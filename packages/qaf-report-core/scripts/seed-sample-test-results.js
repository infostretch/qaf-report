#!/usr/bin/env node
/**
 * @author Chirag Jayswal, QAF team
 * Replace test-results with generic sample executions covering:
 * suite drill-down, test-case view + index, history (shared test IDs), cycle/charts (multi-run trends),
 * Playwright-style attachments, legacy QAF ../img checkpoints,
 * Charts "By suite" / "By module" comparison (chromium + api_suite on all main runs; modules ui, promo, services).
 *
 * Run: npm run seed-samples (repo root) or node scripts/seed-sample-test-results.js
 * Uses the monorepo root when npm workspace cwd is packages/qaf-report-core; override with QAF_PROJECT_ROOT.
 *
 * Multi-project samples follow **PRJ-1** layout (see README): `{slug}/meta-info.json`,
 * `{slug}/test-results/meta-info.json`, `{slug}/test-results/samples/<run>/json/...`.
 */
const fs = require('fs');
const path = require('path');
const { buildIndex } = require('./build-test-history-index.js');
const { resolveProjectRoot } = require('./resolve-project-root.js');

const DASHBOARD_ROOT = resolveProjectRoot();
if (path.resolve(DASHBOARD_ROOT) !== path.resolve(process.cwd())) {
  console.log('seed-samples: writing under', DASHBOARD_ROOT, '(npm workspace cwd was', process.cwd() + ')');
}
const TR_DEFAULT = path.join(DASHBOARD_ROOT, 'test-results');

/** PRJ-1 / PRJ-2 reference: directory slugs (use ?prj=prj-1). */
const SAMPLE_PRJ1_SLUG = 'prj-1';
const SAMPLE_PRJ2_SLUG = 'prj-2';

const CLASS_CHECKOUT = 'ui/checkout.spec.ts';
const CLASS_PROMO = 'features/promo/campaign.feature';
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const HAR_MINI = JSON.stringify({
  log: { version: '1.2', creator: { name: 'sample-har' }, entries: [] }
});


// ---- dynamic sample runs ----

function daysAgo(days, hr,min) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hr, min);
  return d;
}

function toStartOfDayTs(date) {
  const d = new Date(date);
  d.setHours(10, 0, 0, 0);
  return d.getTime();
}

function formatRunName(date, label) {
  const fmt = date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit'
  });
  return `Sample run · ${fmt} (${label})`;
}

function buildRunId(date) {
  return `exec_${date.toISOString().slice(0, 10).replace(/-/g, '_')}`;
}

const day03 = daysAgo(24, 10,20);
const day10 = daysAgo(17, 8,15);
const day17 = daysAgo(10, 19,36);
const day24 = daysAgo(3, 13,51);
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, 'utf8');
}

function writeBin(filePath, buf) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buf);
}

function clearDashboardSampleDirs() {
  ['test-results', SAMPLE_PRJ1_SLUG, SAMPLE_PRJ2_SLUG, 'prj-3', 'demo-alpha', 'demo-beta'].forEach((name) => {
    const p = path.join(DASHBOARD_ROOT, name);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  });
  const pj = path.join(DASHBOARD_ROOT, 'projects.json');
  if (fs.existsSync(pj)) fs.rmSync(pj, { force: true });
}

function methodStable(startMs) {
  return {
    index: 1,
    retryCount: null,
    type: 'test',
    args: [],
    metaData: {
      name: 'Stable checkout smoke',
      sign: 'checkout.spec.ts.Stable checkout smoke()',
      reference: CLASS_CHECKOUT,
      resultFileName: 'StableCheckout',
      testID: 'SAMPLE-TC-STABLE',
      module: 'ui',
      platform: 'chromium'
    },
    dependsOn: [],
    doc: null,
    startTime: startMs,
    duration: 3100,
    result: 'pass',
    passPer: 100
  };
}

function methodFlaky(result, startMs) {
  const fail = result === 'fail';
  return {
    index: 2,
    retryCount: null,
    type: 'test',
    args: [],
    metaData: {
      name: 'Flaky cart assertion',
      sign: 'checkout.spec.ts.Flaky cart assertion()',
      reference: CLASS_CHECKOUT,
      resultFileName: 'FlakyCart',
      testID: 'SAMPLE-TC-FLAKY',
      module: 'ui',
      platform: 'chromium'
    },
    dependsOn: [],
    doc: null,
    startTime: startMs + 100,
    duration: fail ? 5200 : 2800,
    result,
    passPer: fail ? 0 : 100
  };
}

function methodOptional(result, startMs) {
  return {
    index: 3,
    retryCount: null,
    type: 'test',
    args: [],
    metaData: {
      name: 'Optional promotional banner',
      sign: 'checkout.spec.ts.Optional promotional banner()',
      reference: CLASS_CHECKOUT,
      resultFileName: 'OptionalBanner',
      testID: 'SAMPLE-TC-OPTIONAL',
      module: 'ui',
      platform: 'chromium'
    },
    dependsOn: [],
    doc: null,
    startTime: startMs + 200,
    duration: result === 'skip' ? 120 : 900,
    result,
    passPer: result === 'pass' ? 100 : 0
  };
}

function methodPromoCampaign(result, startMs) {
  const fail = result === 'fail';
  return {
    index: 1,
    retryCount: null,
    type: 'test',
    args: [],
    metaData: {
      name: 'Campaign banner visible',
      sign: 'campaign.feature.Campaign banner visible()',
      reference: CLASS_PROMO,
      resultFileName: 'CampaignBanner',
      testID: 'SAMPLE-TC-PROMO',
      platform: 'chromium'
    },
    dependsOn: [],
    doc: null,
    startTime: startMs + 400,
    duration: fail ? 800 : 340,
    result,
    passPer: fail ? 0 : 100
  };
}

function methodRichDemo(startMs) {
  return {
    index: 4,
    retryCount: null,
    type: 'test',
    args: [],
    metaData: {
      name: 'Rich failure with attachments',
      sign: 'checkout.spec.ts.Rich failure with attachments()',
      reference: CLASS_CHECKOUT,
      resultFileName: 'RichAttachments',
      testID: 'SAMPLE-TC-RICH',
      module: 'ui',
      platform: 'chromium'
    },
    dependsOn: [],
    doc: null,
    startTime: startMs + 300,
    duration: 4100,
    result: 'fail',
    passPer: 0
  };
}

function resultStable() {
  return {
    seleniumLog: [
      { command: 'open', target: '/', value: '' },
      { command: 'click', target: 'css=.sign-in-guest', value: '' },
      { command: 'type', target: 'id=email', value: 'demo-user@example.com' },
      { command: 'click', target: 'css=.checkout-cta', value: '' }
    ],
    checkPoints: [
      { message: 'Open store front', type: 'pass', duration: 120 },
      { message: 'Sign in as guest shopper', type: 'pass', duration: 240 },
      { message: 'Reach checkout', type: 'pass', duration: 310 }
    ]
  };
}

function resultFlaky(fail) {
  if (!fail) {
    return {
      checkPoints: [
        { message: 'Add item to cart', type: 'pass', duration: 200 },
        { message: 'Open cart drawer', type: 'pass', duration: 150 }
      ]
    };
  }
  return {
    errorTrace:
      "java.lang.AssertionError: Expected cart total 42.00 but was 19.99\n\tat com.example.tests.CartTest.verifyTotal(CartTest.java:88)",
    errorMessage: 'java.lang.AssertionError: Expected cart total 42.00 but was 19.99',
    checkPoints: [
      { message: 'Add item to cart', type: 'pass', duration: 200 },
      { message: 'Assert cart total', type: 'fail', duration: 100 },
      { message: 'Capture cart state', type: 'info', screenshot: 'attachments/0_cart.png' }
    ]
  };
}

function resultOptional(res) {
  if (res === 'skip') {
    return {
      checkPoints: [{ message: 'Banner feature disabled for this build', type: 'skip', duration: 50 }]
    };
  }
  return {
    checkPoints: [
      { message: 'Load home page', type: 'pass', duration: 180 },
      { message: 'Dismiss optional banner', type: 'pass', duration: 90 }
    ]
  };
}

function resultPromo(fail) {
  if (!fail) {
    return {
      checkPoints: [
        { message: 'Load home page', type: 'pass', duration: 150 },
        { message: 'Verify campaign strip', type: 'pass', duration: 90 }
      ]
    };
  }
  return {
    errorTrace:
      'java.lang.AssertionError: Expected campaign element visible but was hidden\n\tat sample.CampaignTest.verifyBanner(CampaignTest.java:22)',
    errorMessage: 'java.lang.AssertionError: Expected campaign element visible but was hidden',
    checkPoints: [
      { message: 'Load home page', type: 'pass', duration: 150 },
      { message: 'Verify campaign strip', type: 'fail', duration: 800 }
    ]
  };
}

function resultRich() {
  return {
    errorTrace:
      "Error: expect(locator).toBeVisible() failed\nLocator: getByRole('button', { name: 'Pay now' })\nTimeout: 5000ms",
    errorMessage: "Error: expect(locator).toBeVisible() failed",
    checkPoints: [
      { message: 'Load payment step', type: 'pass', duration: 260 },
      { message: 'Wait for primary action', type: 'fail', duration: 5000 },
      {
        message: 'Screenshot at failure',
        type: 'fail',
        screenshot: 'attachments/0_failure.png'
      }
    ],
    attachments: [
      { name: 'network.har', path: 'attachments/1_network.har', contentType: 'application/json' },
      { name: 'session-notes.txt', path: 'attachments/2_notes.txt', contentType: 'text/plain' }
    ]
  };
}

function writeCheckoutArtifacts(baseDir, run) {
  const classDir = path.join(baseDir, 'chromium', CLASS_CHECKOUT);
  ensureDir(classDir);

  writeJson(path.join(classDir, 'StableCheckout.json'), resultStable());
  if (run.flaky === 'fail') {
    const attDir = path.join(classDir, 'attachments');
    ensureDir(attDir);
    writeBin(path.join(attDir, '0_cart.png'), PNG_1X1);
  }
  writeJson(path.join(classDir, 'FlakyCart.json'), resultFlaky(run.flaky === 'fail'));

  writeJson(path.join(classDir, 'OptionalBanner.json'), resultOptional(run.optional));

  if (run.includeRichDemo) {
    const attDir = path.join(classDir, 'attachments');
    ensureDir(attDir);
    writeBin(path.join(attDir, '0_failure.png'), PNG_1X1);
    writeText(path.join(attDir, '1_network.har'), HAR_MINI);
    writeText(
      path.join(attDir, '2_notes.txt'),
      'Sample run notes: synthetic data for dashboard demo.\nNo external URLs or customer content.'
    );
    writeJson(path.join(classDir, 'RichAttachments.json'), resultRich());
  }

  const promoResult = run.promoResult === 'fail' ? 'fail' : 'pass';
  const promoDir = path.join(baseDir, 'chromium', CLASS_PROMO);
  ensureDir(promoDir);
  writeJson(path.join(promoDir, 'CampaignBanner.json'), resultPromo(promoResult === 'fail'));
  writeJson(path.join(promoDir, 'meta-info.json'), {
    methods: [methodPromoCampaign(promoResult, run.startTime + 1000)]
  });

  const methods = [
    methodStable(run.startTime + 1000),
    methodFlaky(run.flaky === 'fail' ? 'fail' : 'pass', run.startTime + 1000),
    methodOptional(run.optional, run.startTime + 1000)
  ];
  if (run.includeRichDemo) {
    methods.push(methodRichDemo(run.startTime + 1000));
  }

  writeJson(path.join(classDir, 'meta-info.json'), { methods });

  const p = run.chromiumTotals.pass;
  const f = run.chromiumTotals.fail;
  const sk = run.chromiumTotals.skip;
  writeJson(path.join(baseDir, 'chromium', 'overview.json'), {
    total: p + f + sk,
    pass: p,
    fail: f,
    skip: sk,
    classes: [CLASS_CHECKOUT, CLASS_PROMO]
  });
}

function writeApiSuite(baseDir, startTime, apiResult) {
  const cls = 'services/health.spec.ts';
  const classDir = path.join(baseDir, 'api_suite', cls);
  const fail = apiResult === 'fail';
  ensureDir(classDir);
  writeJson(path.join(classDir, 'meta-info.json'), {
    methods: [
      {
        index: 1,
        retryCount: null,
        type: 'test',
        args: [],
        metaData: {
          name: 'Health probe returns 200',
          sign: 'health.spec.ts.Health probe()',
          reference: cls,
          resultFileName: 'ApiHealth',
          testID: 'SAMPLE-TC-API',
          module: 'services',
          platform: 'api'
        },
        dependsOn: [],
        doc: null,
        startTime: startTime + 500,
        duration: fail ? 2100 : 120,
        result: fail ? 'fail' : 'pass',
        passPer: fail ? 0 : 100
      }
    ]
  });
  writeJson(
    path.join(classDir, 'ApiHealth.json'),
    fail
      ? {
          errorTrace:
            'java.net.ConnectException: Connection refused (Connection refused)\n\tat sample.ApiHealthTest.getHealth(ApiHealthTest.java:15)',
          errorMessage: 'java.net.ConnectException: Connection refused (Connection refused)',
          checkPoints: [
            { message: 'GET /health', type: 'fail', duration: 2100 }
          ]
        }
      : {
          checkPoints: [
            { message: 'GET /health', type: 'pass', duration: 40 },
            { message: 'Verify status line', type: 'pass', duration: 20 }
          ]
        }
  );
  writeJson(path.join(baseDir, 'api_suite', 'overview.json'), {
    total: 1,
    pass: fail ? 0 : 1,
    fail: fail ? 1 : 0,
    skip: 0,
    classes: [cls]
  });
}

function writeExecution(run, diskRoot) {
  const jsonRoot = path.join(diskRoot, 'samples', run.id, 'json');
  ensureDir(jsonRoot);

  const tests = run.tests;
  let total = 0;
  let pass = 0;
  let fail = 0;
  let skip = 0;
  tests.forEach((t) => {
    const o = run.suiteTotals[t];
    if (o) {
      total += o.total;
      pass += o.pass;
      fail += o.fail;
      skip += o.skip;
    }
  });

  const status = fail > 0 ? 'fail' : 'pass';
  const endTime = run.startTime + total * 900 + 120000;

  writeJson(path.join(jsonRoot, 'meta-info.json'), {
    name: run.name,
    status,
    tests,
    total,
    pass,
    fail,
    skip,
    startTime: run.startTime,
    endTime
  });

  writeCheckoutArtifacts(jsonRoot, run);
  if (tests.includes('api_suite')) {
    writeApiSuite(jsonRoot, run.startTime, run.apiResult || 'pass');
  }
}

function methodPrj1Core(startMs) {
  return {
    index: 1,
    retryCount: null,
    type: 'test',
    args: [],
    metaData: {
      name: 'PRJ-1 core smoke',
      sign: 'checkout.spec.ts.PRJ-1 core smoke()',
      reference: CLASS_CHECKOUT,
      resultFileName: 'Prj1Core',
      testID: 'SAMPLE-PRJ1-CORE',
      module: 'ui',
      platform: 'chromium'
    },
    dependsOn: [],
    doc: null,
    startTime: startMs,
    duration: 900,
    result: 'pass',
    passPer: 100
  };
}

function methodPrj1Pair(result, startMs) {
  const fail = result === 'fail';
  return {
    index: 2,
    retryCount: null,
    type: 'test',
    args: [],
    metaData: {
      name: 'PRJ-1 integration pair',
      sign: 'checkout.spec.ts.PRJ-1 integration pair()',
      reference: CLASS_CHECKOUT,
      resultFileName: 'Prj1Pairing',
      testID: 'SAMPLE-PRJ1-PAIR',
      module: 'ui',
      platform: 'chromium'
    },
    dependsOn: [],
    doc: null,
    startTime: startMs + 50,
    duration: fail ? 1100 : 600,
    result,
    passPer: fail ? 0 : 100
  };
}

function writePrj1Run(diskRoot, def) {
  const jsonRoot = path.join(diskRoot, 'samples', def.id, 'json');
  const fail = !!def.flakyFail;
  const tests = ['chromium'];
  const pass = fail ? 1 : 2;
  const failC = fail ? 1 : 0;
  const t = 2;
  writeJson(path.join(jsonRoot, 'meta-info.json'), {
    name: def.name,
    status: fail ? 'fail' : 'pass',
    tests,
    total: t,
    pass,
    fail: failC,
    skip: 0,
    startTime: def.startTime,
    endTime: def.startTime + 80000
  });
  const classDir = path.join(jsonRoot, 'chromium', CLASS_CHECKOUT);
  ensureDir(classDir);
  writeJson(path.join(classDir, 'Prj1Core.json'), resultStable());
  if (fail) {
    const attDir = path.join(classDir, 'attachments');
    ensureDir(attDir);
    writeBin(path.join(attDir, '0_cart.png'), PNG_1X1);
  }
  writeJson(path.join(classDir, 'Prj1Pairing.json'), resultFlaky(fail));
  writeJson(path.join(classDir, 'meta-info.json'), {
    methods: [methodPrj1Core(def.startTime + 200), methodPrj1Pair(fail ? 'fail' : 'pass', def.startTime + 200)]
  });
  writeJson(path.join(jsonRoot, 'chromium', 'overview.json'), {
    total: t,
    pass,
    fail: failC,
    skip: 0,
    classes: [CLASS_CHECKOUT]
  });
}

function methodPrj2Stable(startMs) {
  return {
    index: 1,
    retryCount: null,
    type: 'test',
    args: [],
    metaData: {
      name: 'PRJ-2 stable path',
      sign: 'checkout.spec.ts.PRJ-2 stable path()',
      reference: CLASS_CHECKOUT,
      resultFileName: 'Prj2Stable',
      testID: 'SAMPLE-PRJ2-STABLE',
      module: 'ui',
      platform: 'chromium'
    },
    dependsOn: [],
    doc: null,
    startTime: startMs,
    duration: 700,
    result: 'pass',
    passPer: 100
  };
}

function methodPrj2Optional(result, startMs) {
  return {
    index: 2,
    retryCount: null,
    type: 'test',
    args: [],
    metaData: {
      name: 'PRJ-2 optional feature',
      sign: 'checkout.spec.ts.PRJ-2 optional feature()',
      reference: CLASS_CHECKOUT,
      resultFileName: 'Prj2Optional',
      testID: 'SAMPLE-PRJ2-OPT',
      module: 'ui',
      platform: 'chromium'
    },
    dependsOn: [],
    doc: null,
    startTime: startMs + 40,
    duration: result === 'skip' ? 80 : 400,
    result,
    passPer: result === 'pass' ? 100 : 0
  };
}

function writePrj2Run(diskRoot, def) {
  const jsonRoot = path.join(diskRoot, 'samples', def.id, 'json');
  const opt = def.optional;
  const tests = ['chromium'];
  const pass = opt === 'skip' ? 1 : 2;
  const skip = opt === 'skip' ? 1 : 0;
  const t = 2;
  writeJson(path.join(jsonRoot, 'meta-info.json'), {
    name: def.name,
    status: 'pass',
    tests,
    total: t,
    pass,
    fail: 0,
    skip,
    startTime: def.startTime,
    endTime: def.startTime + 70000
  });
  const classDir = path.join(jsonRoot, 'chromium', CLASS_CHECKOUT);
  ensureDir(classDir);
  writeJson(path.join(classDir, 'Prj2Stable.json'), resultStable());
  writeJson(path.join(classDir, 'Prj2Optional.json'), resultOptional(opt));
  writeJson(path.join(classDir, 'meta-info.json'), {
    methods: [methodPrj2Stable(def.startTime + 100), methodPrj2Optional(opt, def.startTime + 100)]
  });
  writeJson(path.join(jsonRoot, 'chromium', 'overview.json'), {
    total: t,
    pass,
    fail: 0,
    skip,
    classes: [CLASS_CHECKOUT]
  });
}

function writePrj1SampleProject() {
  const slug = SAMPLE_PRJ1_SLUG;
  const diskRoot = path.join(DASHBOARD_ROOT, slug, 'test-results');
  const runs = [
    { id: 'prj1_build_01', name: 'PRJ-1 · Build 01', startTime: daysAgo(26, 8,10).getTime(), flakyFail: false },
    { id: 'prj1_build_02', name: 'PRJ-1 · Build 02', startTime: daysAgo(27, 9,15).getTime(), flakyFail: true }
  ];
  runs.forEach((d) => writePrj1Run(diskRoot, d));
  const reports = runs
    .map((d) => ({ name: d.name, dir: `test-results/samples/${d.id}/json`, startTime: d.startTime }))
    .sort((a, b) => b.startTime - a.startTime);
  const payload = { reports };
  writeJson(path.join(diskRoot, 'meta-info.json'), payload);
  writeJson(path.join(DASHBOARD_ROOT, slug, 'meta-info.json'), payload);
}

function writePrj2SampleProject() {
  const slug = SAMPLE_PRJ2_SLUG;
  const diskRoot = path.join(DASHBOARD_ROOT, slug, 'test-results');
  const runs = [
    { id: 'prj2_nightly_01', name: 'PRJ-2 · Nightly 01', startTime: daysAgo(29, 23,00).getTime(), optional: 'skip' },
    { id: 'prj2_nightly_02', name: 'PRJ-2 · Nightly 02', startTime: daysAgo(30, 23,00).getTime(), optional: 'pass' }
  ];
  runs.forEach((d) => writePrj2Run(diskRoot, d));
  const reports = runs
    .map((d) => ({ name: d.name, dir: `test-results/samples/${d.id}/json`, startTime: d.startTime }))
    .sort((a, b) => b.startTime - a.startTime);
  const payload = { reports };
  writeJson(path.join(diskRoot, 'meta-info.json'), payload);
  writeJson(path.join(DASHBOARD_ROOT, slug, 'meta-info.json'), payload);
}

function writeProjectsManifest() {
  writeJson(path.join(DASHBOARD_ROOT, 'projects.json'), {
    projects: [
      { id: '', label: 'Default', description: 'test-results at repository root' },
      {
        id: SAMPLE_PRJ1_SLUG,
        label: 'PRJ-1',
        description: 'Reference sample layout — see README (PRJ-1 structure)'
      },
      { id: SAMPLE_PRJ2_SLUG, label: 'PRJ-2', description: 'Second compact sample project' }
    ]
  });
}

function writeLegacyQaf(diskRoot) {
  const id = 'exec_legacy_qaf';
  const root = path.join(diskRoot, 'samples', id);
  const jsonRoot = path.join(root, 'json');
  const classPath = 'features/shop/orders.feature';
  const classDir = path.join(jsonRoot, 'smoke_suite', classPath);
  ensureDir(classDir);

  writeJson(path.join(jsonRoot, 'meta-info.json'), {
    name: 'Sample legacy-style run (QAF paths)',
    status: 'pass',
    tests: ['smoke_suite'],
    total: 1,
    pass: 1,
    fail: 0,
    skip: 0,
    startTime: day24.getTime(),
    endTime: day24.getTime() + 200000
  });

  writeJson(path.join(jsonRoot, 'smoke_suite', 'overview.json'), {
    total: 1,
    pass: 1,
    fail: 0,
    skip: 0,
    classes: [classPath]
  });

  writeJson(path.join(classDir, 'meta-info.json'), {
    methods: [
      {
        index: 1,
        retryCount: null,
        type: 'test',
        args: [],
        metaData: {
          name: 'Place order happy path',
          sign: 'orders.feature.Place order happy path()',
          reference: classPath,
          resultFileName: 'OrderHappyPath',
          testID: 'SAMPLE-TC-LEGACY',
          module: 'shop',
          platform: 'web'
        },
        dependsOn: [],
        doc: null,
        startTime: day24.getTime(),
        duration: 12000,
        result: 'pass',
        passPer: 100
      }
    ]
  });

  writeBin(path.join(root, 'img', 'legacy_checkpoint.png'), PNG_1X1);
  writeJson(path.join(classDir, 'OrderHappyPath.json'), {
    checkPoints: [
      { message: 'Select catalog item', type: 'pass', duration: 400 },
      {
        message: 'Review order screen',
        type: 'pass',
        duration: 220,
        screenshot: '../img/legacy_checkpoint.png'
      }
    ]
  });
}

async function main() {
  clearDashboardSampleDirs();

  const META_DEFAULT = 'test-results';
  const execDay03 = {
    id: 'exec_03',
    name: formatRunName(day03,'baseline'),
    startTime: day03.getTime(),
    flaky: 'pass',
    optional: 'skip',
    promoResult: 'pass',
    apiResult: 'pass',
    includeRichDemo: false,
    tests: ['chromium', 'api_suite'],
    chromiumTotals: { total: 4, pass: 3, fail: 0, skip: 1 },
    suiteTotals: {
      chromium: { total: 4, pass: 3, fail: 0, skip: 1 },
      api_suite: { total: 1, pass: 1, fail: 0, skip: 0 }
    }
  };

  const execDay10 = {
    id: 'exec_10',
	name: formatRunName(day10,'regression'),
    startTime: day10.getTime(),
    flaky: 'fail',
    optional: 'skip',
    promoResult: 'fail',
    apiResult: 'fail',
    includeRichDemo: false,
    tests: ['chromium', 'api_suite'],
    chromiumTotals: { total: 4, pass: 1, fail: 2, skip: 1 },
    suiteTotals: {
      chromium: { total: 4, pass: 1, fail: 2, skip: 1 },
      api_suite: { total: 1, pass: 0, fail: 1, skip: 0 }
    }
  };

  const execDay17 = {
    id: 'exec_17',
	name: formatRunName(day17,'recovery'),
    startTime: day17.getTime(),
    flaky: 'pass',
    optional: 'pass',
    promoResult: 'pass',
    apiResult: 'pass',
    includeRichDemo: false,
    tests: ['chromium', 'api_suite'],
    chromiumTotals: { total: 4, pass: 4, fail: 0, skip: 0 },
    suiteTotals: {
      chromium: { total: 4, pass: 4, fail: 0, skip: 0 },
      api_suite: { total: 1, pass: 1, fail: 0, skip: 0 }
    }
  };

  const execDay24 = {
    id: 'exec_24',
    name: formatRunName(day24,'latest'),
    startTime: day24.getTime(),
    flaky: 'pass',
    optional: 'pass',
    promoResult: 'pass',
    apiResult: 'pass',
    includeRichDemo: true,
    tests: ['chromium', 'api_suite'],
    chromiumTotals: { total: 5, pass: 4, fail: 1, skip: 0 },
    suiteTotals: {
      chromium: { total: 5, pass: 4, fail: 1, skip: 0 },
      api_suite: { total: 1, pass: 1, fail: 0, skip: 0 }
    }
  };

  [execDay03, execDay10, execDay17, execDay24].forEach((r) => writeExecution(r, TR_DEFAULT));
  writeLegacyQaf(TR_DEFAULT);

  const reports = [
    { name: execDay24.name, dir: `${META_DEFAULT}/samples/${execDay24.id}/json`, startTime: execDay24.startTime },
    {
      name: 'Sample legacy-style run (QAF paths)',
      dir: `${META_DEFAULT}/samples/exec_legacy_qaf/json`,
      startTime: execDay24.startTime,
    },
    { name: execDay17.name, dir: `${META_DEFAULT}/samples/${execDay17.id}/json`, startTime: execDay17.startTime },
    { name: execDay10.name, dir: `${META_DEFAULT}/samples/${execDay10.id}/json`, startTime: execDay10.startTime },
    { name: execDay03.name, dir: `${META_DEFAULT}/samples/${execDay03.id}/json`, startTime: execDay03.startTime }
  ];

  writeJson(path.join(TR_DEFAULT, 'meta-info.json'), { reports });

  writePrj1SampleProject();
  writePrj2SampleProject();
  writeProjectsManifest();

  for (const rootRel of [
    'test-results',
    `${SAMPLE_PRJ1_SLUG}/test-results`,
    `${SAMPLE_PRJ2_SLUG}/test-results`
  ]) {
    const rootPath = path.join(DASHBOARD_ROOT, rootRel);
    await buildIndex(rootPath, { write: true, maxHistory: 10 });
  }

  console.log(
    `Sample data under ${DASHBOARD_ROOT}: test-results/, ${SAMPLE_PRJ1_SLUG}/test-results/, ${SAMPLE_PRJ2_SLUG}/test-results/, projects.json (+ indexes).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
