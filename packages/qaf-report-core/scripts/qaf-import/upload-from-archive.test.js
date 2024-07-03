/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeKind,
  entriesFromPlainReportBuffer,
  findQafPrefix,
  detectAutoKind,
  sniffJsonKind,
  pickFileForKind
} = require('./upload-from-archive');

test('normalizeKind maps playwright alias and default', () => {
  assert.strictEqual(normalizeKind(undefined), 'qaf');
  assert.strictEqual(normalizeKind('PLAYWRIGHT'), 'playreport');
  assert.strictEqual(normalizeKind('junit'), 'junit');
});

test('entriesFromPlainReportBuffer detects xml and json', () => {
  const x = entriesFromPlainReportBuffer(Buffer.from('  \n<testsuite></testsuite>', 'utf8'));
  assert.ok(x && x.length === 1);
  assert.match(x[0].name, /\.xml$/);
  const j = entriesFromPlainReportBuffer(Buffer.from('{ "suites": [] }', 'utf8'));
  assert.ok(j && j.length === 1);
  assert.match(j[0].name, /\.json$/);
  assert.strictEqual(entriesFromPlainReportBuffer(Buffer.from('not xml', 'utf8')), null);
});

test('findQafPrefix finds shortest prefix', () => {
  const p = findQafPrefix([
    { name: 'foo/test-results/a/x.txt', data: Buffer.from('x') },
    { name: 'test-results/b/y.txt', data: Buffer.from('y') }
  ]);
  assert.strictEqual(p, 'test-results/');
});

test('detectAutoKind: qaf tree wins', () => {
  assert.strictEqual(
    detectAutoKind([{ name: 'x/test-results/z.json', data: Buffer.from('{}') }]),
    'qaf'
  );
});

test('detectAutoKind: single junit xml', () => {
  const xml = Buffer.from(
    '<?xml version="1.0"?><testsuites><testsuite name="S"><testcase name="t"/></testsuite></testsuites>',
    'utf8'
  );
  assert.strictEqual(detectAutoKind([{ name: 'report.xml', data: xml }]), 'junit');
});

test('sniffJsonKind distinguishes playwright and cucumber', () => {
  assert.strictEqual(sniffJsonKind(JSON.stringify({ suites: [] })), 'playreport');
  assert.strictEqual(
    sniffJsonKind(JSON.stringify([{ uri: 'x.feature', name: 'F', elements: [] }])),
    'cucumber'
  );
});

test('pickFileForKind respects entry hint', () => {
  const entries = [
    { name: 'a/one.xml', data: Buffer.from('<testsuite><testcase name="a"/></testsuite>', 'utf8') },
    { name: 'b/two.xml', data: Buffer.from('<testsuite><testcase name="b"/></testsuite>', 'utf8') }
  ];
  const picked = pickFileForKind(entries, 'junit', 'b/two.xml');
  assert.strictEqual(picked.name, 'b/two.xml');
});

test('pickFileForKind errors on ambiguous junit', () => {
  const entries = [
    { name: 'a.xml', data: Buffer.from('<testsuite><testcase name="a"/></testsuite>', 'utf8') },
    { name: 'b.xml', data: Buffer.from('<testsuite><testcase name="b"/></testsuite>', 'utf8') }
  ];
  assert.throws(() => pickFileForKind(entries, 'junit', ''), /Multiple JUnit XML/);
});
