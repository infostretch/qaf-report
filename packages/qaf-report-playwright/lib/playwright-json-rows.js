/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const path = require('path');
const {
  specFileForQafDisplay,
  sanitizedClassDirName,
  resultFileNameSlug,
  resolveExecutionFolderName,
  testsetFolderName,
  classOutputDirAbs
} = require('qaf-report-core/lib/paths');
const { buildResultPayload } = require('qaf-report-core/lib/emit');
const { mapPlaywrightStatus } = require('qaf-report-core/lib/result-builder');

/**
 * Ordered absolute dirs to resolve spec files against (Playwright JSON + import paths).
 * @param {object} raw
 * @param {string|undefined} reportInputPath
 * @param {string[]} [extraDirs]
 */
function resolveSpecRootDirs(raw, reportInputPath, extraDirs = []) {
  const out = [];
  for (const d of extraDirs) {
    if (d) out.push(path.resolve(String(d)));
  }
  const rd = raw?.config?.rootDir;
  if (reportInputPath) {
    const reportDir = path.dirname(path.resolve(reportInputPath));
    if (rd != null && String(rd).trim() !== '') {
      const rds = String(rd);
      out.push(path.isAbsolute(rds) ? path.resolve(rds) : path.resolve(reportDir, rds));
    }
    out.push(reportDir);
  } else if (rd != null && String(rd).trim() !== '') {
    out.push(path.resolve(String(rd)));
  }
  out.push(path.resolve(process.cwd()));
  return [...new Set(out)];
}

function extractTestId(test) {
  const anns = test.annotations || [];
  for (const a of anns) {
    if (a.type === 'testId' && a.description) return String(a.description);
    if (a.type === 'test_id' && a.description) return String(a.description);
  }
  return undefined;
}

/**
 * Playwright JSON report → canonical emitter rows (tool-native; no import/merge logic).
 *
 * @param {object} raw - parsed Playwright JSON report
 * @param {object} options
 * @param {string} [options.outputRoot]
 * @param {string} [options.executionName]
 * @param {'per-project'|'single'} [options.testsetStrategy]
 * @param {string} [options.executionFolderOverride]
 * @param {number} [options.rowIdStart]
 * @param {number} [options.startTime]
 * @param {number} [options.endTime]
 * @param {string} [options.reportInputPath] - merged report .json path (for rootDir + dirname heuristics)
 * @param {string[]} [options.specRootDirs] - extra bases first (e.g. dashboard root) for relative specs
 */
async function buildRowsFromPlaywrightReport(raw, options) {
  const {
    outputRoot = 'test-results',
    executionName = 'Playwright',
    testsetStrategy = 'per-project',
    executionFolderOverride,
    rowIdStart = 0,
    startTime: startTimeOverride,
    endTime: endTimeOverride,
    reportInputPath,
    specRootDirs: specRootDirsExtra = []
  } = options;

  const specRootDirs = resolveSpecRootDirs(raw, reportInputPath, specRootDirsExtra);

  const startTime = startTimeOverride ?? (raw.stats?.startTime || Date.now());
  const endTime = endTimeOverride ?? (raw.stats?.endTime || Date.now());

  const folderName = resolveExecutionFolderName({
    executionName,
    startTime,
    executionFolderOverride
  });
  const execAbs = path.join(outputRoot, folderName, 'json');

  const warn = (m) => {
    if (process.env.DEBUG_QAF) console.warn('[qaf-report-playwright]', m);
  };

  /** @type {object[]} */
  const rawRows = [];
  let rowId = rowIdStart;

  function walkSuites(suites, inheritedFile, suiteChain) {
    for (const suite of suites || []) {
      const file = suite.file || inheritedFile;
      const chain = [...suiteChain, suite.title].filter(Boolean);

      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const projectName = test.projectName || test.projectId || 'default';
          const titlePath = Array.isArray(test.titlePath) ? test.titlePath.filter(Boolean) : [];
          const testTitle =
            (titlePath.length ? titlePath.join(' > ') : null) ||
            test.title ||
            spec.title ||
            'test';
          const specFile = specFileForQafDisplay(
            test.location?.file || file || 'unknown.spec.ts',
            specRootDirs
          );
          const classLogical = specFile;
          const classDirName = sanitizedClassDirName(specFile);

          const testResults = test.results || [];
          for (let ri = 0; ri < testResults.length; ri++) {
            const result = testResults[ri];
            const status = mapPlaywrightStatus(result.status);
            const rfn = resultFileNameSlug(testTitle, rowId + (result.retry || 0));
            rowId++;

            rawRows.push({
              testsetName: projectName,
              classLogicalPath: classLogical,
              classDirName,
              testTitle,
              specFile,
              result: status,
              duration: result.duration,
              startTime: result.startTime || startTime,
              retryCount: result.retry == null ? null : result.retry,
              resultFileName: rfn,
              testID: extractTestId(test),
              projectName,
              _rawResult: result
            });
          }
        }
      }

      if (suite.suites?.length) {
        walkSuites(suite.suites, file, chain);
      }
    }
  }

  walkSuites(raw.suites, '', []);

  const rows = [];
  for (const rr of rawRows) {
    const r = rr._rawResult;
    const tsName = testsetFolderName(testsetStrategy, rr.testsetName);
    const classAbs = classOutputDirAbs(execAbs, tsName, rr.classLogicalPath);

    const payload = await buildResultPayload(
      {
        errors: r.errors,
        error: r.error,
        attachments: r.attachments,
        status: r.status
      },
      classAbs,
      { warn }
    );

    delete rr._rawResult;
    rows.push({
      ...rr,
      resultPayload: payload
    });
  }

  return { rows, startTime, endTime, folderName, execAbs };
}

module.exports = { buildRowsFromPlaywrightReport };
