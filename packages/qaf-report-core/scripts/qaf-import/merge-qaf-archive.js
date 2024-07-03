/**
 * @author Chirag Jayswal, QAF team
 * Merge QAF test-results tree from archive entries into a test-results directory.
 * Used by the reporting server and sync upload inbox.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function mergeMetaInfo(existing, incoming) {
  const byDir = new Map();
  (existing?.reports || []).forEach((r) => byDir.set(r.dir, r));
  (incoming?.reports || []).forEach((r) => {
    const cur = byDir.get(r.dir);
    if (!cur || (r.startTime || 0) > (cur.startTime || 0)) byDir.set(r.dir, r);
  });
  return { reports: Array.from(byDir.values()).sort((a, b) => (b.startTime || 0) - (a.startTime || 0)) };
}

function resolveReportDir(projectRoot, dir) {
  return path.isAbsolute(dir) ? dir : path.join(projectRoot, dir);
}

function cleanAndPruneReports(projectRoot, reports, config) {
  const filtered = (reports || []).filter((r) => {
    const fullPath = resolveReportDir(projectRoot, r.dir);
    return fs.existsSync(fullPath);
  });
  return filtered.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
}

/**
 * @param {{ name: string, data: Buffer }[]} rawEntries
 * @param {{ projectRoot: string, testResultsPath: string, config: object }} ctx
 */
function mergeQafTestResultsArchive(rawEntries, ctx) {
  const { projectRoot, testResultsPath, config } = ctx;
  const testResultsDir = 'test-results/';
  let zipMeta = null;
  let prefix = null;
  for (const e of rawEntries) {
    const name = e.name;
    const idx = name.indexOf(testResultsDir);
    if (idx === -1) continue;
    const p = name.substring(0, idx + testResultsDir.length);
    if (prefix === null || p.length < prefix.length) prefix = p;
    if (name.endsWith('/meta-info.json') && !name.includes('/json/')) {
      zipMeta = JSON.parse(e.data.toString('utf8'));
    }
  }
  if (!prefix) throw new Error('No test-results folder found in archive');
  const toExtract = [];
  for (const e of rawEntries) {
    const name = e.name;
    if (!name.startsWith(prefix)) continue;
    const rel = name.slice(prefix.length);
    if (rel === 'meta-info.json') continue;
    toExtract.push({ rel, data: e.data });
  }
  fs.mkdirSync(testResultsPath, { recursive: true });
  for (const { rel, data } of toExtract) {
    const dest = path.join(testResultsPath, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }
  const metaPathFull = path.join(testResultsPath, 'meta-info.json');
  let existing = { reports: [] };
  if (fs.existsSync(metaPathFull)) {
    existing = JSON.parse(fs.readFileSync(metaPathFull, 'utf8'));
  }
  const existingDirs = new Set((existing.reports || []).map((r) => r.dir));
  const merged = zipMeta ? mergeMetaInfo(existing, zipMeta) : existing;
  const cleaned = { reports: cleanAndPruneReports(projectRoot, merged.reports, config) };
  fs.writeFileSync(metaPathFull, JSON.stringify(cleaned, null, 2));

  const zipReports = zipMeta?.reports || [];
  let suites = 0;
  let tests = 0;
  let pass = 0;
  let fail = 0;
  let skip = 0;
  let newCount = 0;
  let updatedCount = 0;
  for (const r of zipReports) {
    const fullPath = path.join(resolveReportDir(projectRoot, r.dir), 'meta-info.json');
    try {
      const execMeta = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      suites += (execMeta.tests || []).length;
      tests += execMeta.total ?? 0;
      pass += execMeta.pass ?? 0;
      fail += execMeta.fail ?? 0;
      skip += execMeta.skip ?? 0;
    } catch (e) {}
    if (existingDirs.has(r.dir)) {
      updatedCount++;
    } else {
      newCount++;
    }
  }
  const status = newCount > 0 ? 'uploaded' : updatedCount > 0 ? 'updated' : 'duplicate';
  return {
    ok: true,
    status,
    message: status === 'uploaded' ? 'New execution(s) added' : status === 'updated' ? 'Execution(s) updated' : 'Duplicate (no new data)',
    stats: {
      executions: zipReports.length,
      new: newCount,
      updated: updatedCount,
      suites,
      tests,
      pass,
      fail,
      skip
    }
  };
}

module.exports = {
  mergeMetaInfo,
  resolveReportDir,
  cleanAndPruneReports,
  mergeQafTestResultsArchive
};
