/**
 * @author Chirag Jayswal, QAF team
 * Data loader for test results JSON.
 * Supports File System Access API (Chrome/Edge) and fetch (when served).
 */
const DataLoader = (function () {
  /** URL/project-switcher value: merge every entry from projects.json (HTTP only). */
  const ALL_PROJECTS_SLUG = '__all__';

  let rootHandle = null;
  /** Path from site root to the active test-results folder (contains meta-info.json). E.g. test-results, prj-1/test-results */
  let contentMount = 'test-results';
  /** True when user picked the dashboard folder and data lives under test-results/ or {project}/test-results/ */
  let fileApiFromDashboardRoot = false;
  /** True when user picked a single test-results folder (meta-info.json at handle root) */
  let fileApiInnerPick = false;
  let useFileApi = false;
  let projectSlug = '';
  /** Non-null = merged view for several projects from projects.json (comma-separated `prj` URL). */
  let projectSubset = null;
  const cache = new Map();
  /** Promise for optional metadata_formats.json (picked folder root or HTTP page URL). */
  let metadataFormatsPromise = undefined;

  function sanitizeProjectSlug(raw) {
    if (raw == null || raw === '') return '';
    const s = String(raw);
    if (s.toLowerCase() === ALL_PROJECTS_SLUG || s === ALL_PROJECTS_SLUG) return ALL_PROJECTS_SLUG;
    if (s.toLowerCase() === 'default') return '';
    return s.replace(/[^a-zA-Z0-9._-]/g, '');
  }

  function isAllProjectsMode() {
    return projectSlug === ALL_PROJECTS_SLUG;
  }

  function isSubsetProjectsMode() {
    return Array.isArray(projectSubset) && projectSubset.length > 0;
  }

  function getProjectSubset() {
    return projectSubset ? projectSubset.slice() : [];
  }

  /** True when reports may include multiple projectId values (merged roots). */
  function isMultiProjectView() {
    return isAllProjectsMode() || isSubsetProjectsMode();
  }

  /**
   * Value for `prj` query: __all__, comma-separated ids, or single id.
   */
  function getProjectSlugForUrl() {
    if (isAllProjectsMode()) return ALL_PROJECTS_SLUG;
    if (isSubsetProjectsMode()) return projectSubset.join(',');
    return projectSlug;
  }

  /**
   * Active project id for URL/UI ('' = default test-results at site root).
   */
  function getProjectSlug() {
    return projectSlug;
  }

  /**
   * Mount path for the current project (always ends with test-results).
   */
  function getContentMount() {
    return contentMount;
  }

  function canSwitchProject() {
    return !useFileApi || fileApiFromDashboardRoot;
  }

  /**
   * Switch dataset root (e.g. prj=prj-1 → prj-1/test-results).
   * Use comma-separated ids for a subset of projects (still uses projects.json merge).
   */
  function setProjectSlug(rawSlug) {
    const raw = rawSlug == null ? '' : String(rawSlug).trim();
    projectSubset = null;
    if (!raw) {
      projectSlug = '';
      contentMount = 'test-results';
      cache.clear();
      return;
    }
    if (raw.toLowerCase() === ALL_PROJECTS_SLUG || raw === ALL_PROJECTS_SLUG) {
      projectSlug = ALL_PROJECTS_SLUG;
      contentMount = 'test-results';
      cache.clear();
      return;
    }
    if (raw.includes(',')) {
      const parts = raw
        .split(',')
        .map((x) => sanitizeProjectSlug(String(x).trim()))
        .filter(Boolean);
      const uniq = [...new Set(parts)].sort((a, b) => a.localeCompare(b));
      if (uniq.length === 0) {
        projectSlug = '';
        contentMount = 'test-results';
      } else if (uniq.length === 1) {
        projectSlug = uniq[0];
        contentMount = projectSlug ? `${projectSlug}/test-results` : 'test-results';
      } else {
        projectSlug = '';
        projectSubset = uniq;
        contentMount = 'test-results';
      }
      cache.clear();
      return;
    }
    projectSlug = sanitizeProjectSlug(raw);
    if (projectSlug === ALL_PROJECTS_SLUG) {
      contentMount = 'test-results';
    } else {
      contentMount = projectSlug ? `${projectSlug}/test-results` : 'test-results';
    }
    cache.clear();
  }

  function getProjectSlugFromSearch() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return '';
    try {
      const p = new URLSearchParams(window.location.search).get('prj');
      if (p == null || String(p).trim() === '') return '';
      const t = String(p).trim();
      if (t.toLowerCase() === ALL_PROJECTS_SLUG || t === ALL_PROJECTS_SLUG) return ALL_PROJECTS_SLUG;
      if (t.includes(',')) {
        const parts = t.split(',').map((x) => sanitizeProjectSlug(String(x).trim())).filter(Boolean);
        return parts.length ? parts.sort((a, b) => a.localeCompare(b)).join(',') : '';
      }
      return sanitizeProjectSlug(t);
    } catch (e) {
      return '';
    }
  }

  async function loadRootMetaFromFileApi() {
    if (fileApiInnerPick) {
      const text = await getFileContent('meta-info.json');
      return JSON.parse(text);
    }
    const primary = `${contentMount}/meta-info.json`;
    try {
      const text = await getFileContent(primary);
      return JSON.parse(text);
    } catch (e) {
      if (!projectSlug || !isMissingPathFsError(e)) throw e;
      const text = await getFileContent(`${projectSlug}/meta-info.json`);
      return JSON.parse(text);
    }
  }

  /** File System Access API NotFoundError and similar. */
  function isMissingPathFsError(e) {
    if (!e) return false;
    if (e.name === 'NotFoundError') return true;
    const msg = String(e.message || e);
    return /could not be found at the time/i.test(msg) || /NotFoundError/i.test(msg);
  }

  function cacheKey(...parts) {
    return parts.filter(Boolean).join('/');
  }

  async function fetchWithRetry(url, retries = 2) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) return res;
        if (res.status === 404) {
          const err = new Error('404');
          err.status = 404;
          throw err;
        }
        throw new Error(res.status + '');
      } catch (e) {
        lastErr = e;
        if (e && e.status === 404) throw e;
        if (i < retries) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
    throw lastErr;
  }

  /**
   * Run async work with bounded concurrency (for batching many index fetches).
   */
  async function mapPool(items, limit, fn) {
    if (!items.length) return [];
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (true) {
        const i = next++;
        if (i >= items.length) break;
        results[i] = await fn(items[i], i);
      }
    }
    const n = Math.min(Math.max(1, limit), items.length);
    await Promise.all(Array.from({ length: n }, () => worker()));
    return results;
  }

  async function getFileContent(path) {
    const key = cacheKey(path);
    if (cache.has(key)) return cache.get(key);

    let content = null;
    if (useFileApi && rootHandle) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length === 0) throw new Error('Empty path');
      let current = rootHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i]);
      }
      const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
      const file = await fileHandle.getFile();
      content = await file.text();
    } else {
      const url = path.startsWith('/') ? path : `./${path}`;
      const res = await fetchWithRetry(url);
      content = await res.text();
    }

    cache.set(key, content);
    return content;
  }

  /**
   * Get a blob URL for a file (for images/screenshots).
   * File API: reads file and returns URL.createObjectURL(blob).
   * Fetch: returns path suitable for img src (relative to page).
   */
  async function getFileBlobUrl(path) {
    if (!path || !path.trim()) return null;
    if (useFileApi && rootHandle) {
      try {
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 0) return null;
        let current = rootHandle;
        for (let i = 0; i < parts.length - 1; i++) {
          current = await current.getDirectoryHandle(parts[i]);
        }
        const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
        const file = await fileHandle.getFile();
        return URL.createObjectURL(file);
      } catch (e) {
        return null;
      }
    }
    const prefix = path.startsWith('/') ? '' : './';
    return prefix + path;
  }

  async function getJson(path) {
    const text = await getFileContent(path);
    return JSON.parse(text);
  }

  /**
   * Optional metadata_formats.json for testcase detail display templates.
   * - HTTP: same directory as the dashboard page (fetch).
   * - File folder pick: root of the chosen directory (alongside test-results/), not inside the UI package path.
   */
  async function loadMetadataFormats() {
    if (metadataFormatsPromise !== undefined) return metadataFormatsPromise;
    metadataFormatsPromise = (async () => {
      if (useFileApi && rootHandle) {
        try {
          const fh = await rootHandle.getFileHandle('metadata_formats.json');
          const file = await fh.getFile();
          const text = await file.text();
          const obj = JSON.parse(text);
          return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
        } catch (e) {
          return null;
        }
      }
      try {
        const res = await fetch(new URL('metadata_formats.json', window.location.href), {
          cache: 'force-cache'
        });
        if (!res.ok) return null;
        const obj = await res.json();
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
      } catch (e) {
        return null;
      }
    })();
    return metadataFormatsPromise;
  }

  /**
   * Initialize with File System Access API - user selects folder
   * @returns {Object} Root meta-info or null
   */
  async function initWithFileApi() {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API not supported. Use Chrome or Edge, or serve via http.');
    }
    rootHandle = await window.showDirectoryPicker();
    useFileApi = true;
    fileApiFromDashboardRoot = false;
    fileApiInnerPick = false;
    projectSlug = '';
    contentMount = 'test-results';
    metadataFormatsPromise = undefined;

    try {
      await rootHandle.getDirectoryHandle('test-results');
      fileApiFromDashboardRoot = true;
    } catch (e) {
      try {
        await rootHandle.getFileHandle('meta-info.json');
        fileApiInnerPick = true;
      } catch (e2) {
        throw new Error('Could not find meta-info.json. Select the dashboard folder (containing test-results).');
      }
    }

    cache.clear();
    setProjectSlug(getProjectSlugFromSearch());
    if (fileApiInnerPick && projectSlug) {
      setProjectSlug('');
    }
    if (isAllProjectsMode()) {
      setProjectSlug('');
    }

    const slugBeforeLoad = getProjectSlug();
    try {
      return await getRootMetaInfo();
    } catch (e) {
      if (slugBeforeLoad && isMissingPathFsError(e)) {
        cache.clear();
        setProjectSlug('');
        return await getRootMetaInfo();
      }
      throw e;
    }
  }

  /**
   * Resolve reports[].dir to a path usable for fetch / File API.
   * Canonical QAF shape: test-results/samples/.../json (same for default and ?prj= trees).
   * With ?prj=slug, that becomes slug/test-results/samples/... on disk and in URLs.
   * Legacy: dirs may still be slug/test-results/... from repo root — returned as-is.
   */
  function resolveExecPath(execDir) {
    if (!execDir) return execDir;
    const norm = String(execDir).replace(/\\/g, '/');
    if (isAllProjectsMode() || isSubsetProjectsMode()) {
      return norm;
    }
    if (!useFileApi) {
      if (projectSlug && norm.startsWith('test-results/')) {
        return `${projectSlug}/${norm}`;
      }
      return norm;
    }
    if (fileApiInnerPick) {
      const mountPrefix = contentMount.replace(/\/$/, '') + '/';
      if (norm.startsWith(mountPrefix)) return norm.slice(mountPrefix.length);
      if (norm.startsWith('test-results/')) return norm.replace(/^test-results\/?/, '');
      return norm;
    }
    if (fileApiFromDashboardRoot && projectSlug && norm.startsWith('test-results/')) {
      return `${projectSlug}/${norm}`;
    }
    return norm;
  }

  /**
   * Initialize with fetch - load from relative paths (works when served)
   */
  async function initWithFetch() {
    useFileApi = false;
    rootHandle = null;
    fileApiFromDashboardRoot = false;
    fileApiInnerPick = false;
    metadataFormatsPromise = undefined;
    cache.clear();
    setProjectSlug(getProjectSlugFromSearch());
    return getRootMetaInfo();
  }

  async function fetchProjectsManifestJson() {
    const res = await fetch('./projects.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('projects.json HTTP ' + res.status);
    return res.json();
  }

  async function loadProjectsJsonList() {
    if (useFileApi && rootHandle) {
      try {
        const text = await getFileContent('projects.json');
        return JSON.parse(text).projects || [];
      } catch (e) {
        throw new Error(`Multi-project mode needs projects.json at the site root. (${e.message || e})`);
      }
    }
    try {
      const data = await fetchProjectsManifestJson();
      return data.projects || [];
    } catch (e) {
      throw new Error(`Multi-project mode needs projects.json at the site root. (${e.message || e})`);
    }
  }

  /**
   * Merge meta-info from a list of manifest project entries (same shape as projects.json `projects` items).
   */
  async function mergeMetaFromManifestProjects(list) {
    const merged = { reports: [] };
    const labelById = new Map();
    for (const p of list) {
      const id = p.id != null && String(p.id).trim() !== '' ? String(p.id).trim() : '';
      labelById.set(id, p.label || id || 'Default');
    }

    const rows = await Promise.all(
      list.map(async (p) => {
        const id = p.id != null && String(p.id).trim() !== '' ? String(p.id).trim() : '';
        const mount = id ? `${id}/test-results` : 'test-results';
        let meta;
        if (useFileApi && rootHandle) {
          try {
            const text = await getFileContent(`${mount}/meta-info.json`);
            meta = JSON.parse(text);
          } catch (e) {
            if (!id) return null;
            try {
              const text = await getFileContent(`${id}/meta-info.json`);
              meta = JSON.parse(text);
            } catch (e2) {
              return null;
            }
          }
        } else {
          try {
            let res = await fetch(`./${mount}/meta-info.json`, { cache: 'no-store' });
            if (res.status === 404 && id) {
              res = await fetch(`./${id}/meta-info.json`, { cache: 'no-store' });
            }
            if (!res.ok) return null;
            meta = await res.json();
          } catch (e) {
            return null;
          }
        }
        if (!meta?.reports?.length) return null;
        return { id, meta };
      })
    );

    for (const row of rows) {
      if (!row) continue;
      const id = row.id;
      const label = labelById.get(id) ?? (id || 'Default');
      const reps = row.meta.reports || [];
      for (const r of reps) {
        const rawDir = r.dir || '';
        const dir =
          id && rawDir.startsWith('test-results/')
            ? `${id}/${rawDir}`
            : rawDir;
        merged.reports.push({
          ...r,
          dir,
          projectId: id,
          projectLabel: label,
          name: id ? `${label}: ${r.name || ''}`.trim() : (r.name || '')
        });
      }
    }
    merged.reports.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    if (merged.reports.length === 0) {
      throw new Error(
        'No executions found for the selected project(s). Check that each has test-results/meta-info.json.'
      );
    }
    return merged;
  }

  async function getRootMetaInfoAllProjects() {
    const list = await loadProjectsJsonList();
    if (list.length < 2) {
      setProjectSlug('');
      return getRootMetaInfo();
    }
    return mergeMetaFromManifestProjects(list);
  }

  async function getRootMetaInfoSubset(ids) {
    const list = await loadProjectsJsonList();
    const allowed = new Set((ids || []).map((x) => String(x)));
    const filtered = list.filter((p) => {
      const id = p.id != null && String(p.id).trim() !== '' ? String(p.id).trim() : '';
      return allowed.has(id);
    });
    if (filtered.length === 0) {
      throw new Error('No projects from your selection appear in projects.json.');
    }
    const found = new Set(
      filtered.map((p) => (p.id != null && String(p.id).trim() !== '' ? String(p.id).trim() : ''))
    );
    const missing = [...allowed].filter((id) => !found.has(id));
    if (missing.length) {
      throw new Error(`Unknown project id(s): ${missing.join(', ')}`);
    }
    return mergeMetaFromManifestProjects(filtered);
  }

  /**
   * Load root meta-info.json (fetch or File API). Throws a clear message if missing or invalid.
   */
  async function getRootMetaInfo() {
    if (isAllProjectsMode()) {
      return await getRootMetaInfoAllProjects();
    }
    if (isSubsetProjectsMode()) {
      return await getRootMetaInfoSubset(projectSubset);
    }
    if (useFileApi) {
      try {
        return await loadRootMetaFromFileApi();
      } catch (e) {
        const msg = e?.message || String(e);
        if (projectSlug) {
          throw new Error(
            `Could not open project "${projectSlug}": ${msg} Ensure "${contentMount}/meta-info.json" exists inside the folder you selected.`
          );
        }
        throw e;
      }
    }
    const primaryRel = `${contentMount}/meta-info.json`;
    const fallbackRel = projectSlug ? `${projectSlug}/meta-info.json` : '';
    const tryPaths = fallbackRel && fallbackRel !== primaryRel ? [primaryRel, fallbackRel] : [primaryRel];

    let res;
    let loadedFrom = primaryRel;
    for (let i = 0; i < tryPaths.length; i++) {
      const relPath = tryPaths[i];
      const url = relPath.startsWith('/') ? relPath : `./${relPath}`;
      loadedFrom = relPath;
      try {
        res = await fetch(url, { cache: 'no-store' });
      } catch (e) {
        throw new Error(`Network error loading ${relPath}: ${e.message || e}`);
      }
      if (res.ok) {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          if (text.trim().startsWith('<')) {
            throw new Error(`${relPath} returned HTML instead of JSON. Check the URL and server path.`);
          }
          throw new Error(`${relPath} is not valid JSON.`);
        }
      }
      if (res.status !== 404 || i === tryPaths.length - 1) {
        if (res.status === 404) {
          const loc = projectSlug
            ? `${projectSlug}/test-results/meta-info.json or ${projectSlug}/meta-info.json`
            : `${primaryRel}`;
          const hint = projectSlug
            ? `Add ${loc} next to the dashboard (or run npm run sync-meta), or open the default project.`
            : `Add test-results/meta-info.json or run npm run seed-samples.`;
          throw new Error(`Project not found: no ${tryPaths.join(' or ')} (${hint})`);
        }
        throw new Error(`Could not load ${loadedFrom} (HTTP ${res.status}).`);
      }
    }
  }

  /**
   * Load execution meta-info
   * @param {string} execDir - from reports[].dir, e.g. "test-results/samples/exec_march_24/json"
   */
  async function loadExecutionMetaInfo(execDir) {
    const base = resolveExecPath(execDir);
    return getJson(`${base}/meta-info.json`);
  }

  /**
   * Load testset overview
   * @param {string} execDir - execution dir
   * @param {string} testsetPath - from tests[], e.g. "chromium" or "smoke_suite"
   */
  async function loadTestsetOverview(execDir, testsetPath) {
    const base = resolveExecPath(execDir);
    return getJson(`${base}/${testsetPath}/overview.json`);
  }

  /**
   * Load class meta-info
   * @param {string} execDir
   * @param {string} testsetPath
   * @param {string} classPath - from classes[], e.g. "ui/checkout.spec.ts"
   */
  async function loadClassMetaInfo(execDir, testsetPath, classPath) {
    const base = resolveExecPath(execDir);
    return getJson(`${base}/${testsetPath}/${classPath}/meta-info.json`);
  }

  /**
   * Load result file (seleniumLog, checkPoints) for a method.
   * resultFileName from metaData is relative to the class meta-info.json directory
   * (same folder as meta-info.json).
   * @returns {Promise<{data:object|null, attemptedDir?:string}>}
   */
  async function loadResultFile(execDir, testsetPath, classPath, resultFileName) {
    if (!resultFileName) return { data: null };

    const base = resolveExecPath(execDir);
    const classDir = `${base}/${testsetPath}/${classPath}`.replace(/\/+/g, '/');
    const slug = String(resultFileName).replace(/\.json$/i, '');
    const baseName = slug.replace(/\d+$/, '');
    const toTry = [`${slug}.json`, `${resultFileName}.json`, `${baseName}.json`];
    for (let i = 0; i < 12; i++) {
      toTry.push(`${baseName}${i}.json`);
    }

    const hasContent = (d) =>
      (d?.seleniumLog?.length > 0) ||
      (d?.checkPoints?.length > 0) ||
      (d?.checkpoints?.length > 0) ||
      (d?.errorTrace && String(d.errorTrace).trim()) ||
      (d?.errorMessage && String(d.errorMessage).trim());
    for (const fname of [...new Set(toTry)]) {
      try {
        const p = `${classDir}/${fname}`.replace(/\/+/g, '/');
        const data = await getJson(p);
        if (hasContent(data)) return { data };
      } catch (e) {
        continue;
      }
    }
    return { data: null, attemptedDir: classDir };
  }

  const INDEX_KEY_PREFIX = 'dashboard-test-history-index-';
  /** When set, skip server test-history-index and use browser-built localStorage index + scans. */
  const PREFER_CLIENT_HISTORY_KEY = 'dashboard-prefer-client-history-index';
  const MAX_HISTORY = 10;
  /** Above this, do not run client full-tree index scans; rely on prebuilt test-history-index. */
  const MAX_CLIENT_SCAN_REPORTS = 120;

  function getPreferClientHistoryIndex() {
    try {
      return localStorage.getItem(PREFER_CLIENT_HISTORY_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setPreferClientHistoryIndex(prefer) {
    try {
      if (prefer) localStorage.setItem(PREFER_CLIENT_HISTORY_KEY, '1');
      else localStorage.removeItem(PREFER_CLIENT_HISTORY_KEY);
    } catch (e) {}
  }

  /** Remove all client-side test history index blobs (not theme or preferences). */
  function clearClientHistoryIndexStorage() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(INDEX_KEY_PREFIX)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
  }

  /** True if any client history index blob exists in localStorage. */
  function hasClientHistoryIndexStorage() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(INDEX_KEY_PREFIX)) return true;
      }
    } catch (e) {}
    return false;
  }

  async function rebuildClientHistoryIndex(reports) {
    cache.clear();
    clearClientHistoryIndexStorage();
    if (!reports?.length) return null;
    const index = await buildFullIndex(reports);
    saveIndex(reports, index);
    return index;
  }

  function getTestIdFromMethod(method) {
    if (typeof ReportMetaHelpers !== 'undefined' && ReportMetaHelpers.getTestIdFromMeta) {
      return ReportMetaHelpers.getTestIdFromMeta(method?.metaData);
    }
    if (typeof Utils !== 'undefined' && Utils.getTestId) return Utils.getTestId(method?.metaData);
    const m = method?.metaData;
    if (m?.testID != null && String(m.testID).trim() !== '') return String(m.testID).trim();
    if (m?.name != null && String(m.name).trim() !== '') return String(m.name).trim();
    return null;
  }

  function getModuleForMethod(method, classPath) {
    if (typeof ReportMetaHelpers !== 'undefined' && ReportMetaHelpers.getModuleFromMethod) {
      return ReportMetaHelpers.getModuleFromMethod(method, classPath);
    }
    if (typeof Utils === 'undefined' || !Utils.getModule) return null;
    return Utils.getModule({ metaData: method?.metaData, classPath, testsetPath: method?.testsetPath });
  }

  function minimalEntry(report, method, testsetPath, classPath) {
    const tid = getTestIdFromMethod(method);
    if (!tid) return null;
    const moduleName = method.metaData?.module ?? getModuleForMethod(method, classPath);
    const metaData = { testID: tid, resultFileName: method.metaData?.resultFileName };
    if (method.metaData?.name) metaData.name = method.metaData.name;
    if (moduleName && moduleName !== '-') metaData.module = moduleName;
    return {
      report: { name: report.name, dir: report.dir, startTime: report.startTime },
      method: {
        result: method.result,
        duration: method.duration,
        startTime: method.startTime,
        metaData
      },
      testsetPath
    };
  }

  function indexBase() {
    if (isAllProjectsMode() || isSubsetProjectsMode()) return 'test-history-index';
    if (useFileApi && fileApiInnerPick) return 'test-history-index';
    return `${contentMount}/test-history-index`;
  }

  function storageKey(projectId, testID, classPath) {
    const p = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : '';
    const tk = testKey(testID, classPath);
    return p ? `${p}\0${tk}` : tk;
  }

  function parseStorageKey(sk) {
    const parts = String(sk).split('\0');
    if (parts.length >= 3) {
      return { projectId: parts[0] || '', testID: parts[1], classPath: parts.slice(2).join('\0') };
    }
    if (parts.length === 2) {
      return { projectId: '', testID: parts[0], classPath: parts[1] };
    }
    return { projectId: '', testID: sk, classPath: '' };
  }

  function catalogIndexKey(projectId, testID, classPath) {
    const p = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : '';
    return `${p}\x1e${testID}\x1e${classPath}`;
  }

  function parseCatalogIndexKey(rawKey, info) {
    const s = String(rawKey);
    if (s.indexOf('\x1e') >= 0) {
      const parts = s.split('\x1e');
      const pid = parts[0] || '';
      const tid = parts[1] || '';
      const cp = parts.slice(2).join('\x1e');
      return { projectId: pid, testID: tid, classPath: cp };
    }
    const ip = info?.projectId != null && String(info.projectId).trim() !== '' ? String(info.projectId).trim() : '';
    return {
      projectId: ip,
      testID: s,
      classPath: info?.classPath != null ? String(info.classPath) : ''
    };
  }

  async function loadMergedTestsIndex() {
    const base = indexBase();
    try {
      const manifest = await getJson(`${base}/tests-index-manifest.json`);
      if (manifest && manifest.format === 'tests-index-shards' && Array.isArray(manifest.chunks)) {
        const parts = await Promise.all(
          manifest.chunks.map((c) => getJson(`${base}/${c}`).catch(() => null))
        );
        const merged = {};
        for (const p of parts) {
          if (p && typeof p === 'object') Object.assign(merged, p);
        }
        if (Object.keys(merged).length) return merged;
      }
    } catch (e) {}
    try {
      return await getJson(`${base}/tests-index.json`);
    } catch (e) {
      return null;
    }
  }

  function hashTestKey(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  async function loadServerManifest() {
    const p = isAllProjectsMode() || isSubsetProjectsMode()
      ? 'test-history-index.json'
      : useFileApi && fileApiInnerPick
        ? 'test-history-index.json'
        : `${contentMount}/test-history-index.json`;
    try {
      const data = await getJson(p);
      if (data && typeof data === 'object' && Array.isArray(data.reportDirs)) return data;
    } catch (e) {}
    return null;
  }

  async function loadServerIndexLegacy() {
    const manifest = await loadServerManifest();
    if (!manifest || !manifest.reportDirs || !manifest.tests) return null;
    return manifest;
  }

  async function loadServerTestHistory(testID, classPath, projectId) {
    const sk = storageKey(projectId, testID, classPath);
    const hash = hashTestKey(sk);
    const p = `${indexBase()}/${hash}.json`;
    try {
      const data = await getJson(p);
      if (Array.isArray(data)) return data;
    } catch (e) {}
    return null;
  }

  async function loadServerIndex() {
    const legacy = await loadServerIndexLegacy();
    if (legacy) return legacy;
    const manifest = await loadServerManifest();
    if (!manifest || !manifest.reportDirs) return null;
    return { lastUpdated: manifest.lastUpdated, reportDirs: manifest.reportDirs, tests: {} };
  }

  function indexKey(reports) {
    const dirs = reports.map(r => r.dir).sort().join('\0');
    let h = 0;
    const salt =
      (isAllProjectsMode() ? ALL_PROJECTS_SLUG : isSubsetProjectsMode() ? 'subset:' + projectSubset.join(',') : contentMount) +
      '\0';
    for (let i = 0; i < salt.length; i++) h = ((h << 5) - h + salt.charCodeAt(i)) | 0;
    for (let i = 0; i < dirs.length; i++) h = ((h << 5) - h + dirs.charCodeAt(i)) | 0;
    return INDEX_KEY_PREFIX + (h >>> 0).toString(36);
  }

  function getIndex(reports) {
    try {
      const key = indexKey(reports);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveIndex(reports, index) {
    try {
      const key = indexKey(reports);
      const raw = JSON.stringify(index);
      if (raw.length > 4.5 * 1024 * 1024) return;
      localStorage.setItem(key, raw);
    } catch (e) {}
  }

  function testKey(testID, classPath) {
    return (testID || '') + '\0' + (classPath || '');
  }

  async function scanReportsForIndex(reports, execDirsToScan) {
    const byKey = new Map();
    for (const report of reports) {
      if (!execDirsToScan.has(report.dir)) continue;
      try {
        const execMeta = await loadExecutionMetaInfo(report.dir);
        const tests = execMeta?.tests || [];
        for (const testsetPath of tests) {
          try {
            const overview = await loadTestsetOverview(report.dir, testsetPath);
            const classes = overview?.classes || [];
            for (const classPath of classes) {
              try {
                const classMeta = await loadClassMetaInfo(report.dir, testsetPath, classPath);
                const methods = classMeta?.methods || [];
                for (const method of methods) {
                  const tid = getTestIdFromMethod(method);
                  if (!tid) continue;
                  const pid = report.projectId != null && String(report.projectId).trim() !== '' ? String(report.projectId).trim() : '';
                  const key = storageKey(pid, tid, classPath);
                  const entry = minimalEntry(report, method, testsetPath, classPath);
                  if (!entry) continue;
                  if (!byKey.has(key)) byKey.set(key, []);
                  byKey.get(key).push(entry);
                }
              } catch (e) {
                continue;
              }
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        continue;
      }
    }
    return byKey;
  }

  async function buildFullIndex(reports) {
    if (reports.length > MAX_CLIENT_SCAN_REPORTS) {
      try {
        console.warn(
          'QAF Dashboard: skipping full index scan for',
          reports.length,
          'executions — use a prebuilt test-history-index (CI) or prefer fewer reports in meta-info.'
        );
      } catch (e) {}
      return {
        lastUpdated: Math.max(...reports.map((r) => r.startTime || 0), 0),
        reportDirs: reports.map((r) => r.dir).sort(),
        tests: {}
      };
    }
    const execDirs = new Set(reports.map(r => r.dir));
    const byKey = await scanReportsForIndex(reports, execDirs);
    const tests = {};
    byKey.forEach((entries, key) => {
      tests[key] = entries
        .sort((a, b) => (b.method.startTime || 0) - (a.method.startTime || 0))
        .slice(0, MAX_HISTORY);
    });
    const lastUpdated = Math.max(...reports.map(r => r.startTime || 0), 0);
    return {
      lastUpdated,
      reportDirs: reports.map(r => r.dir).sort(),
      tests
    };
  }

  function mergeIndexEntries(existing, incoming) {
    const byDir = new Map();
    (existing || []).forEach(e => byDir.set(e.report.dir, e));
    (incoming || []).forEach(e => byDir.set(e.report.dir, e));
    return Array.from(byDir.values())
      .sort((a, b) => (b.method.startTime || 0) - (a.method.startTime || 0))
      .slice(0, MAX_HISTORY);
  }

  function indexMatchesReports(index, reports) {
    const current = new Set(reports.map(r => r.dir));
    const indexed = new Set(index.reportDirs || []);
    if (current.size !== indexed.size) return false;
    for (const d of current) if (!indexed.has(d)) return false;
    return true;
  }

  function isIndexStale(manifest, reports) {
    const last = manifest?.lastUpdated ?? 0;
    return reports.some(r => (r.startTime || 0) > last);
  }

  async function ensureIndexFresh(reports) {
    if (!getPreferClientHistoryIndex()) {
      const serverIndex = await loadServerIndex();
      if (serverIndex && indexMatchesReports(serverIndex, reports) && !isIndexStale(serverIndex, reports)) {
        return serverIndex;
      }
      if (
        reports.length > MAX_CLIENT_SCAN_REPORTS &&
        (!serverIndex || !indexMatchesReports(serverIndex, reports) || isIndexStale(serverIndex, reports))
      ) {
        try {
          console.warn(
            'QAF Dashboard: prebuilt test-history-index is required at this execution count; client scan is disabled.'
          );
        } catch (e) {}
        return serverIndex || { lastUpdated: 0, reportDirs: reports.map((r) => r.dir).sort(), tests: {} };
      }
    } else if (reports.length > MAX_CLIENT_SCAN_REPORTS) {
      const existing = getIndex(reports);
      if (existing && indexMatchesReports(existing, reports)) return existing;
      try {
        console.warn('QAF Dashboard: client-built index disabled above', MAX_CLIENT_SCAN_REPORTS, 'executions.');
      } catch (e) {}
      return existing || { lastUpdated: 0, reportDirs: reports.map((r) => r.dir).sort(), tests: {} };
    }

    const existing = getIndex(reports);
    const currentDirs = new Set(reports.map(r => r.dir));
    const currentDirList = reports.map(r => r.dir).sort();

    if (!existing || !existing.reportDirs) {
      const index = await buildFullIndex(reports);
      saveIndex(reports, index);
      return index;
    }

    const existingDirs = new Set(existing.reportDirs || []);
    const newReports = reports.filter(r => !existingDirs.has(r.dir));
    const staleReports = (existing.reportDirs || []).filter(d => !currentDirs.has(d));

    if (staleReports.length > 0) {
      const index = await buildFullIndex(reports);
      saveIndex(reports, index);
      return index;
    }

    if (newReports.length === 0) {
      return existing;
    }

    const toScan = new Set(newReports.map(r => r.dir));
    const scanned = await scanReportsForIndex(reports, toScan);
    const tests = { ...(existing.tests || {}) };
    scanned.forEach((entries, key) => {
      tests[key] = mergeIndexEntries(tests[key], entries);
    });
    const lastUpdated = Math.max(
      existing.lastUpdated || 0,
      ...newReports.map(r => r.startTime || 0)
    );
    const index = {
      lastUpdated,
      reportDirs: currentDirList,
      tests
    };
    saveIndex(reports, index);
    return index;
  }

  /**
   * Root meta-info lists report.dir as test-results/... but per-project test-history-index
   * entries use {projectId}/test-results/... (see buildIndex projectId + mergedDirForReport).
   * Cycle / history filters must treat those as the same execution.
   */
  function reportDirAliasSet(report) {
    const raw = report?.dir;
    if (raw == null || raw === '') return new Set();
    const d = String(raw).replace(/\\/g, '/');
    const set = new Set([d]);
    const k = d.indexOf('/test-results/');
    if (k > 0) {
      set.add(d.slice(k + 1));
    }
    const pid =
      report.projectId != null && String(report.projectId).trim() !== '' ? String(report.projectId).trim() : '';
    const slug =
      pid ||
      (!isAllProjectsMode() && !isSubsetProjectsMode() && projectSlug && projectSlug !== ALL_PROJECTS_SLUG
        ? String(projectSlug).trim()
        : '');
    if (slug && d.startsWith('test-results/')) {
      set.add(`${slug}/${d}`);
    }
    return set;
  }

  function filterHistoryEntriesForReports(entries, currentExecDir, reports) {
    if (!reports?.length) return [];
    const excludeRaw =
      currentExecDir != null && String(currentExecDir) !== '' && String(currentExecDir) !== '__cycle_all__'
        ? String(currentExecDir).replace(/\\/g, '/')
        : null;
    const excludeAliases = excludeRaw != null ? reportDirAliasSet({ dir: excludeRaw }) : null;
    const aliasSets = reports.map((r) => reportDirAliasSet(r));
    function entryMatchesSelectedReports(entryDir) {
      return aliasSets.some((s) => s.has(entryDir));
    }
    return (entries || [])
      .filter((e) => {
        const ed = e.report?.dir != null ? String(e.report.dir).replace(/\\/g, '/') : '';
        if (!ed) return false;
        if (excludeAliases != null && excludeAliases.has(ed)) return false;
        return entryMatchesSelectedReports(ed);
      })
      .map((e) => ({ report: e.report, method: e.method, testsetPath: e.testsetPath }))
      .sort((a, b) => (b.method.startTime || 0) - (a.method.startTime || 0))
      .slice(0, MAX_HISTORY);
  }

  /**
   * Load test history by testID across executions.
   * Uses per-test index when available; falls back to full index or scan.
   * @param {string} testID - testID from metaData
   * @param {string} classPath - class path
   * @param {string} currentExecDir - current execution dir to exclude
   * @param {Array} reports - from root meta-info
   * @returns {Promise<Array<{report:object, method:object}>>}
   */
  async function loadTestHistory(testID, classPath, currentExecDir, reports) {
    if (!testID || !classPath || !reports?.length) return [];

    const repForExec = reports.find((r) => r.dir === currentExecDir);
    const projectId = repForExec?.projectId != null ? String(repForExec.projectId).trim() : '';

    if (!getPreferClientHistoryIndex()) {
      try {
        const manifest = await loadServerManifest();
        if (manifest && indexMatchesReports(manifest, reports) && !isIndexStale(manifest, reports)) {
          if (manifest.tests) {
            const tk = testKey(testID, classPath);
            const sk = storageKey(projectId, testID, classPath);
            const entries = manifest.tests[tk] || manifest.tests[sk];
            if (entries) return filterHistoryEntriesForReports(entries, currentExecDir, reports);
          } else {
            const cat = await loadMergedTestsIndex();
            if (cat) {
              const ck = catalogIndexKey(projectId, testID, classPath);
              let info = cat[ck];
              let entries = info && Array.isArray(info.runs) && info.runs.length ? info.runs : null;
              if (!entries?.length && info?.hash) {
                try {
                  entries = await getJson(`${indexBase()}/${info.hash}.json`);
                } catch (e) {
                  entries = null;
                }
              }
              if (entries?.length) return filterHistoryEntriesForReports(entries, currentExecDir, reports);
            }
            const fromHash = await loadServerTestHistory(testID, classPath, projectId);
            if (fromHash) return filterHistoryEntriesForReports(fromHash, currentExecDir, reports);
          }
        }
      } catch (e) {}
    }

    try {
      const index = await ensureIndexFresh(reports);
      const sk = storageKey(projectId, testID, classPath);
      const tk = testKey(testID, classPath);
      const entries = index?.tests?.[sk] || index?.tests?.[tk] || [];
      if (entries.length) return filterHistoryEntriesForReports(entries, currentExecDir, reports);
    } catch (e) {}

    return loadTestHistoryFallback(testID, classPath, currentExecDir, reports);
  }

  function resolveCycleUniverseTestId(tc) {
    let testID = tc.metaData?.testID;
    if ((testID == null || testID === '') && typeof tc.id === 'string' && tc.id.includes('::')) {
      testID = tc.id.split('::').pop();
    }
    if (testID == null || testID === '') testID = tc.id;
    return testID;
  }

  /**
   * One index/manifest pass + in-memory filter for all cycle rows (avoids N× loadTestHistory / ensureIndexFresh).
   * Returns cycle-scoped history (selected date range) and full history (all known executions) per row for Trend vs Cycle columns.
   * @param {Array} testCases - cycle universe rows
   * @param {Array} reportsInRange - executions in selected dates (filter)
   * @param {Array} reportsFull - all executions (for index/manifest match)
   * @returns {Promise<{ cycleHistories: Array<Array>, fullHistories: Array<Array> }>}
   */
  async function loadHistoriesForCycleBulk(testCases, reportsInRange, reportsFull) {
    const n = testCases?.length || 0;
    const outCycle = new Array(n);
    const outFull = new Array(n);
    const CYCLE_EXCLUDE = '__cycle_all__';
    if (n === 0) return { cycleHistories: outCycle, fullHistories: outFull };

    function assignFromEntries(entries, i) {
      outCycle[i] =
        reportsInRange?.length > 0
          ? filterHistoryEntriesForReports(entries, CYCLE_EXCLUDE, reportsInRange)
          : [];
      outFull[i] =
        reportsFull?.length > 0
          ? filterHistoryEntriesForReports(entries, CYCLE_EXCLUDE, reportsFull)
          : [];
    }

    let manifestTests = null;
    let catalogBySk = null;
    if (!getPreferClientHistoryIndex() && reportsFull?.length) {
      try {
        const manifest = await loadServerManifest();
        if (manifest && indexMatchesReports(manifest, reportsFull) && !isIndexStale(manifest, reportsFull)) {
          if (manifest.tests) {
            manifestTests = manifest.tests;
          } else {
            const cat = await loadMergedTestsIndex();
            if (cat && typeof cat === 'object') {
              catalogBySk = new Map();
              const pairs = Object.entries(cat);
              await mapPool(pairs, 20, async ([ckey, info]) => {
                const { projectId, testID: tid, classPath: cp } = parseCatalogIndexKey(ckey, info);
                const sk = storageKey(projectId, tid, cp);
                let ent = Array.isArray(info.runs) && info.runs.length ? info.runs : null;
                if (!ent?.length && info.hash) {
                  try {
                    ent = await getJson(`${indexBase()}/${info.hash}.json`);
                  } catch (e) {
                    ent = null;
                  }
                }
                if (Array.isArray(ent) && ent.length) catalogBySk.set(sk, ent);
              });
            }
          }
        }
      } catch (e) {}
    }

    let clientIndex = null;
    if (!manifestTests && !catalogBySk?.size && reportsFull?.length) {
      try {
        clientIndex = await ensureIndexFresh(reportsFull);
      } catch (e) {}
    }

    const needFallback = [];
    for (let i = 0; i < n; i++) {
      const tc = testCases[i];
      const testID = resolveCycleUniverseTestId(tc);
      const classPath = tc.classPath;
      if (!testID || !classPath) {
        outCycle[i] = [];
        outFull[i] = [];
        continue;
      }
      const pid = tc.projectId != null && String(tc.projectId).trim() !== '' ? String(tc.projectId).trim() : '';
      const tk = testKey(testID, classPath);
      const sk = storageKey(pid, testID, classPath);
      let entries = manifestTests?.[tk] || manifestTests?.[sk];
      if (!entries?.length && catalogBySk) entries = catalogBySk.get(sk);
      if (!entries?.length) entries = clientIndex?.tests?.[sk] || clientIndex?.tests?.[tk] || null;
      if (entries?.length) {
        assignFromEntries(entries, i);
      } else {
        needFallback.push({ i, testID, classPath });
      }
    }

    if (needFallback.length && (manifestTests || catalogBySk?.size) && !clientIndex && reportsFull?.length) {
      try {
        clientIndex = await ensureIndexFresh(reportsFull);
      } catch (e) {}
      if (clientIndex?.tests) {
        const still = [];
        for (const item of needFallback) {
          const { i, testID, classPath } = item;
          const tc = testCases[i];
          const pid = tc?.projectId != null && String(tc.projectId).trim() !== '' ? String(tc.projectId).trim() : '';
          const sk = storageKey(pid, testID, classPath);
          const tk = testKey(testID, classPath);
          const entries = clientIndex.tests[sk] || clientIndex.tests[tk];
          if (entries?.length) {
            assignFromEntries(entries, i);
          } else {
            still.push(item);
          }
        }
        needFallback.length = 0;
        needFallback.push(...still);
      }
    }

    const FB_BATCH = 24;
    for (let b = 0; b < needFallback.length; b += FB_BATCH) {
      const slice = needFallback.slice(b, b + FB_BATCH);
      await Promise.all(
        slice.map(async ({ i, testID, classPath }) => {
          try {
            const fullPromise =
              reportsFull?.length > 0
                ? loadTestHistoryFallback(testID, classPath, CYCLE_EXCLUDE, reportsFull)
                : Promise.resolve([]);
            const cyclePromise =
              reportsInRange?.length > 0
                ? loadTestHistoryFallback(testID, classPath, CYCLE_EXCLUDE, reportsInRange)
                : Promise.resolve([]);
            const [fullH, cycleH] = await Promise.all([fullPromise, cyclePromise]);
            outFull[i] = fullH;
            outCycle[i] = cycleH;
          } catch (e) {
            outFull[i] = [];
            outCycle[i] = [];
          }
        })
      );
    }

    for (let i = 0; i < n; i++) {
      if (outCycle[i] === undefined) outCycle[i] = [];
      if (outFull[i] === undefined) outFull[i] = [];
    }
    return { cycleHistories: outCycle, fullHistories: outFull };
  }

  async function loadTestHistoryFallback(testID, classPath, currentExecDir, reports) {
    const results = [];
    for (const report of reports) {
      const execDir = report.dir;
      if (execDir === currentExecDir) continue;
      try {
        const execMeta = await loadExecutionMetaInfo(execDir);
        const tests = execMeta?.tests || [];
        for (const testsetPath of tests) {
          try {
            const overview = await loadTestsetOverview(execDir, testsetPath);
            const classes = overview?.classes || [];
            if (!classes.includes(classPath)) continue;
            const classMeta = await loadClassMetaInfo(execDir, testsetPath, classPath);
            const methods = classMeta?.methods || [];
            const match = methods.find(m => getTestIdFromMethod(m) === testID);
            if (match) {
              results.push({
                report,
                method: match,
                testsetPath
              });
              break;
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        continue;
      }
    }
    return results
      .sort((a, b) => (b.method.startTime || 0) - (a.method.startTime || 0))
      .slice(0, MAX_HISTORY);
  }

  async function warmTestHistoryIndex(reports) {
    if (!reports?.length) return;
    try {
      await ensureIndexFresh(reports);
    } catch (e) {}
  }

  /**
   * Group methods by test (deduplicate retries), keeping primary (most recent) run only.
   */
  function groupMethodsByTest(methods) {
    const groups = new Map();
    methods.forEach((m) => {
      const key = m.metaData?.sign || (m.metaData?.testID || '') + '|' + (m.metaData?.name || m.name || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });
    return Array.from(groups.values()).map((runs) => {
      const sorted = runs.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
      return sorted[sorted.length - 1];
    });
  }

  /**
   * Load all test cases for a single execution.
   * @param {string} execDir
   * @param {Array} tests - testset paths from exec meta
   * @returns {Promise<Map<string, object>>} Map of testID -> { ...method, testsetPath, classPath }
   */
  async function loadTestCasesForExecution(execDir, tests) {
    const testsetList = tests || [];
    const flat = [];
    const TESTSET_CONCURRENCY = 10;
    const CLASS_CONCURRENCY = 16;

    await mapPool(testsetList, TESTSET_CONCURRENCY, async (testsetPath) => {
      try {
        const overview = await loadTestsetOverview(execDir, testsetPath);
        const classes = overview?.classes || [];
        await mapPool(classes, CLASS_CONCURRENCY, async (classPath) => {
          try {
            const classMeta = await loadClassMetaInfo(execDir, testsetPath, classPath);
            const methods = classMeta?.methods || [];
            const primaryOnly = groupMethodsByTest(methods);
            for (const m of primaryOnly) {
              const testID = getTestIdFromMethod(m);
              if (!testID) continue;
              flat.push({
                testID,
                startTime: m.startTime || 0,
                row: {
                  ...m,
                  metaData: { ...m.metaData, testID },
                  testsetPath,
                  classPath,
                  id: testID
                }
              });
            }
          } catch (e) {}
        });
      } catch (e) {}
    });

    const byTestId = new Map();
    for (const { testID, startTime, row } of flat) {
      const existing = byTestId.get(testID);
      if (!existing || startTime > (existing.startTime || 0)) {
        byTestId.set(testID, row);
      }
    }
    return byTestId;
  }

  /**
   * Load all unique test cases from the generated test-history-index.
   * Uses tests-index.json (optional inline `runs` from a fresh index build) and otherwise per-test hash files in parallel.
   * @param {string} currentExecDir - execution being viewed
   * @param {Array} reports - all reports (for validation)
   * @returns {Promise<Array>|null} Test cases or null if index unavailable
   */
  async function loadAllTestCasesFromIndex(currentExecDir, reports) {
    if (getPreferClientHistoryIndex()) return null;

    const manifest = await loadServerManifest();
    if (!manifest?.reportDirs?.length) return null;
    const reportDirs = new Set(manifest.reportDirs);
    if (!reportDirs.has(currentExecDir)) return null;

    const testsIndex = await loadMergedTestsIndex();
    if (!testsIndex || typeof testsIndex !== 'object') return null;

    const labelByProject = new Map();
    for (const r of reports || []) {
      const pid = r.projectId != null && String(r.projectId).trim() !== '' ? String(r.projectId).trim() : '';
      if (!labelByProject.has(pid)) {
        labelByProject.set(pid, r.projectLabel != null ? String(r.projectLabel) : '');
      }
    }

    const rows = Object.entries(testsIndex).filter(([_, info]) => info && (info.hash || (Array.isArray(info.runs) && info.runs.length)));
    const INDEX_FETCH_CONCURRENCY = 28;

    const builtRows = await mapPool(rows, INDEX_FETCH_CONCURRENCY, async ([rawKey, info]) => {
      const { projectId, testID, classPath } = parseCatalogIndexKey(rawKey, info);
      let entries = Array.isArray(info.runs) && info.runs.length ? info.runs : null;
      if (!entries && info.hash) {
        const historyPath = `${indexBase()}/${info.hash}.json`;
        try {
          entries = await getJson(historyPath);
        } catch (e) {
          return null;
        }
      }
      if (!Array.isArray(entries) || entries.length === 0) return null;

      const currentEntry = entries.find((e) => e.report?.dir === currentExecDir);
      const latestEntry = entries[0];
      const method = currentEntry?.method ?? latestEntry?.method;
      const result = currentEntry ? currentEntry.method?.result : 'not-run';
      const failureReason = (result === 'fail' || result === 'skip') ? (currentEntry?.failureReason ?? latestEntry?.failureReason) : undefined;
      const metaData = method?.metaData ?? { testID };
      const testsetPath = currentEntry?.testsetPath ?? latestEntry?.testsetPath;
      if (!metaData.module && typeof Utils !== 'undefined' && Utils.getModule) {
        metaData.module = Utils.getModule({ metaData, classPath, testsetPath });
      } else if (!metaData.module && info.module) {
        metaData.module = info.module;
      }
      const rowKey = projectId ? `${projectId}::${testID}` : String(testID);
      const row = {
        id: rowKey,
        projectId,
        projectLabel: labelByProject.get(projectId) || '',
        result,
        testsetPath,
        classPath,
        duration: method?.duration,
        startTime: method?.startTime,
        metaData,
        failureReason,
        execDirForResult: currentEntry ? currentExecDir : latestEntry?.report?.dir
      };
      return row;
    });

    return builtRows.filter(Boolean);
  }

  /**
   * Full test catalog from server tests-index for Cycle view: every indexed test, including
   * those with no hash file / no runs (stub row), so not-run-in-period counts match index size.
   */
  async function loadAllTestCasesFromIndexForCycle(reports, preferredExecDir) {
    if (getPreferClientHistoryIndex()) return null;
    const manifest = await loadServerManifest();
    if (!manifest?.reportDirs?.length) return null;
    const reportDirs = new Set(manifest.reportDirs);
    let anchorDir = preferredExecDir;
    if (!anchorDir || !reportDirs.has(anchorDir)) {
      anchorDir = (reports || []).find((r) => reportDirs.has(r.dir))?.dir;
    }
    if (!anchorDir || !reportDirs.has(anchorDir)) return null;

    const testsIndex = await loadMergedTestsIndex();
    if (!testsIndex || typeof testsIndex !== 'object') return null;

    const labelByProject = new Map();
    for (const r of reports || []) {
      const pid = r.projectId != null && String(r.projectId).trim() !== '' ? String(r.projectId).trim() : '';
      if (!labelByProject.has(pid)) {
        labelByProject.set(pid, r.projectLabel != null ? String(r.projectLabel) : '');
      }
    }

    const rows = Object.entries(testsIndex).filter(([_, info]) => info && info.classPath);
    const INDEX_FETCH_CONCURRENCY = 28;

    const builtRows = await mapPool(rows, INDEX_FETCH_CONCURRENCY, async ([rawKey, info]) => {
      const { projectId, testID, classPath } = parseCatalogIndexKey(rawKey, info);
      let entries = Array.isArray(info.runs) && info.runs.length ? info.runs : null;
      if (!entries && info.hash) {
        const historyPath = `${indexBase()}/${info.hash}.json`;
        try {
          const data = await getJson(historyPath);
          entries = Array.isArray(data) ? data : [];
        } catch (e) {
          entries = [];
        }
      } else if (!entries) {
        entries = [];
      }
      if (!Array.isArray(entries)) entries = [];

      const buildStub = () => {
        const metaData = { testID };
        const testsetPath = info.testsetPath || null;
        if (info.module) metaData.module = info.module;
        if (typeof Utils !== 'undefined' && Utils.getModule) {
          metaData.module =
            metaData.module || Utils.getModule({ metaData, classPath, testsetPath });
        }
        const rowKey = projectId ? `${projectId}::${testID}` : String(testID);
        return {
          id: rowKey,
          projectId,
          projectLabel: labelByProject.get(projectId) || '',
          result: 'not-run',
          testsetPath,
          classPath,
          duration: undefined,
          startTime: undefined,
          metaData,
          failureReason: undefined,
          execDirForResult: anchorDir
        };
      };

      if (entries.length === 0) {
        return buildStub();
      }

      const currentEntry = entries.find((e) => e.report?.dir === anchorDir);
      const latestEntry = entries[0];
      const method = currentEntry?.method ?? latestEntry?.method;
      const result = currentEntry ? currentEntry.method?.result : 'not-run';
      const failureReason =
        (result === 'fail' || result === 'skip')
          ? (currentEntry?.failureReason ?? latestEntry?.failureReason)
          : undefined;
      const metaData = method?.metaData ?? { testID };
      const testsetPath = currentEntry?.testsetPath ?? latestEntry?.testsetPath;
      if (!metaData.module && typeof Utils !== 'undefined' && Utils.getModule) {
        metaData.module = Utils.getModule({ metaData, classPath, testsetPath });
      } else if (!metaData.module && info.module) {
        metaData.module = info.module;
      }
      const rowKey = projectId ? `${projectId}::${testID}` : String(testID);
      return {
        id: rowKey,
        projectId,
        projectLabel: labelByProject.get(projectId) || '',
        result,
        testsetPath,
        classPath,
        duration: method?.duration,
        startTime: method?.startTime,
        metaData,
        failureReason,
        execDirForResult: currentEntry ? anchorDir : latestEntry?.report?.dir
      };
    });

    return builtRows.filter(Boolean);
  }

  function cycleRowsFromClientBuiltIndex(index, preferredExecDir, reports) {
    const tests = index?.tests;
    if (!tests || typeof tests !== 'object') return [];
    const reportByDir = new Map((reports || []).map((r) => [r.dir, r]));
    const anchorDir =
      preferredExecDir ||
      (Array.isArray(index.reportDirs) && index.reportDirs.length ? index.reportDirs[0] : '') ||
      (reports && reports[0]?.dir);
    const rows = [];

    for (const key of Object.keys(tests)) {
      const { projectId, testID, classPath } = parseStorageKey(key);
      if (!testID || !classPath) continue;
      const entries = tests[key];
      if (!Array.isArray(entries) || entries.length === 0) {
        const stubKey = projectId ? `${projectId}::${testID}` : String(testID);
        const plabelStub =
          (reports || []).find((r) => String(r.projectId || '') === projectId)?.projectLabel || '';
        rows.push({
          id: stubKey,
          projectId: projectId || '',
          projectLabel: plabelStub,
          result: 'not-run',
          testsetPath: null,
          classPath,
          metaData: { testID },
          execDirForResult: anchorDir
        });
        continue;
      }
      const latest = entries[0];
      const report = latest.report;
      const repFull = report?.dir ? reportByDir.get(report.dir) : null;
      const pid =
        (projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : '') ||
        (repFull?.projectId != null ? String(repFull.projectId).trim() : '');
      const plabel =
        (repFull?.projectLabel != null ? String(repFull.projectLabel).trim() : '') ||
        (reports || []).find((r) => String(r.projectId || '') === pid)?.projectLabel ||
        '';
      const rowKey = pid ? `${pid}::${testID}` : String(testID);
      const method = latest.method;
      const metaData = method?.metaData ? { ...method.metaData } : { testID };
      if (metaData.testID == null || metaData.testID === '') metaData.testID = testID;
      const res = method?.result || 'not-run';
      rows.push({
        id: rowKey,
        projectId: pid,
        projectLabel: plabel,
        result: res,
        testsetPath: latest.testsetPath,
        classPath,
        duration: method?.duration,
        startTime: method?.startTime,
        metaData,
        failureReason: undefined,
        execDirForResult: report?.dir || anchorDir
      });
    }
    return rows;
  }

  /**
   * Cycle view: union of all tests known to indexes (server tests-index, else browser-built index),
   * else scan all executions. Ensures tests not present in-range executions still appear as pending.
   */
  async function loadCycleTestUniverse(reports, preferredExecDir) {
    if (!reports?.length) return [];

    if (!getPreferClientHistoryIndex()) {
      const fromServer = await loadAllTestCasesFromIndexForCycle(reports, preferredExecDir);
      if (fromServer != null && fromServer.length > 0) return fromServer;
    }

    try {
      const index = await ensureIndexFresh(reports);
      const fromClient = cycleRowsFromClientBuiltIndex(index, preferredExecDir, reports);
      if (fromClient.length > 0) return fromClient;
    } catch (e) {}

    const anchor = preferredExecDir || reports[0]?.dir;
    return loadAllTestCasesAcrossExecutions(reports, anchor);
  }

  /**
   * Load all unique test cases across ALL executions.
   * Each test appears once. Status reflects the current execution (or "skip" if not run there).
   * @param {Array} reports - all reports from root meta-info
   * @param {string} currentExecDir - execution being viewed
   * @returns {Promise<Array<{...method, testsetPath, classPath, result}>>}
   */
  function crossProjectRowKey(report, testID) {
    const pid = report.projectId != null && String(report.projectId).trim() !== '' ? String(report.projectId).trim() : '';
    return pid ? `${pid}::${testID}` : String(testID);
  }

  async function loadAllTestCasesAcrossExecutions(reports, currentExecDir) {
    const allByKey = new Map();
    let currentByKey = new Map();

    for (const report of reports || []) {
      try {
        const execMeta = await loadExecutionMetaInfo(report.dir);
        const tests = execMeta?.tests || [];
        const execMap = await loadTestCasesForExecution(report.dir, tests);
        const isCurrent = report.dir === currentExecDir;
        if (isCurrent) {
          currentByKey = new Map();
          for (const [testID, tc] of execMap) {
            currentByKey.set(crossProjectRowKey(report, testID), tc);
          }
        }

        for (const [testID, tc] of execMap) {
          const key = crossProjectRowKey(report, testID);
          const startTime = tc.startTime || 0;
          const pid = report.projectId != null ? String(report.projectId) : '';
          const plabel = report.projectLabel != null ? String(report.projectLabel) : '';
          const tagged = { ...tc, _execDir: report.dir, _projectId: pid, _projectLabel: plabel };
          const existing = allByKey.get(key);
          if (!existing || startTime > (existing.startTime || 0)) {
            allByKey.set(key, tagged);
          }
        }
      } catch (e) {
        continue;
      }
    }

    const results = [];
    for (const [key, tc] of allByKey) {
      const currentRun = currentByKey.get(key);
      const result = currentRun ? currentRun.result : 'not-run';
      const projectId = tc._projectId ?? '';
      const projectLabel = tc._projectLabel ?? '';
      const row = {
        ...tc,
        id: key,
        projectId,
        projectLabel,
        result,
        testsetPath: currentRun?.testsetPath ?? tc.testsetPath,
        classPath: currentRun?.classPath ?? tc.classPath,
        duration: currentRun?.duration ?? tc.duration,
        startTime: currentRun?.startTime ?? tc.startTime,
        metaData: currentRun?.metaData ?? tc.metaData,
        execDirForResult: currentRun ? currentExecDir : tc._execDir
      };
      delete row._execDir;
      delete row._projectId;
      delete row._projectLabel;
      if (typeof Utils !== 'undefined' && Utils.getModule && (!row.metaData?.module || row.metaData.module === '')) {
        row.metaData = { ...row.metaData };
        row.metaData.module = Utils.getModule(row);
      }
      results.push(row);
    }
    return results;
  }

  /**
   * Load all test cases for a single execution (backward compatible).
   */
  async function loadAllTestCases(execDir, tests) {
    const map = await loadTestCasesForExecution(execDir, tests);
    return Array.from(map.values());
  }

  return {
    initWithFileApi,
    initWithFetch,
    getRootMetaInfo,
    loadExecutionMetaInfo,
    loadTestsetOverview,
    loadClassMetaInfo,
    loadResultFile,
    getFileBlobUrl,
    loadTestHistory,
    loadHistoriesForCycleBulk,
    loadAllTestCases,
    loadAllTestCasesAcrossExecutions,
    loadAllTestCasesFromIndex,
    loadCycleTestUniverse,
    warmTestHistoryIndex,
    isFileApi: () => useFileApi,
    getContentMount,
    getProjectSlug,
    getProjectSlugForUrl,
    setProjectSlug,
    getProjectSlugFromSearch,
    getProjectSubset,
    isAllProjectsMode,
    isSubsetProjectsMode,
    isMultiProjectView,
    ALL_PROJECTS_SLUG,
    canSwitchProject,
    loadRootMetaFromFileApi,
    clearCache: () => {
      cache.clear();
      metadataFormatsPromise = undefined;
    },
    loadMetadataFormats,
    /** Same path resolution as loadResultFile / fetch — use for asset URLs from report.dir */
    resolveReportPath: resolveExecPath,
    getPreferClientHistoryIndex,
    setPreferClientHistoryIndex,
    clearClientHistoryIndexStorage,
    hasClientHistoryIndexStorage,
    rebuildClientHistoryIndex
  };
})();
