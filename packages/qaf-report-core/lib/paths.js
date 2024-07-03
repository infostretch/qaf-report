/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const path = require('path');

/**
 * Logical class path for overview (forward slashes, e.g. tests/foo.spec.ts)
 * @param {string} filePath
 */
function logicalClassPath(filePath) {
  if (!filePath) return 'unknown.spec.ts';
  return filePath.replace(/\\/g, '/');
}

/**
 * Spec file path for QAF overview, meta `reference` / `sign`, and on-disk layout.
 * Prefers a path relative to the first matching base (Playwright rootDir, report dir, cwd).
 * @param {string} filePath
 * @param {string|string[]|undefined} rootDirs - resolved in order; cwd is always tried last
 */
function specFileForQafDisplay(filePath, rootDirs) {
  if (!filePath) return 'unknown.spec.ts';
  const absFile = path.resolve(String(filePath));
  const bases = [];
  if (rootDirs != null) {
    const arr = Array.isArray(rootDirs) ? rootDirs : [rootDirs];
    for (const b of arr) {
      if (b) bases.push(path.resolve(String(b)));
    }
  }
  bases.push(path.resolve(process.cwd()));

  let chosen = null;
  for (const base of [...new Set(bases)]) {
    try {
      const rel = path.relative(base, absFile);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        chosen = rel;
        break;
      }
    } catch (_) {
      /* try next base */
    }
  }

  if (chosen != null) return logicalClassPath(chosen);

  const s = logicalClassPath(absFile);
  if (hasDriveOrUncLogical(s)) {
    const parts = s.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last || 'unknown.spec.ts';
  }
  return s;
}

function hasDriveOrUncLogical(logical) {
  const s = String(logical).replace(/\\/g, '/');
  return /^[a-zA-Z]:\//.test(s) || /^\/\/+/.test(s);
}

function sanitizePathSegment(seg) {
  const s = String(seg || 'x')
    .replace(/[^a-zA-Z0-9._\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s || 'x';
}

/**
 * Absolute directory for a class under json/<testset>/ matching overview.classes path segments
 * (e.g. tests/foo.spec.ts → …/default/tests/foo.spec.ts). Falls back to flat sanitized name if
 * classLogicalPath still looks like an absolute Windows path.
 * @param {string} execAbs - …/execution/json
 * @param {string} testsetSegment - e.g. chromium, default
 * @param {string} classLogicalPath - forward slashes, e.g. ui/checkout.spec.ts
 */
function classOutputDirAbs(execAbs, testsetSegment, classLogicalPath) {
  const logicalRaw = String(classLogicalPath || 'unknown.spec.ts');
  if (hasDriveOrUncLogical(logicalRaw)) {
    return path.join(execAbs, testsetSegment, sanitizedClassDirName(logicalRaw));
  }
  const logicalClean = logicalClassPath(logicalRaw).replace(/^[/]+/, '');
  const parts = logicalClean
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .map(sanitizePathSegment);
  if (!parts.length) parts.push('unknown.spec.ts');
  return path.join(execAbs, testsetSegment, ...parts);
}

/**
 * Single segment safe for a directory name under testset.
 * @param {string} filePath
 */
function sanitizedClassDirName(filePath) {
  const logical = logicalClassPath(filePath);
  return logical
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]/g, '__')
    .replace(/\./g, '_')
    .replace(/[^a-zA-Z0-9_\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'class';
}

/**
 * Stable slug for result JSON filename (no extension).
 * @param {string} title
 * @param {number} salt
 */
function resultFileNameSlug(title, salt = 0) {
  const base = String(title || 'test')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 48) || 'test';
  return base + (salt > 0 ? String(salt) : '');
}

/**
 * Execution folder name under output root.
 * @param {string} executionName
 * @param {number} startTime
 */
function executionFolderName(executionName, startTime) {
  const slug = String(executionName || 'Playwright')
    .replace(/[^a-zA-Z0-9._\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'Playwright';
  return `Playwright_${slug}_${startTime}`;
}

/**
 * Stable execution folder basename (no Playwright_ prefix). Used when operators pass --execution-folder.
 * @param {string} name
 */
function sanitizeExecutionFolderName(name) {
  return (
    String(name || '')
      .replace(/[^a-zA-Z0-9._\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'execution'
  );
}

/**
 * @param {{ executionName: string, startTime: number, executionFolderOverride?: string }} opts
 * @returns {string}
 */
function resolveExecutionFolderName(opts) {
  const { executionName, startTime, executionFolderOverride } = opts;
  if (executionFolderOverride) {
    return sanitizeExecutionFolderName(executionFolderOverride);
  }
  return executionFolderName(executionName, startTime);
}

/**
 * Testset folder segment from strategy.
 * @param {'per-project'|'single'} strategy
 * @param {string} projectName
 */
function testsetFolderName(strategy, projectName) {
  if (strategy === 'single') return 'default';
  const p = String(projectName || 'default').replace(/[^a-zA-Z0-9._\-]+/g, '_') || 'default';
  return p;
}

module.exports = {
  logicalClassPath,
  specFileForQafDisplay,
  classOutputDirAbs,
  sanitizedClassDirName,
  resultFileNameSlug,
  executionFolderName,
  sanitizeExecutionFolderName,
  resolveExecutionFolderName,
  testsetFolderName
};
