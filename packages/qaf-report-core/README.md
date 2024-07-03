# qaf-report-core

*Author: Chirag Jayswal, QAF team*


Node library and CLI for the QAF-shaped `test-results/` tree (`emit`, merge-root, history index), HTTP server (`qaf-serve`), and imports (JUnit XML, Cucumber JSON; Playwright when `qaf-report-playwright` is installed).

**Install (with UI):** `npm install qaf-report-core qaf-dashboard-ui`

**Serve:** `npx qaf-serve` (or `npm run start` in this monorepo). Set `QAF_PROJECT_ROOT` for the directory containing `test-results/`, and optionally `QAF_STATIC_ROOT` if the UI package is not resolvable via `node_modules`.

**Imports:** `npx qaf-import junit|playreport|cucumber --input …`
