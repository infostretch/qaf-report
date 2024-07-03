/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

module.exports = {
  generateQafResultsFromJson: require('./lib/from-json').generateQafResultsFromJson,
  buildRowsFromPlaywrightReport: require('./lib/playwright-json-rows').buildRowsFromPlaywrightReport,
  mergeRootMeta: require('qaf-report-core/lib/merge-root').mergeRootMeta,
  QafReporter: require('./reporter')
};
