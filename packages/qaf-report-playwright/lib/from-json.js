/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const { emitQafTreeFromRows } = require('qaf-report-core/lib/emit');
const { buildRowsFromPlaywrightReport } = require('./playwright-json-rows');

/**
 * Read a Playwright JSON report from disk and write QAF tree (standalone / reporter-adjacent).
 * Dashboard import should use scripts/qaf-import/playwright.js instead.
 *
 * @param {object} options
 * @param {string} options.inputPath
 * @param {string} [options.outputRoot]
 * @param {string} [options.executionName]
 * @param {'per-project'|'single'} [options.testsetStrategy]
 * @param {boolean} [options.mergeRoot]
 * @param {string} [options.executionFolderOverride]
 * @param {string[]} [options.specRootDirs] - extra bases for relative spec paths in JSON reports
 */
async function generateQafResultsFromJson(options) {
  const {
    inputPath,
    outputRoot = 'test-results',
    executionName = 'Playwright',
    testsetStrategy = 'per-project',
    mergeRoot = false,
    executionFolderOverride
  } = options;

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const built = await buildRowsFromPlaywrightReport(raw, {
    outputRoot,
    executionName,
    testsetStrategy,
    executionFolderOverride,
    rowIdStart: 0,
    startTime: raw.stats?.startTime,
    endTime: raw.stats?.endTime,
    reportInputPath: inputPath,
    specRootDirs: options.specRootDirs || []
  });

  if (!built.rows.length) {
    console.warn('[qaf-report-playwright] No tests found in JSON report; writing empty execution.');
  }

  return emitQafTreeFromRows({
    outputRoot,
    executionName,
    startTime: built.startTime,
    endTime: built.endTime,
    testsetStrategy,
    mergeRoot,
    executionFolderOverride,
    rows: built.rows
  });
}

module.exports = { generateQafResultsFromJson };
