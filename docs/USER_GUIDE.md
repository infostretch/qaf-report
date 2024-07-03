# Test Reporting Dashboard — User Guide

*Author: Chirag Jayswal, QAF team*


This guide covers setup, running locally, publishing as **static HTML** (Amazon S3, GitHub Pages, CDNs), and running the **reporting server** with upload and configuration APIs. For data shape and features, see the root [README](../README.md).

---

## 1. What you get

| Mode | Best for | Multi-project `?prj=` | Upload merges | History index |
|------|-----------|----------------------|---------------|---------------|
| **Open `file://` + folder picker** | Quick local view, Chrome/Edge | Yes, if you pick the **dashboard** folder (same layout as static deploy) | No | Pre-built site-root `test-history-index` strongly recommended; client scan is capped at scale |
| **Static HTTP (S3, GitHub Pages, `npx serve`)** | Shared reports, no Node on viewers | Yes, if `projects.json` + folders exist | No | Pre-build recommended |
| **Reporting server (`npm start`)** | Local/CI ingest, APIs, auto index | Yes | Yes | Built on demand / pre-built |

---

## 2. Requirements

### To view the dashboard (any mode)

- A modern browser (Chrome, Edge, Firefox, Safari).
- **File System Access API** (folder picker without a server): **Chrome** or **Edge** recommended.

### To run Node scripts (optional)

- **Node.js** 18+ recommended (for `npm start`, `seed-samples`, `sync-meta`, `build-index`).

---

## 3. Setup

### 3.1 Get the code

```bash
git clone <your-repo-url> dashboard
cd dashboard
```

### 3.2 Install dependencies (server / tooling only)

Static hosting does **not** require `npm install` on the machine that **only** serves files. Install where you run Node:

```bash
npm install
```

### 3.3 Optional: sample data

```bash
npm run seed-samples
```

This refreshes `test-results/`, sample `prj-*` trees, `projects.json`, and history indexes.

### 3.4 Import demos (JUnit, Playwright, Cucumber)

Minimal samples and **`npm run import`** scripts live in the separate **`qaf-demos`** repository (not bundled in this package). Clone that repo and use **`npm install`** / **`qaf-import`** per demo README. From **this** monorepo root you can still run **`npm run qaf-import:junit`** etc. for the same CLI.

### 3.5 Optional: align disk with `meta-info` / `projects.json`

After adding or removing report folders (or before publishing):

```bash
npm run sync-meta          # execution trees only (default)
npm run sync-meta:all      # also refresh projects.json + orphan cleanup
npm run sync-meta:index    # executions + rebuild `test-history-index`
npm run sync-meta:all:index  # everything including projects + index
```

See `scripts/sync-projects-meta.js` header for `--projects`, `--no-executions`, `--build-index`, `--no-upload-inbox`, and `--upload-dir`.

**Upload inbox (import on sync):** Before execution sync, the script looks for a folder named **`upload`** at the dashboard root (imports into `test-results/`) and, for each project directory such as `prj-1/`, an optional **`prj-1/upload`** (imports into `prj-1/test-results/`). Supported **files** at the top level of each inbox are the same as HTTP upload: **`.zip`**, **`.tgz`**, **`.tar`**, **`.xml`**, **`.json`** (JUnit, Playwright, Cucumber, or a QAF **`test-results/`** tree in a zip). Each file is auto-detected and imported; **after a successful import the file is deleted** from the inbox. Unreadable or ambiguous files are left in place and a warning is printed. Set **`QAF_UPLOAD_DIR`** or **`--upload-dir=name`** to use a different inbox folder name; use **`--no-upload-inbox`** to skip this step.

---

## 4. Local usage

### 4.1 Reporting server (recommended for development)

Serves the dashboard and JSON under the repo root, and exposes APIs:

```bash
npm start
# same as: node scripts/server.js [port]
# default: http://localhost:2612 (qaf-dashboard-ui / qaf-serve)
```

- Open **http://localhost:2612** (or the port printed in the terminal).
- **Upload**, **config**, and **on-demand history index** behavior are described in [Section 6](#6-reporting-server).

### 4.2 Static server + upload proxy

If you prefer **`serve`** for static files but still want **`/api/upload`**:

```bash
npm run serve
# proxy → API on port+1, static on port+2, browser on default 2612
```

See `scripts/proxy-with-serve.js` for port layout.

### 4.3 Plain static server (no upload)

Any static file server from the **repository root** (where `index.html` lives) works:

```bash
npx serve .
# or
python -m http.server 8080
```

Open the URL shown; relative paths like `./test-results/meta-info.json` must resolve from that root.

### 4.4 File `file://` + “Select folder” (no HTTP)

1. Open **`index.html`** in Chrome or Edge.
2. Click **Select folder**.
3. Choose:
   - The **dashboard directory** (contains `index.html` and `test-results/`), **or**
   - A single **`test-results`** folder (one project only; project switcher disabled).

**Upload** and **server APIs** are unavailable in this mode.

### 4.5 Multiple projects (`?prj=`)

- Data layout: default **`test-results/`**; other projects **`{id}/test-results/`** beside it (e.g. `prj-1/test-results/`).
- URL: **`http://localhost:2612/?prj=prj-1`**
- **`projects.json`** at the site root lists entries for the header **Project** dropdown when served over HTTP.
- **`reports[].dir`** in each root `meta-info.json` uses paths like **`test-results/<path>/json`**; the app maps them under `{id}/test-results/` when `?prj=` is set.

If a project is missing, the UI shows an error with links to valid projects when possible.

### 4.6 Index tools (browser storage)

When **on-disk** **`test-history-index`** files are available, the app uses them for a fast **History** tab and **By Test Case** view. That includes files served over **HTTP(S)** and files inside a **folder you select** (for example outputs from **`npm run build-index`** / CI). If that index is missing, stale, or wrong—but still “matches” the app’s checks—you can fix behavior **only in this browser** using the header **Index** menu:

- **Prefer browser-built history index** — Skips the on-disk index and uses a client-built index in **`localStorage`** (keys prefixed with `dashboard-test-history-index-`), plus full scans where needed.
- **Refresh client index** — Clears those stored index keys and rebuilds the client index from the current `meta-info` executions (does **not** change files on the server).
- **Clear stored indexes** — Removes the client index blobs and refetches; use **Refresh** if History or By Test Case still looks empty.

**UI behavior:** The **Prefer browser-built** option appears when on-disk indexes can apply: **HTTP(S)**, or after you use **Select folder** (even with a `file://` page). Before any folder is loaded on `file://`, only **Refresh** / **Clear** apply to any existing **`localStorage`** cache. When the checkbox is shown, **Refresh** and **Clear** stay disabled until it is on **and** a browser index exists—open **History** or **By Test Case** once to create it, or hover the disabled buttons for a short hint.

Theme and the checkbox preference themselves are not removed by **Clear stored indexes** (only the history index cache).

---

## 5. Static HTML hosting (S3, GitHub Pages, etc.)

Use this when you want **read-only** published reports without running Node in production.

**Walkthroughs** (companion **`qaf-demos`** repo): GitHub Pages + Actions example, S3 sync script, and a real **Playwright** project with the QAF reporter. Clone **`qaf-demos`** and open `github-pages/`, `s3/`, or `playwright-project/`.

### 5.1 What to publish

Deploy the **dashboard root** as the **website root** (the folder that contains):

- `index.html`
- `css/`, `js/`, `assets/` (if present)
- **`test-results/`** (and optional **`prj-*/test-results/`**)
- **`projects.json`** (optional but needed for the Project dropdown)

Do **not** publish only `test-results/` unless you change paths; the app expects `index.html` and assets next to the data.

### 5.2 Build / sync before upload

1. Copy or generate your report trees under `test-results/` (and any `prj-*` folders).
2. Run on a machine with Node:

   ```bash
   npm run sync-meta:all:index
   ```

   Or at minimum `npm run sync-meta:all` then `npm run build-index` for the default tree. With **`projects.json`** and multiple projects, run **`npm run sync-meta:all:index`** (builds per-project indexes and a **merged** site-root index for **`?prj=__all__`**) or **`npm run build-workspace-index`** from the repo root after per-tree indexes exist.

3. Upload the **entire** static tree to your host.

Pre-building **`test-history-index`** (and **`test-history-index/tests-index*.json`**) makes **History**, **By Test Case**, **Charts**, and **Cycle** fast on static hosts and with the folder picker. Without a matching on-disk index, the app may scan executions in the browser only up to a **bounded report count**; beyond that, ship a pre-built index from CI.

**Merged workspace layout (multi-project):** Site root **`test-history-index.json`** lists every execution **`dir`** after the same merge rules as the UI (e.g. `prj-1/test-results/samples/.../json`). Optional shards: **`test-history-index/tests-index-manifest.json`** plus **`tests-index-000.json`**, … Large catalogs use **composite keys** (`projectId` + `testID` + `classPath`) so rows do not collide across projects.

### 5.3 Amazon S3 (static website hosting)

1. Create a bucket; enable **Static website hosting** (index document: `index.html`).
2. Upload the dashboard root contents (preserve structure).
3. Set **Block public access** off *or* use CloudFront with OAI/OAC as your policy requires.
4. Typical **MIME types**: `.html`, `.css`, `.js`, `.json`, images — S3 default object metadata is usually sufficient.
5. Open the website endpoint URL; use **`?prj=`** as needed.

**CORS:** Not required for same-bucket fetches (same origin). If you split assets across origins, configure CORS on the bucket that serves JSON.

### 5.4 GitHub Pages

**User or org site** (`username.github.io`): put files in the published branch so **`index.html`** is at the site root.

**Project site** (`username.github.io/repo-name/`):

- Publish the dashboard so the app root matches the Pages path (e.g. `https://username.github.io/repo-name/` loads `repo-name/index.html`).
- Relative URLs (`./test-results/...`) resolve under that path automatically if `index.html` is served from `/repo-name/`.
- If your build outputs to `docs/`, copy the full dashboard (including `test-results`) into **`docs/`** or configure **Pages “folder”** to match where `index.html` lives.

**GitHub Actions:** After tests, copy artifacts into `test-results/`, run `sync-meta:all:index`, deploy the folder with something like **peaceiris/actions-gh-pages** or **actions/upload-pages-artifact**.

### 5.5 Limitations on static hosts

| Feature | Static host |
|--------|-------------|
| View reports | Yes |
| `?prj=` / `projects.json` | Yes |
| Folder picker (`file://` still works locally) | N/A when only using HTTPS |
| **`POST /api/upload`** | **No** — use CI to push files or rebuild site |
| **`/api/config`** | **No** |
| Server-built history index on first request | **No** — run `build-index` / `sync-meta:index` before deploy |

### 5.6 Scale, retention, hosting checklist, and QA

**SLO (targets with pre-built index + capped executions):** plan for about **3–5 s** typical and **≤10 s** worst case on broadband for a **cold load** of the full dashboard (shell + first execution + primary tabs), once **`meta-info`**, **`test-history-index`**, and **`tests-index`** shards are versioned or cache-busted appropriately.

**Retention:** Keep **`meta-info.json`** tractable — cap executions per project (e.g. **`maxExecutions`** / `dashboard-config.json` on the server, or CI pruning). **Merged `reportDirs`** size scales with **retention × project count**; very large orgs may need **per-project** navigation (`?prj=slug`) or publishing **sharded** indexes only.

| Mode | Data access | Artifacts at site root | Cache / notes |
|------|--------------|-------------------------|---------------|
| **GitHub Pages** | `fetch` | `projects.json`, `test-history-index.json`, `test-history-index/*` | Prefer short TTL or hashed paths for JSON that changes each publish; long-cache hashed static assets |
| **S3 (+ CDN)** | `fetch` | Same tree as Pages | Enable **gzip/brotli** at the edge; same cache split as above |
| **Local folder (File API)** | File handles | Identical relative paths under the picked **dashboard** root | No CORS; bounded concurrency; **pick the folder that contains `projects.json`**, not a single `test-results` folder, for **`?prj=__all__`** parity |
| **HTTP server (`qaf-serve`, nginx)** | `fetch` | Same static layout | Optional upload API; index build on ingest |

**QA matrix (manual):** Validate **cold load** with **`?prj=__all__`** and a single project; exercise **By Suite**, **By Test Case**, **Charts**, and **Cycle** on **GitHub Pages-style paths**, **S3**, and **folder picker**; optionally throttle to Fast 3G. Use **`performance.measure`** from marks **`qaf-overview-shell`** → **`qaf-first-exec-loaded`** in devtools when tuning.

**UI budget:** Views that materialize **very large row sets** (on the order of **50k–100k+** rows in one table) may need **virtualization** or a **paginated catalog** in a future iteration; Cycle / testcase grids already use **pagination** to protect the main thread.

---

## 6. Reporting server

`npm start` runs **`scripts/server.js`**, which:

1. Serves static files from the **repository root** (HTML, JS, CSS, JSON under `test-results/`, etc.).
2. Optionally builds **`test-results/test-history-index.json`** (and shards) when that manifest is requested and missing/stale (default tree); see server code for per-path behavior.
3. Exposes HTTP APIs below.

Default listen: **port 2612** (`node scripts/server.js 8080` to override).

### 6.1 Upload API — QAF archives and external reports

**QAF tree:** merge a **`.zip`**, **`.tgz`**, or **`.tar`** that contains **`test-results/`** (same as copying a pre-built dashboard tree).

**JUnit, Playwright, Cucumber:** upload a zip/tar that contains the report file, a **raw `.xml` / `.json` file**, or use **`?import=`** (or JSON field **`import`**) with the same values as **`qaf-import`**: **`qaf`**, **`junit`**, **`playreport`**, **`cucumber`**, **`auto`**. Optional query/body fields: **`executionName`**, **`entry`** (path inside the archive when there are multiple reports).

Examples:

```bash
# Default: QAF zip, or auto-detect external report when there is no test-results/ in the archive
curl -X POST --data-binary @archive.zip \
  -H "Content-Type: application/octet-stream" \
  http://localhost:2612/api/upload

curl -X POST --data-binary @junit-report.xml \
  -H "Content-Type: application/octet-stream" \
  "http://localhost:2612/api/upload?import=junit"

curl -X POST --data-binary @playwright-report.json \
  -H "Content-Type: application/octet-stream" \
  "http://localhost:2612/api/upload?import=playreport"
```

Multipart form with field **`file`** is supported; you can add form fields **`import`**, **`executionName`**, **`entry`**. JSON body upload (used by the dashboard UI) may include **`zip`** (base64), **`import`**, and those options. **`GET /api/health`** lists **`importFormats`** and whether **`archiveExtract`** is available. After upload, run **`npm run sync-meta:all`** if you use multi-project layouts and need `projects.json` or execution roots normalized.

**Playwright** uploads require package **`qaf-report-playwright`** installed alongside **`qaf-report-core`** (same as CLI `qaf-import playreport`).

### 6.2 Config API

Stored in **`test-results/dashboard-config.json`**:

```bash
curl http://localhost:2612/api/config
curl -X POST -H "Content-Type: application/json" \
  -d '{"maxExecutions":5,"maxHistory":10,"allowDeleteOldExecutions":false}' \
  http://localhost:2612/api/config
```

- **`maxExecutions`**: cap on entries in root `meta-info` (pruning behavior ties to server merge logic).
- **`maxHistory`**: entries per test in the history index.
- **`allowDeleteOldExecutions`**: whether pruned executions are deleted from disk.

### 6.3 When to use the server vs static

| Scenario | Suggestion |
|--------|------------|
| Developers browsing local reports | `npm start` or static + `sync-meta` |
| CI publishes a zip to a shared drive | Upload via server or extract in pipeline |
| Public read-only report site | Build static bundle + **S3 / GitHub Pages** |
| Need upload UI from browser | **Server** (or `npm run serve`) |

### 6.4 Retention — delete old executions on disk

`scripts/cleanup-old-executions.js` removes **execution folders** (the tree that contains `json/meta-info.json`) whose **start time** is older than **N days** (default **30**). It uses each report’s `startTime`, or reads `startTime` from the child `json/meta-info.json` if missing. Entries with **no usable timestamp are not deleted**.

After deletions it runs **`sync-projects-meta.js`** (executions-only) so root `meta-info.json` and project mirrors match the filesystem.

```bash
npm run cleanup-old-executions              # default 30 days, then sync-meta
npm run cleanup-old-executions:index        # same + rebuild history index via sync-meta --build-index
node scripts/cleanup-old-executions.js 14
node scripts/cleanup-old-executions.js --days=60 --dry-run
```

Use **`--dry-run`** to list what would be removed without deleting or syncing.

---

## 7. npm scripts reference

| Script | Purpose |
|--------|---------|
| `npm start` | Reporting server (`scripts/server.js`) |
| `npm run serve` | Static `serve` + upload API proxy |
| `npm run build-index` | `test-history-index` for `./test-results` |
| `npm run build-workspace-index` | Merged site-root index for `?prj=__all__` (`projects.json` + each `*/test-results`) |
| `npm run seed-samples` | Replace with generic multi-project samples |
| `npm run sync-meta` | Sync execution `meta-info` from disk only |
| `npm run sync-meta:projects` | `projects.json` + orphan mirrors only |
| `npm run sync-meta:all` | Projects + executions |
| `npm run sync-meta:index` | Executions + index (default tree per script; see package.json) |
| `npm run sync-meta:all:index` | Projects + executions + `--build-index` |
| `npm run cleanup-old-executions` | Delete executions older than 30 days, then `sync-meta` |
| `npm run cleanup-old-executions:index` | Same + `--build-index` on sync step |

---

## 8. Troubleshooting

| Issue | Things to check |
|-------|----------------|
| Blank or “project not found” | `?prj=` id matches a folder with `{id}/test-results/meta-info.json`; run **`npm run sync-meta:all`**. |
| History tab very slow | Run **`npm run build-index`** (and per-project paths if needed) before static deploy. |
| Upload fails | Use **`npm start`** or **`npm run serve`**, not plain static hosting. |
| `file://` CORS / fetch errors | Use **Select folder** or serve over **http://**. |
| Wrong paths on GitHub Pages | Ensure **site root** is where `index.html` lives; see [§5.4](#54-github-pages). |
| Stale execution list | **`npm run sync-meta`** or **`sync-meta:all`** after adding/removing run folders. |
| History / By Test Case wrong over HTTP | Server **`test-history-index`** out of date: run **`npm run build-index`** (or **`sync-meta:index`**) on the server tree; or use header **Index** → prefer browser-built / refresh (see [§4.6](#46-index-tools-browser-storage)). |

---

## 9. Related documentation

- **[README](../README.md)** — Features, data layout, Playwright package pointer, index file layout.
- **`packages/qaf-report-playwright/README.md`** — Generating QAF-shaped trees from Playwright.
