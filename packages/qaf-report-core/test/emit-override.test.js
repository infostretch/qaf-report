/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { emitQafTreeFromRows } = require('../lib/emit');

test('emitQafTreeFromRows uses executionFolderOverride and relative reportEntry.dir', async () => {
  const dashboardRoot = path.join(__dirname, '_dash_' + Date.now());
  const testResultsAbs = path.join(dashboardRoot, 'test-results');
  fs.mkdirSync(testResultsAbs, { recursive: true });

  const startTime = 1700000000000;
  const endTime = startTime;
  const res = await emitQafTreeFromRows({
    outputRoot: testResultsAbs,
    executionName: 'JUnit',
    startTime,
    endTime,
    testsetStrategy: 'single',
    mergeRoot: false,
    executionFolderOverride: 'My_Stable_Folder',
    dashboardRoot,
    rows: [
      {
        testsetName: 'default',
        classLogicalPath: 'demo.spec.ts',
        classDirName: 'demo_spec_ts',
        testTitle: 'one',
        specFile: 'demo.spec.ts',
        result: 'pass',
        duration: 1,
        startTime,
        retryCount: null,
        resultFileName: 'one0',
        resultPayload: {}
      }
    ]
  });

  assert.strictEqual(res.reportEntry.dir.replace(/\\/g, '/'), 'test-results/My_Stable_Folder/json');
  const meta = path.join(testResultsAbs, 'My_Stable_Folder', 'json', 'meta-info.json');
  assert.ok(fs.existsSync(meta));
  fs.rmSync(dashboardRoot, { recursive: true, force: true });
});
