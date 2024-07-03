/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fsp = fs.promises;
const {
  logicalClassPath,
  sanitizedClassDirName,
  resultFileNameSlug,
  resolveExecutionFolderName,
  testsetFolderName,
  classOutputDirAbs
} = require('./paths');
const { mergeRootMeta } = require('./merge-root');
const { processAttachments, formatErrorFromResult, mapPlaywrightStatus } = require('./result-builder');

/**
 * @typedef {object} MethodRowInput
 * @property {string} testsetName - raw project name
 * @property {string} classLogicalPath
 * @property {string} classDirName
 * @property {string} testTitle
 * @property {string} specFile
 * @property {string} result
 * @property {number} duration
 * @property {number} startTime
 * @property {number|null|undefined} retryCount
 * @property {string} resultFileName
 * @property {string} [testID]
 * @property {string} [projectName]
 * @property {object} resultPayload - already built JSON (written as file)
 */

/**
 * @param {object} opts
 * @param {string} opts.outputRoot
 * @param {string} opts.executionName
 * @param {number} opts.startTime
 * @param {number} opts.endTime
 * @param {'per-project'|'single'} opts.testsetStrategy
 * @param {boolean} [opts.mergeRoot]
 * @param {string} [opts.executionFolderOverride] - stable folder basename under outputRoot (sanitize applied)
 * @param {string} [opts.dashboardRoot] - repo root; when set, reportEntry.dir is posix-relative to it
 * @param {MethodRowInput[]} opts.rows
 */
async function emitQafTreeFromRows(opts) {
  const {
    outputRoot,
    executionName,
    startTime,
    endTime,
    testsetStrategy = 'per-project',
    mergeRoot: doMergeRoot = false,
    executionFolderOverride,
    dashboardRoot,
    rows
  } = opts;

  const folderName = resolveExecutionFolderName({
    executionName,
    startTime,
    executionFolderOverride
  });
  const execRel = path.join(folderName, 'json');
  const execAbs = path.join(outputRoot, execRel);

  /** @type {Map<string, MethodRowInput[]>} */
  const byClass = new Map();

  for (const row of rows) {
    const ts = testsetFolderName(testsetStrategy, row.testsetName);
    const key = `${ts}\0${row.classLogicalPath}`;
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(row);
  }

  for (const [, groupRows] of byClass) {
    groupRows.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  }

  for (const [key, groupRows] of byClass) {
    const [tsName] = key.split('\0');
    const first = groupRows[0];
    const classAbs = classOutputDirAbs(execAbs, tsName, first.classLogicalPath);
    await fsp.mkdir(classAbs, { recursive: true });

    const methods = groupRows.map((r, mi) => {
      const metaData = {
        name: r.testTitle,
        sign: `${r.specFile}.${r.testTitle}()`,
        reference: r.specFile,
        resultFileName: r.resultFileName,
        testID: r.testID || undefined
      };
      if (r.projectName) metaData.platform = r.projectName;
      return {
        index: 1,
        retryCount: r.retryCount == null ? null : r.retryCount,
        type: 'test',
        args: [],
        metaData,
        dependsOn: [],
        doc: null,
        startTime: r.startTime,
        duration: r.duration,
        result: r.result,
        passPer: r.result === 'pass' ? 100 : 0
      };
    });

    await fsp.writeFile(path.join(classAbs, 'meta-info.json'), JSON.stringify({ methods }, null, 2), 'utf8');

    for (const r of groupRows) {
      await fsp.writeFile(
        path.join(classAbs, `${r.resultFileName}.json`),
        JSON.stringify(r.resultPayload, null, 2),
        'utf8'
      );
    }
  }

  let total = 0;
  let pass = 0;
  let fail = 0;
  let skip = 0;
  for (const r of rows) {
    total++;
    if (r.result === 'pass') pass++;
    else if (r.result === 'fail') fail++;
    else skip++;
  }

  const testsetNames = new Set();
  for (const r of rows) {
    testsetNames.add(testsetFolderName(testsetStrategy, r.testsetName));
  }

  for (const tsName of testsetNames) {
    const testsetAbs = path.join(execAbs, tsName);
    await fsp.mkdir(testsetAbs, { recursive: true });
    const classesLogical = [];
    for (const r of rows) {
      if (testsetFolderName(testsetStrategy, r.testsetName) !== tsName) continue;
      if (!classesLogical.includes(r.classLogicalPath)) classesLogical.push(r.classLogicalPath);
    }
    classesLogical.sort();

    let ovTotal = 0;
    let ovPass = 0;
    let ovFail = 0;
    let ovSkip = 0;
    for (const r of rows) {
      if (testsetFolderName(testsetStrategy, r.testsetName) !== tsName) continue;
      ovTotal++;
      if (r.result === 'pass') ovPass++;
      else if (r.result === 'fail') ovFail++;
      else ovSkip++;
    }

    const overview = {
      total: ovTotal,
      pass: ovPass,
      fail: ovFail,
      skip: ovSkip,
      classes: classesLogical
    };
    await fsp.writeFile(path.join(testsetAbs, 'overview.json'), JSON.stringify(overview, null, 2), 'utf8');
  }

  const status = fail > 0 ? 'fail' : 'pass';
  const testsArr = Array.from(testsetNames).sort();

  const execMeta = {
    name: executionName,
    status,
    tests: testsArr,
    total,
    pass,
    fail,
    skip,
    startTime,
    endTime
  };

  await fsp.mkdir(execAbs, { recursive: true });
  await fsp.writeFile(path.join(execAbs, 'meta-info.json'), JSON.stringify(execMeta, null, 2), 'utf8');

  const reportDir = path.join(outputRoot, folderName).replace(/\\/g, '/');
  const execJsonAbs = path.join(outputRoot, execRel);
  let reportDirForEntry = execJsonAbs.replace(/\\/g, '/');
  if (dashboardRoot) {
    reportDirForEntry = path
      .relative(path.resolve(dashboardRoot), path.resolve(execJsonAbs))
      .replace(/\\/g, '/');
  }
  const reportEntry = {
    name: executionName,
    dir: reportDirForEntry,
    startTime
  };

  if (doMergeRoot) {
    mergeRootMeta(outputRoot, {
      name: reportEntry.name,
      dir: reportEntry.dir,
      startTime: reportEntry.startTime
    });
  }

  return {
    executionDir: reportDir,
    execRel: execRel.replace(/\\/g, '/'),
    reportEntry,
    execMeta
  };
}

/**
 * Build result JSON payload and process raw attachments from disk/base64.
 */
async function buildResultPayload({ errors, error, attachments, status }, classAbsDir, opts = {}) {
  const errorTrace = formatErrorFromResult(errors, error);
  const { checkPoints, extraAttachments } = await processAttachments(attachments, classAbsDir, opts);
  const payload = {};
  if (errorTrace) {
    payload.errorTrace = errorTrace;
    payload.errorMessage = errorTrace.split('\n')[0] || errorTrace;
  }
  if (checkPoints.length) {
    payload.checkPoints = checkPoints;
  }
  if (extraAttachments.length) {
    payload.attachments = extraAttachments;
  }
  return payload;
}

module.exports = {
  emitQafTreeFromRows,
  buildResultPayload,
  logicalClassPath,
  sanitizedClassDirName,
  resultFileNameSlug,
  mapPlaywrightStatus,
  mergeRootMeta
};
