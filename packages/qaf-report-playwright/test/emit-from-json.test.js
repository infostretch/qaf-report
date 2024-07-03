/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { generateQafResultsFromJson } = require('../lib/from-json');

test('generateQafResultsFromJson writes execution meta and class meta', async () => {
  const out = path.join(__dirname, '_out_' + Date.now());
  fs.mkdirSync(out, { recursive: true });
  const fixture = path.join(__dirname, 'fixtures', 'minimal-report.json');
  const res = await generateQafResultsFromJson({
    inputPath: fixture,
    outputRoot: out,
    executionName: 'UnitTest',
    mergeRoot: false,
    testsetStrategy: 'per-project'
  });

  const metaPath = path.join(res.executionDir, 'json', 'meta-info.json');
  assert.ok(fs.existsSync(metaPath), 'execution meta-info.json exists');
  const execMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  assert.strictEqual(execMeta.total, 1);
  assert.strictEqual(execMeta.pass, 1);

  const chromiumDir = path.join(res.executionDir, 'json', 'chromium');
  const overviewPath = path.join(chromiumDir, 'overview.json');
  assert.ok(fs.existsSync(overviewPath));
  const ov = JSON.parse(fs.readFileSync(overviewPath, 'utf8'));
  assert.ok(ov.classes.includes('example.spec.ts'));

  const classDir = path.join(chromiumDir, 'example.spec.ts');
  const classMeta = JSON.parse(fs.readFileSync(path.join(classDir, 'meta-info.json'), 'utf8'));
  assert.strictEqual(classMeta.methods.length, 1);
  assert.strictEqual(classMeta.methods[0].metaData.testID, 'TC-1');

  assert.ok(res.reportEntry.dir.includes('json'));
  fs.rmSync(out, { recursive: true, force: true });
});

test('mergeRootMeta appends reports', async () => {
  const out = path.join(__dirname, '_out_merge_' + Date.now());
  fs.mkdirSync(out, { recursive: true });
  const fixture = path.join(__dirname, 'fixtures', 'minimal-report.json');
  await generateQafResultsFromJson({
    inputPath: fixture,
    outputRoot: out,
    executionName: 'Run1',
    mergeRoot: true,
    testsetStrategy: 'per-project'
  });
  await generateQafResultsFromJson({
    inputPath: fixture,
    outputRoot: out,
    executionName: 'Run2',
    mergeRoot: true,
    testsetStrategy: 'per-project'
  });

  const root = JSON.parse(fs.readFileSync(path.join(out, 'meta-info.json'), 'utf8'));
  assert.strictEqual(root.reports.length, 2);
  fs.rmSync(out, { recursive: true, force: true });
});
