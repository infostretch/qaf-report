/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');
const {
  logicalClassPath,
  sanitizedClassDirName,
  resultFileNameSlug
} = require('../../lib/paths');
const { getDashboardRoot, defaultTestResultsAbs } = require('./utils');
const { runToolImport } = require('./orchestrate');

function firstChild(obj, names) {
  if (!obj || typeof obj !== 'object') return null;
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] != null) return obj[n];
  }
  return null;
}

function junitMessageBody(el) {
  if (!el) return { message: '', body: '' };
  const msg = el['@_message'] || el['@_type'] || '';
  const body = typeof el['#text'] === 'string' ? el['#text'] : '';
  return { message: String(msg), body: String(body || '').trim() };
}

function testcaseAttrs(tc) {
  return {
    classname: tc ? tc['@_classname'] || tc['@_class'] || '' : '',
    name: tc ? tc['@_name'] || 'test' : 'test',
    time: tc ? tc['@_time'] : '0',
    file: tc ? tc['@_file'] || '' : ''
  };
}

function collectSuites(node, chain, visitor) {
  if (node == null) return;
  const suites = node.testsuite;
  if (!suites) return;
  const list = Array.isArray(suites) ? suites : [suites];
  for (const s of list) {
    const name = s['@_name'] || s['@_hostname'] || '';
    const next = [...chain, name].filter(Boolean);
    visitor(s, next);
    collectSuites(s, next, visitor);
  }
}

function normalizeXmlRoot(parsed) {
  if (parsed.testsuites) return parsed.testsuites;
  if (parsed.testsuite) return { testsuite: parsed.testsuite };
  return parsed;
}

function parseSuiteStartMs(suiteNode) {
  const ts = suiteNode['@_timestamp'];
  if (!ts) return null;
  const d = Date.parse(ts);
  return Number.isFinite(d) ? d : null;
}

/**
 * @param {string} xmlString
 * @param {object} options
 * @param {'per-project'|'single'} options.testsetStrategy
 * @param {boolean} [options.suiteAsTestset]
 * @param {number} [options.startTimeFallback]
 * @param {number} [options.rowSaltStart]
 */
function junitXmlToRows(xmlString, options) {
  const {
    testsetStrategy = 'per-project',
    suiteAsTestset = false,
    startTimeFallback = Date.now(),
    rowSaltStart = 0
  } = options;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true
  });
  const parsed = parser.parse(xmlString);
  const root = normalizeXmlRoot(parsed);
  const pairs = [];

  collectSuites(root, [], (suiteNode, nameChain) => {
    const tcNode = suiteNode.testcase;
    if (!tcNode) return;
    const cases = Array.isArray(tcNode) ? tcNode : [tcNode];
    const suiteTitle = nameChain.length ? nameChain.join(' > ') : suiteNode['@_name'] || 'default';
    for (const tc of cases) {
      pairs.push({ suiteNode, suiteTitle, testcase: tc });
    }
  });

  const rows = [];
  let rid = rowSaltStart;
  for (const { suiteNode, suiteTitle, testcase: tc } of pairs) {
    const { classname, name, time, file } = testcaseAttrs(tc);
    const specFile = logicalClassPath(
      file || (classname ? `${classname.replace(/\./g, '/')}.java` : 'unknown.java')
    );
    const classDirName = sanitizedClassDirName(specFile);
    const durationMs = Math.round(parseFloat(String(time || '0')) * 1000) || 0;

    const failure = firstChild(tc, ['failure', 'error']);
    const skipped = firstChild(tc, ['skipped']);

    let result = 'pass';
    let errorTrace = '';
    let errorMessage = '';
    if (skipped) {
      result = 'skip';
      const j = junitMessageBody(skipped);
      errorMessage = j.message || j.body || 'skipped';
      errorTrace = (errorMessage + (j.body ? `\n${j.body}` : '')).trim();
    } else if (failure) {
      result = 'fail';
      const j = junitMessageBody(failure);
      const parts = [j.message, j.body].filter(Boolean);
      errorTrace = parts.join('\n').trim();
      errorMessage = (
        j.message ||
        (j.body ? j.body.split('\n')[0] : '') ||
        errorTrace ||
        'failure'
      ).trim();
    }

    let testsetName = 'default';
    if (suiteAsTestset) {
      testsetName = suiteTitle || 'default';
    }

    const suiteStart = parseSuiteStartMs(suiteNode);
    const rowStart = suiteStart != null ? suiteStart : startTimeFallback;

    const testTitle = name;
    const rfn = resultFileNameSlug(testTitle, rid++);

    const resultPayload = {};
    if (errorTrace) {
      resultPayload.errorTrace = errorTrace;
      resultPayload.errorMessage = errorMessage || errorTrace.split('\n')[0] || errorTrace;
    }

    rows.push({
      testsetName,
      classLogicalPath: specFile,
      classDirName,
      testTitle,
      specFile,
      result,
      duration: durationMs,
      startTime: rowStart,
      retryCount: null,
      resultFileName: rfn,
      testID: undefined,
      projectName: undefined,
      resultPayload
    });
  }

  return rows;
}

async function importJUnitXml(options) {
  const {
    inputPath,
    executionName = 'JUnit',
    dashboardRoot = getDashboardRoot(),
    testResultsAbs = defaultTestResultsAbs(dashboardRoot),
    testsetStrategy = 'per-project',
    suiteAsTestset = false,
    mergeRoot = false,
    append = false,
    force = false,
    startTime: startTimeOpt,
    endTime: endTimeOpt
  } = options;

  const xml = fs.readFileSync(inputPath, 'utf8');

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
    warnIfEmpty: '[qaf-import:junit] No testcases found in XML.',
    buildIncoming: async ({ rowSaltStart, startTimeFallback }) => {
      let st = startTimeOpt != null ? startTimeOpt : startTimeFallback;
      return {
        rows: junitXmlToRows(xml, {
          testsetStrategy,
          suiteAsTestset,
          startTimeFallback: st,
          rowSaltStart
        })
      };
    }
  });
}

module.exports = {
  junitXmlToRows,
  importJUnitXml
};
