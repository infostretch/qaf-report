/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const path = require('path');
const { emitQafTreeFromRows, buildResultPayload } = require('qaf-report-core/lib/emit');
const { mapPlaywrightStatus } = require('qaf-report-core/lib/result-builder');
const {
  specFileForQafDisplay,
  sanitizedClassDirName,
  resultFileNameSlug,
  executionFolderName,
  testsetFolderName,
  classOutputDirAbs
} = require('qaf-report-core/lib/paths');

function getProjectName(test) {
  if (typeof test.project === 'function') {
    try {
      const p = test.project();
      if (p && p.name) return p.name;
    } catch (e) {
      /* ignore */
    }
  }
  return 'default';
}

function extractTestId(test) {
  const anns = test.annotations || [];
  for (const a of anns) {
    if (a && (a.type === 'testId' || a.type === 'test_id') && a.description) {
      return String(a.description);
    }
  }
  return undefined;
}

function toPlainErrors(result) {
  if (result.errors && result.errors.length) return result.errors;
  if (result.error) return [result.error];
  return [];
}

function toPlainAttachments(result) {
  const out = [];
  for (const a of result.attachments || []) {
    if (!a) continue;
    out.push({
      name: a.name,
      path: a.path,
      contentType: a.contentType,
      body: a.body
    });
  }
  return out;
}

/**
 * Plain reporter class (Playwright's `@playwright/test/reporter` has no CJS export of Reporter base).
 * Implements the same hook surface as a typical Playwright reporter.
 */
class QafReporter {
  /**
   * @param {{
   *   outputRoot?: string,
   *   executionName?: string,
   *   testsetStrategy?: 'per-project'|'single',
   *   mergeRootMeta?: boolean
   * }} options
   */
  constructor(options = {}) {
    this._options = {
      outputRoot: options.outputRoot || 'test-results',
      executionName: options.executionName || 'Playwright',
      testsetStrategy: options.testsetStrategy || 'per-project',
      mergeRootMeta: options.mergeRootMeta === true
    };
    this._rows = [];
    this._rowId = 0;
    this._startTime = Date.now();
    /** @type {string[]} bases for specFileForQafDisplay (Playwright rootDir, etc.) */
    this._specRootDirs = [process.cwd()];
    this._warn = (m) => {
      if (process.env.DEBUG_QAF) console.warn('[qaf-report-playwright]', m);
    };
  }

  /**
   * @param {import('@playwright/test').FullConfig} [config]
   */
  onBegin(config) {
    this._startTime = Date.now();
    const dirs = [];
    if (config?.rootDir) dirs.push(path.resolve(config.rootDir));
    if (config?.configDir) dirs.push(path.resolve(config.configDir));
    dirs.push(process.cwd());
    this._specRootDirs = [...new Set(dirs.map((d) => path.resolve(d)))];
  }

  /**
   * @param {import('@playwright/test').TestCase} test
   * @param {import('@playwright/test').TestResult} result
   */
  async onTestEnd(test, result) {
    const projectName = getProjectName(test);
    const specFile = specFileForQafDisplay(test.location.file, this._specRootDirs);
    const classDirName = sanitizedClassDirName(specFile);
    let testTitle = null;
    if (typeof test.titlePath === 'function') {
      const parts = test.titlePath().filter(Boolean);
      if (parts.length) testTitle = parts.join(' > ');
    }
    if (!testTitle) testTitle = test.title || 'test';

    const status = mapPlaywrightStatus(result.status);
    const folderName = executionFolderName(this._options.executionName, this._startTime);
    const execAbs = path.join(this._options.outputRoot, folderName, 'json');
    const tsName = testsetFolderName(this._options.testsetStrategy, projectName);
    const classAbs = classOutputDirAbs(execAbs, tsName, specFile);

    const rfn = resultFileNameSlug(testTitle, this._rowId + (result.retry || 0));
    this._rowId++;

    const errors = toPlainErrors(result);
    const attachments = toPlainAttachments(result);

    const payload = await buildResultPayload(
      {
        errors,
        error: result.error,
        attachments,
        status: result.status
      },
      classAbs,
      { warn: this._warn }
    );

    this._rows.push({
      testsetName: projectName,
      classLogicalPath: specFile,
      classDirName,
      testTitle,
      specFile,
      result: status,
      duration: result.duration,
      startTime: result.startTime || this._startTime,
      retryCount: result.retry == null ? null : result.retry,
      resultFileName: rfn,
      testID: extractTestId(test),
      projectName,
      resultPayload: payload
    });
  }

  async onEnd() {
    const endTime = Date.now();
    await emitQafTreeFromRows({
      outputRoot: this._options.outputRoot,
      executionName: this._options.executionName,
      startTime: this._startTime,
      endTime,
      testsetStrategy: this._options.testsetStrategy,
      mergeRoot: this._options.mergeRootMeta,
      rows: this._rows
    });
  }
}

module.exports = QafReporter;
