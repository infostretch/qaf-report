/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { cucumberJsonToRows, durationNsToMs } = require('./cucumber');

const SAMPLE = [
  {
    uri: 'features/login.feature',
    name: 'Login',
    elements: [
      {
        type: 'scenario',
        line: 10,
        id: 'login-success',
        name: 'User logs in',
        steps: [
          {
            keyword: 'Given ',
            name: 'app is open',
            result: { status: 'passed', duration: 2_000_000 }
          },
          {
            keyword: 'Then ',
            name: 'see home',
            result: { status: 'passed', duration: 1_000_000 }
          }
        ]
      },
      {
        type: 'scenario',
        line: 20,
        name: 'Bad password',
        steps: [
          {
            keyword: 'When ',
            name: 'wrong pwd',
            result: {
              status: 'failed',
              duration: 500_000,
              error_message: 'AssertionError: expected false'
            }
          }
        ]
      },
      {
        type: 'background',
        name: 'bg',
        steps: [{ keyword: 'Given ', name: 'x', result: { status: 'passed', duration: 100 } }]
      }
    ]
  }
];

test('durationNsToMs', () => {
  assert.strictEqual(durationNsToMs(3_000_000), 3);
  assert.strictEqual(durationNsToMs(500_000), 1);
  assert.strictEqual(durationNsToMs(0), 0);
});

test('cucumberJsonToRows maps uris and step aggregation', () => {
  const rows = cucumberJsonToRows(SAMPLE, {
    testsetStrategy: 'per-project',
    featureAsTestset: false,
    startTimeFallback: 1,
    rowSaltStart: 0
  });
  assert.strictEqual(rows.length, 2);
  const ok = rows.find((r) => r.testTitle.includes('User logs in'));
  const bad = rows.find((r) => r.testTitle.includes('Bad password'));
  assert.ok(ok);
  assert.ok(bad);
  assert.strictEqual(ok.result, 'pass');
  assert.strictEqual(ok.duration, 3);
  assert.strictEqual(bad.result, 'fail');
  assert.ok(bad.resultPayload.errorTrace.includes('AssertionError'));
  assert.ok(ok.classLogicalPath.includes('login.feature'));
});

test('featureAsTestset uses feature name as testset', () => {
  const rows = cucumberJsonToRows(SAMPLE, {
    featureAsTestset: true,
    startTimeFallback: 0,
    rowSaltStart: 0
  });
  assert.ok(rows.every((r) => r.testsetName === 'Login'));
});
