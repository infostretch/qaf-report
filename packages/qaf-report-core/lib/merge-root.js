/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {string} outputRoot - e.g. test-results
 * @param {{ name: string, dir: string, startTime: number }} reportEntry
 * @param {{ dedupeByDir?: boolean }} [opts]
 */
function mergeRootMeta(outputRoot, reportEntry, opts = {}) {
  const dedupeByDir = opts.dedupeByDir !== false;
  const metaPath = path.join(outputRoot, 'meta-info.json');
  let root = { reports: [] };
  try {
    if (fs.existsSync(metaPath)) {
      root = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (!Array.isArray(root.reports)) root.reports = [];
    }
  } catch (e) {
    root = { reports: [] };
  }
  if (dedupeByDir) {
    root.reports = root.reports.filter((r) => r && r.dir !== reportEntry.dir);
  }
  root.reports.push(reportEntry);
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(root, null, 2), 'utf8');
}

module.exports = { mergeRootMeta };
