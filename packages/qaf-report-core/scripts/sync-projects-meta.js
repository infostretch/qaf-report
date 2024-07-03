#!/usr/bin/env node
/**
 * @author Chirag Jayswal, QAF team
 * Sync projects.json (optional) and/or execution meta under each test-results/ tree.
 *
 * Flags (defaults):
 *   --projects           Update projects.json + orphan mirror cleanup (default: off)
 *   --no-executions      Skip root meta-info + per-execution json/meta-info pruning (default: run executions)
 *   --build-index        After execution sync, rebuild test-history-index per tree + merged site-root index when ≥2 projects
 *   --no-upload-inbox    Do not import files from upload dir(s) before syncing
 *   --upload-dir=<name>  Inbox folder name under dashboard root / each project (default: upload; override with QAF_UPLOAD_DIR)
 *
 * Examples:
 *   node scripts/sync-projects-meta.js                      # executions only
 *   node scripts/sync-projects-meta.js --projects           # projects + executions
 *   node scripts/sync-projects-meta.js --projects --no-executions
 *   node scripts/sync-projects-meta.js --build-index
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveProjectRoot } = require('./resolve-project-root.js');

const DASHBOARD_ROOT = resolveProjectRoot();
const EXCLUDED_DIR_NAMES = new Set(['test-history-index', 'test-history-index.backup']);
const DEFAULT_CONFIG = { maxHistory: 10 };

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadMaxHistory() {
  const configPath = path.join(DASHBOARD_ROOT, 'test-results', 'dashboard-config.json');
  const c = readJsonSafe(configPath, {});
  const n = parseInt(c.maxHistory, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CONFIG.maxHistory;
}

function defaultLabelForSlug(slug) {
  if (!slug) return 'Default';
  return String(slug)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(' ');
}

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

/**
 * projects.json from disk truth only; keep labels/descriptions for ids that still exist.
 */
function buildProjectsJson(existingManifest, validSlugs) {
  const byId = new Map();
  for (const p of existingManifest?.projects || []) {
    const id = p.id != null && p.id !== '' ? String(p.id) : '';
    byId.set(id, { id, label: p.label || defaultLabelForSlug(id), description: p.description || '' });
  }

  const projects = [];
  if (validSlugs.has('')) {
    const p = byId.get('') || { id: '', label: 'Default', description: 'test-results at repository root' };
    projects.push({
      id: '',
      label: p.label || 'Default',
      description: p.description || 'test-results at repository root'
    });
  }

  for (const id of [...validSlugs].filter((k) => k !== '').sort()) {
    const p = byId.get(id) || {
      id,
      label: defaultLabelForSlug(id),
      description: `test-results in ${id}/`
    };
    projects.push({
      id,
      label: p.label || defaultLabelForSlug(id),
      description: p.description || `test-results in ${id}/`
    });
  }

  return { projects };
}

/** Remove sibling meta-info.json when test-results was deleted (mirror only). */
function cleanupOrphanProjectMirrors(validSlugs) {
  let removed = 0;
  let entries;
  try {
    entries = fs.readdirSync(DASHBOARD_ROOT, { withFileTypes: true });
  } catch {
    return removed;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
    const slug = ent.name;
    if (slug === 'test-results') continue;
    if (validSlugs.has(slug)) continue;
    const tr = path.join(DASHBOARD_ROOT, slug, 'test-results');
    const mirror = path.join(DASHBOARD_ROOT, slug, 'meta-info.json');
    if (!fs.existsSync(tr) && fs.existsSync(mirror)) {
      try {
        fs.unlinkSync(mirror);
        removed++;
        console.log('Removed orphan mirror:', path.relative(DASHBOARD_ROOT, mirror));
      } catch (e) {
        console.warn('Could not remove', mirror, e.message);
      }
    }
  }
  return removed;
}

function scanExecutions(testResultsAbs) {
  const out = [];

  function walk(relParts, absDir) {
    const tail = relParts.length ? relParts[relParts.length - 1] : '';
    if (tail && EXCLUDED_DIR_NAMES.has(tail)) return;

    const jsonMeta = path.join(absDir, 'json', 'meta-info.json');
    if (fs.existsSync(jsonMeta)) {
      const dir = ['test-results', ...relParts, 'json'].join('/').replace(/\\/g, '/');
      out.push({ dir, execFolderAbs: absDir });
      return;
    }

    let ents;
    try {
      ents = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      if (!ent.isDirectory()) continue;
      if (EXCLUDED_DIR_NAMES.has(ent.name)) continue;
      walk([...relParts, ent.name], path.join(absDir, ent.name));
    }
  }

  let ents;
  try {
    ents = fs.readdirSync(testResultsAbs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    if (!ent.isDirectory()) continue;
    if (EXCLUDED_DIR_NAMES.has(ent.name)) continue;
    walk([ent.name], path.join(testResultsAbs, ent.name));
  }
  return out;
}

function readExecStartTime(execFolderAbs) {
  const p = path.join(execFolderAbs, 'json', 'meta-info.json');
  const meta = readJsonSafe(p, null);
  if (!meta || typeof meta !== 'object') return 0;
  const t = Number(meta.startTime);
  return Number.isFinite(t) ? t : 0;
}

function executionNameForAuto(startTimeMs) {
  const iso =
    Number.isFinite(startTimeMs) && startTimeMs > 0
      ? new Date(startTimeMs).toISOString()
      : new Date().toISOString();
  return `Execution@${iso}`;
}

function recomputeTotalsFromOverviews(jsonDir, tests) {
  let total = 0;
  let pass = 0;
  let fail = 0;
  let skip = 0;
  for (const ts of tests) {
    const ovPath = path.join(jsonDir, ts, 'overview.json');
    const ov = readJsonSafe(ovPath, null);
    if (!ov || typeof ov !== 'object') continue;
    total += Number(ov.total) || 0;
    pass += Number(ov.pass) || 0;
    fail += Number(ov.fail) || 0;
    skip += Number(ov.skip) || 0;
  }
  return { total, pass, fail, skip };
}

/**
 * Prune execution-level json/meta-info.json: valid tests[] only, sync totals to overviews.
 */
function pruneExecutionDetailMeta(execFolderAbs) {
  const jsonDir = path.join(execFolderAbs, 'json');
  const metaPath = path.join(jsonDir, 'meta-info.json');
  const meta = readJsonSafe(metaPath, null);
  if (!meta || typeof meta !== 'object') return false;

  const rawTests = Array.isArray(meta.tests) ? meta.tests : [];
  const filtered = rawTests.filter((ts) => {
    if (typeof ts !== 'string' || !ts.trim()) return false;
    return fs.existsSync(path.join(jsonDir, ts, 'overview.json'));
  });

  const totals = recomputeTotalsFromOverviews(jsonDir, filtered);
  const next = { ...meta, tests: filtered };
  next.total = totals.total;
  next.pass = totals.pass;
  next.fail = totals.fail;
  next.skip = totals.skip;

  const sameTests =
    rawTests.length === filtered.length && rawTests.every((t, i) => t === filtered[i]);
  const sameNumbers =
    (meta.total || 0) === next.total &&
    (meta.pass || 0) === next.pass &&
    (meta.fail || 0) === next.fail &&
    (meta.skip || 0) === next.skip;

  if (sameTests && sameNumbers) return false;

  writeJson(metaPath, next);
  return true;
}

function syncMetaForTestResultsDir(absTestResults, slug) {
  const discovered = scanExecutions(absTestResults);
  let prunedExecMetas = 0;
  for (const d of discovered) {
    if (pruneExecutionDetailMeta(d.execFolderAbs)) prunedExecMetas++;
  }

  const metaPath = path.join(absTestResults, 'meta-info.json');
  const oldReports = readJsonSafe(metaPath, {}).reports || [];
  const oldByDir = new Map(oldReports.map((r) => [r.dir, r]));

  const reports = discovered
    .map((d) => {
      const startTime = readExecStartTime(d.execFolderAbs);
      const prev = oldByDir.get(d.dir);
      if (prev) {
        return {
          name: prev.name,
          dir: d.dir,
          startTime: startTime || prev.startTime || 0
        };
      }
      return {
        name: executionNameForAuto(startTime),
        dir: d.dir,
        startTime: startTime || 0
      };
    })
    .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

  fs.mkdirSync(absTestResults, { recursive: true });
  writeJson(metaPath, { reports });

  if (slug) {
    const mirrorPath = path.join(DASHBOARD_ROOT, slug, 'meta-info.json');
    writeJson(mirrorPath, { reports });
  }

  return { count: reports.length, prunedExecMetas, metaPath };
}

function parseUploadDirName(argv) {
  const env = process.env.QAF_UPLOAD_DIR;
  if (env != null && String(env).trim() !== '') return String(env).trim();
  const eq = argv.find((a) => a.startsWith('--upload-dir='));
  if (eq) {
    const v = eq.slice('--upload-dir='.length).trim();
    return v || 'upload';
  }
  const idx = argv.indexOf('--upload-dir');
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return String(argv[idx + 1]).trim();
  return 'upload';
}

async function main() {
  const argv = process.argv.slice(2);
  const syncProjects = argv.includes('--projects');
  const syncExecutions = !argv.includes('--no-executions');
  const doIndex = argv.includes('--build-index');

  if (!syncProjects && !syncExecutions) {
    console.warn('Nothing to do: enable --projects and/or omit --no-executions.');
    process.exit(0);
    return;
  }

  let roots = discoverProjectTestResultRoots();
  if (syncExecutions && !argv.includes('--no-upload-inbox')) {
    const { processAllUploadInboxes } = require('./qaf-import/sync-upload-inbox.js');
    const uploadDirName = parseUploadDirName(argv);
    try {
      const { totalImported, totalRemoved, errors } = await processAllUploadInboxes(DASHBOARD_ROOT, uploadDirName);
      if (totalImported > 0) {
        console.log(
          'Upload inbox: imported',
          totalImported,
          'file(s); removed',
          totalRemoved,
          'after successful import.'
        );
      }
      for (const err of errors) {
        console.warn('Upload inbox:', path.relative(DASHBOARD_ROOT, err.file), '-', err.message);
      }
    } catch (e) {
      console.warn('Upload inbox pass failed:', e.message || e);
    }
    roots = discoverProjectTestResultRoots();
  }
  const validSlugs = new Set(roots.map((r) => r.slug));

  if (syncProjects) {
    const orphanMirrors = cleanupOrphanProjectMirrors(validSlugs);
    if (orphanMirrors) console.log('Removed', orphanMirrors, 'orphan project mirror file(s).');

    const existingManifest = readJsonSafe(path.join(DASHBOARD_ROOT, 'projects.json'), { projects: [] });
    const nextManifest = buildProjectsJson(existingManifest, validSlugs);
    writeJson(path.join(DASHBOARD_ROOT, 'projects.json'), nextManifest);
    console.log('Wrote projects.json (' + nextManifest.projects.length + ' project(s)).');
  }

  if (!syncExecutions) {
    if (doIndex) {
      console.warn('--build-index skipped (--no-executions).');
    }
    return;
  }

  if (!roots.length) {
    console.warn('No test-results directories found under', DASHBOARD_ROOT);
    return;
  }

  for (const { slug, absTestResults } of roots) {
    const rel = path.relative(DASHBOARD_ROOT, absTestResults);
    const { count, prunedExecMetas } = syncMetaForTestResultsDir(absTestResults, slug);
    console.log(
      'Synced',
      rel + ':',
      count,
      'execution(s); pruned',
      prunedExecMetas,
      'execution meta-info.json file(s)'
    );
  }

  if (doIndex) {
    const { buildIndex, buildWorkspaceIndex } = require('./build-test-history-index.js');
    const maxHistory = loadMaxHistory();
    for (const { slug, absTestResults } of roots) {
      const rel = path.relative(DASHBOARD_ROOT, absTestResults);
      const projectId = slug != null && String(slug).trim() !== '' ? String(slug).trim() : '';
      try {
        await buildIndex(absTestResults, { write: true, maxHistory, projectId });
        console.log('Built test-history-index for', rel);
      } catch (e) {
        console.error('Index failed for', rel, e.message || e);
      }
    }
    const manifest = readJsonSafe(path.join(DASHBOARD_ROOT, 'projects.json'), { projects: [] });
    if ((manifest.projects || []).length >= 2) {
      try {
        await buildWorkspaceIndex(DASHBOARD_ROOT, { write: true, maxHistory });
        console.log('Built merged workspace test-history-index at site root (for ?prj=__all__)');
      } catch (e) {
        console.error('Workspace index failed', e.message || e);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
