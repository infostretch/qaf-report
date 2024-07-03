/**
 * @author Chirag Jayswal, QAF team
 * Import dropped reports from an inbox directory (default name "upload") into test-results,
 * using the same rules as POST /api/upload. Successfully imported files are removed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveRawEntries } = require('../lib/archive-extract.js');
const { importFromArchiveEntries } = require('./upload-from-archive.js');
const { mergeQafTestResultsArchive } = require('./merge-qaf-archive.js');

const DEFAULT_CONFIG = { maxExecutions: 5, maxHistory: 10, allowDeleteOldExecutions: false };

function loadConfigForTree(testResultsAbs) {
  try {
    const p = path.join(testResultsAbs, 'dashboard-config.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { ...DEFAULT_CONFIG, ...data };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

/** Top-level inbox files we try to import (same family as HTTP upload). */
const IMPORTABLE_EXT = new Set([
  '.zip',
  '.tgz',
  '.tar',
  '.xml',
  '.json'
]);

function listInboxFiles(uploadAbs) {
  if (!fs.existsSync(uploadAbs) || !fs.statSync(uploadAbs).isDirectory()) return [];
  const out = [];
  for (const ent of fs.readdirSync(uploadAbs, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    if (ent.name.startsWith('.')) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!IMPORTABLE_EXT.has(ext)) continue;
    out.push(path.join(uploadAbs, ent.name));
  }
  out.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  return out;
}

/**
 * @param {{ projectRoot: string, testResultsAbs: string, uploadAbs: string }} target
 * @returns {{ imported: number, removed: number, errors: { file: string, message: string }[] }}
 */
async function processUploadInboxTarget(target) {
  const { projectRoot, testResultsAbs, uploadAbs } = target;
  const errors = [];
  let imported = 0;
  let removed = 0;
  const files = listInboxFiles(uploadAbs);
  for (const filePath of files) {
    let buf;
    try {
      buf = fs.readFileSync(filePath);
    } catch (e) {
      errors.push({ file: filePath, message: e.message || String(e) });
      continue;
    }
    if (!buf.length) continue;
    try {
      const rawEntries = await resolveRawEntries(buf);
      const base = path.basename(filePath, path.extname(filePath));
      const importPlan = await importFromArchiveEntries(rawEntries, {
        kind: 'auto',
        importSpecified: false,
        executionName: base || 'import',
        entry: '',
        projectRoot,
        testResultsPath: testResultsAbs
      });
      const config = loadConfigForTree(testResultsAbs);
      if (importPlan.mode === 'qaf-tree') {
        mergeQafTestResultsArchive(rawEntries, {
          projectRoot,
          testResultsPath: testResultsAbs,
          config
        });
      }
      imported++;
      try {
        fs.unlinkSync(filePath);
        removed++;
      } catch (e) {
        errors.push({ file: filePath, message: 'Imported but could not remove file: ' + (e.message || e) });
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      errors.push({ file: filePath, message: msg });
    }
  }
  return { imported, removed, errors };
}

/**
 * @param {string} dashboardRoot
 * @param {string} uploadDirName - relative name, default "upload"
 * @returns {Promise<{ totalImported: number, totalRemoved: number, errors: { file: string, message: string }[] }>}
 */
async function processAllUploadInboxes(dashboardRoot, uploadDirName = 'upload') {
  const errors = [];
  let totalImported = 0;
  let totalRemoved = 0;
  const rootInbox = path.join(dashboardRoot, uploadDirName);
  const defaultTr = path.join(dashboardRoot, 'test-results');
  if (fs.existsSync(rootInbox)) {
    const r = await processUploadInboxTarget({
      projectRoot: dashboardRoot,
      testResultsAbs: defaultTr,
      uploadAbs: rootInbox
    });
    totalImported += r.imported;
    totalRemoved += r.removed;
    errors.push(...r.errors);
  }

  let ents;
  try {
    ents = fs.readdirSync(dashboardRoot, { withFileTypes: true });
  } catch (e) {
    return { totalImported, totalRemoved, errors };
  }
  const skip = new Set(['node_modules', 'test-results', 'upload', 'packages', 'docs', '.git']);
  for (const ent of ents) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    if (skip.has(ent.name)) continue;
    const uploadAbs = path.join(dashboardRoot, ent.name, uploadDirName);
    if (!fs.existsSync(uploadAbs)) continue;
    const testResultsAbs = path.join(dashboardRoot, ent.name, 'test-results');
    const r = await processUploadInboxTarget({
      projectRoot: dashboardRoot,
      testResultsAbs,
      uploadAbs
    });
    totalImported += r.imported;
    totalRemoved += r.removed;
    errors.push(...r.errors);
  }
  return { totalImported, totalRemoved, errors };
}

module.exports = {
  processAllUploadInboxes,
  processUploadInboxTarget,
  listInboxFiles,
  loadConfigForTree
};
