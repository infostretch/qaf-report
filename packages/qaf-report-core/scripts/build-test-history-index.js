#!/usr/bin/env node
/**
 * @author Chirag Jayswal, QAF team
 * Build test-history-index.json for the dashboard.
 * Run: node scripts/build-test-history-index.js [test-results-path]
 * Workspace (multi-project): node scripts/build-test-history-index.js --workspace <dashboard-root>
 * Default single path: ./test-results
 *
 * Output: test-history-index.json (manifest) + test-history-index/{hash}.json
 * Optional sharded tests-index: tests-index-manifest.json + tests-index-NNN.json when key count exceeds shard size.
 * Catalog keys: projectId\\x1etestID\\x1eclassPath (empty projectId for default single-tree builds).
 */
const realFs = require('fs');
require('graceful-fs').gracefulify(realFs);
const DEFAULT_MAX_HISTORY = 10;
const MAX_CONCURRENT_READS = 16;
/** ~8k rows per chunk keeps each JSON under typical parse/memory budgets at scale */
const DEFAULT_TESTS_INDEX_SHARD_SIZE = Number(process.env.QAF_TESTS_INDEX_SHARD_SIZE || 8000);
const fs = require('fs');
const path = require('path');
const fsPromises = fs.promises;
const ReportMetaHelpers = require(path.join(__dirname, '../lib/report-meta-helpers.js'));

let readQueue = [];
let activeReads = 0;

function acquireReadSlot() {
  if (activeReads < MAX_CONCURRENT_READS) {
    activeReads++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    readQueue.push(resolve);
  });
}

function releaseReadSlot() {
  activeReads--;
  if (readQueue.length > 0) {
    activeReads++;
    readQueue.shift()();
  }
}

async function readJsonAsync(filePath) {
  await acquireReadSlot();
  try {
    const data = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  } finally {
    releaseReadSlot();
  }
}

function testKey(testID, classPath) {
  return (testID || '') + '\0' + (classPath || '');
}

function hashTestKey(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Storage key for hash files and index lookups (matches browser DataLoader). */
function storageKeyForIndex(projectId, testID, classPath) {
  const p = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : '';
  const tk = testKey(testID, classPath);
  return p ? `${p}\0${tk}` : tk;
}

/** Stable key for tests-index.json object entries. */
function catalogIndexKey(projectId, testID, classPath) {
  const p = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : '';
  return `${p}\x1e${testID}\x1e${classPath}`;
}

function formatFailureReason(errorTrace) {
  if (!errorTrace || typeof errorTrace !== 'string') return '';
  const firstLine = String(errorTrace).split('\n')[0].trim();
  if (!firstLine) return '';
  const match = firstLine.match(/^(?:\w+\.)*(\w+(?:Exception|Error)):\s*(.+)$/);
  if (match) {
    let [, excType, msg] = match;
    msg = msg.trim();
    const advisoryIdx = msg.search(/\s+You can check\/set value of/i);
    if (advisoryIdx > 0) msg = msg.substring(0, advisoryIdx).trim();
    msg = msg.replace(/\.\s*\.\.\.\s*$/, '').trim();
    return excType + ': ' + msg;
  }
  return firstLine;
}

async function loadFailureReasonAsync(classDir, resultFileName) {
  if (!resultFileName) return '';
  const baseName = resultFileName.replace(/\d+$/, '');
  const toTry = [`${resultFileName}.json`, `${baseName}.json`];
  for (let i = 0; i < 5; i++) toTry.push(`${baseName}${i}.json`);
  for (const fname of [...new Set(toTry)]) {
    try {
      const data = await readJsonAsync(path.join(classDir, fname));
      const err = data?.errorTrace || data?.errorMessage;
      if (err) return formatFailureReason(err);
    } catch (e) {
      continue;
    }
  }
  return '';
}

/**
 * Resolve report.dir to the filesystem path of the execution json folder.
 */
function resolveExecutionDir(rootPath, execDir) {
  if (!execDir) return rootPath;
  if (path.isAbsolute(execDir)) return execDir;
  const norm = String(execDir).replace(/\\/g, '/');
  const needle = '/test-results/';
  const k = norm.indexOf(needle);
  if (k >= 0) {
    const suffix = norm.slice(k + needle.length);
    return path.join(rootPath, suffix);
  }
  if (norm.startsWith('test-results/')) {
    return path.resolve(path.dirname(rootPath), norm);
  }
  return path.join(rootPath, norm);
}

/**
 * Append methods from one execution into `tests` map (mutates).
 */
async function ingestExecutionReports(rootPath, meta, projectId, tests, maxHistory) {
  let lastUpdated = 0;
  const dirs = [];
  function mergedDirForReport(rdir) {
    const raw = rdir || '';
    return projectId && String(raw).startsWith('test-results/') ? `${projectId}/${raw}` : raw;
  }
  for (const report of meta.reports || []) {
    dirs.push(mergedDirForReport(report.dir));
    const execDir = report.dir;
    const basePath = resolveExecutionDir(rootPath, execDir);
    const execMetaPath = path.join(basePath, 'meta-info.json');
    const execMeta = await readJsonAsync(execMetaPath);
    if (!execMeta?.tests) continue;

    lastUpdated = Math.max(lastUpdated, report.startTime || 0);

    for (const testsetPath of execMeta.tests) {
      const overviewPath = path.join(basePath, testsetPath, 'overview.json');
      const overview = await readJsonAsync(overviewPath);
      if (!overview?.classes) continue;

      for (const classPath of overview.classes) {
        const classMetaPath = path.join(basePath, testsetPath, classPath, 'meta-info.json');
        const classMeta = await readJsonAsync(classMetaPath);
        if (!classMeta?.methods) continue;

        const classDir = path.join(basePath, testsetPath, classPath);
        for (const method of classMeta.methods) {
          const tid = ReportMetaHelpers.getTestIdFromMeta(method.metaData);
          if (!tid) continue;
          const sk = storageKeyForIndex(projectId, tid, classPath);
          if (!tests[sk]) tests[sk] = [];
          const isFailed = method.result === 'fail' || method.result === 'skip';
          const failureReason = isFailed ? await loadFailureReasonAsync(classDir, method.metaData?.resultFileName) : '';
          const moduleName = ReportMetaHelpers.getModuleFromMethod({ ...method, testsetPath }, classPath);
          const entry = {
            report: { name: report.name, dir: mergedDirForReport(report.dir), startTime: report.startTime },
            method: {
              result: method.result,
              duration: method.duration,
              startTime: method.startTime,
              metaData: {
                testID: tid,
                resultFileName: method.metaData?.resultFileName,
                name: method.metaData?.name,
                reference: method.metaData?.reference,
                module: moduleName
              }
            },
            testsetPath
          };
          if (failureReason) entry.failureReason = failureReason;
          tests[sk].push(entry);
        }
      }
    }
  }
  for (const sk of Object.keys(tests)) {
    tests[sk] = tests[sk]
      .sort((a, b) => (b.method.startTime || 0) - (a.method.startTime || 0))
      .slice(0, maxHistory);
  }
  return { lastUpdated, reportDirs: dirs };
}

function parseStorageKey(sk) {
  const parts = String(sk).split('\0');
  if (parts.length >= 3) {
    return { projectId: parts[0] || '', testID: parts[1], classPath: parts.slice(2).join('\0') };
  }
  if (parts.length === 2) {
    return { projectId: '', testID: parts[0], classPath: parts[1] };
  }
  return { projectId: '', testID: sk, classPath: '' };
}

/**
 * Write manifest, per-test hash json files, and tests-index (optionally sharded).
 */
function writeIndexBundle(outRoot, tests, mergedLastUpdated, sortedReportDirs, opts = {}) {
  const shouldWrite = opts.write !== false;
  const maxHistory = opts.maxHistory ?? DEFAULT_MAX_HISTORY;
  const shardSize = opts.testsIndexShardSize ?? DEFAULT_TESTS_INDEX_SHARD_SIZE;
  if (!shouldWrite) return;

  const indexDir = path.join(outRoot, 'test-history-index');
  const manifestPath = path.join(outRoot, 'test-history-index.json');
  const backupPath = manifestPath + '.backup';
  const backupDir = path.join(outRoot, 'test-history-index.backup');
  if (fs.existsSync(manifestPath)) fs.copyFileSync(manifestPath, backupPath);
  if (fs.existsSync(indexDir)) {
    if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true });
    fs.cpSync(indexDir, backupDir, { recursive: true });
  } else if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true });
  }
  fs.mkdirSync(indexDir, { recursive: true });

  const manifest = { lastUpdated: mergedLastUpdated, reportDirs: sortedReportDirs };
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    const byCatalog = {};
    const storageKeys = Object.keys(tests);
    let count = 0;

    for (const sk of storageKeys) {
      const entries = tests[sk];
      const sorted = (entries || [])
        .sort((a, b) => (b.method.startTime || 0) - (a.method.startTime || 0))
        .slice(0, maxHistory);
      const { projectId, testID, classPath } = parseStorageKey(sk);
      const hash = hashTestKey(sk);
      fs.writeFileSync(path.join(indexDir, hash + '.json'), JSON.stringify(sorted), 'utf8');
      count++;

      const mostRecent = sorted[0]?.method?.startTime || 0;
      const e0 = sorted[0];
      const moduleName =
        e0?.method?.metaData?.module ??
        ReportMetaHelpers.getModuleFromMethod(
          e0?.method && { ...e0.method, testsetPath: e0.testsetPath },
          classPath
        );
      const ckey = catalogIndexKey(projectId, testID, classPath);
      if (!byCatalog[ckey] || mostRecent > (byCatalog[ckey].startTime || 0)) {
        byCatalog[ckey] = {
          classPath,
          hash,
          startTime: mostRecent,
          module: moduleName,
          projectId: projectId || undefined,
          runs: sorted,
          testID
        };
      }
    }

    const catalogEntries = Object.entries(byCatalog);
    catalogEntries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    if (catalogEntries.length <= shardSize) {
      const single = {};
      for (const [k, v] of catalogEntries) single[k] = v;
      fs.writeFileSync(path.join(indexDir, 'tests-index.json'), JSON.stringify(single), 'utf8');
      try {
        fs.unlinkSync(path.join(indexDir, 'tests-index-manifest.json'));
      } catch (e) {}
      for (const f of fs.readdirSync(indexDir)) {
        if (/^tests-index-\d{3}\.json$/.test(f)) {
          try {
            fs.unlinkSync(path.join(indexDir, f));
          } catch (e) {}
        }
      }
    } else {
      try {
        fs.unlinkSync(path.join(indexDir, 'tests-index.json'));
      } catch (e) {}
      const chunks = [];
      for (let i = 0, part = 0; i < catalogEntries.length; i += shardSize, part++) {
        const slice = catalogEntries.slice(i, i + shardSize);
        const chunkObj = {};
        for (const [k, v] of slice) chunkObj[k] = v;
        const fname = `tests-index-${String(part).padStart(3, '0')}.json`;
        fs.writeFileSync(path.join(indexDir, fname), JSON.stringify(chunkObj), 'utf8');
        chunks.push(fname);
      }
      fs.writeFileSync(
        path.join(indexDir, 'tests-index-manifest.json'),
        JSON.stringify({ version: 1, format: 'tests-index-shards', chunks }, null, 0),
        'utf8'
      );
    }

    if (require.main === module) {
      console.log('Wrote manifest +', count, 'per-test index files + tests-index (sharded:', catalogEntries.length > shardSize, ')');
    }
  } catch (e) {
    if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, manifestPath);
    if (fs.existsSync(backupDir)) {
      if (fs.existsSync(indexDir)) fs.rmSync(indexDir, { recursive: true });
      fs.cpSync(backupDir, indexDir, { recursive: true });
    }
    throw e;
  }
}

async function buildIndex(rootPath, opts = {}) {
  rootPath = path.resolve(rootPath || path.join(process.cwd(), 'test-results'));
  const shouldWrite = opts.write || require.main === module;
  const maxHistory = opts.maxHistory ?? DEFAULT_MAX_HISTORY;
  const projectId = opts.projectId != null && String(opts.projectId).trim() !== '' ? String(opts.projectId).trim() : '';
  const metaPath = path.join(rootPath, 'meta-info.json');
  const meta = await readJsonAsync(metaPath);
  if (!meta?.reports?.length) {
    if (require.main === module && !opts.quiet) {
      console.error('No reports in meta-info.json at', metaPath);
      process.exit(1);
    }
    return null;
  }

  const tests = {};
  const { lastUpdated } = await ingestExecutionReports(rootPath, meta, projectId, tests, maxHistory);
  const reportDirs = meta.reports.map((r) => r.dir).sort();

  writeIndexBundle(rootPath, tests, lastUpdated, reportDirs, { write: shouldWrite, maxHistory, testsIndexShardSize: opts.testsIndexShardSize });

  const testsMap = {};
  for (const key of Object.keys(tests)) {
    testsMap[key] = tests[key];
  }
  return { lastUpdated, reportDirs, tests: testsMap };
}

/**
 * Build merged site-root index from dashboard layout: projects.json + {id}/test-results/meta-info.json
 * Writes test-history-index.json and test-history-index/ under workspaceRoot.
 */
async function buildWorkspaceIndex(workspaceRoot, opts = {}) {
  workspaceRoot = path.resolve(workspaceRoot);
  const shouldWrite = opts.write !== false;
  const maxHistory = opts.maxHistory ?? DEFAULT_MAX_HISTORY;
  const projPath = path.join(workspaceRoot, 'projects.json');
  const data = await readJsonAsync(projPath);
  const list = data?.projects || [];
  if (list.length < 2) {
    if (require.main === module) console.error('workspace mode needs ≥2 projects in', projPath);
    return null;
  }

  const tests = {};
  let lastUpdated = 0;
  const reportDirsSet = new Set();

  for (const p of list) {
    const id = p.id != null && String(p.id).trim() !== '' ? String(p.id).trim() : '';
    const mount = id ? path.join(workspaceRoot, id, 'test-results') : path.join(workspaceRoot, 'test-results');
    const meta = await readJsonAsync(path.join(mount, 'meta-info.json'));
    if (!meta?.reports?.length) continue;
    const { lastUpdated: lu, reportDirs: rd } = await ingestExecutionReports(mount, meta, id, tests, maxHistory);
    lastUpdated = Math.max(lastUpdated, lu);
    for (const d of rd) {
      const dir = id && String(d).startsWith('test-results/') ? `${id}/${d}` : d;
      reportDirsSet.add(dir);
    }
  }

  const sortedReportDirs = [...reportDirsSet].sort();
  if (sortedReportDirs.length === 0) return null;

  writeIndexBundle(workspaceRoot, tests, lastUpdated, sortedReportDirs, {
    write: shouldWrite,
    maxHistory,
    testsIndexShardSize: opts.testsIndexShardSize
  });

  return { lastUpdated, reportDirs: sortedReportDirs, tests };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let workspace = null;
  let rootPath = path.join(process.cwd(), 'test-results');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      workspace = path.resolve(args[++i]);
    } else if (args[i] && !args[i].startsWith('-')) {
      rootPath = path.resolve(args[i]);
    }
  }
  const run = workspace ? buildWorkspaceIndex(workspace) : buildIndex(rootPath);
  run.catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

function getModuleFromPath(p) {
  return ReportMetaHelpers.getModuleFromPath(p);
}
function getModule(method, classPath) {
  return ReportMetaHelpers.getModuleFromMethod(method, classPath);
}

module.exports = {
  buildIndex,
  buildWorkspaceIndex,
  resolveExecutionDir,
  hashTestKey,
  testKey,
  storageKeyForIndex,
  catalogIndexKey,
  getModule,
  getModuleFromPath,
  ReportMetaHelpers
};
