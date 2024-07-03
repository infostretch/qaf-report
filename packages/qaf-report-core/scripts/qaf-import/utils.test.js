/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const {
  toRelativeReportDir,
  sanitizeExecutionFolderName,
  mergeRows,
  rowDedupeKey
} = require('./utils');

test('sanitizeExecutionFolderName', () => {
  assert.strictEqual(sanitizeExecutionFolderName('Phoenix Regression'), 'Phoenix_Regression');
  assert.strictEqual(sanitizeExecutionFolderName(''), 'execution');
});

test('toRelativeReportDir uses posix separators', () => {
  const root = os.tmpdir();
  const execJson = path.join(root, 'test-results', 'MyExec', 'json');
  const rel = toRelativeReportDir(root, execJson);
  assert.ok(rel.includes('test-results'));
  assert.ok(!rel.includes('\\'));
});

test('mergeRows prefers incoming by default', () => {
  const a = {
    testsetName: 'd',
    classLogicalPath: 'x',
    testTitle: 't',
    resultFileName: 'f0'
  };
  const b = { ...a, result: 'fail' };
  const c = { ...a, result: 'pass' };
  const out = mergeRows([b], [c]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].result, 'pass');
});

test('rowDedupeKey stable', () => {
  const r = {
    testsetName: 'd',
    classLogicalPath: 'x',
    testTitle: 't',
    resultFileName: 'f'
  };
  assert.strictEqual(rowDedupeKey(r), rowDedupeKey({ ...r }));
});
