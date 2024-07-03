/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { junitXmlToRows } = require('./junit');

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="SuiteA" tests="2" timestamp="2020-01-01T00:00:00Z">
    <testcase classname="com.example.Demo" name="shouldPass" time="0.050"/>
    <testcase classname="com.example.Demo" name="shouldFail" time="0.120">
      <failure message="boom">stacktrace</failure>
    </testcase>
  </testsuite>
</testsuites>`;

test('junitXmlToRows maps class names and results', () => {
  const rows = junitXmlToRows(SAMPLE, {
    testsetStrategy: 'per-project',
    suiteAsTestset: false,
    startTimeFallback: 1700000000000,
    rowSaltStart: 0
  });
  assert.strictEqual(rows.length, 2);
  const pass = rows.find((r) => r.testTitle === 'shouldPass');
  const fail = rows.find((r) => r.testTitle === 'shouldFail');
  assert.ok(pass);
  assert.ok(fail);
  assert.strictEqual(pass.result, 'pass');
  assert.strictEqual(fail.result, 'fail');
  assert.strictEqual(pass.duration, 50);
  assert.strictEqual(fail.duration, 120);
  assert.ok(pass.classLogicalPath.includes('com/example/Demo'));
  assert.ok(fail.resultPayload.errorTrace.includes('boom'));
});

test('suiteAsTestset sets testsetName from suite title', () => {
  const rows = junitXmlToRows(SAMPLE, {
    suiteAsTestset: true,
    startTimeFallback: 0,
    rowSaltStart: 0
  });
  assert.ok(rows.every((r) => r.testsetName === 'SuiteA'));
});
