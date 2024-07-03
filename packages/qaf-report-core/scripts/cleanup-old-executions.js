#!/usr/bin/env node
/**
 * @author Chirag Jayswal, QAF team
 * Remove on-disk execution folders older than N days (default 30), then run sync-projects-meta
 * to rebuild root meta-info.json (and mirrors) from filesystem.
 *
 * Age uses report.startTime, or startTime from the execution's json/meta-info.json if missing.
 * Reports with no usable timestamp are skipped (not deleted).
 *
 * Usage:
 *   node scripts/cleanup-old-executions.js
 *   node scripts/cleanup-old-executions.js 14
 *   node scripts/cleanup-old-executions.js --days=60
 *   node scripts/cleanup-old-executions.js --dry-run
 *   node scripts/cleanup-old-executions.js --build-index   # pass through to sync-meta
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveExecutionDir } = require('./build-test-history-index.js');
const { resolveProjectRoot } = require('./resolve-project-root.js');

const DASHBOARD_ROOT = resolveProjectRoot();

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Same discovery as sync-projects-meta */
function discoverProjectTestResultRoots() {
  const out = [];
  const defaultTr = path.join(DASHBOARD_ROOT, 'test-results');
  if (fs.existsSync(defaultTr) && fs.statSync(defaultTr).isDirectory()) {
    out.push({ slug: '', absTestResults: defaultTr });
  }
  let entries;
  try {
    entries = fs.readdirSync(DASHBOARD_ROOT, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
    const nested = path.join(DASHBOARD_ROOT, ent.name, 'test-results');
    if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
      if (path.resolve(nested) === path.resolve(defaultTr)) continue;
      out.push({ slug: ent.name, absTestResults: path.resolve(nested) });
    }
  }
  return out;
}

function parseArgs() {
  let days = 30;
  let dryRun = false;
  let buildIndex = false;
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') dryRun = true;
    else if (a === '--build-index') buildIndex = true;
    else if (/^--days=\d+$/i.test(a)) days = parseInt(a.split('=')[1], 10);
    else if (/^\d+$/.test(a)) days = parseInt(a, 10);
  }
  if (!Number.isFinite(days) || days < 0) days = 30;
  return { days, dryRun, buildIndex };
}

function resolveStartTime(report, jsonFolderAbs) {
  let t = Number(report.startTime);
  if (Number.isFinite(t) && t > 0) return t;
  const child = readJsonSafe(path.join(jsonFolderAbs, 'meta-info.json'), null);
  t = child ? Number(child.startTime) : NaN;
  if (Number.isFinite(t) && t > 0) return t;
  return 0;
}

/**
 * Folder to remove: parent of .../json when report points at .../json, else the resolved path.
 */
function executionTreeToDelete(absTestResults, execDir) {
  const jsonFolder = resolveExecutionDir(absTestResults, execDir);
  let toDelete =
    path.basename(jsonFolder) === 'json' ? path.dirname(jsonFolder) : jsonFolder;
  toDelete = path.resolve(toDelete);
  const root = path.resolve(absTestResults);
  if (toDelete === root || toDelete.length <= root.length) return null;
  const rel = path.relative(root, toDelete);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const excl = new Set(['test-history-index', 'test-history-index.backup', 'dashboard-config.json']);
  if (excl.has(path.basename(toDelete))) return null;
  return toDelete;
}

function rmTree(p, dryRun) {
  if (dryRun) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function runSyncMeta(buildIndex) {
  const syncScript = path.join(__dirname, 'sync-projects-meta.js');
  const args = [syncScript];
  if (buildIndex) args.push('--build-index');
  const r = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    cwd: DASHBOARD_ROOT,
    env: process.env
  });
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
}

function main() {
  const { days, dryRun, buildIndex } = parseArgs();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const roots = discoverProjectTestResultRoots();

  if (!roots.length) {
    console.warn('No test-results directories found under', DASHBOARD_ROOT);
    return;
  }

  console.log(
    dryRun ? `[dry-run] Would remove executions with startTime before ${new Date(cutoff).toISOString()} (${days} day(s))`
      : `Removing executions with startTime before ${new Date(cutoff).toISOString()} (${days} day(s))`
  );

  let removed = 0;
  let skippedNoTs = 0;
  let skippedOther = 0;

  for (const { slug, absTestResults } of roots) {
    const metaPath = path.join(absTestResults, 'meta-info.json');
    const meta = readJsonSafe(metaPath, {});
    const reports = meta.reports || [];
    const relRoot = path.relative(DASHBOARD_ROOT, absTestResults);

    for (const report of reports) {
      const execDir = report.dir;
      if (!execDir) continue;

      const jsonFolder = resolveExecutionDir(absTestResults, execDir);
      const startTime = resolveStartTime(report, jsonFolder);

      if (!startTime || startTime >= cutoff) {
        if (!startTime) skippedNoTs++;
        continue;
      }

      const toDelete = executionTreeToDelete(absTestResults, execDir);
      if (!toDelete || !fs.existsSync(toDelete)) {
        skippedOther++;
        continue;
      }

      const label = report.name || execDir;
      console.log(
        dryRun ? `[dry-run] delete: ${path.relative(DASHBOARD_ROOT, toDelete)} (${label})`
          : `delete: ${path.relative(DASHBOARD_ROOT, toDelete)} (${label})`
      );
      try {
        rmTree(toDelete, dryRun);
        removed++;
      } catch (e) {
        console.error('Failed to remove', toDelete, e.message || e);
      }
    }
  }

  if (dryRun === false && (skippedNoTs || skippedOther)) {
    if (skippedNoTs) console.log('Note:', skippedNoTs, 'report(s) skipped (no usable startTime).');
    if (skippedOther) console.log('Note:', skippedOther, 'expired report(s) skipped (path missing or unsafe).');
  }

  if (dryRun) {
    console.log('[dry-run] no files deleted; sync-meta not run.');
    return;
  }

  if (removed === 0) {
    console.log('No execution folders removed; running sync-meta anyway to normalize meta-info.');
  }

  runSyncMeta(buildIndex);
}

main();
