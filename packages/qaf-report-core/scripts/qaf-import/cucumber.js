/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const {
  logicalClassPath,
  sanitizedClassDirName,
  resultFileNameSlug
} = require('../../lib/paths');
const {
  getDashboardRoot,
  defaultTestResultsAbs
} = require('./utils');
const { runToolImport } = require('./orchestrate');

function durationNsToMs(n) {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.round(n / 1e6);
}

function stepStatusToQaf(result) {
  const s = String(result?.status || '').toLowerCase();
  if (s === 'passed') return 'pass';
  if (s === 'failed') return 'fail';
  if (s === 'skipped') return 'skip';
  if (s === 'pending' || s === 'undefined' || s === 'ambiguous') return s === 'ambiguous' ? 'fail' : 'skip';
  return 'skip';
}

function mergeScenarioStatus(a, b) {
  const rank = { fail: 3, skip: 2, pass: 1 };
  return rank[a] >= rank[b] ? a : b;
}

function collectStepError(steps) {
  const parts = [];
  for (const step of steps || []) {
    const res = step.result || {};
    if (String(res.status).toLowerCase() === 'failed' && res.error_message) {
      parts.push(String(res.error_message));
    }
  }
  return parts.join('\n');
}

function cucumberJsonToRows(raw, options) {
  const {
    testsetStrategy = 'per-project',
    featureAsTestset = false,
    startTimeFallback = Date.now(),
    rowSaltStart = 0
  } = options;

  const features = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const rows = [];
  let rid = rowSaltStart;

  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue;
    const uri = logicalClassPath(feature.uri || 'unknown.feature');
    const specFile = uri;
    const classDirName = sanitizedClassDirName(specFile);
    const featureName = String(feature.name || 'Feature').trim() || 'Feature';

    const elements = Array.isArray(feature.elements) ? feature.elements : [];
    for (const el of elements) {
      const type = String(el.type || '').toLowerCase();
      if (type === 'background') continue;

      const steps = Array.isArray(el.steps) ? el.steps : [];
      if (!steps.length && type !== 'scenario') continue;

      let status = 'pass';
      let durationMs = 0;
      for (const step of steps) {
        const res = step.result || {};
        const st = stepStatusToQaf(res);
        status = mergeScenarioStatus(status, st);
        durationMs += durationNsToMs(res.duration);
      }

      const scenarioName = String(el.name || 'Scenario').trim() || 'Scenario';
      const line = el.line != null ? el.line : '';
      const testTitle = line !== '' ? `${scenarioName} (line ${line})` : scenarioName;

      let testsetName = 'default';
      if (testsetStrategy !== 'single') {
        if (featureAsTestset) {
          testsetName = featureName;
        }
      }

      const errText = collectStepError(steps);
      const resultPayload = {};
      if (errText) {
        resultPayload.errorTrace = errText;
        resultPayload.errorMessage = errText.split('\n')[0] || errText;
      }

      const rfn = resultFileNameSlug(testTitle.replace(/\s+/g, '_'), rid++);

      rows.push({
        testsetName,
        classLogicalPath: specFile,
        classDirName,
        testTitle,
        specFile,
        result: status,
        duration: durationMs,
        startTime: startTimeFallback,
        retryCount: null,
        resultFileName: rfn,
        testID: el.id ? String(el.id) : undefined,
        projectName: undefined,
        resultPayload
      });
    }
  }

  return rows;
}

async function importCucumberJson(options) {
  const {
    inputPath,
    executionName = 'Cucumber',
    dashboardRoot = getDashboardRoot(),
    testResultsAbs = defaultTestResultsAbs(dashboardRoot),
    testsetStrategy = 'per-project',
    featureAsTestset = false,
    mergeRoot = false,
    append = false,
    force = false,
    startTime: startTimeOpt,
    endTime: endTimeOpt
  } = options;

  const text = fs.readFileSync(inputPath, 'utf8');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const err = new Error(`Invalid JSON: ${inputPath}: ${e.message}`);
    err.code = 'INVALID_JSON';
    throw err;
  }

  return runToolImport({
    executionFolder: options.executionFolder,
    executionName,
    dashboardRoot,
    testResultsAbs,
    testsetStrategy,
    mergeRoot,
    append,
    force,
    startTime: startTimeOpt,
    endTime: endTimeOpt,
    warnIfEmpty: '[qaf-import:cucumber] No scenarios found in JSON.',
    buildIncoming: async ({ rowSaltStart, startTimeFallback }) => ({
      rows: cucumberJsonToRows(raw, {
        testsetStrategy,
        featureAsTestset,
        startTimeFallback,
        rowSaltStart
      })
    })
  });
}

module.exports = {
  cucumberJsonToRows,
  importCucumberJson,
  durationNsToMs
};
