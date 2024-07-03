#!/usr/bin/env node
/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const path = require('path');
const { generateQafResultsFromJson } = require('./lib/from-json');

async function main() {
  const args = process.argv.slice(2);
  let input = null;
  let outputRoot = 'test-results';
  let name = 'Playwright';
  let mergeRoot = false;
  let testsetStrategy = 'per-project';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--input' || a === '-i') {
      input = args[++i];
      continue;
    }
    if (a === '--output' || a === '-o') {
      outputRoot = args[++i];
      continue;
    }
    if (a === '--name' || a === '-n') {
      name = args[++i];
      continue;
    }
    if (a === '--merge-root') {
      mergeRoot = true;
      continue;
    }
    if (a === '--testset') {
      const v = args[++i];
      if (v === 'per-project' || v === 'single') testsetStrategy = v;
      continue;
    }
    if (a === '--help' || a === '-h') {
      console.log(`Usage: qaf-report-playwright --input <playwright-report.json> [options]

Options:
  --output, -o   Output root (default: test-results)
  --name, -n     Execution display name (default: Playwright)
  --merge-root   Append to test-results/meta-info.json
  --testset      per-project | single (default: per-project)
`);
      process.exit(0);
    }
  }

  if (!input) {
    console.error('Missing --input <path-to-playwright-json-report>');
    process.exit(1);
  }

  const res = await generateQafResultsFromJson({
    inputPath: path.resolve(input),
    outputRoot: path.resolve(outputRoot),
    executionName: name,
    mergeRoot,
    testsetStrategy
  });

  console.log('QAF results written under:', res.reportEntry.dir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
