/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const { getDashboardRoot, defaultTestResultsAbs } = require('./utils');
const { runToolImport, playwrightComputeEmitTimes } = require('./orchestrate');

function tryLoadPlaywrightPackage() {
  try {
    return require('qaf-report-playwright');
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    const err = new Error(
      'Playwright report import requires npm package "qaf-report-playwright". Install: npm install qaf-report-playwright'
    );
    err.code = 'MISSING_PLAYWRIGHT_PKG';
    throw err;
  }
}

async function importPlaywrightReport(options) {
  const { buildRowsFromPlaywrightReport } = tryLoadPlaywrightPackage();
  const {
    inputPath,
    executionName = 'Playwright',
    dashboardRoot = getDashboardRoot(),
    testResultsAbs = defaultTestResultsAbs(dashboardRoot),
    testsetStrategy = 'per-project',
    mergeRoot = false,
    append = false,
    force = false
  } = options;

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  return runToolImport({
    executionFolder: options.executionFolder,
    executionName,
    dashboardRoot,
    testResultsAbs,
    testsetStrategy,
    mergeRoot,
    append,
    force,
    warnIfEmpty: null,
    computeEmitTimes: playwrightComputeEmitTimes,
    buildIncoming: async ({
      rowSaltStart,
      executionFolderOverride,
      append: appendFlag,
      folderSan,
      testResultsAbs: tra
    }) => {
      const built = await buildRowsFromPlaywrightReport(raw, {
        outputRoot: tra,
        executionName,
        testsetStrategy,
        executionFolderOverride,
        rowIdStart: rowSaltStart,
        startTime: raw.stats?.startTime,
        endTime: raw.stats?.endTime,
        reportInputPath: inputPath,
        specRootDirs: [dashboardRoot]
      });

      const logWarn =
        !built.rows.length && rowSaltStart === 0
          ? '[qaf-report-playwright] No tests found in JSON report; writing empty execution.'
          : null;

      const logWarnAfterMerge = appendFlag
        ? '[qaf-import:playwright] No tests found after merge.'
        : null;

      return {
        rows: built.rows,
        meta: { startTime: built.startTime, endTime: built.endTime },
        logWarn,
        logWarnAfterMerge
      };
    }
  });
}

module.exports = { importPlaywrightReport };
