/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const path = require('path');
const { importJUnitXml } = require('./junit');
const { importPlaywrightReport } = require('./playwright');
const { importCucumberJson } = require('./cucumber');
const { getDashboardRoot, defaultTestResultsAbs } = require('./utils');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let key;
      let val;
      if (eq !== -1) {
        key = a.slice(2, eq);
        val = a.slice(eq + 1);
      } else {
        key = a.slice(2);
        val = undefined;
      }
      const normKey = key.replace(/-/g, '');
      if (val !== undefined) {
        args[normKey] = val;
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          args[normKey] = next;
          i++;
        } else {
          args[normKey] = true;
        }
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function bool(v) {
  return v === true || v === 'true';
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];
  if (!cmd) {
    console.error(
      'Usage: node scripts/qaf-import/cli.js <junit|playreport|cucumber> [options]'
    );
    process.exitCode = 1;
    return;
  }

  const dashboardRoot = args.dashboardroot
    ? path.resolve(String(args.dashboardroot))
    : getDashboardRoot();
  const testResultsAbs = args.testresults
    ? path.resolve(String(args.testresults))
    : defaultTestResultsAbs(dashboardRoot);

  const common = {
    dashboardRoot,
    testResultsAbs,
    mergeRoot: bool(args.mergeroot),
    append: bool(args.append),
    force: bool(args.force),
    executionName: args.executionname ? String(args.executionname) : undefined,
    executionFolder: args.executionfolder ? String(args.executionfolder) : undefined
  };

  try {
    if (cmd === 'junit') {
      const inputPath = args.input ? String(args.input) : args._[1];
      if (!inputPath) {
        console.error('junit: --input <file.xml> required');
        process.exitCode = 1;
        return;
      }
      await importJUnitXml({
        inputPath: path.resolve(inputPath),
        ...common,
        executionName: common.executionName || 'JUnit',
        testsetStrategy: args.testsetstrategy === 'single' ? 'single' : 'per-project',
        suiteAsTestset: bool(args.suiteastestset),
        startTime: args.starttime != null ? Number(args.starttime) : undefined,
        endTime: args.endtime != null ? Number(args.endtime) : undefined
      });
      return;
    }

    if (cmd === 'playreport') {
      const inputPath = args.input ? String(args.input) : args._[1];
      if (!inputPath) {
        console.error('playreport: --input <report.json> required');
        process.exitCode = 1;
        return;
      }
      await importPlaywrightReport({
        inputPath: path.resolve(inputPath),
        ...common,
        executionName: common.executionName || 'Playwright',
        testsetStrategy: args.testsetstrategy === 'single' ? 'single' : 'per-project'
      });
      return;
    }

    if (cmd === 'cucumber') {
      const inputPath = args.input ? String(args.input) : args._[1];
      if (!inputPath) {
        console.error('cucumber: --input <report.json> required');
        process.exitCode = 1;
        return;
      }
      await importCucumberJson({
        inputPath: path.resolve(inputPath),
        ...common,
        executionName: common.executionName || 'Cucumber',
        testsetStrategy: args.testsetstrategy === 'single' ? 'single' : 'per-project',
        featureAsTestset: bool(args.featureastestset),
        startTime: args.starttime != null ? Number(args.starttime) : undefined,
        endTime: args.endtime != null ? Number(args.endtime) : undefined
      });
      return;
    }

    console.error(`Unknown command: ${cmd}`);
    process.exitCode = 1;
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = e.code === 'EXEC_EXISTS' ? 2 : 1;
  }
}

main();
