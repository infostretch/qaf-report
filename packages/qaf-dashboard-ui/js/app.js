/**
 * @author Chirag Jayswal, QAF team
 * Main application - state, navigation, side panel drill-down
 */
(function () {
  /** Resolve checkpoint/attachment paths (legacy QAF ../img vs Playwright class-relative). */
  function assetUrlFromClassDir(execDir, testsetPath, classPath, relativePath) {
    const baseExecDir = DataLoader.resolveReportPath(execDir);
    const resolved = Utils.resolveReportAssetRelativePath(baseExecDir, testsetPath, classPath, relativePath);
    if (!resolved) return null;
    const prefix = DataLoader.isFileApi() ? '' : './';
    return prefix + resolved;
  }

  function getViewModeFromUrl() {
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (hash === 'testcase') return 'testcase';
    if (hash === 'charts') return 'charts';
    if (hash === 'cycle') return 'cycle';
    if (hash === 'steps') return 'steps';
    return 'suite';
  }

  function buildLocationHref(hashFragment) {
    const url = new URL(window.location.href);
    const slug =
      typeof DataLoader !== 'undefined' && typeof DataLoader.getProjectSlugForUrl === 'function'
        ? DataLoader.getProjectSlugForUrl()
        : typeof DataLoader !== 'undefined'
          ? DataLoader.getProjectSlug()
          : '';
    if (slug) url.searchParams.set('prj', slug);
    else url.searchParams.delete('prj');
    const h = hashFragment != null ? hashFragment : (window.location.hash || '');
    return url.pathname + url.search + h;
  }

  function syncProjectToUrl() {
    window.history.replaceState(null, '', buildLocationHref());
  }

  function syncViewModeToUrl() {
    let desired = '';
    if (state.execViewMode === 'testcase') desired = '#testcase';
    else if (state.execViewMode === 'charts') desired = '#charts';
    else if (state.execViewMode === 'cycle') desired = '#cycle';
    else if (state.execViewMode === 'steps') desired = '#steps';
    if (window.location.hash !== desired) {
      window.history.replaceState(null, '', buildLocationHref(desired));
    }
  }

  const SIDEBAR_RAIL_KEY = 'dashboard-sidebar-rail-collapsed';
  const LEGACY_SIDEBAR_RAIL_KEY = 'dashboard-layout-b-sidebar-collapsed';

  function readSidebarRailCollapsed() {
    try {
      const v = localStorage.getItem(SIDEBAR_RAIL_KEY);
      if (v === '1' || v === '0') return v === '1';
      if (localStorage.getItem(LEGACY_SIDEBAR_RAIL_KEY) === '1') {
        localStorage.setItem(SIDEBAR_RAIL_KEY, '1');
        return true;
      }
    } catch (e) {}
    return false;
  }

  function applySidebarRailFromStorage() {
    const app = document.getElementById('app');
    const rail = document.getElementById('btn-sidebar-rail-toggle');
    if (!app) return;
    const collapsed = readSidebarRailCollapsed();
    app.classList.toggle('sidebar-rail-collapsed', collapsed);
    if (rail) {
      rail.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      rail.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      rail.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }
  }

  function setupSidebarRail() {
    const rail = document.getElementById('btn-sidebar-rail-toggle');
    if (rail) {
      rail.addEventListener('click', () => {
        const app = document.getElementById('app');
        if (!app) return;
        const nextCollapsed = !app.classList.contains('sidebar-rail-collapsed');
        app.classList.toggle('sidebar-rail-collapsed', nextCollapsed);
        try {
          localStorage.setItem(SIDEBAR_RAIL_KEY, nextCollapsed ? '1' : '0');
        } catch (e) {}
        rail.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
        rail.setAttribute('aria-label', nextCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
        rail.title = nextCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
      });
    }
    applySidebarRailFromStorage();
  }

  let projectsManifest = null;
  let projectSwitcherBound = false;

  async function fetchProjectsManifest() {
    try {
      const r = await fetch('./projects.json', { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  function setProjectSwitcherPanelOpen(open) {
    const trigger = document.getElementById('project-switcher-trigger');
    const panel = document.getElementById('project-switcher-panel');
    if (!trigger || !panel) return;
    panel.classList.toggle('hidden', !open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function commitProjectSwitcherFromUi() {
    const ALL = DataLoader.ALL_PROJECTS_SLUG;
    const listEl = document.getElementById('project-switcher-list');
    if (!listEl) return;
    const allCb = listEl.querySelector('input[data-project-opt="' + ALL + '"]');
    if (allCb && allCb.checked) {
      setProjectSwitcherPanelOpen(false);
      applyProjectChange(ALL).catch((e) => setStatus('Error: ' + e.message, true));
      return;
    }
    const checked = Array.from(listEl.querySelectorAll('input[type="checkbox"]')).filter(
      (cb) => cb.checked && cb.dataset.projectOpt !== ALL
    );
    if (checked.length === 0) {
      populateProjectSwitcher();
      setProjectSwitcherPanelOpen(false);
      return;
    }
    const values = checked.map((cb) => cb.dataset.projectOpt ?? '');
    setProjectSwitcherPanelOpen(false);
    if (values.length === 1) {
      applyProjectChange(values[0]).catch((e) => setStatus('Error: ' + e.message, true));
      return;
    }
    applyProjectChange(values.sort((a, b) => String(a).localeCompare(String(b))).join(',')).catch((e) =>
      setStatus('Error: ' + e.message, true)
    );
  }

  function cancelProjectSwitcherPanel() {
    populateProjectSwitcher();
    setProjectSwitcherPanelOpen(false);
  }

  function projectSwitcherSummaryLabel() {
    const ALL = DataLoader.ALL_PROJECTS_SLUG;
    const isAll = DataLoader.isAllProjectsMode && DataLoader.isAllProjectsMode();
    const manifestList = projectsManifest?.projects || [];
    const labelForId = (rawId) => {
      const id = rawId != null ? String(rawId) : '';
      const p = manifestList.find((x) => String(x.id) === id);
      if (p) return p.label || p.id || 'Default';
      if (id === ALL) return 'All projects';
      return id || 'Default';
    };
    if (isAll) return 'All projects';
    const subset =
      DataLoader.isSubsetProjectsMode && DataLoader.isSubsetProjectsMode() && DataLoader.getProjectSubset
        ? DataLoader.getProjectSubset()
        : [];
    if (subset.length > 1) {
      const names = subset.slice(0, 2).map((id) => labelForId(id));
      const more = subset.length - 2;
      return more > 0 ? names.join(', ') + ' +' + more : names.join(', ');
    }
    if (subset.length === 1) return labelForId(subset[0]);
    const slug = DataLoader.getProjectSlug() || '';
    return labelForId(slug);
  }

  function handleProjectCheckboxChange(input) {
    const ALL = DataLoader.ALL_PROJECTS_SLUG;
    const wrap = document.getElementById('project-switcher-wrap');
    const listEl = document.getElementById('project-switcher-list');
    if (!wrap || !listEl || input.disabled) return;

    if (input.dataset.projectOpt === ALL) {
      if (input.checked) {
        listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          cb.checked = cb === input;
        });
        setProjectSwitcherPanelOpen(false);
        applyProjectChange(ALL).catch((e) => setStatus('Error: ' + e.message, true));
      } else {
        input.checked = true;
      }
      return;
    }

    if (input.checked) {
      const allCb = listEl.querySelector('input[data-project-opt="' + ALL + '"]');
      if (allCb) allCb.checked = false;
    }

    const checked = Array.from(listEl.querySelectorAll('input[type="checkbox"]')).filter(
      (cb) => cb.checked && cb.dataset.projectOpt !== ALL
    );

    if (checked.length === 0) {
      populateProjectSwitcher();
    }
  }

  function populateProjectSwitcher() {
    const wrap = document.getElementById('project-switcher-wrap');
    const listEl = document.getElementById('project-switcher-list');
    const summaryEl = document.getElementById('project-switcher-summary');
    if (!wrap || !listEl || !summaryEl) return;
    if (DataLoader.isFileApi()) {
      wrap.classList.add('hidden');
      setProjectSwitcherPanelOpen(false);
      return;
    }
    const list = projectsManifest?.projects;
    const isServed = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    if (!isServed || !list || list.length < 2) {
      wrap.classList.add('hidden');
      setProjectSwitcherPanelOpen(false);
      return;
    }
    wrap.classList.remove('hidden');
    const ALL = DataLoader.ALL_PROJECTS_SLUG;
    const isAll = DataLoader.isAllProjectsMode && DataLoader.isAllProjectsMode();
    const subset =
      DataLoader.isSubsetProjectsMode && DataLoader.isSubsetProjectsMode() && DataLoader.getProjectSubset
        ? DataLoader.getProjectSubset()
        : [];
    const currentSingle = (!isAll && subset.length === 0 && DataLoader.getProjectSlug()) || '';
    listEl.innerHTML = '';

    function appendOptionRow(optValue, displayText, checked) {
      const row = document.createElement('label');
      row.className = 'project-ms-option';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked;
      cb.setAttribute('data-project-opt', optValue);
      const span = document.createElement('span');
      span.className = 'project-ms-option-text';
      span.textContent = displayText;
      row.appendChild(cb);
      row.appendChild(span);
      listEl.appendChild(row);
    }

    if (list.length >= 2) {
      appendOptionRow(ALL, 'All projects', !!isAll);
      const div = document.createElement('div');
      div.className = 'project-ms-divider';
      div.setAttribute('aria-hidden', 'true');
      listEl.appendChild(div);
    }

    list.forEach((p) => {
      const id = p.id != null && p.id !== '' ? String(p.id) : '';
      let checked = false;
      if (!isAll) {
        if (subset.length > 0) checked = subset.includes(id);
        else if (currentSingle && id === currentSingle) checked = true;
      }
      appendOptionRow(id, p.label || p.id || 'Default', checked);
    });

    summaryEl.textContent = projectSwitcherSummaryLabel();

    const trigger = document.getElementById('project-switcher-trigger');
    if (trigger) {
      trigger.disabled = !!(DataLoader.isFileApi() && !DataLoader.canSwitchProject());
      trigger.setAttribute('aria-label', 'Projects: ' + summaryEl.textContent);
    }
  }

  /** Clear selected execution / drill-down so a new dataset (folder or project) cannot reuse stale dirs. */
  function resetExecutionDrilldownState() {
    state.execDir = null;
    state.report = null;
    state.execMeta = null;
    state.testsetPath = null;
    state.testsetOverview = null;
    state.testsetsWithStats = [];
    state.classPath = null;
    state.classMeta = null;
    state.classesWithStats = [];
    state.allTestCases = null;
    state.allTestCasesExecDir = null;
    state.cycleSnapshot = null;
  }

  async function applyProjectChange(newSlug) {
    DataLoader.setProjectSlug(newSlug || '');
    syncProjectToUrl();
    DataLoader.clearCache();
    try {
      state.rootMetaInfo = await DataLoader.getRootMetaInfo();
    } catch (e) {
      state.rootMetaInfo = null;
      setStatus(e.message || 'Load failed', true);
      renderProjectLoadError(e.message || 'Load failed', { availableProjects: projectHintsFromManifest() });
      populateProjectSwitcher();
      updateIndexToolsAvailability();
      return;
    }
    state.view = 'overview';
    state.breadcrumb = [];
    resetExecutionDrilldownState();
    setStatus('Loaded');
    render();
    if (state.rootMetaInfo?.reports?.length) {
      DataLoader.warmTestHistoryIndex(state.rootMetaInfo.reports)
        .then(() => updateIndexToolsAvailability())
        .catch(() => updateIndexToolsAvailability());
    } else {
      updateIndexToolsAvailability();
    }
    populateProjectSwitcher();
  }

  function setupProjectSwitcherOnce() {
    const wrap = document.getElementById('project-switcher-wrap');
    const trigger = document.getElementById('project-switcher-trigger');
    const panel = document.getElementById('project-switcher-panel');
    const listEl = document.getElementById('project-switcher-list');
    const btnApply = document.getElementById('project-switcher-apply');
    const btnClose = document.getElementById('project-switcher-close');
    if (!wrap || !trigger || !panel || !listEl || !btnApply || !btnClose || projectSwitcherBound) return;
    projectSwitcherBound = true;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!panel.classList.contains('hidden')) {
        commitProjectSwitcherFromUi();
        return;
      }
      setProjectSwitcherPanelOpen(true);
    });

    btnApply.addEventListener('click', (e) => {
      e.stopPropagation();
      commitProjectSwitcherFromUi();
    });

    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelProjectSwitcherPanel();
    });

    document.addEventListener('mousedown', (e) => {
      if (wrap.classList.contains('hidden') || panel.classList.contains('hidden')) return;
      if (!wrap.contains(e.target)) cancelProjectSwitcherPanel();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
        cancelProjectSwitcherPanel();
      }
    });

    listEl.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('input[type="checkbox"]')) handleProjectCheckboxChange(t);
    });
  }

  const state = {
    rootMetaInfo: null,
    view: 'overview',
    execViewMode: getViewModeFromUrl(),
    breadcrumb: [],
    execDir: null,
    report: null,
    execMeta: null,
    testsetPath: null,
    testsetOverview: null,
    testsetsWithStats: [],
    classPath: null,
    classMeta: null,
    classesWithStats: [],
    allTestCases: null,
    allTestCasesExecDir: null,
    /** Reuse one cycle load per (reports set, date range, anchor) — see loadAndShowCycleView */
    cycleSnapshot: null
  };

  function setStatus(msg, isError = false) {
    const el = document.getElementById('load-status');
    if (el) {
      el.textContent = msg;
      const active = msg && !isError ? ' load-status--active' : '';
      el.className = 'load-status ' + (isError ? 'error' : '') + active;
    }
  }

  const ICON_SVG_UPLOAD =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  const ICON_SVG_FOLDER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

  function manifestProjectIds(manifest) {
    const list = manifest?.projects;
    if (!list || !list.length) return new Set();
    return new Set(list.map((p) => (p.id != null && p.id !== '' ? String(p.id) : '')).filter(Boolean));
  }

  function projectHintsFromManifest() {
    const list = projectsManifest?.projects;
    if (!list) return [];
    return list.filter((p) => p.id != null && String(p.id) !== '').map((p) => ({ id: String(p.id), label: p.label || p.id }));
  }

  function navigationUrlForProject(projectId) {
    const u = new URL(window.location.href);
    if (projectId) u.searchParams.set('prj', projectId);
    else u.searchParams.delete('prj');
    return u.pathname + u.search + u.hash;
  }

  function renderProjectLoadError(message, options = {}) {
    const overview = document.getElementById('overview-panel');
    const drilldown = document.getElementById('drilldown-panel');
    const sidePanel = document.getElementById('side-panel');
    if (drilldown) drilldown.classList.add('hidden');
    if (sidePanel) sidePanel.classList.add('hidden');
    document.getElementById('view-switcher')?.classList.add('hidden');
    if (!overview) return;
    const available = options.availableProjects || projectHintsFromManifest();
    const slug =
      typeof DataLoader.getProjectSlugForUrl === 'function' ? DataLoader.getProjectSlugForUrl() : DataLoader.getProjectSlug();
    let extra = '';
    if (slug && slug !== DataLoader.ALL_PROJECTS_SLUG && projectsManifest?.projects) {
      const ids = manifestProjectIds(projectsManifest);
      const toCheck = slug.includes(',')
        ? slug
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [String(slug).trim()].filter(Boolean);
      const unknown = toCheck.filter((s) => !ids.has(s));
      if (unknown.length) {
        const names = [...ids].join(', ') || '(none in projects.json)';
        extra +=
          '<p class="project-load-error-note">Unknown id(s): <code>' +
          Utils.escapeHtml(unknown.join(', ')) +
          '</code> — not in <code>projects.json</code>. Known ids: ' +
          Utils.escapeHtml(names) +
          '</p>';
      }
    }
    let listHtml = '';
    if (available.length) {
      listHtml = '<p class="project-load-error-label">Try a project from the list:</p><ul class="project-load-error-list">';
      available.forEach((p) => {
        const href = navigationUrlForProject(p.id);
        listHtml += '<li><a href="' + Utils.escapeHtml(href) + '">' + Utils.escapeHtml(p.label) + '</a> <span class="project-load-error-id">(' + Utils.escapeHtml(p.id) + ')</span></li>';
      });
      listHtml += '</ul>';
    }
    const defaultHref = navigationUrlForProject('');
    overview.innerHTML =
      '<div class="project-load-error" role="alert">' +
      '<h2 class="project-load-error-title">Could not load this project</h2>' +
      '<p class="project-load-error-msg">' + Utils.escapeHtml(message) + '</p>' +
      extra +
      listHtml +
      '<p class="project-load-error-footer"><a href="' + Utils.escapeHtml(defaultHref) + '">Open default project</a> (removes <code>?prj=</code> from the URL)</p>' +
      '</div>';
  }

  function hideUploadToast() {
    const toast = document.getElementById('upload-toast');
    if (!toast) return;
    clearTimeout(toast._hideTimer);
    toast._hideTimer = null;
    toast.classList.add('hidden');
  }

  function showUploadToast(statusType, title, detail, options) {
    const toast = document.getElementById('upload-toast');
    if (!toast) return;
    let typeClass = 'uploaded';
    if (statusType === 'hint') typeClass = 'hint';
    else if (
      statusType === 'duplicate' ||
      statusType === 'updated' ||
      statusType === 'uploaded' ||
      statusType === 'success'
    ) {
      typeClass = statusType;
    }
    toast.className = 'upload-toast ' + typeClass;
    toast.innerHTML =
      '<div class="toast-inner">' +
      '<div class="toast-body">' +
      '<div class="toast-title">' +
      Utils.escapeHtml(title) +
      '</div>' +
      (detail ? '<div class="toast-detail">' + Utils.escapeHtml(detail) + '</div>' : '') +
      '</div>' +
      '<button type="button" class="toast-dismiss" aria-label="Dismiss notification">' +
      '<span aria-hidden="true">×</span>' +
      '</button>' +
      '</div>';
    toast.classList.remove('hidden');
    const dismiss = toast.querySelector('.toast-dismiss');
    if (dismiss) {
      dismiss.addEventListener('click', (e) => {
        e.stopPropagation();
        hideUploadToast();
      });
    }
    clearTimeout(toast._hideTimer);
    toast._hideTimer = null;
    if (!options || !options.persist) {
      toast._hideTimer = setTimeout(hideUploadToast, 5000);
    }
  }

  function navigateTo(index) {
    if (index === -1 || index === 0) {
      state.view = 'execution';
      state.breadcrumb = state.breadcrumb.slice(0, 1);
      state.testsetPath = null;
      state.testsetOverview = null;
      state.classPath = null;
      state.classMeta = null;
      state.classesWithStats = [];
      syncViewModeToUrl();
    } else {
      const item = state.breadcrumb[index];
      if (item) {
        state.view = item.view;
        state.breadcrumb = state.breadcrumb.slice(0, index + 1);
        if (item.view === 'execution') {
          state.testsetPath = null;
          state.testsetOverview = null;
          state.classPath = null;
          state.classMeta = null;
          state.classesWithStats = [];
        } else if (item.view === 'testset') {
          state.classPath = null;
          state.classMeta = null;
          state.classesWithStats = [];
        }
      }
    }
    render();
  }

  /** Collapse suite/class drill-down to execution root (e.g. when switching execution tabs). */
  function collapseDrilldownToExecutionRoot() {
    if (!state.breadcrumb?.length || state.breadcrumb.length <= 1) return false;
    state.breadcrumb = state.breadcrumb.slice(0, 1);
    state.testsetPath = null;
    state.testsetOverview = null;
    state.classPath = null;
    state.classMeta = null;
    state.classesWithStats = [];
    state.view = 'execution';
    return true;
  }

  function showOverview() {
    document.getElementById('drilldown-panel').classList.add('hidden');
    document.getElementById('overview-panel').classList.remove('hidden');
    const sidePanel = document.getElementById('side-panel');
    sidePanel?.classList.remove('hidden');
    applySidebarRailFromStorage();

    const reports = state.rootMetaInfo?.reports || [];
    SidebarComponent.render('sidebar-content', {
      reports,
      onExecutionClick: (report) => {
        state.breadcrumb = [{ label: report.name, name: report.name, view: 'execution', report }];
        state.view = 'execution';
        state.report = report;
        state.execDir = report.dir;
        loadAndShowExecution(report);
      }
    });

    if (reports.length === 0) {
      document.getElementById('overview-panel').innerHTML = '<p class="empty-state">No test reports found. Select a folder containing test-results.</p>';
    } else {
      const report = state.report || reports[0];
      state.breadcrumb = [{ label: report.name, name: report.name, view: 'execution', report }];
      state.view = 'execution';
      state.report = report;
      state.execDir = report.dir;
      if (typeof performance !== 'undefined' && performance.mark) {
        try {
          performance.mark('qaf-overview-shell');
        } catch (e) {}
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          loadAndShowExecution(report).then(() => {
            if (typeof performance !== 'undefined' && performance.mark) {
              try {
                performance.mark('qaf-first-exec-loaded');
              } catch (e) {}
            }
          });
        });
      });
    }
  }

  function renderViewSwitcher() {
    const container = document.getElementById('view-switcher');
    if (!container) return;
    const reports = [...(state.rootMetaInfo?.reports || [])].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    const showExecNav =
      (state.execViewMode === 'suite' || state.execViewMode === 'testcase' || state.execViewMode === 'steps') &&
      reports.length > 1;
    const currentIdx = reports.findIndex((r) => r.dir === state.execDir);
    const hasPrev = showExecNav && currentIdx > 0;
    const hasNext = showExecNav && currentIdx >= 0 && currentIdx < reports.length - 1;

    let html = '<div class="view-switcher view-switcher--tabs">';
    html += '<nav class="view-switcher-tabs" role="tablist" aria-label="Execution views">';
    html += '<button type="button" role="tab" class="view-switcher-tab' + (state.execViewMode === 'suite' ? ' active' : '') + '" data-mode="suite">By Suite</button>';
    html += '<button type="button" role="tab" class="view-switcher-tab' + (state.execViewMode === 'testcase' ? ' active' : '') + '" data-mode="testcase">By Test Case</button>';
    html += '<button type="button" role="tab" class="view-switcher-tab' + (state.execViewMode === 'steps' ? ' active' : '') + '" data-mode="steps">Steps</button>';
    html += '<button type="button" role="tab" class="view-switcher-tab' + (state.execViewMode === 'charts' ? ' active' : '') + '" data-mode="charts">Charts</button>';
    html += '<button type="button" role="tab" class="view-switcher-tab' + (state.execViewMode === 'cycle' ? ' active' : '') + '" data-mode="cycle">Cycle</button>';
    html += '</nav>';
    if (showExecNav) {
      html += '<div class="view-switcher-exec-nav">';
      html += '<button type="button" class="view-switcher-nav-btn" id="exec-prev" title="Previous execution (past)" aria-label="Previous execution (past)"' + (hasPrev ? '' : ' disabled') + '>◀</button>';
      html += '<button type="button" class="view-switcher-nav-btn" id="exec-next" title="Next execution (future)" aria-label="Next execution (future)"' + (hasNext ? '' : ' disabled') + '>▶</button>';
      html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.view-switcher-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.execViewMode = btn.dataset.mode;
        const collapsed = collapseDrilldownToExecutionRoot();
        if (collapsed) updateSidebar();
        syncViewModeToUrl();
        renderViewSwitcher();
        if (state.execViewMode === 'testcase') {
          loadAndShowTestCasesView();
        } else if (state.execViewMode === 'charts') {
          loadAndShowChartsView();
        } else if (state.execViewMode === 'cycle') {
          loadAndShowCycleView();
        } else if (state.execViewMode === 'steps') {
          loadAndShowStepsView();
        } else {
          renderTestsetsList();
        }
      });
    });

    if (showExecNav) {
      const prevBtn = document.getElementById('exec-prev');
      const nextBtn = document.getElementById('exec-next');
      prevBtn?.addEventListener('click', () => {
        if (currentIdx > 0 && reports[currentIdx - 1]) {
          loadAndShowExecution(reports[currentIdx - 1]);
        }
      });
      nextBtn?.addEventListener('click', () => {
        if (currentIdx >= 0 && currentIdx < reports.length - 1 && reports[currentIdx + 1]) {
          loadAndShowExecution(reports[currentIdx + 1]);
        }
      });
    }
  }

  async function loadAndShowTestCasesView(initialStatusFilter, initialModuleFilter) {
    setStatus('Loading test cases...');
    try {
      const reports = state.rootMetaInfo?.reports || [];
      const execDir = state.execDir;
      if (!execDir || !reports?.length) {
        setStatus('No execution selected', true);
        return;
      }
      let testCases = (state.allTestCasesExecDir === execDir) ? state.allTestCases : null;
      if (!testCases) {
        testCases = await DataLoader.loadAllTestCasesFromIndex(execDir, reports);
        if (!testCases) {
          setStatus('Loading test cases across all executions...');
          testCases = await DataLoader.loadAllTestCasesAcrossExecutions(reports, execDir);
        }
        state.allTestCases = testCases;
        state.allTestCasesExecDir = execDir;
      }
      const reportsForTestHistory = (row) => {
        const pid = row.projectId != null ? String(row.projectId) : '';
        if (pid !== '') {
          return reports.filter((r) => String(r.projectId || '') === pid);
        }
        return reports.filter((r) => !r.projectId || String(r.projectId).trim() === '');
      };

      const HISTORY_BATCH_SIZE = 24;
      const withHistory = [];
      for (let i = 0; i < testCases.length; i += HISTORY_BATCH_SIZE) {
        const chunk = testCases.slice(i, i + HISTORY_BATCH_SIZE);
        const loaded = await Promise.all(
          chunk.map(async (tc) => {
            const history = await DataLoader.loadTestHistory(
              tc.metaData?.testID,
              tc.classPath,
              execDir,
              reportsForTestHistory(tc)
            );
            const past = [...history].reverse().map((h) => h.method?.result).filter(Boolean);
            const withCurrent = tc.result === 'not-run' ? past.slice(-8) : [...past, tc.result].slice(-8);
            const transitions = withCurrent.reduce((n, r, j) => (j > 0 && r !== withCurrent[j - 1] ? n + 1 : n), 0);
            const historyAnalysis = transitions >= 2 ? 'Unstable' : null;
            return { ...tc, historyAnalysis, _historyEntries: history };
          })
        );
        withHistory.push(...loaded);
      }

      const toLoad = withHistory.filter((r) => (r.result === 'fail' || r.result === 'skip') && r.metaData?.resultFileName && r.execDirForResult);
      await Promise.allSettled(
        toLoad.map(async (row) => {
          const execDirRow = row.execDirForResult || state.execDir;
          const result = await DataLoader.loadResultFile(execDirRow, row.testsetPath, row.classPath, row.metaData?.resultFileName);
          const data = result?.data ?? result;
          const err = data?.errorTrace || data?.errorMessage;
          row.failureReason = err ? Utils.formatFailureReason(err) : '';
        })
      );

      withHistory.forEach((row) => {
        const hist = row._historyEntries;
        delete row._historyEntries;
        row.historyTimeline = Utils.buildHistoryTimeline(row, hist, state.report);
        row.historyTimelineTrackHtml = Utils.renderHistoryTimelineTrack(row.historyTimeline);
      });

      const loadResultFileForRow = (row) => {
        const dir = row.execDirForResult || state.execDir;
        return DataLoader.loadResultFile(dir, row.testsetPath, row.classPath, row.metaData?.resultFileName);
      };
      const getScreenshotUrlForRow = (row) => (screenshotPath) =>
        assetUrlFromClassDir(row.execDirForResult || state.execDir, row.testsetPath, row.classPath, screenshotPath);
      const loadHistoryItemResult = (execDir, testsetPathVal, classPathVal, resultFileName) =>
        DataLoader.loadResultFile(execDir, testsetPathVal, classPathVal, resultFileName);
      const onRenderMethodDetail = (container, row, data) => {
        const getScreenshotUrl = getScreenshotUrlForRow(row);
        const loadForRetry = (r) => DataLoader.loadResultFile(row.execDirForResult, row.testsetPath, row.classPath, (r.metaData || r).resultFileName);
        const loadHistoryForRow = (testID) =>
          DataLoader.loadTestHistory(testID, row.classPath, state.execDir, reportsForTestHistory(row));
        const getScreenshotUrlFor = (execDir, testsetPathVal, classPathVal) => (path) =>
          assetUrlFromClassDir(execDir, testsetPathVal, classPathVal, path);
        DrilldownComponent.renderMethodDetailAndBind(
          container,
          row,
          data,
          getScreenshotUrl,
          loadForRetry,
          loadHistoryForRow,
          loadHistoryItemResult,
          getScreenshotUrlFor,
          row.classPath,
          reportsForTestHistory(row)
        );
      };
      if (typeof ChartsViewComponent !== 'undefined' && ChartsViewComponent.destroyCharts) {
        ChartsViewComponent.destroyCharts();
      }
      if (typeof CycleViewComponent !== 'undefined' && CycleViewComponent.destroyCharts) {
        CycleViewComponent.destroyCharts();
      }
      renderViewSwitcher();
      TestCaseViewComponent.render('drilldown-panel', {
        testCases: withHistory,
        reports,
        execDir: state.execDir,
        onLoadResultFile: loadResultFileForRow,
        onRenderMethodDetail,
        breadcrumb: state.breadcrumb,
        onBreadcrumbClick: navigateTo,
        initialStatusFilter,
        initialModuleFilter
      });
      setStatus('');
    } catch (e) {
      setStatus('Failed to load: ' + e.message, true);
    }
  }

  async function loadAndShowStepsView() {
    setStatus('Loading steps index…');
    try {
      const reports = state.rootMetaInfo?.reports || [];
      const execDir = state.execDir;
      if (!execDir || !reports?.length) {
        setStatus('No execution selected', true);
        return;
      }
      let testCases = state.allTestCasesExecDir === execDir ? state.allTestCases : null;
      if (!testCases) {
        testCases = await DataLoader.loadAllTestCasesFromIndex(execDir, reports);
        if (!testCases) {
          setStatus('Resolving tests…');
          testCases = await DataLoader.loadAllTestCasesAcrossExecutions(reports, execDir);
        }
        state.allTestCases = testCases;
        state.allTestCasesExecDir = execDir;
      }

      if (typeof ChartsViewComponent !== 'undefined' && ChartsViewComponent.destroyCharts) {
        ChartsViewComponent.destroyCharts();
      }
      if (typeof CycleViewComponent !== 'undefined' && CycleViewComponent.destroyCharts) {
        CycleViewComponent.destroyCharts();
      }
      renderViewSwitcher();

      const loadResultFileForRow = (row) => {
        const execDirRow = row.execDirForResult || execDir;
        return DataLoader.loadResultFile(
          execDirRow,
          row.testsetPath,
          row.classPath,
          row.metaData?.resultFileName
        );
      };

      await StepsViewComponent.render('drilldown-panel', {
        testCases,
        execDir,
        loadResultFile: loadResultFileForRow,
        breadcrumb: state.breadcrumb,
        onBreadcrumbClick: navigateTo
      });
      setStatus('');
    } catch (e) {
      setStatus('Failed to load steps: ' + e.message, true);
    }
  }

  async function loadComparisonChartsData(selectedReports) {
    if (!selectedReports || selectedReports.length === 0) return { headerStats: null, testsetsWithStats: [], modulesWithStats: [], selectedReports: [] };
    const testsetsByPath = new Map();
    const modulesByPath = new Map();
    const execStats = [];
    for (const r of selectedReports) {
      const execMeta = await DataLoader.loadExecutionMetaInfo(r.dir).catch(() => null);
      if (!execMeta) continue;
      const pass = execMeta.pass ?? 0;
      const fail = execMeta.fail ?? 0;
      const skip = execMeta.skip ?? 0;
      execStats.push({ name: r.name || getDisplayName(r.dir), dir: r.dir, startTime: r.startTime, pass, fail, skip, total: pass + fail + skip });
      const tests = execMeta.tests || [];
      const overviews = await Promise.all(tests.map((t) => DataLoader.loadTestsetOverview(r.dir, t).catch(() => null)));
      tests.forEach((path, i) => {
        const ov = overviews[i];
        if (!testsetsByPath.has(path)) testsetsByPath.set(path, { path, executions: [] });
        const entry = testsetsByPath.get(path);
        const p = ov?.pass ?? 0, f = ov?.fail ?? 0, s = ov?.skip ?? 0;
        if (p + f + s > 0) {
          entry.executions.push({ name: r.name || getDisplayName(r.dir), dir: r.dir, pass: p, fail: f, skip: s });
        }
      });
      const testCases = await DataLoader.loadAllTestCases(r.dir, tests).catch(() => []);
      if (testCases.length > 0 && typeof Utils !== 'undefined' && Utils.getModule) {
        const byMod = new Map();
        testCases.forEach((tc) => {
          const mod = Utils.getModule(tc) || '-';
          if (!byMod.has(mod)) byMod.set(mod, { pass: 0, fail: 0, skip: 0 });
          const s = byMod.get(mod);
          if (tc.result === 'pass') s.pass++;
          else if (tc.result === 'fail') s.fail++;
          else if (tc.result === 'skip') s.skip++;
        });
        byMod.forEach((stats, mod) => {
          if (!modulesByPath.has(mod)) modulesByPath.set(mod, { path: mod, executions: [] });
          const entry = modulesByPath.get(mod);
          const { pass: p, fail: f, skip: s } = stats;
          if (p + f + s > 0) {
            entry.executions.push({ name: r.name || getDisplayName(r.dir), dir: r.dir, pass: p, fail: f, skip: s });
          }
        });
      }
    }
    const totalPass = execStats.reduce((s, e) => s + e.pass, 0);
    const totalFail = execStats.reduce((s, e) => s + e.fail, 0);
    const totalSkip = execStats.reduce((s, e) => s + e.skip, 0);
    const testsetsWithStats = Array.from(testsetsByPath.values()).filter((t) => t.executions.length > 0);
    const modulesWithStats = Array.from(modulesByPath.values()).filter((m) => m.executions.length > 0);
    return {
      headerStats: { pass: totalPass, fail: totalFail, skip: totalSkip, total: totalPass + totalFail + totalSkip },
      testsetsWithStats,
      modulesWithStats,
      selectedReports: execStats
    };
  }

  function getDisplayName(path) {
    if (!path) return '-';
    const parts = String(path).split('/');
    return parts[parts.length - 1]?.replace(/_/g, ' ') || path;
  }

  async function loadAndShowChartsView() {
    setStatus('Loading charts...');
    try {
      const reports = state.rootMetaInfo?.reports || [];
      let reportsData = [];
      if (reports.length > 0) {
        const metas = await Promise.all(
          reports.map((r) => DataLoader.loadExecutionMetaInfo(r.dir).catch(() => null))
        );
        reportsData = reports.map((r, i) => {
          const m = metas[i];
          const duration = m?.endTime != null && m?.startTime != null ? m.endTime - m.startTime : null;
          return {
            name: r.name,
            dir: r.dir,
            startTime: r.startTime,
            duration,
            pass: m?.pass ?? 0,
            fail: m?.fail ?? 0,
            skip: m?.skip ?? 0,
            total: (m?.pass ?? 0) + (m?.fail ?? 0) + (m?.skip ?? 0)
          };
        });
      }
      let modulesWithStats = [];
      if (state.execDir && reports.length > 0) {
        const execDir = state.execDir;
        let testCases = (state.allTestCasesExecDir === execDir) ? state.allTestCases : null;
        if (!testCases) {
          testCases = await DataLoader.loadAllTestCasesFromIndex(execDir, reports);
          if (!testCases) {
            testCases = await DataLoader.loadAllTestCasesAcrossExecutions(reports, execDir);
          }
          if (testCases) {
            state.allTestCases = testCases;
            state.allTestCasesExecDir = execDir;
          }
        }
        if (testCases && testCases.length > 0 && typeof Utils !== 'undefined' && Utils.getModule) {
          const byModule = new Map();
          testCases.forEach((tc) => {
            const mod = Utils.getModule(tc) || '-';
            if (!byModule.has(mod)) byModule.set(mod, { path: mod, pass: 0, fail: 0, skip: 0 });
            const s = byModule.get(mod);
            if (tc.result === 'pass') s.pass++;
            else if (tc.result === 'fail') s.fail++;
            else if (tc.result === 'skip') s.skip++;
          });
          modulesWithStats = Array.from(byModule.values()).filter((m) => (m.pass || 0) + (m.fail || 0) + (m.skip || 0) > 0);
        }
      }
      const initialSelected = state.report ? [state.report.dir] : [];
      const onSelectionChange = async (selectedReports) => {
        if (!selectedReports || selectedReports.length === 0) {
          ChartsViewComponent.render('drilldown-panel', {
            breadcrumb: state.breadcrumb,
            onBreadcrumbClick: navigateTo,
            headerStats: state.headerStats,
            execMeta: state.execMeta,
            testsetsWithStats: state.testsetsWithStats,
            modulesWithStats,
            reportsData,
            reports,
            comparisonExecutions: undefined,
            onStatusClick: (s) => { state.execViewMode = 'testcase'; syncViewModeToUrl(); loadAndShowTestCasesView(s); },
            onExecutionClick: (item) => { const report = reports.find((r) => r.dir === item.dir); if (report) loadAndShowExecution(report); },
            onSelectionChange,
            selectedReportDirs: [],
            onSuiteClick: (path) => { state.testsetPath = path; state.breadcrumb = [{ label: state.report?.name, name: state.report?.name, view: 'execution', report: state.report }, { label: SidebarComponent.getDisplayName(path), name: path.split('/').pop(), view: 'testset', testsetPath: path }]; loadAndShowTestset(path); },
            onModuleClick: (moduleName) => { state.execViewMode = 'testcase'; syncViewModeToUrl(); loadAndShowTestCasesView(null, moduleName); }
          });
          return;
        }
        setStatus('Loading comparison...');
        const comparison = await loadComparisonChartsData(selectedReports);
        ChartsViewComponent.render('drilldown-panel', {
          breadcrumb: state.breadcrumb,
          onBreadcrumbClick: navigateTo,
          headerStats: comparison.headerStats,
          execMeta: null,
          testsetsWithStats: comparison.testsetsWithStats,
          modulesWithStats: comparison.modulesWithStats,
          comparisonExecutions: comparison.selectedReports,
          reportsData,
          reports,
          onStatusClick: (s) => { state.execViewMode = 'testcase'; syncViewModeToUrl(); loadAndShowTestCasesView(s); },
          onExecutionClick: (item) => { const report = reports.find((r) => r.dir === item.dir); if (report) loadAndShowExecution(report); },
          onSelectionChange,
          selectedReportDirs: selectedReports.map((r) => r.dir),
          onSuiteClick: (path) => { state.testsetPath = path; state.breadcrumb = [{ label: state.report?.name, name: state.report?.name, view: 'execution', report: state.report }, { label: SidebarComponent.getDisplayName(path), name: path.split('/').pop(), view: 'testset', testsetPath: path }]; loadAndShowTestset(path); },
          onModuleClick: (moduleName) => { state.execViewMode = 'testcase'; syncViewModeToUrl(); loadAndShowTestCasesView(null, moduleName); }
        });
        setStatus('');
      };
      renderViewSwitcher();
      ChartsViewComponent.render('drilldown-panel', {
        breadcrumb: state.breadcrumb,
        onBreadcrumbClick: navigateTo,
        headerStats: state.headerStats,
        execMeta: state.execMeta,
        testsetsWithStats: state.testsetsWithStats,
        modulesWithStats,
        reportsData,
        reports,
        comparisonExecutions: undefined,
        onStatusClick: (status) => {
          state.execViewMode = 'testcase';
          syncViewModeToUrl();
          loadAndShowTestCasesView(status);
        },
        onExecutionClick: (item) => {
          const report = reports.find((r) => r.dir === item.dir);
          if (report) loadAndShowExecution(report);
        },
        onSelectionChange,
        selectedReportDirs: initialSelected,
        initialSelectedDir: state.report?.dir,
        onSuiteClick: (path) => {
          state.testsetPath = path;
          state.breadcrumb = [
            { label: state.report?.name, name: state.report?.name, view: 'execution', report: state.report },
            { label: SidebarComponent.getDisplayName(path), name: path.split('/').pop(), view: 'testset', testsetPath: path }
          ];
          loadAndShowTestset(path);
        },
        onModuleClick: (moduleName) => {
          state.execViewMode = 'testcase';
          syncViewModeToUrl();
          loadAndShowTestCasesView(null, moduleName);
        }
      });
      setStatus('');
    } catch (e) {
      setStatus('Failed to load charts: ' + e.message, true);
    }
  }

  function showCycleLoadingOverlay(msg) {
    const main = document.getElementById('main-content');
    if (!main) return null;
    let overlay = document.getElementById('cycle-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'cycle-loading-overlay';
      overlay.className = 'cycle-loading-overlay hidden';
      overlay.innerHTML = '<div class="cycle-loading-spinner"></div><div class="cycle-loading-msg"></div>';
      main.appendChild(overlay);
    }
    const msgEl = overlay.querySelector('.cycle-loading-msg');
    if (msgEl) msgEl.textContent = msg || 'Loading... Please wait.';
    overlay.classList.remove('hidden');
    return overlay;
  }

  function hideCycleLoadingOverlay() {
    const overlay = document.getElementById('cycle-loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function cycleReportsFingerprint(reports) {
    if (!reports?.length) return '';
    return reports.map((r) => (r.dir || '') + ':' + (r.startTime || 0)).join('|');
  }

  /** Calendar last 7 days including today (local): start of (today−6) 00:00 through end of today. */
  function getDefaultCycleDateRangeMs() {
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date(to);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from: from.getTime(), to: to.getTime() };
  }

  async function buildCycleViewRows(testCases, reportsInRange, reportsFull) {
    const list = testCases && testCases.length ? testCases : [];
    const { cycleHistories, fullHistories } = await DataLoader.loadHistoriesForCycleBulk(
      list,
      reportsInRange,
      reportsFull
    );
    return list.map((tc, idx) => {
      const history = cycleHistories[idx] || [];
      const historyAll = fullHistories[idx] || [];
      let testID = tc.metaData?.testID;
      if ((testID == null || testID === '') && typeof tc.id === 'string' && tc.id.includes('::')) {
        testID = tc.id.split('::').pop();
      }
      if (testID == null || testID === '') testID = tc.id;
      const status = history[0]?.method?.result || tc.result || 'not-run';
      const cycleStatus = CycleViewComponent.getCycleStatus(history);
      const overallStatus = CycleViewComponent.getOverallStatus(historyAll);
      const lastExecutionDate = history[0]?.method?.startTime ?? history[0]?.report?.startTime;
      const lastFailureReason = cycleStatus === 'fail' ? (() => {
        const failedEntry = history.find((e) => e.method?.result === 'fail');
        return failedEntry?.failureReason || tc.failureReason || '';
      })() : '';
      const rowId = tc.id != null && tc.id !== '' ? tc.id : String(testID);
      return {
        ...tc,
        id: rowId,
        status,
        cycleStatus,
        overallStatus,
        runsInRange: history.length,
        lastExecutionDate,
        lastFailureReason,
        cycleHistoryEntries: history,
        fullHistoryEntries: historyAll
      };
    });
  }

  async function loadAndShowCycleView(dateFrom, dateTo) {
    try {
      const reports = state.rootMetaInfo?.reports || [];
      if (reports.length === 0) {
        setStatus('No reports available', true);
        return;
      }
      const minTs = Math.min(...reports.map((r) => r.startTime || 0));
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const maxTs = todayEnd.getTime();
      let from;
      let to;
      if (dateFrom == null && dateTo == null) {
        const def = getDefaultCycleDateRangeMs();
        from = def.from;
        to = def.to;
      } else {
        from = dateFrom ?? minTs;
        to = dateTo ?? maxTs;
      }
      const reportsInRange = reports.filter((r) => {
        const ts = r.startTime || 0;
        return ts >= from && ts <= to;
      }).sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

      const anchorDir = reportsInRange[0]?.dir ?? reports[0]?.dir;
      if (!anchorDir) {
        setStatus('No execution directories available', true);
        return;
      }

      const snapKey =
        cycleReportsFingerprint(reports) + '\n' + from + '\n' + to + '\n' + anchorDir;
      let cycleRows;
      const cacheHit = state.cycleSnapshot && state.cycleSnapshot.key === snapKey;
      if (cacheHit) {
        cycleRows = state.cycleSnapshot.cycleRows;
      } else {
        setStatus('Loading cycle report...');
        showCycleLoadingOverlay(
          reportsInRange.length === 0
            ? 'Loading tests from index (no executions in selected range)...'
            : 'Loading test catalog from index...'
        );
        setStatus(reportsInRange.length === 0 ? 'No executions in range — building list from index...' : 'Loading test catalog...');

        let testCases = await DataLoader.loadCycleTestUniverse(reports, anchorDir);
        if (!testCases || testCases.length === 0) {
          showCycleLoadingOverlay('Loading test cases across executions...');
          testCases = await DataLoader.loadAllTestCasesAcrossExecutions(reports, anchorDir);
        }

        showCycleLoadingOverlay('Loading test history for cycle...');
        setStatus('Loading test history for cycle...');
        cycleRows = await buildCycleViewRows(testCases, reportsInRange, reports);
        state.cycleSnapshot = { key: snapKey, cycleRows };
      }

      if (typeof ChartsViewComponent !== 'undefined' && ChartsViewComponent.destroyCharts) {
        ChartsViewComponent.destroyCharts();
      }
      renderViewSwitcher();
      CycleViewComponent.render('drilldown-panel', {
        breadcrumb: state.breadcrumb,
        onBreadcrumbClick: navigateTo,
        cycleRows,
        dateFrom: from,
        dateTo: to,
        dateMin: minTs,
        dateMax: maxTs,
        onDateChange: (f, t) => loadAndShowCycleView(f, t),
        reports,
        reportsInRange,
        execDir: anchorDir,
        showProjectBreakdown:
          typeof DataLoader.isMultiProjectView === 'function'
            ? DataLoader.isMultiProjectView()
            : typeof DataLoader.isAllProjectsMode === 'function' && DataLoader.isAllProjectsMode()
      });
      if (reportsInRange.length === 0) {
        setStatus(
          cycleRows.length > 0
            ? 'No executions in date range; all ' + cycleRows.length + ' test(s) from the index are UnExecuted for this period.'
            : 'No executions in date range and no tests found in the index.'
        );
      } else {
        setStatus('');
      }
    } catch (e) {
      setStatus('Failed to load cycle report: ' + e.message, true);
    } finally {
      hideCycleLoadingOverlay();
    }
  }

  function renderTestsetsList() {
    if (typeof ChartsViewComponent !== 'undefined' && ChartsViewComponent.destroyCharts) {
      ChartsViewComponent.destroyCharts();
    }
    if (typeof CycleViewComponent !== 'undefined' && CycleViewComponent.destroyCharts) {
      CycleViewComponent.destroyCharts();
    }
    renderViewSwitcher();
    DrilldownComponent.renderTestsetsList('drilldown-panel', state.testsetsWithStats, (path) => {
      state.testsetPath = path;
      state.breadcrumb = [
        { label: state.report?.name, name: state.report?.name, view: 'execution', report: state.report },
        { label: SidebarComponent.getDisplayName(path), name: path.split('/').pop(), view: 'testset', testsetPath: path }
      ];
      loadAndShowTestset(path);
    }, state.breadcrumb, navigateTo, state.headerStats, state.execMeta);
  }

  async function loadAndShowExecution(report) {
    state.execDir = report.dir;
    state.report = report;
    state.breadcrumb = [{ label: report.name, name: report.name, view: 'execution', report }];
    state.allTestCases = null;
    state.allTestCasesExecDir = null;
    state.cycleSnapshot = null;
    setStatus('Loading execution...');
    try {
      const execMeta = await DataLoader.loadExecutionMetaInfo(report.dir);
      state.execMeta = execMeta;
      const tests = execMeta?.tests || [];

      state.testsetPath = null;
      state.testsetOverview = null;
      state.classPath = null;
      state.classMeta = null;
      state.classesWithStats = [];

      state.testsetsWithStats = tests.map((path) => ({
        path,
        pass: 0,
        fail: 0,
        skip: 0,
        total: 0,
        duration: null,
        loading: true
      }));
      state.headerStats = { pass: execMeta?.pass ?? 0, fail: execMeta?.fail ?? 0, skip: execMeta?.skip ?? 0, total: execMeta?.total ?? 0 };

      document.getElementById('overview-panel').classList.add('hidden');
      document.getElementById('drilldown-panel').classList.remove('hidden');
      document.getElementById('view-switcher').classList.remove('hidden');
      const sidePanel = document.getElementById('side-panel');
      sidePanel?.classList.remove('hidden');
      applySidebarRailFromStorage();

      updateSidebar();
      syncViewModeToUrl();

      const loadOverviews = () =>
        Promise.all(tests.map((t) => DataLoader.loadTestsetOverview(report.dir, t).catch(() => null))).then((overviews) => {
          if (state.report !== report) return;
          state.testsetsWithStats = tests.map((path, i) => {
            const ov = overviews[i];
            const duration = ov?.endTime != null && ov?.startTime != null ? ov.endTime - ov.startTime : null;
            return { path, pass: ov?.pass ?? 0, fail: ov?.fail ?? 0, skip: ov?.skip ?? 0, total: ov?.total ?? 0, duration, loading: false };
          });
          state.headerStats = null;
          return overviews;
        });

      if (state.execViewMode === 'charts') {
        await loadOverviews();
        loadAndShowChartsView();
      } else if (state.execViewMode === 'testcase') {
        loadAndShowTestCasesView();
        loadOverviews().then(() => { updateSidebar(); });
      } else if (state.execViewMode === 'cycle') {
        loadAndShowCycleView();
        loadOverviews().then(() => { updateSidebar(); });
      } else if (state.execViewMode === 'steps') {
        loadAndShowStepsView();
        loadOverviews().then(() => { updateSidebar(); });
      } else {
        renderTestsetsList();
        const cb = window.requestIdleCallback || ((fn) => setTimeout(fn, 500));
        cb(() => {
          loadOverviews().then(() => {
            if (state.report !== report) return;
            renderTestsetsList();
            updateSidebar();
          });
        }, { timeout: 2000 });
      }
      setStatus('');
    } catch (e) {
      setStatus('Failed to load: ' + e.message, true);
    }
  }

  async function loadAndShowTestset(testsetPath) {
    state.testsetPath = testsetPath;
    setStatus('Loading suite...');
    try {
      const overview = await DataLoader.loadTestsetOverview(state.execDir, testsetPath);
      state.testsetOverview = overview;
      const classes = overview?.classes || [];

      setStatus('Loading classes...');
      const classMetas = await Promise.all(
        classes.map(c => DataLoader.loadClassMetaInfo(state.execDir, testsetPath, c).catch(() => null))
      );

      state.classesWithStats = classes.map((path, i) => {
        const meta = classMetas[i];
        const methods = meta?.methods || [];
        const pass = methods.filter(m => m.result === 'pass').length;
        const fail = methods.filter(m => m.result === 'fail').length;
        const skip = methods.filter(m => m.result === 'skip').length;
        return {
          path,
          pass,
          fail,
          skip,
          total: methods.length
        };
      });

      state.classPath = null;
      state.classMeta = null;

      updateSidebar();
      DrilldownComponent.renderClassesList('drilldown-panel', testsetPath, overview, state.classesWithStats, (classPath) => {
        state.classPath = classPath;
        state.breadcrumb = [
          { label: state.report?.name, name: state.report?.name, view: 'execution', report: state.report },
          { label: SidebarComponent.getDisplayName(testsetPath), name: testsetPath.split('/').pop(), view: 'testset', testsetPath },
          { label: SidebarComponent.getDisplayName(classPath), name: classPath.split('/').pop(), view: 'class', classPath }
        ];
        loadAndShowClass(classPath);
      }, state.breadcrumb, navigateTo, state.execDir);
      renderViewSwitcher();
      setStatus('');
    } catch (e) {
      setStatus('Failed to load: ' + e.message, true);
    }
  }

  async function loadAndShowClass(classPath) {
    state.classPath = classPath;
    setStatus('Loading class...');
    try {
      const classMeta = await DataLoader.loadClassMetaInfo(state.execDir, state.testsetPath, classPath);
      state.classMeta = classMeta;
      const loadResultFile = (row) => {
        const resultFileName = row.metaData?.resultFileName;
        if (!resultFileName) return Promise.resolve(null);
        return DataLoader.loadResultFile(state.execDir, state.testsetPath, classPath, resultFileName);
      };
      const getScreenshotUrl = (screenshotPath) =>
        assetUrlFromClassDir(state.execDir, state.testsetPath, classPath, screenshotPath);
      const loadResultFileForHistory = (execDir, testsetPathVal, classPathVal, resultFileName) => {
        if (!resultFileName) return Promise.resolve(null);
        return DataLoader.loadResultFile(execDir, testsetPathVal, classPathVal, resultFileName);
      };
      const getScreenshotUrlFor = (execDir, testsetPathVal, classPathVal) => (screenshotPath) =>
        assetUrlFromClassDir(execDir, testsetPathVal, classPathVal, screenshotPath);
      const allRep = state.rootMetaInfo?.reports || [];
      const historyReports = (() => {
        const rep = state.report;
        if (!rep) return allRep;
        const pid = rep.projectId != null ? String(rep.projectId) : '';
        if (pid !== '') {
          return allRep.filter((r) => String(r.projectId || '') === pid);
        }
        return allRep.filter((r) => !r.projectId || String(r.projectId).trim() === '');
      })();
      const loadHistory = (testID) => DataLoader.loadTestHistory(testID, classPath, state.execDir, historyReports);
      updateSidebar();
      DrilldownComponent.renderClassMethods(
        'drilldown-panel',
        classPath,
        classMeta,
        loadResultFile,
        getScreenshotUrl,
        loadHistory,
        loadResultFileForHistory,
        getScreenshotUrlFor,
        historyReports,
        state.report || null,
        state.breadcrumb,
        navigateTo
      );
      renderViewSwitcher();
      setStatus('');
    } catch (e) {
      setStatus('Failed to load: ' + e.message, true);
    }
  }

  function updateSidebar() {
    const reports = state.rootMetaInfo?.reports || [];
    SidebarComponent.render('sidebar-content', {
      execMeta: state.execMeta,
      testsets: state.testsetsWithStats,
      classes: state.classesWithStats,
      selectedTestset: state.testsetPath,
      selectedClass: state.classPath,
      reports,
      selectedReport: state.report,
      onExecutionClick: (report) => {
        state.breadcrumb = [{ label: report.name, name: report.name, view: 'execution', report }];
        state.view = 'execution';
        state.report = report;
        state.execDir = report.dir;
        loadAndShowExecution(report);
      },
      onTestsetSelect: (path) => {
        state.testsetPath = path;
        state.breadcrumb = [
          { label: state.report?.name, name: state.report?.name, view: 'execution', report: state.report },
          { label: SidebarComponent.getDisplayName(path), name: path.split('/').pop(), view: 'testset', testsetPath: path }
        ];
        loadAndShowTestset(path);
      },
      onClassSelect: (path) => {
        state.classPath = path;
        state.breadcrumb = [
          { label: state.report?.name, name: state.report?.name, view: 'execution', report: state.report },
          { label: SidebarComponent.getDisplayName(state.testsetPath), name: state.testsetPath?.split('/').pop(), view: 'testset', testsetPath: state.testsetPath },
          { label: SidebarComponent.getDisplayName(path), name: path.split('/').pop(), view: 'class', classPath: path }
        ];
        loadAndShowClass(path);
      }
    });
  }

  function render() {
    if (state.view === 'overview') {
      showOverview();
      return;
    }
    const bc = state.breadcrumb;
    if (bc.length && bc[0].view === 'execution') {
      const report = bc[0].report;
      if (state.view === 'execution') {
        loadAndShowExecution(report);
      } else if (state.view === 'testset' && bc[1]) {
        loadAndShowTestset(bc[1].testsetPath || bc[1].path);
      } else if (state.view === 'class' && bc[2]) {
        loadAndShowClass(bc[2].classPath || bc[2].path);
      }
    }
  }

  async function loadWithFileApi() {
    const btn = document.getElementById('btn-load-folder');
    if (btn?.disabled) return;
    hideUploadToast();
    showUploadToast(
      'hint',
      'Select folder',
      'Choose your test-results folder in the system dialog.',
      { persist: true }
    );
    if (btn) {
      btn.disabled = true;
      btn.classList.add('btn-loading');
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>';
      btn.title = 'Selecting folder…';
    }
    setStatus('Select folder…');
    try {
      state.rootMetaInfo = await DataLoader.initWithFileApi();
      syncProjectToUrl();
      state.view = 'overview';
      state.breadcrumb = [];
      resetExecutionDrilldownState();
      setStatus('Loaded');
      projectsManifest = await fetchProjectsManifest();
      populateProjectSwitcher();
      render();
      DataLoader.warmTestHistoryIndex(state.rootMetaInfo?.reports)
        .then(() => updateIndexToolsAvailability())
        .catch(() => updateIndexToolsAvailability());
    } catch (e) {
      if (!e.message?.includes('File picker already active')) {
        setStatus('Error: ' + e.message, true);
      }
    } finally {
      hideUploadToast();
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.title = 'Select folder';
        btn.innerHTML = btn.dataset.originalText || ICON_SVG_FOLDER;
      }
    }
  }

  async function loadWithFetch() {
    setStatus('Loading...');
    try {
      state.rootMetaInfo = await DataLoader.initWithFetch();
      state.view = 'overview';
      state.breadcrumb = [];
      resetExecutionDrilldownState();
      setStatus('Loaded');
      projectsManifest = (await fetchProjectsManifest()) || projectsManifest;
      populateProjectSwitcher();
      render();
      DataLoader.warmTestHistoryIndex(state.rootMetaInfo?.reports)
        .then(() => updateIndexToolsAvailability())
        .catch(() => updateIndexToolsAvailability());
    } catch (e) {
      state.rootMetaInfo = null;
      projectsManifest = (await fetchProjectsManifest()) || projectsManifest;
      populateProjectSwitcher();
      setStatus('Could not load project', true);
      renderProjectLoadError(e.message || String(e), { availableProjects: projectHintsFromManifest() });
      updateIndexToolsAvailability();
    }
  }

  async function handleUploadZip(file, importMode) {
    if (!file || file.size === 0) {
      setStatus('Please select a non-empty file', true);
      return;
    }
    const btn = document.getElementById('btn-upload-zip');
    const origText = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.classList.add('btn-loading');
      btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>';
      btn.title = 'Uploading…';
    }
    setStatus('Uploading...');
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const chunkSize = 0x8000;
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      const mode =
        importMode != null && String(importMode).trim() !== ''
          ? String(importMode).trim()
          : 'auto';
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip: base64, import: mode })
      });
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        if (text.trim().startsWith('<')) {
          throw new Error('Upload API not available. Run the dashboard with qaf-report-core (e.g. npx qaf-serve or npm start in a project that depends on qaf-report-core).');
        }
        throw new Error('Invalid response from server');
      }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
      const stats = data.stats || {};
      const statusType = data.status || 'uploaded';
      const statusMsg = statusType === 'uploaded' ? 'Uploaded' : statusType === 'updated' ? 'Updated' : 'Duplicate';
      const parts = [];
      if (stats.executions != null) parts.push(stats.executions + ' execution(s)');
      if (stats.new > 0) parts.push(stats.new + ' new');
      if (stats.updated > 0) parts.push(stats.updated + ' updated');
      if (stats.suites != null && stats.suites > 0) parts.push(stats.suites + ' suites');
      if (stats.tests != null && stats.tests > 0) parts.push(stats.tests + ' tests');
      if (stats.pass != null || stats.fail != null || stats.skip != null) {
        const p = stats.pass ?? 0, f = stats.fail ?? 0, s = stats.skip ?? 0;
        if (p + f + s > 0) parts.push(p + ' pass, ' + f + ' fail, ' + s + ' skip');
      }
      const detail = parts.join(' · ');
      setStatus('Reloading...');
      await loadWithFetch();
      setStatus('Loaded');
      showUploadToast(statusType, statusMsg, detail);
    } catch (e) {
      setStatus('Upload failed: ' + e.message, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.title = 'Upload report';
        btn.innerHTML = origText || ICON_SVG_UPLOAD;
      }
    }
  }

  async function invalidateTestCaseCacheAndRefreshViews() {
    state.allTestCases = null;
    state.allTestCasesExecDir = null;
    state.cycleSnapshot = null;
    const reports = state.rootMetaInfo?.reports || [];
    if (reports.length) {
      await DataLoader.warmTestHistoryIndex(reports);
    }
    if (state.view !== 'execution' || !state.report) {
      updateIndexToolsAvailability();
      return;
    }
    if (state.execViewMode === 'testcase') {
      await loadAndShowTestCasesView();
    } else if (state.execViewMode === 'charts') {
      await loadAndShowChartsView();
    } else if (state.execViewMode === 'cycle') {
      await loadAndShowCycleView();
    } else if (state.execViewMode === 'steps') {
      await loadAndShowStepsView();
    } else {
      renderTestsetsList();
    }
    updateIndexToolsAvailability();
  }

  function isDashboardHttpServed() {
    const p = window.location.protocol;
    return p === 'http:' || p === 'https:';
  }

  /** Script/site <code>test-history-index</code> can be loaded (HTTP fetch or files in a picked folder). */
  function canUseOnDiskHistoryIndex() {
    return isDashboardHttpServed() || DataLoader.isFileApi();
  }

  const INDEX_TOOLS_HELP_DISK =
    'When <strong>Prefer browser-built</strong> is off, the app uses <code>test-history-index</code> files from the site or from the folder you selected (for example from a CI/build script). If those are wrong or History / By Test Case looks incomplete, turn the option on and use Refresh or Clear. Only <code>localStorage</code> in this browser changes&mdash;not files on disk.';
  const INDEX_TOOLS_HELP_FILE_ONLY =
    'Open this page over HTTP or use <strong>Select folder</strong> to load reports. Until then, Refresh/Clear only affect any existing <code>localStorage</code> cache in this browser.';

  function updateIndexToolsAvailability() {
    const panel = document.getElementById('index-tools-panel');
    const btnToggle = document.getElementById('btn-index-tools');
    const preferWrap = document.getElementById('index-tools-prefer-wrap');
    const helpEl = document.getElementById('index-tools-help');
    const chk = document.getElementById('chk-prefer-client-index');
    const btnRefresh = document.getElementById('btn-refresh-client-index');
    const btnClear = document.getElementById('btn-clear-index-storage');
    if (!panel || !btnToggle || !preferWrap || !helpEl || !chk || !btnRefresh || !btnClear) return;

    const diskIndex = canUseOnDiskHistoryIndex();
    const prefer = DataLoader.getPreferClientHistoryIndex();
    const hasStore = DataLoader.hasClientHistoryIndexStorage();

    preferWrap.classList.toggle('hidden', !diskIndex);
    helpEl.innerHTML = diskIndex ? INDEX_TOOLS_HELP_DISK : INDEX_TOOLS_HELP_FILE_ONLY;

    chk.checked = prefer;

    const disableNoPrefer = diskIndex && !prefer;
    const disablePreferNoStore = diskIndex && prefer && !hasStore;
    const disableRefreshClear = disableNoPrefer || disablePreferNoStore;

    btnRefresh.disabled = disableRefreshClear;
    btnClear.disabled = disableRefreshClear;

    if (disableNoPrefer) {
      const msg =
        'Turn on “Prefer browser-built history index” to rebuild or clear the browser cache (on-disk test-history-index is used when this is off).';
      btnRefresh.title = msg;
      btnClear.title = msg;
    } else if (disablePreferNoStore) {
      const msg =
        'No browser index yet. Open History or By Test Case once to build it, then you can refresh or clear.';
      btnRefresh.title = msg;
      btnClear.title = msg;
    } else {
      btnRefresh.removeAttribute('title');
      btnClear.removeAttribute('title');
    }
  }

  function closeIndexToolsPanel() {
    const panel = document.getElementById('index-tools-panel');
    const btnToggle = document.getElementById('btn-index-tools');
    if (panel) panel.classList.add('hidden');
    if (btnToggle) btnToggle.setAttribute('aria-expanded', 'false');
  }

  function setupIndexTools() {
    const panel = document.getElementById('index-tools-panel');
    const btnToggle = document.getElementById('btn-index-tools');
    const chk = document.getElementById('chk-prefer-client-index');
    const btnRefresh = document.getElementById('btn-refresh-client-index');
    const btnClear = document.getElementById('btn-clear-index-storage');
    if (!panel || !btnToggle || !chk || !btnRefresh || !btnClear) return;

    chk.checked = DataLoader.getPreferClientHistoryIndex();
    updateIndexToolsAvailability();

    chk.addEventListener('change', () => {
      DataLoader.setPreferClientHistoryIndex(chk.checked);
      DataLoader.clearCache();
      updateIndexToolsAvailability();
      invalidateTestCaseCacheAndRefreshViews().then(() => {
        setStatus(
          chk.checked ? 'Using browser-built history index' : 'Using on-disk test-history-index when available'
        );
        updateIndexToolsAvailability();
      });
    });

    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('hidden');
      const expanded = !panel.classList.contains('hidden');
      btnToggle.setAttribute('aria-expanded', String(expanded));
      if (expanded) updateIndexToolsAvailability();
    });

    document.addEventListener('click', () => {
      if (!panel.classList.contains('hidden')) closeIndexToolsPanel();
    });
    panel.addEventListener('click', (e) => e.stopPropagation());

    const btnClosePanel = document.getElementById('btn-index-tools-close');
    if (btnClosePanel) {
      btnClosePanel.addEventListener('click', (e) => {
        e.stopPropagation();
        closeIndexToolsPanel();
      });
    }

    btnRefresh.addEventListener('click', async () => {
      if (btnRefresh.disabled) return;
      closeIndexToolsPanel();
      const reports = state.rootMetaInfo?.reports || [];
      setStatus('Rebuilding client index...');
      try {
        await DataLoader.rebuildClientHistoryIndex(reports);
        await invalidateTestCaseCacheAndRefreshViews();
        setStatus('Client index rebuilt');
        showUploadToast('success', 'Index updated', 'History and By Test Case use the new browser index.');
      } catch (e) {
        setStatus('Index rebuild failed: ' + (e.message || e), true);
      }
      updateIndexToolsAvailability();
    });

    btnClear.addEventListener('click', () => {
      if (btnClear.disabled) return;
      closeIndexToolsPanel();
      DataLoader.clearClientHistoryIndexStorage();
      DataLoader.clearCache();
      state.allTestCases = null;
      state.allTestCasesExecDir = null;
      setStatus('Cleared browser index storage');
      showUploadToast('success', 'Storage cleared', 'Use Refresh client index or switch views to rebuild.');
      if (state.rootMetaInfo?.reports?.length && state.view === 'execution') {
        invalidateTestCaseCacheAndRefreshViews().catch(() => {});
      }
      updateIndexToolsAvailability();
    });
  }

  function setupUploadDialog(serverCap) {
    const backdrop = document.getElementById('upload-dialog-backdrop');
    const btnOpen = document.getElementById('btn-upload-zip');
    const btnCancel = document.getElementById('btn-upload-dialog-cancel');
    const btnBrowse = document.getElementById('btn-upload-dialog-browse');
    const btnSubmit = document.getElementById('btn-upload-dialog-submit');
    const input = document.getElementById('input-upload-dialog');
    const sel = document.getElementById('upload-dialog-import');
    const nameEl = document.getElementById('upload-dialog-filename');

    const showUpload =
      serverCap.hasServerApi &&
      serverCap.upload &&
      (window.location.protocol === 'http:' || window.location.protocol === 'https:');

    if (!backdrop || !btnOpen || !btnCancel || !btnBrowse || !btnSubmit || !input || !sel || !nameEl) return;

    btnOpen.style.display = showUpload ? '' : 'none';
    if (!showUpload) return;

    let selectedFile = null;

    function closeDialog() {
      backdrop.classList.add('hidden');
      backdrop.setAttribute('aria-hidden', 'true');
      selectedFile = null;
      input.value = '';
      nameEl.textContent = 'No file chosen';
      btnSubmit.disabled = true;
    }

    function openDialog() {
      sel.value = 'auto';
      selectedFile = null;
      input.value = '';
      nameEl.textContent = 'No file chosen';
      btnSubmit.disabled = true;
      backdrop.classList.remove('hidden');
      backdrop.setAttribute('aria-hidden', 'false');
      setTimeout(() => sel.focus(), 0);
    }

    btnOpen.addEventListener('click', () => openDialog());

    btnCancel.addEventListener('click', () => closeDialog());

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeDialog();
    });

    btnBrowse.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      selectedFile = file;
      nameEl.textContent = file ? file.name : 'No file chosen';
      btnSubmit.disabled = !file;
    });

    btnSubmit.addEventListener('click', () => {
      if (!selectedFile) return;
      const file = selectedFile;
      const mode = sel.value || 'auto';
      closeDialog();
      handleUploadZip(file, mode);
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || backdrop.classList.contains('hidden')) return;
      ev.preventDefault();
      closeDialog();
    });
  }

  async function init() {
    projectsManifest = await fetchProjectsManifest();
    setupProjectSwitcherOnce();
    setupIndexTools();

    const serverCap =
      typeof ServerCapabilities !== 'undefined'
        ? await ServerCapabilities.probeServerCapabilities()
        : { hasServerApi: false, upload: false };

    setupUploadDialog(serverCap);

    if (typeof Utils.loadMetadataFormats === 'function') {
      Utils.loadMetadataFormats().catch(() => {});
    }

    window.addEventListener('hashchange', () => {
      const mode = getViewModeFromUrl();
      if (mode === state.execViewMode && state.breadcrumb.length <= 1) return;
      state.execViewMode = mode;
      const collapsed = collapseDrilldownToExecutionRoot();
      if (collapsed) updateSidebar();
      const vs = document.getElementById('view-switcher');
      if (!vs || vs.classList.contains('hidden')) return;
      renderViewSwitcher();
      if (state.view === 'overview' || !state.execDir) return;
      if (state.execViewMode === 'testcase') {
        loadAndShowTestCasesView();
      } else if (state.execViewMode === 'charts') {
        loadAndShowChartsView();
      } else if (state.execViewMode === 'cycle') {
        loadAndShowCycleView();
      } else if (state.execViewMode === 'steps') {
        loadAndShowStepsView();
      } else {
        renderTestsetsList();
      }
    });

    document.getElementById('btn-load-folder').addEventListener('click', loadWithFileApi);

    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      loadWithFetch().catch(() => {
        setStatus('Could not load test-results. Select folder or check path.', true);
      });
    } else {
      setStatus('Select folder to load test results (required for file://)');
    }
  }

  function startApp() {
    setupSidebarRail();
    init().catch((e) => setStatus('Init error: ' + e.message, true));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }
})();
