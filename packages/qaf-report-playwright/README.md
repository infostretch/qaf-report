# qaf-report-playwright

*Author: Chirag Jayswal, QAF team*


Playwright `@playwright/test` reporter and CLI to turn Playwright JSON reports into QAF-shaped output. Depends on **qaf-report-core** for emit and paths.

**Install:** `npm install qaf-report-playwright qaf-report-core @playwright/test`

**CLI (from JSON):** `npx qaf-report-playwright --input playwright-report.json [--output test-results]`

**Reporter:** in `playwright.config` use `reporter: [['qaf-report-playwright/reporter', { outputRoot: 'test-results', mergeRootMeta: true }]]` (see `reporter.js` for options).

**Playwright `outputDir` vs `outputRoot`:** Playwright clears `outputDir` at the start of a run. Use a **different** folder from the reporter’s `outputRoot` (e.g. `outputDir: 'playwright-output'` and `outputRoot: 'test-results'`) so previous QAF executions under `test-results/` are not deleted.
