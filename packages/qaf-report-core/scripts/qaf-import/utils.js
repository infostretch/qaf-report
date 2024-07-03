/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fsp = fs.promises;
const { mergeRootMeta } = require('../../lib/merge-root');
const {
  sanitizedClassDirName,
  sanitizeExecutionFolderName,
  classOutputDirAbs
} = require('../../lib/paths');

function getDashboardRoot() {
  return path.resolve(process.cwd());
}

function defaultTestResultsAbs(dashboardRoot = getDashboardRoot()) {
  return path.join(dashboardRoot, 'test-results');
}

/**
 * POSIX repo-relative path to execution json dir (for root meta / fetch parity).
 * @param {string} dashboardRoot
 * @param {string} execJsonDirAbs
 */
function toRelativeReportDir(dashboardRoot, execJsonDirAbs) {
  return path
    .relative(path.resolve(dashboardRoot), path.resolve(execJsonDirAbs))
    .replace(/\\/g, '/');
}

/**
 * @param {{ testResultsAbs: string, dashboardRoot: string, reportEntry: { name: string, dir: string, startTime: number } }} opts
 */
function mergeRootReportEntry(opts) {
  const { testResultsAbs, dashboardRoot, reportEntry } = opts;
  const dr = path.resolve(dashboardRoot);
  let dir = reportEntry.dir;
  if (path.isAbsolute(dir)) {
    dir = path.relative(dr, dir).replace(/\\/g, '/');
  } else {
    dir = String(dir).replace(/\\/g, '/');
  }
  mergeRootMeta(testResultsAbs, { ...reportEntry, dir });
}

/**
 * @param {string} testResultsAbs
 * @param {string} executionFolder - sanitized folder basename under testResultsAbs
 */
function executionJsonDirAbs(testResultsAbs, executionFolder) {
  return path.join(testResultsAbs, executionFolder, 'json');
}

function executionJsonMetaExists(testResultsAbs, executionFolder) {
  const p = path.join(executionJsonDirAbs(testResultsAbs, executionFolder), 'meta-info.json');
  return fs.existsSync(p);
}

function rowDedupeKey(row) {
  return `${row.testsetName}\0${row.classLogicalPath}\0${row.testTitle}\0${row.resultFileName}`;
}

/**
 * @param {object[]} existing
 * @param {object[]} incoming
 * @param {{ preferIncoming?: boolean }} [dedupeOpts]
 */
function mergeRows(existing, incoming, dedupeOpts = {}) {
  const preferIncoming = dedupeOpts.preferIncoming !== false;
  const map = new Map();
  for (const r of existing) {
    map.set(rowDedupeKey(r), r);
  }
  for (const r of incoming) {
    const k = rowDedupeKey(r);
    if (preferIncoming || !map.has(k)) {
      map.set(k, r);
    }
  }
  return Array.from(map.values());
}

/**
 * Rebuild emitter rows from an existing execution json tree.
 * @param {string} execJsonAbs - .../test-results/<folder>/json
 * @param {'per-project'|'single'} testsetStrategy
 */
async function loadRowsFromExistingExecution(execJsonAbs, testsetStrategy = 'per-project') {
  const metaPath = path.join(execJsonAbs, 'meta-info.json');
  const raw = await fsp.readFile(metaPath, 'utf8');
  const execMeta = JSON.parse(raw);
  const testDirs = Array.isArray(execMeta.tests) ? execMeta.tests : [];
  const rows = [];

  for (const tsFolder of testDirs) {
    const testsetAbs = path.join(execJsonAbs, tsFolder);
    const overviewPath = path.join(testsetAbs, 'overview.json');
    let overview;
    try {
      overview = JSON.parse(await fsp.readFile(overviewPath, 'utf8'));
    } catch {
      continue;
    }
    const classes = Array.isArray(overview.classes) ? overview.classes : [];
    const testsetName = testsetStrategy === 'single' ? 'default' : tsFolder;

    for (const classLogicalPath of classes) {
      const classDirName = sanitizedClassDirName(classLogicalPath);
      const classAbs = classOutputDirAbs(execJsonAbs, tsFolder, classLogicalPath);
      let classMeta;
      try {
        classMeta = JSON.parse(await fsp.readFile(path.join(classAbs, 'meta-info.json'), 'utf8'));
      } catch {
        continue;
      }
      const methods = Array.isArray(classMeta.methods) ? classMeta.methods : [];
      for (const m of methods) {
        const md = m.metaData || {};
        const rfn = md.resultFileName;
        if (!rfn) continue;
        let resultPayload = {};
        try {
          resultPayload = JSON.parse(
            await fsp.readFile(path.join(classAbs, `${rfn}.json`), 'utf8')
          );
        } catch {
          resultPayload = {};
        }
        rows.push({
          testsetName,
          classLogicalPath,
          classDirName,
          testTitle: md.name || 'test',
          specFile: md.reference || classLogicalPath,
          result: m.result || 'fail',
          duration: m.duration == null ? 0 : m.duration,
          startTime: m.startTime == null ? 0 : m.startTime,
          retryCount: m.retryCount == null ? null : m.retryCount,
          resultFileName: rfn,
          testID: md.testID,
          projectName: md.platform,
          resultPayload
        });
      }
    }
  }

  return rows;
}

module.exports = {
  getDashboardRoot,
  defaultTestResultsAbs,
  toRelativeReportDir,
  sanitizeExecutionFolderName,
  mergeRootReportEntry,
  executionJsonDirAbs,
  executionJsonMetaExists,
  rowDedupeKey,
  mergeRows,
  loadRowsFromExistingExecution
};
