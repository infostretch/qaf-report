# Test Reporting Dashboard

*Author: Chirag Jayswal, QAF team*


Monorepo with publishable packages: **`qaf-report-core`**, **`qaf-dashboard-ui`**, and **`qaf-report-playwright`**, under [`packages/`](packages/).

A static HTML/JS dashboard for viewing **QAF-shaped** test execution JSON. No server is required when you open `index.html` and use the folder picker (Chrome/Edge).

**Full documentation:** setup, static hosting (S3, GitHub Pages), reporting server, and workflows — see **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)**.

**Demos** live in a **separate repository** (sample imports, Playwright project, GitHub Pages / S3 notes) so users can clone them without this monorepo. See the **`qaf-demos`** companion repo (or your team’s fork). Use **`npm install`** there for published **`qaf-*`** packages, or run **`install-local-qaf.mjs --qaf-root`** with the path to **this** repository clone until publish.

## Quick start (sample data)

The repo includes **generic demo data** (no customer-specific content):

| Location | Role |
| -------- | ---- |
| `test-results/` | Default project — full multi-suite samples |
| `prj-1/test-results/` | **PRJ-1** (reference layout) — two compact runs (`SAMPLE-PRJ1-*`) |
| `prj-2/test-results/` | **PRJ-2** — two nightly-style runs (`SAMPLE-PRJ2-*`) |

Each optional project folder also has a root **`prj-1/meta-info.json`** / **`prj-2/meta-info.json`** (same `reports` as under `test-results/`) for tools that read beside the project directory. The dashboard reads **`{project}/test-results/meta-info.json`** when using `?prj=`.

**`reports[].dir`** uses the same QAF-relative paths as the default tree, e.g. **`test-results/samples/<run-id>/json`**, not `<project>/test-results/...`. With **`?prj=<id>`**, the app resolves those paths under **`{id}/test-results/`** on disk and in HTTP URLs.

### PRJ-1 reference layout (sample project structure)

Use **`prj-1/`** as the template when adding another repo or CI artifact tree next to the default `test-results/`:

```
prj-1/
  meta-info.json              # optional mirror: same { reports } as test-results/meta-info.json
  test-results/
    meta-info.json            # required for ?prj=prj-1
    samples/
      <run-id>/
        json/                 # execution root (overview, chromium/, …)
    test-history-index/       # optional; built by seed or build-test-history-index
```

`projects.json` lists these for the in-app **Project** control (HTTP mode). Regenerate everything with:

```bash
npm run seed-samples
```

That script also runs `build-test-history-index` for **each** project’s `test-results` tree. To rebuild history for only the default tree:

```bash
npm run build-index
# or: node packages/qaf-report-core/scripts/build-test-history-index.js prj-1/test-results
```

Default samples include a **legacy-style** run (`../img/...` next to `json/`), **Playwright-style** attachments, **shared test IDs** across runs (History tab), and **multiple suites** for Charts **By suite** / **By module** when you compare executions on the trend chart.

### Multiple projects (URL + layout)

- **Layout:** default data lives in `test-results/`. Other projects use `<project-id>/test-results/` at the same level as the default folder (sibling of `test-results/`, not nested inside it).
- **Query param:** `?prj=<project-id>` selects the dataset, e.g. `http://localhost:2612/?prj=prj-2` loads `prj-2/test-results/meta-info.json`. Omit `prj` (or use `prj=default`) for the default `test-results/` tree.
- **In-app switcher:** With `projects.json` present and the dashboard served over HTTP(S), a **Project** dropdown appears in the header; changes update `?prj` and reload data.
- **File System Access API:** Pick the **dashboard** folder (the directory that contains `test-results` and optional sibling project folders such as `prj-1/`). The loader applies `?prj` from the page URL after you choose the folder. If you pick a single `test-results` directory directly, only that tree is available and the project switcher stays disabled.

## Usage

### Option 1: File System Access API (Chrome/Edge)

1. Open `packages/qaf-dashboard-ui/index.html` in Chrome or Edge (double-click or drag into the browser).
2. Click **Select folder** (or **Select test-results folder**, depending on build).
3. Choose either:
   - The **dashboard folder** (containing `test-results` and `index.html`), or
   - The **test-results** folder directly.
4. The dashboard loads `meta-info.json` and execution trees from disk.

### Option 2: Local HTTP Server (any browser)

1. From the dashboard directory, run:

   ```bash
   npm start
   # or: npx qaf-serve --prefix packages/qaf-report-core
   ```

2. Open `http://localhost:2612` (or the port shown). Add `?prj=prj-1` (or another id from `projects.json`) to load that project’s `prj-1/test-results/meta-info.json` (path pattern: `{project-id}/test-results/meta-info.json`).
3. By default the app loads `test-results/meta-info.json`.

**Upload requires the built-in server.** Plain `npx serve` or `python -m http.server` only serve static files. Use `npm start` for the Upload API, or:

```bash
npm run serve
```

for static hosting with the upload endpoint proxied.

**Note:** On first request, `npm start` can build `test-history-index.json` if it is missing, which speeds up the History tab.

### npm scripts

| Script            | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `npm start`       | Dashboard + upload/config APIs (`qaf-report-core` / `qaf-serve`) |
| `npm run serve`   | Static `serve` with upload proxy                     |
| `npm run build-index` | Regenerate `test-history-index` from `meta-info.json` |
| `npm run seed-samples` | Replace demo `test-results` with generic samples |
| `npm run sync-meta` | Sync execution `meta-info` from disk (see [User Guide](docs/USER_GUIDE.md)) |
| `npm run sync-meta:all` | Also refresh `projects.json` + execution roots |
| `npm run sync-meta:index` | Executions + rebuild history index |
| `npm run sync-meta:all:index` | Projects + executions + index |
| `npm run cleanup-old-executions` | Remove executions older than 30 days, then `sync-meta` (see [User Guide](docs/USER_GUIDE.md)) |
| `npm run cleanup-old-executions:index` | Same + rebuild history index |

## Upload test-results (merge)

Upload a `.zip`, `.tgz`, or `.tar` archive to merge into `test-results`:

```bash
# Raw binary (recommended for curl)
curl -X POST --data-binary @archive.zip -H "Content-Type: application/octet-stream" http://localhost:2612/api/upload

# Multipart form
curl -X POST -F "file=@archive.zip" http://localhost:2612/api/upload
```

## Config API

Get or set `maxExecutions` (cap on execution entries in root `meta-info`, default 5), `maxHistory` (max history entries per test, default 10), and `allowDeleteOldExecutions` (when true, delete pruned execution directories from disk; default false):

```bash
# Get config
curl http://localhost:2612/api/config

# Set config
curl -X POST -H "Content-Type: application/json" -d '{"maxExecutions":5,"maxHistory":10,"allowDeleteOldExecutions":true}' http://localhost:2612/api/config
```

Config is stored in `test-results/dashboard-config.json`. Non-existent execution directories referenced in `meta-info` are cleaned up automatically; older executions can be pruned to `maxExecutions`.

## Features

- **Overview**: Execution list with start times and navigation into a run.
- **By Suite / By Test Case / Charts / Cycle**: View switcher for different layouts (URL hash: `#testcase`, `#charts`, `#cycle`).
- **Charts**: Status donut (multi-donut when comparing executions), stacked bars and line trends, **By suite** and **By module** breakdowns with optional data tables. Select multiple executions on the trend chart to compare pass/fail/skip per suite or per module side by side.
- **Cycle**: Date range and status across runs (e.g. fixed / broken / unstable heuristics); table and trend visuals.
- **Drill-down**: Execution → test sets → classes → methods; checkpoints, screenshots, non-image attachments, `seleniumLog` / command log where present.
- **History tab** (method detail): Prior runs for the same `testID` + `classPath` across executions listed in root `meta-info`.
- **Filters, sort, search**: On tables where applicable.
- **Breadcrumbs**: Navigate back through execution / test set / class.

### Asset paths in JSON

- **Legacy QAF** often stores checkpoint screenshots as paths like `../img/...` (relative to the execution’s `json/` root).
- **Playwright-originated** reports usually use paths under the class folder (for example `attachments/...`).

The dashboard resolves both patterns so screenshots and attachment links open correctly.

## Data layout

Root **`test-results/meta-info.json`** (or **`{project}/test-results/meta-info.json`**) lists a `reports` array. Each entry has `name`, `dir`, and `startTime`. The **`dir`** value is typically **`test-results/samples/<run>/json`** (execution root). For sibling projects, that path is resolved inside **`{project}/test-results/`** so the same `meta-info` shape can be copied between trees. The execution folder contains its own **`meta-info.json`** (totals, `tests` array of test-set folder names). Under each test set:

- **`overview.json`**: aggregates and a `classes` list.
- Each class folder: **`meta-info.json`** (methods with `metaData.resultFileName`, `testID`, etc.) and sidecar **`{resultFileName}.json`** files (checkpoints, errors, optional `attachments`).

## Playwright → QAF tree

To generate compatible **`test-results/`** trees from **Playwright** (reporter or JSON converter), see **[`packages/qaf-report-playwright/README.md`](packages/qaf-report-playwright/README.md)** (`npm install` / `npx qaf-report-playwright`).

## Test history index (optional)

The History tab and **By Test Case** view are faster when a pre-built index exists:

```bash
node scripts/build-test-history-index.js [test-results-path]
# Default: ./test-results
```

Outputs:

- **`test-results/test-history-index.json`** — manifest (`reportDirs`, `lastUpdated`).
- **`test-results/test-history-index/tests-index.json`** — map of test id → `classPath` / hash (for **By Test Case**).
- **`test-results/test-history-index/{hash}.json`** — last N executions per test (default 10), minimal fields.

If the index is missing or stale, the app falls back to **localStorage** (browser) or a **full scan** of reports.

**When to run:** After importing or generating new reports, or in CI after publishing `test-results/`.

## Backup behavior

- **Fetch retry**: Critical loads retry with backoff.
- **Index backup**: The build script (and server) can back up the previous index before rewriting; failed writes restore the backup when applicable.
- **History resolution**: Server per-test files → legacy bundled index → **localStorage** → full scan.
