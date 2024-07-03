/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const { emitQafTreeFromRows } = require('../../lib/emit');
const {
  executionJsonDirAbs,
  executionJsonMetaExists,
  loadRowsFromExistingExecution,
  mergeRows,
  sanitizeExecutionFolderName
} = require('./utils');

/**
 * @param {object[]} rows
 * @param {object} ctx
 * @param {number|undefined} ctx.startTimeOpt
 * @param {number|undefined} ctx.endTimeOpt
 * @param {number} ctx.startTimeSeed
 * @param {number} ctx.endTimeSeed
 * @returns {{ startTime: number, endTime: number }}
 */
function defaultComputeEmitTimes(rows, ctx) {
  const { startTimeOpt, endTimeOpt, startTimeSeed, endTimeSeed } = ctx;
  for (const r of rows) {
    if (r.startTime == null || r.startTime === 0) {
      r.startTime = startTimeSeed;
    }
  }
  const firstStart = rows.length
    ? Math.min(...rows.map((r) => r.startTime || startTimeSeed))
    : startTimeSeed;
  const lastEnd = rows.length
    ? Math.max(...rows.map((r) => (r.startTime || startTimeSeed) + (r.duration || 0)))
    : endTimeSeed;
  const startTime = startTimeOpt != null ? startTimeOpt : firstStart;
  const endTime = endTimeOpt != null ? endTimeOpt : Math.max(endTimeSeed, lastEnd);
  return { startTime, endTime };
}

/**
 * @param {object} options
 * @param {string} [options.executionFolder]
 * @param {string} options.executionName
 * @param {string} [options.dashboardRoot]
 * @param {string} options.testResultsAbs
 * @param {'per-project'|'single'} options.testsetStrategy
 * @param {boolean} options.mergeRoot
 * @param {boolean} options.append
 * @param {boolean} options.force
 * @param {number} [options.startTime]
 * @param {number} [options.endTime]
 * @param {string} [options.warnIfEmpty] - console.warn when no incoming and no base rows
 * @param {function(object): Promise<{ rows: object[], meta?: object, logWarn?: string }>} options.buildIncoming
 * @param {function(object[], object): { startTime: number, endTime: number }} [options.computeEmitTimes]
 */
async function runToolImport(options) {
  const {
    executionFolder,
    executionName,
    dashboardRoot,
    testResultsAbs,
    testsetStrategy,
    mergeRoot,
    append,
    force,
    startTime: startTimeOpt,
    endTime: endTimeOpt,
    warnIfEmpty,
    buildIncoming,
    computeEmitTimes = defaultComputeEmitTimes
  } = options;

  let startTimeSeed = startTimeOpt != null ? startTimeOpt : Date.now();
  let endTimeSeed = endTimeOpt != null ? endTimeOpt : startTimeSeed;

  const folderSan = executionFolder ? sanitizeExecutionFolderName(executionFolder) : null;
  const executionFolderOverride = folderSan != null ? folderSan : undefined;

  const exists = folderSan != null && executionJsonMetaExists(testResultsAbs, folderSan);
  if (exists && !append && !force) {
    const err = new Error(
      `Execution already exists at ${folderSan}; use --append or --force`
    );
    err.code = 'EXEC_EXISTS';
    throw err;
  }

  let rowSaltStart = 0;
  let baseRows = [];
  if (append && folderSan != null && executionJsonMetaExists(testResultsAbs, folderSan)) {
    const exJson = executionJsonDirAbs(testResultsAbs, folderSan);
    baseRows = await loadRowsFromExistingExecution(exJson, testsetStrategy);
    rowSaltStart = baseRows.length;
  }

  const incomingResult = await buildIncoming({
    rowSaltStart,
    startTimeFallback: startTimeSeed,
    baseRows,
    append,
    folderSan,
    executionFolderOverride,
    testResultsAbs,
    executionName,
    testsetStrategy
  });

  const incoming = incomingResult.rows;
  if (incomingResult.logWarn) {
    console.warn(incomingResult.logWarn);
  } else if (warnIfEmpty && !incoming.length && !baseRows.length) {
    console.warn(warnIfEmpty);
  }

  const rows = mergeRows(baseRows, incoming, { preferIncoming: true });

  if (incomingResult.logWarnAfterMerge && !rows.length) {
    console.warn(incomingResult.logWarnAfterMerge);
  }

  const { startTime, endTime } = computeEmitTimes(rows, {
    startTimeOpt,
    endTimeOpt,
    startTimeSeed,
    endTimeSeed,
    incomingResult,
    append,
    hadBaseRows: baseRows.length > 0
  });

  return emitQafTreeFromRows({
    outputRoot: testResultsAbs,
    executionName,
    startTime,
    endTime,
    testsetStrategy,
    mergeRoot,
    executionFolderOverride,
    dashboardRoot,
    rows
  });
}

function playwrightComputeEmitTimes(rows, ctx) {
  const meta = ctx.incomingResult.meta;
  if (!meta) {
    return defaultComputeEmitTimes(rows, ctx);
  }
  for (const r of rows) {
    if (r.startTime == null || r.startTime === 0) {
      r.startTime = ctx.startTimeSeed;
    }
  }
  if (ctx.append && ctx.hadBaseRows) {
    let startTime = meta.startTime;
    let endTime = meta.endTime;
    if (rows.length) {
      startTime = Math.min(...rows.map((r) => Number(r.startTime) || startTime));
      endTime = Math.max(
        ...rows.map((r) => (Number(r.startTime) || startTime) + (Number(r.duration) || 0))
      );
    }
    return { startTime, endTime };
  }
  return { startTime: meta.startTime, endTime: meta.endTime };
}

module.exports = { runToolImport, defaultComputeEmitTimes, playwrightComputeEmitTimes };
