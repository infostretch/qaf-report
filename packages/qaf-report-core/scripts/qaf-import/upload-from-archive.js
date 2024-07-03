/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { importJUnitXml } = require('./junit');
const { importPlaywrightReport } = require('./playwright');
const { importCucumberJson } = require('./cucumber');

/** @typedef {{ name: string, data: Buffer }} ArchiveEntry */

function normalizeKind(s) {
  if (s == null || s === '') return 'qaf';
  const k = String(s).trim().toLowerCase();
  if (k === 'playwright') return 'playreport';
  return k;
}

function normalizePath(n) {
  return String(n || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * When the buffer is not a zip/tar, treat raw XML or JSON as a single archive entry.
 * @param {Buffer} buf
 * @returns {ArchiveEntry[] | null}
 */
function entriesFromPlainReportBuffer(buf) {
  const t = buf.toString('utf8', 0, Math.min(buf.length, 65536)).trimStart();
  if (t.startsWith('{') || t.startsWith('[')) {
    return [{ name: 'upload.json', data: buf }];
  }
  if (t.startsWith('<')) {
    return [{ name: 'upload.xml', data: buf }];
  }
  return null;
}

function findQafPrefix(rawEntries) {
  const testResultsDir = 'test-results/';
  let prefix = null;
  for (const e of rawEntries) {
    const name = normalizePath(e.name);
    const idx = name.indexOf(testResultsDir);
    if (idx === -1) continue;
    const p = name.substring(0, idx + testResultsDir.length);
    if (prefix === null || p.length < prefix.length) prefix = p;
  }
  return prefix;
}

function looksKindJunit(textSlice) {
  return /<\s*testsuite\b/i.test(textSlice) || /<\s*testcase\b/i.test(textSlice);
}

/**
 * @param {string} text
 * @returns {'playreport'|'cucumber'|null}
 */
function sniffJsonKind(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (j && typeof j === 'object' && !Array.isArray(j) && Array.isArray(j.suites)) {
    return 'playreport';
  }
  if (Array.isArray(j) && j.length && j[0] && typeof j[0] === 'object') {
    const h = j[0];
    if (Array.isArray(h.elements) || (h.uri != null && h.name != null)) return 'cucumber';
  }
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    if (Array.isArray(j.elements) && (j.uri != null || j.name != null)) return 'cucumber';
  }
  return null;
}

/**
 * Auto-detect import kind (includes `qaf` when archive embeds `test-results/`).
 * @param {ArchiveEntry[]} rawEntries
 * @returns {'qaf'|'junit'|'playreport'|'cucumber'|null}
 */
function detectAutoKind(rawEntries) {
  if (findQafPrefix(rawEntries)) return 'qaf';

  const files = rawEntries.filter((e) => e.data && e.data.length && normalizePath(e.name));
  if (!files.length) return null;

  const xmlFiles = files.filter((f) => /\.xml$/i.test(normalizePath(f.name)));
  if (xmlFiles.length === 1 && files.length === 1) {
    const t = xmlFiles[0].data.toString('utf8', 0, Math.min(12000, xmlFiles[0].data.length));
    if (looksKindJunit(t)) return 'junit';
  }
  if (xmlFiles.length >= 1) {
    const junitish = xmlFiles.filter((f) =>
      looksKindJunit(f.data.toString('utf8', 0, Math.min(8000, f.data.length)))
    );
    if (junitish.length === 1) return 'junit';
  }

  const jsonFiles = files.filter((f) => /\.json$/i.test(normalizePath(f.name)));
  for (const jf of jsonFiles) {
    const k = sniffJsonKind(jf.data.toString('utf8'));
    if (k) return k;
  }

  if (files.length === 1 && /\.json$/i.test(normalizePath(files[0].name))) {
    const k = sniffJsonKind(files[0].data.toString('utf8'));
    if (k) return k;
  }

  return null;
}

/**
 * @param {ArchiveEntry[]} entries
 * @param {'junit'|'playreport'|'cucumber'} kind
 * @param {string} entryHint normalized relative path inside archive (optional)
 */
function pickFileForKind(entries, kind, entryHint) {
  const normHint = normalizePath(entryHint);
  const files = entries.filter((e) => e.data && e.data.length);

  if (normHint) {
    const e = files.find((x) => {
      const n = normalizePath(x.name);
      return n === normHint || n.endsWith('/' + normHint);
    });
    if (!e) {
      throw new Error(`Archive has no file matching entry path: ${entryHint}`);
    }
    return e;
  }

  if (kind === 'junit') {
    const xmls = files.filter((f) => /\.xml$/i.test(normalizePath(f.name)));
    const junitish = xmls.filter((f) =>
      looksKindJunit(f.data.toString('utf8', 0, Math.min(12000, f.data.length)))
    );
    if (junitish.length === 1) return junitish[0];
    if (xmls.length === 1 && junitish.length === 0) return xmls[0];
    if (junitish.length > 1) {
      throw new Error('Multiple JUnit XML files in archive; set entry to the report path (e.g. entry=reports/junit.xml).');
    }
    throw new Error('No JUnit XML found in archive.');
  }

  if (kind === 'playreport') {
    const jsons = files.filter((f) => /\.json$/i.test(normalizePath(f.name)));
    const plays = jsons.filter((f) => sniffJsonKind(f.data.toString('utf8')) === 'playreport');
    if (plays.length === 1) return plays[0];
    if (plays.length > 1) {
      throw new Error('Multiple Playwright JSON reports in archive; set entry=path/to/report.json');
    }
    throw new Error('No Playwright report JSON found (expected top-level "suites" array).');
  }

  if (kind === 'cucumber') {
    const jsons = files.filter((f) => /\.json$/i.test(normalizePath(f.name)));
    const cukes = jsons.filter((f) => sniffJsonKind(f.data.toString('utf8')) === 'cucumber');
    if (cukes.length === 1) return cukes[0];
    if (cukes.length > 1) {
      throw new Error('Multiple Cucumber JSON files in archive; set entry=path/to/report.json');
    }
    throw new Error('No Cucumber JSON found (expected an array of features with "elements").');
  }

  throw new Error(`Unsupported import kind: ${kind}`);
}

async function runToolImportUpload(kind, inputPath, { projectRoot, testResultsPath, executionName }) {
  const common = {
    dashboardRoot: projectRoot,
    testResultsAbs: testResultsPath,
    mergeRoot: true,
    append: false,
    force: true
  };
  if (kind === 'junit') {
    return importJUnitXml({
      inputPath,
      ...common,
      executionName: executionName || 'JUnit'
    });
  }
  if (kind === 'playreport') {
    return importPlaywrightReport({
      inputPath,
      ...common,
      executionName: executionName || 'Playwright'
    });
  }
  if (kind === 'cucumber') {
    return importCucumberJson({
      inputPath,
      ...common,
      executionName: executionName || 'Cucumber'
    });
  }
  throw new Error(`Unknown import kind: ${kind}`);
}

/**
 * @param {ArchiveEntry[]} rawEntries
 * @param {object} opts
 * @param {'qaf'|'junit'|'playreport'|'cucumber'|'auto'} opts.kind
 * @param {boolean} opts.importSpecified
 * @param {string} [opts.executionName]
 * @param {string} [opts.entry]
 * @param {string} opts.projectRoot
 * @param {string} opts.testResultsPath
 */
async function importFromArchiveEntries(rawEntries, opts) {
  const {
    kind: requestedKind,
    importSpecified,
    executionName = '',
    entry = '',
    projectRoot,
    testResultsPath
  } = opts;

  let kind = requestedKind;

  if (!importSpecified) {
    if (findQafPrefix(rawEntries)) {
      kind = 'qaf';
    } else {
      const guessed = detectAutoKind(rawEntries);
      if (guessed && guessed !== 'qaf') kind = guessed;
    }
  } else if (kind === 'auto') {
    const guessed = detectAutoKind(rawEntries);
    if (!guessed) {
      throw new Error(
        'Could not auto-detect import type. Use import=qaf (QAF test-results zip), junit, playreport, or cucumber.'
      );
    }
    kind = guessed;
  }

  if (kind === 'qaf') {
    if (!findQafPrefix(rawEntries)) {
      throw new Error(
        'No test-results folder found in archive. Use a QAF zip that contains test-results/, or set import=auto or import=junit|playreport|cucumber for external reports.'
      );
    }
    return { kind: 'qaf', mode: 'qaf-tree' };
  }

  if (kind !== 'junit' && kind !== 'playreport' && kind !== 'cucumber') {
    throw new Error(`Invalid import value: ${kind}. Use qaf, junit, playreport, cucumber, or auto.`);
  }

  const picked = pickFileForKind(rawEntries, kind, entry);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qaf-upload-import-'));
  try {
    const safeName = path.basename(normalizePath(picked.name).replace(/\//g, '_')) || 'report.bin';
    const inputPath = path.join(tmpRoot, safeName);
    fs.writeFileSync(inputPath, picked.data);
    const emitResult = await runToolImportUpload(kind, inputPath, {
      projectRoot,
      testResultsPath,
      executionName: executionName || undefined
    });
    return { kind, mode: 'tool-import', emitResult };
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (e) {}
  }
}

module.exports = {
  normalizeKind,
  normalizePath,
  entriesFromPlainReportBuffer,
  findQafPrefix,
  detectAutoKind,
  pickFileForKind,
  sniffJsonKind,
  looksKindJunit,
  importFromArchiveEntries
};
