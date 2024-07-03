#!/usr/bin/env node
/**
 * @author Chirag Jayswal, QAF team
 * Serve the dashboard with on-demand test-history-index build.
 * When test-results/test-history-index.json is requested and missing, builds it.
 * POST /api/upload: merge QAF test-results tree from .zip/.tgz, or import JUnit XML / Playwright JSON / Cucumber JSON (see ?import=).
 *
 * Usage: node scripts/server.js [port]
 * Port: CLI argv first, then QAF_PORT or PORT, then 2612 (qaf-dashboard-ui default).
 */
const realFs = require('fs');
require('graceful-fs').gracefulify(realFs);
const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildIndex } = require('./build-test-history-index.js');
const { resolveUiStaticRoot } = require('./resolve-ui-static-root.js');
const { resolveProjectRoot } = require('./resolve-project-root.js');
const { resolveRawEntries, archiveExtractCapabilities } = require('./lib/archive-extract.js');
const {
  normalizeKind,
  importFromArchiveEntries
} = require('./qaf-import/upload-from-archive.js');
const {
  mergeMetaInfo,
  resolveReportDir: resolveReportDirWithRoot,
  cleanAndPruneReports: cleanAndPruneReportsWithRoot,
  mergeQafTestResultsArchive: mergeQafArchiveToTree
} = require('./qaf-import/merge-qaf-archive.js');
let Busboy;
try { Busboy = require('busboy'); } catch (e) { Busboy = null; }

function resolveListenPort() {
  const a = process.argv[2];
  const fromArgv = a != null && String(a).trim() !== '' ? parseInt(a, 10) : NaN;
  if (Number.isFinite(fromArgv) && fromArgv > 0) return fromArgv;
  const fromEnv = parseInt(process.env.QAF_PORT || process.env.PORT || '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 2612;
}

const port = resolveListenPort();
const projectRoot = resolveProjectRoot();
if (path.resolve(projectRoot) !== path.resolve(process.cwd())) {
  console.log('qaf-serve: data root', projectRoot, '(npm workspace cwd was', process.cwd() + ')');
}
const staticRoot = resolveUiStaticRoot({ projectRoot });
const testResultsPath = path.join(projectRoot, 'test-results');
const configPath = path.join(testResultsPath, 'dashboard-config.json');
const indexPath = path.join(testResultsPath, 'test-history-index.json');
const indexDir = path.join(testResultsPath, 'test-history-index');

const DEFAULT_CONFIG = { maxExecutions: 5, maxHistory: 10, allowDeleteOldExecutions: false };

function loadConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ...DEFAULT_CONFIG, ...data };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  fs.mkdirSync(testResultsPath, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

/** Allow more parallel dashboard reads (test-history shards, overview, class metas). */
const MAX_SERVER_FILE_READS = 48;
let serverReadQueue = [];
let serverActiveReads = 0;

function acquireServerReadSlot() {
  if (serverActiveReads < MAX_SERVER_FILE_READS) {
    serverActiveReads++;
    return Promise.resolve();
  }
  return new Promise((resolve) => { serverReadQueue.push(resolve); });
}

function releaseServerReadSlot() {
  serverActiveReads--;
  if (serverReadQueue.length > 0) {
    serverActiveReads++;
    serverReadQueue.shift()();
  }
}

async function readFileQueued(filePath, encoding) {
  await acquireServerReadSlot();
  try {
    return await fs.promises.readFile(filePath, encoding);
  } finally {
    releaseServerReadSlot();
  }
}

function isIndexStale() {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(testResultsPath, 'meta-info.json'), 'utf8'));
    const reports = meta?.reports || [];
    if (!reports.length) return false;
    if (!fs.existsSync(indexPath)) return true;
    const manifest = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const indexed = new Set(manifest?.reportDirs || []);
    const current = new Set(reports.map(r => r.dir));
    if (indexed.size !== current.size) return true;
    for (const d of current) if (!indexed.has(d)) return true;
    const last = manifest?.lastUpdated ?? 0;
    return reports.some(r => (r.startTime || 0) > last);
  } catch (e) {
    return !fs.existsSync(indexPath);
  }
}

function backupIndex() {
  const backupPath = indexPath + '.backup';
  const backupDir = indexDir + '.backup';
  try {
    if (fs.existsSync(indexPath)) fs.copyFileSync(indexPath, backupPath);
    if (fs.existsSync(indexDir)) {
      if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true });
      fs.cpSync(indexDir, backupDir, { recursive: true });
    }
  } catch (e) {}
}

function restoreIndexBackup() {
  const backupPath = indexPath + '.backup';
  const backupDir = indexDir + '.backup';
  try {
    if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, indexPath);
    if (fs.existsSync(backupDir)) {
      if (fs.existsSync(indexDir)) fs.rmSync(indexDir, { recursive: true });
      fs.cpSync(backupDir, indexDir, { recursive: true });
    }
  } catch (e) {}
}

const EXCLUDED_SUBDIRS = new Set(['test-history-index', 'test-history-index.backup']);

function discoverExecutionDirs() {
  const reports = [];
  try {
    const names = fs.readdirSync(testResultsPath);
    for (const name of names) {
      if (EXCLUDED_SUBDIRS.has(name)) continue;
      const subdir = path.join(testResultsPath, name);
      const stat = fs.lstatSync(subdir);
      if (!stat.isDirectory()) continue;
      const jsonMetaPath = path.join(subdir, 'json', 'meta-info.json');
      const rootMetaPath = path.join(subdir, 'meta-info.json');
      let dir, entry;
      if (fs.existsSync(jsonMetaPath)) {
        dir = `test-results/${name}/json`;
        try {
          const execMeta = JSON.parse(fs.readFileSync(jsonMetaPath, 'utf8'));
          entry = { name: execMeta.name || name, dir, startTime: execMeta.startTime ?? 0 };
        } catch (e) {
          entry = { name, dir, startTime: 0 };
        }
      } else if (fs.existsSync(rootMetaPath)) {
        dir = `test-results/${name}`;
        try {
          const execMeta = JSON.parse(fs.readFileSync(rootMetaPath, 'utf8'));
          entry = { name: execMeta.name || name, dir, startTime: execMeta.startTime ?? 0 };
        } catch (e) {
          entry = { name, dir, startTime: 0 };
        }
      } else {
        dir = `test-results/${name}`;
        entry = { name, dir, startTime: 0 };
      }
      reports.push(entry);
    }
  } catch (e) {}
  return reports.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
}

function ensureMetaClean() {
  const metaPathFull = path.join(testResultsPath, 'meta-info.json');
  const discovered = discoverExecutionDirs();
  let reports;
  let orig = [];
  if (!fs.existsSync(metaPathFull)) {
    reports = discovered;
  } else {
    const meta = JSON.parse(fs.readFileSync(metaPathFull, 'utf8'));
    orig = meta.reports || [];
    reports = mergeMetaInfo(meta, { reports: discovered }).reports;
  }
  const config = loadConfig();
  const cleaned = cleanAndPruneReportsWithRoot(projectRoot, reports, config);
  const changed = cleaned.length !== orig.length || cleaned.some((r, i) => r.dir !== orig[i]?.dir);
  if (changed || !fs.existsSync(metaPathFull)) {
    fs.mkdirSync(testResultsPath, { recursive: true });
    fs.writeFileSync(metaPathFull, JSON.stringify({ reports: cleaned }, null, 2));
  }
}

async function buildIndexIfNeeded() {
  ensureMetaClean();
  if (!isIndexStale()) return true;
  backupIndex();
  try {
    const config = loadConfig();
    await buildIndex(testResultsPath, { write: true, maxHistory: config.maxHistory });
    return true;
  } catch (e) {
    restoreIndexBackup();
    return false;
  }
}

function resolveReportDir(dir) {
  return resolveReportDirWithRoot(projectRoot, dir);
}

/** Non-empty project ids from projects.json (lazy); used to serve `{id}/test-results/...` beyond legacy `prj-*`. */
let manifestProjectDirNames = null;
function manifestProjectIdSet() {
  if (manifestProjectDirNames !== null) return manifestProjectDirNames;
  manifestProjectDirNames = new Set();
  try {
    const fp = path.join(projectRoot, 'projects.json');
    if (!fs.existsSync(fp)) return manifestProjectDirNames;
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    for (const proj of data.projects || []) {
      const id = proj.id != null && String(proj.id).trim() !== '' ? String(proj.id).trim() : '';
      if (id) manifestProjectDirNames.add(id);
    }
  } catch (e) {
    /* ignore */
  }
  return manifestProjectDirNames;
}

function isServedFromProjectData(cleanPath) {
  if (!cleanPath) return false;
  if (cleanPath.split('/').some((s) => s === '..')) return false;
  if (cleanPath.startsWith('test-results/') || cleanPath === 'projects.json') return true;
  if (/^prj-[^/]+\//.test(cleanPath)) return true;
  const first = cleanPath.split('/')[0];
  if (first && manifestProjectIdSet().has(first)) return true;
  return false;
}

function parseUploadOptions(reqUrl, extraFields) {
  const u = new URL(reqUrl || '/', 'http://localhost');
  const fromQuery = {
    import: u.searchParams.get('import'),
    executionName: u.searchParams.get('executionName') || u.searchParams.get('execution_name') || '',
    entry: u.searchParams.get('entry') || ''
  };
  const jb = extraFields && typeof extraFields === 'object' ? extraFields : {};
  const importSpecified =
    u.searchParams.has('import') || Object.prototype.hasOwnProperty.call(jb, 'import');
  const rawImport = Object.prototype.hasOwnProperty.call(jb, 'import') ? jb.import : fromQuery.import;
  const kind = normalizeKind(
    rawImport === undefined || rawImport === null || rawImport === '' ? undefined : String(rawImport)
  );
  const executionName = String(jb.executionName ?? jb.execution_name ?? fromQuery.executionName ?? '');
  const entry = String(jb.entry ?? fromQuery.entry ?? '');
  return { kind, importSpecified, executionName, entry };
}

async function handleUpload(bodyOrBuf, mode = 'json', context = {}) {
  const { reqUrl = '/api/upload', multipartFields = null } = context;
  let buf;
  let jsonExtras = multipartFields;
  if (mode === 'binary') {
    buf = Buffer.isBuffer(bodyOrBuf) ? bodyOrBuf : Buffer.concat(bodyOrBuf);
  } else {
    if (!bodyOrBuf || (typeof bodyOrBuf === 'string' && !bodyOrBuf.trim())) {
      throw new Error('No file data: request body is empty. Ensure the file is selected and not empty.');
    }
    let parsed;
    try {
      parsed = JSON.parse(bodyOrBuf);
    } catch (e) {
      throw new Error('Invalid request: could not parse JSON. The upload may have been truncated (try a smaller file).');
    }
    jsonExtras = parsed;
    const data = parsed?.zip ?? parsed?.file;
    if (!data || (typeof data === 'string' && !data.trim())) {
      throw new Error(
        'No file data: no zip or file field in request. Select a non-empty archive or raw report file.'
      );
    }
    buf = Buffer.from(data, 'base64');
    if (buf.length === 0) {
      throw new Error('No file data: decoded file is empty.');
    }
  }
  const uploadOptions = parseUploadOptions(reqUrl, jsonExtras);
  const rawEntries = await resolveRawEntries(buf);

  let importPlan;
  try {
    importPlan = await importFromArchiveEntries(rawEntries, {
      kind: uploadOptions.kind,
      importSpecified: uploadOptions.importSpecified,
      executionName: uploadOptions.executionName,
      entry: uploadOptions.entry,
      projectRoot,
      testResultsPath
    });
  } catch (e) {
    if (e && e.code === 'MISSING_PLAYWRIGHT_PKG') {
      throw new Error(
        e.message ||
          'Playwright report import requires npm package qaf-report-playwright. Install it next to qaf-report-core.'
      );
    }
    throw e;
  }

  const config = loadConfig();

  if (importPlan.mode === 'qaf-tree') {
    const out = mergeQafArchiveToTree(rawEntries, {
      projectRoot,
      testResultsPath,
      config
    });
    await buildIndex(testResultsPath, { write: true, maxHistory: config.maxHistory });
    return { ...out, importKind: 'qaf' };
  }

  await buildIndex(testResultsPath, { write: true, maxHistory: config.maxHistory });
  const em = importPlan.emitResult.execMeta;
  const suites = (em.tests || []).length;
  return {
    ok: true,
    status: 'uploaded',
    importKind: importPlan.kind,
    message: `Imported ${importPlan.kind} report`,
    stats: {
      executions: 1,
      new: 1,
      updated: 0,
      suites,
      tests: em.total ?? 0,
      pass: em.pass ?? 0,
      fail: em.fail ?? 0,
      skip: em.skip ?? 0
    }
  };
}

const server = http.createServer(async (req, res) => {
  const sendJson = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET' && req.url.split('?')[0] === '/api/health') {
    sendJson(200, {
      ok: true,
      upload: true,
      archiveExtract: (() => {
        const c = archiveExtractCapabilities();
        return !!(c.AdmZip || c.tar);
      })(),
      importFormats: ['qaf', 'junit', 'playreport', 'cucumber', 'auto']
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/config') {
    try {
      sendJson(200, loadConfig());
    } catch (e) {
      sendJson(500, { error: e.message });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/config') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const updates = JSON.parse(body || '{}');
        const config = { ...loadConfig(), ...updates };
        if (updates.maxExecutions != null) config.maxExecutions = Math.max(1, parseInt(updates.maxExecutions, 10) || 5);
        if (updates.maxHistory != null) config.maxHistory = Math.max(1, parseInt(updates.maxHistory, 10) || 10);
        if (updates.allowDeleteOldExecutions != null) config.allowDeleteOldExecutions = !!updates.allowDeleteOldExecutions;
        saveConfig(config);
        sendJson(200, config);
      } catch (e) {
        sendJson(400, { error: e.message || 'Invalid config' });
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/upload') {
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('multipart/form-data')) {
      if (!Busboy) {
        sendJson(400, { ok: false, error: 'Multipart upload requires busboy. Run: npm install' });
        return;
      }
      const busboy = Busboy({ headers: req.headers });
      const chunks = [];
      const fields = {};
      let fileReceived = false;
      busboy.on('field', (name, val) => {
        fields[name] = val;
      });
      busboy.on('file', (field, file) => {
        if (fileReceived) return;
        fileReceived = true;
        file.on('data', chunk => chunks.push(chunk));
        file.on('end', () => {});
      });
      busboy.on('finish', async () => {
        try {
          const buf = Buffer.concat(chunks);
          if (buf.length === 0) {
            throw new Error('No file data: upload is empty. Select a non-empty archive or report file.');
          }
          const result = await handleUpload(buf, 'binary', { reqUrl: req.url, multipartFields: fields });
          sendJson(200, result);
        } catch (e) {
          sendJson(400, { ok: false, error: e.message || 'Upload failed' });
        }
      });
      req.pipe(busboy);
      return;
    }
    if (contentType.includes('application/octet-stream') || contentType.includes('application/x-tar') || contentType.includes('application/x-gzip') || contentType.includes('application/zip')) {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const buf = Buffer.concat(chunks);
          if (buf.length === 0) throw new Error('No file data: request body is empty.');
          const result = await handleUpload(buf, 'binary', { reqUrl: req.url });
          sendJson(200, result);
        } catch (e) {
          sendJson(400, { ok: false, error: e.message || 'Upload failed' });
        }
      });
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const result = await handleUpload(body, 'json', { reqUrl: req.url });
        sendJson(200, result);
      } catch (e) {
        sendJson(400, { ok: false, error: e.message || 'Upload failed' });
      }
    });
    return;
  }

  const url = req.url === '/' ? '/index.html' : req.url;
  const cleanUrl = url.replace(/\?.*$/, '');
  const cleanPath = (cleanUrl || '').replace(/^\/+/, '');
  const baseForFile = isServedFromProjectData(cleanPath) ? projectRoot : staticRoot;
  let filePath = path.join(baseForFile, cleanPath);

  /** Manifest: any .../test-results/test-history-index.json (per-project or default). */
  if (/test-results\/test-history-index\.json$/.test(cleanPath)) {
    const isDefault = cleanPath === 'test-results/test-history-index.json';
    if (isDefault && !(await buildIndexIfNeeded())) {
      res.writeHead(500);
      res.end('Error building index');
      return;
    }
    try {
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const data = await readFileQueued(filePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  /** Per-test index slice: .../test-results/test-history-index/{ hash }.json */
  if (/test-results\/test-history-index\/[a-z0-9]+\.json$/i.test(cleanPath)) {
    if (!fs.existsSync(filePath) && cleanPath.startsWith('test-results/test-history-index/')) {
      await buildIndexIfNeeded();
      filePath = path.join(projectRoot, cleanPath);
    }
    if (fs.existsSync(filePath)) {
      try {
        const data = await readFileQueued(filePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      } catch (e) {
        res.writeHead(500);
        res.end('Error');
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  const resolvedFile = path.resolve(filePath);
  const inProject = resolvedFile.startsWith(path.resolve(projectRoot) + path.sep) || resolvedFile === path.resolve(projectRoot);
  const inStatic = resolvedFile.startsWith(path.resolve(staticRoot) + path.sep) || resolvedFile === path.resolve(staticRoot);
  if ((!inProject && !inStatic) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  try {
    const data = await readFileQueued(filePath, ext === '.json' ? 'utf8' : undefined);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(500);
    res.end('Error');
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `qaf-serve: port ${port} is already in use.\n` +
        `  Try: qaf-serve 2613\n` +
        `  Or:  set QAF_PORT=2613 (or PORT) then qaf-serve`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  buildIndexIfNeeded().catch((e) => {
    console.warn('Startup meta-info cleanup:', e.message);
  });
  console.log('Dashboard at http://localhost:' + port);
});
