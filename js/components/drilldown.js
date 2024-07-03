/**
 * @author Chirag Jayswal, QAF team
 * Drill-down views: Execution -> Testsets -> Classes -> Methods
 */
const DrilldownComponent = (function () {
  let execDir = '';
  let testsetPath = '';
  let classPath = '';
  let execMeta = null;
  let testsetOverview = null;
  let classMeta = null;

  function getDisplayName(path) {
    if (!path) return 'Unknown';
    const parts = path.split('/');
    const last = parts[parts.length - 1] || path;
    return last.replace(/\.feature$/, '').replace(/_/g, ' ');
  }

  function getStatus(pass, fail, skip, total) {
    if (total === 0) return 'empty';
    if (fail > 0) return 'fail';
    if (skip > 0 && pass === 0) return 'skip';
    return 'pass';
  }

  function statusBarHtml(pass, fail, skip, total) {
    if (!total || total === 0) return '';
    const pct = (v) => Math.max(0, Math.round((v / total) * 100));
    const passPct = pct(pass);
    const failPct = pct(fail);
    const skipPct = pct(skip);
    return `<div class="status-bar" role="presentation">
      ${passPct ? `<span class="status-bar-segment pass" style="width:${passPct}%" title="${pass} passed"></span>` : ''}
      ${failPct ? `<span class="status-bar-segment fail" style="width:${failPct}%" title="${fail} failed"></span>` : ''}
      ${skipPct ? `<span class="status-bar-segment skip" style="width:${skipPct}%" title="${skip} skipped"></span>` : ''}
    </div>`;
  }

  function breadcrumbHtml(breadcrumb, onNavigate) {
    if (!breadcrumb?.length) return '';
    let html = '<div class="drilldown-breadcrumb-row">';
    html += '<nav class="drilldown-breadcrumb" aria-label="Breadcrumb">';
    breadcrumb.forEach((item, i) => {
      const label = item.label || item.name || 'Unknown';
      const isLast = i === breadcrumb.length - 1;
      const isFirst = i === 0;
      if (isLast && !isFirst) {
        html += '<span class="breadcrumb-link breadcrumb-current">' + Utils.escapeHtml(label) + '</span>';
      } else {
        html += '<a href="#" class="breadcrumb-link" data-index="' + i + '">' + Utils.escapeHtml(label) + '</a>';
        if (!isLast) html += '<span class="breadcrumb-sep"> &gt; </span>';
      }
    });
    html += '</nav>';
    html += '</div>';
    return html;
  }

  function pieChartHtml(pass, fail, skip, total) {
    if (!total || total === 0) return '';
    const pct = (v) => (v / total) * 100;
    let offset = 0;
    const segments = [];
    if (pass > 0) {
      const d = pct(pass);
      segments.push({ pct: d, offset, cls: 'pass' });
      offset += d;
    }
    if (fail > 0) {
      const d = pct(fail);
      segments.push({ pct: d, offset, cls: 'fail' });
      offset += d;
    }
    if (skip > 0) {
      const d = pct(skip);
      segments.push({ pct: d, offset, cls: 'skip' });
    }
    const r = 24;
    const circum = 2 * Math.PI * r;
    const sizeClass = 'pie-chart-large';
    let html = '<div class="pie-chart-wrap ' + sizeClass + '">';
    html += '<svg class="pie-chart" viewBox="0 0 100 100"><g transform="rotate(-90 50 50)">';
    segments.forEach(seg => {
      const dash = (seg.pct / 100) * circum;
      const gap = circum - dash;
      html += '<circle class="pie-segment ' + seg.cls + '" r="' + r + '" cx="50" cy="50" fill="none" stroke-dasharray="' + dash + ' ' + gap + '" stroke-dashoffset="' + (-seg.offset / 100 * circum) + '" />';
    });
    html += '</g></svg>';
    html += '</div>';
    return html;
  }

  function suiteBarHtml(ts) {
    const total = (ts.pass || 0) + (ts.fail || 0) + (ts.skip || 0);
    if (total === 0) return ts.loading ? '<span class="suite-loading">…</span>' : '';
    const pct = (v) => Math.max(0, Math.round((v / total) * 100));
    const status = getStatus(ts.pass, ts.fail, ts.skip, ts.total);
    return `<div class="report-suite-bar">
      ${(ts.pass || 0) ? `<span class="report-suite-seg pass" style="width:${pct(ts.pass)}%" title="${ts.pass} passed">${ts.pass}</span>` : ''}
      ${(ts.fail || 0) ? `<span class="report-suite-seg fail" style="width:${pct(ts.fail)}%" title="${ts.fail} failed">${ts.fail}</span>` : ''}
      ${(ts.skip || 0) ? `<span class="report-suite-seg skip" style="width:${pct(ts.skip)}%" title="${ts.skip} skipped">${ts.skip}</span>` : ''}
    </div>`;
  }

  function renderTestsetsList(containerId, testsetsWithStats, onTestsetClick, breadcrumb, onBreadcrumbClick, headerStats, execMeta) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const pass = headerStats ? (headerStats.pass ?? 0) : testsetsWithStats.reduce((s, t) => s + (t.pass || 0), 0);
    const fail = headerStats ? (headerStats.fail ?? 0) : testsetsWithStats.reduce((s, t) => s + (t.fail || 0), 0);
    const skip = headerStats ? (headerStats.skip ?? 0) : testsetsWithStats.reduce((s, t) => s + (t.skip || 0), 0);
    const total = headerStats ? (headerStats.total ?? 0) : pass + fail + skip;
    const totalDuration = execMeta?.endTime != null && execMeta?.startTime != null ? execMeta.endTime - execMeta.startTime : null;

    let html = breadcrumbHtml(breadcrumb, onBreadcrumbClick);
    html += '<div class="drilldown-header">';
    html += '<div class="drilldown-header-row"><h2>Suites</h2>' + pieChartHtml(pass, fail, skip, total);
    if (totalDuration != null) {
      html += '<span class="drilldown-header-duration"><span class="drilldown-header-duration-label">Total time:</span> ' + Utils.renderStandardDurationCell(totalDuration) + '</span>';
    }
    html += '</div>';
    html += statusBarHtml(pass, fail, skip, total);
    html += '</div>';
    html += '<div class="drilldown-filters"><div class="filters-row">';
    html += '<select class="filter-select" id="suite-group-by" title="Group by"><option value="">Group by...</option>';
    html += '<option value="pathPrefix">Path prefix</option><option value="status">Status</option></select>';
    html += '</div></div>';
    html += '<div class="table-placeholder" id="drilldown-table"></div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    const suiteData = testsetsWithStats.map(ts => ({
      ...ts,
      id: ts.path,
      name: getDisplayName(ts.path),
      status: getStatus(ts.pass, ts.fail, ts.skip, ts.total),
      pathPrefix: (ts.path || '').split('/')[0] || '(root)'
    }));

    const table = TableComponent.createTable('drilldown-table', {
      columns: [
        {
          key: 'name',
          label: 'Suite',
          sortKey: 'name',
          value: (r) => getDisplayName(r.path),
          render: (v) => Utils.escapeHtml(v || '-')
        },
        {
          key: 'status',
          label: 'Status',
          sortKey: 'status',
          value: (r) => r.status,
          render: (v, row) => {
            const bar = suiteBarHtml(row);
            return bar || (row.loading ? '<span class="suite-loading">…</span>' : '-');
          }
        },
        { key: 'pass', label: 'Pass', sortKey: 'pass', render: (v, r) => r.loading ? '…' : (v ?? '') },
        { key: 'fail', label: 'Fail', sortKey: 'fail', render: (v, r) => r.loading ? '…' : (v ?? '') },
        { key: 'skip', label: 'Skip', sortKey: 'skip', render: (v, r) => r.loading ? '…' : (v ?? '') },
        { key: 'total', label: 'Total', sortKey: 'total', render: (v, r) => r.loading ? '…' : (v ?? '') },
        { key: 'duration', label: 'Duration', sortKey: 'duration', render: (v, r) => r.loading ? '…' : Utils.renderStandardDurationCell(r.duration) }
      ],
      data: suiteData,
      idField: 'path',
      groupByValueGetters: {
        pathPrefix: (r) => r.pathPrefix || '(root)',
        status: (r) => r.status || 'empty'
      },
      getGroupCounts: (rows) => ({
        pass: rows.reduce((s, r) => s + (r.pass || 0), 0),
        fail: rows.reduce((s, r) => s + (r.fail || 0), 0),
        total: rows.reduce((s, r) => s + (r.total || 0), 0)
      }),
      onRowClick: (row) => row && onTestsetClick(row.path)
    });
    if (table) {
      document.getElementById('drilldown-table').appendChild(table.getElement());
      table.render();
    }

    const groupEl = document.getElementById('suite-group-by');
    groupEl?.addEventListener('change', () => {
      table?.setGroupBy(groupEl.value || null);
    });

    if (onBreadcrumbClick) {
      container.querySelectorAll('.drilldown-breadcrumb a.breadcrumb-link').forEach(a => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          onBreadcrumbClick(parseInt(a.dataset.index, 10));
        });
      });
    }
  }

  function renderClassesList(containerId, testsetPathVal, overview, classesWithStats, onClassClick, breadcrumb, onBreadcrumbClick, execDirVal) {
    const container = document.getElementById(containerId);
    if (!container) return;

    testsetPath = testsetPathVal;
    testsetOverview = overview;
    if (execDirVal) execDir = execDirVal;

    const pass = overview?.pass ?? 0;
    const fail = overview?.fail ?? 0;
    const skip = overview?.skip ?? 0;
    const total = overview?.total ?? 0;

    let html = breadcrumbHtml(breadcrumb, onBreadcrumbClick);
    html += '<div class="drilldown-header">';
    html += '<h2>' + Utils.escapeHtml(getDisplayName(testsetPath)) + '</h2>';
    html += statusBarHtml(pass, fail, skip, total);
    if (overview?.envInfo?.['run-parameters']?.['env.name']) {
      html += `<p class="env-info">Environment: ${Utils.escapeHtml(overview.envInfo['run-parameters']['env.name'])}</p>`;
    }
    html += '</div>';
    html += '<div class="table-placeholder" id="drilldown-table"></div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    const classData = classesWithStats.map(c => ({
      ...c,
      id: c.path,
      name: getDisplayName(c.path),
      status: getStatus(c.pass, c.fail, c.skip, c.total)
    }));

    const table = TableComponent.createTable('drilldown-table', {
      columns: [
        {
          key: 'name',
          label: 'Class / Feature',
          sortKey: 'name',
          value: (r) => getDisplayName(r.path),
          render: (v) => Utils.escapeHtml(v || '-')
        },
        {
          key: 'status',
          label: 'Status',
          sortKey: 'status',
          value: (r) => r.status,
          render: (v) => Utils.statusBadge(v)
        },
        { key: 'pass', label: 'Pass', sortKey: 'pass' },
        { key: 'fail', label: 'Fail', sortKey: 'fail' },
        { key: 'skip', label: 'Skip', sortKey: 'skip' },
        { key: 'total', label: 'Tests', sortKey: 'total' }
      ],
      data: classData,
      idField: 'path',
      onRowClick: (row) => row && onClassClick(row.path)
    });
    if (table) {
      document.getElementById('drilldown-table').appendChild(table.getElement());
      table.render();
    }
    if (onBreadcrumbClick) {
      container.querySelectorAll('.drilldown-breadcrumb a.breadcrumb-link').forEach(a => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          onBreadcrumbClick(parseInt(a.dataset.index, 10));
        });
      });
    }
  }

  function renderExecutionTestsets(containerId, execution, execMetaData, onTestsetClick) {
    const container = document.getElementById(containerId);
    if (!container) return;

    execDir = execution.dir;
    execMeta = execMetaData;
    const tests = execMeta?.tests || [];

    const pass = execMeta?.pass ?? 0;
    const fail = execMeta?.fail ?? 0;
    const skip = execMeta?.skip ?? 0;
    const total = execMeta?.total ?? 0;

    let html = '<div class="drilldown-header">';
    html += `<h2>${Utils.escapeHtml(execMeta?.name || execution.name)}</h2>`;
    html += statusBarHtml(pass, fail, skip, total);
    html += '</div>';

    html += '<div class="filters-placeholder" id="drilldown-filters"></div>';
    html += '<div class="table-placeholder" id="drilldown-table"></div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    const testsetData = tests.map((t, i) => ({
      id: t,
      name: t.split('/').pop() || t,
      path: t,
      index: i
    }));

    const table = TableComponent.createTable('drilldown-table', {
      columns: [
        { key: 'name', label: 'Suite', sortKey: 'name' },
        { key: 'path', label: 'Path', sortKey: 'path' }
      ],
      data: testsetData,
      idField: 'path',
      onRowClick: (row) => row && onTestsetClick(row.path)
    });
    if (table) {
      const tableEl = table.getElement();
      document.getElementById('drilldown-table').appendChild(tableEl);
      table.render();
    }
  }

  function renderTestsetClasses(containerId, testsetPathVal, overview, onClassClick) {
    const container = document.getElementById(containerId);
    if (!container) return;

    testsetPath = testsetPathVal;
    testsetOverview = overview;
    const classes = overview?.classes || [];

    let html = '<div class="drilldown-header">';
    html += `<h2>${Utils.escapeHtml(testsetPath.split('/').pop() || testsetPath)}</h2>`;
    html += statusBarHtml(overview?.pass ?? 0, overview?.fail ?? 0, overview?.skip ?? 0, overview?.total ?? 0);

    if (overview?.envInfo) {
      const env = overview.envInfo;
      const envName = env['run-parameters']?.['env.name'] || env['browser-desired-capabilities']?.['browserName'] || '';
      if (envName) html += `<p class="env-info">Environment: ${Utils.escapeHtml(envName)}</p>`;
    }
    html += '</div>';

    html += '<div class="filters-placeholder" id="drilldown-filters"></div>';
    html += '<div class="table-placeholder" id="drilldown-table"></div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    const classData = classes.map((c, i) => ({
      id: c,
      name: c.split('/').pop() || c,
      path: c,
      index: i
    }));

    const table = TableComponent.createTable('drilldown-table', {
      columns: [
        { key: 'name', label: 'Class / Feature', sortKey: 'name' },
        { key: 'path', label: 'Path', sortKey: 'path' }
      ],
      data: classData,
      idField: 'path',
      onRowClick: (row) => row && onClassClick(row.path)
    });
    if (table) {
      const tableEl = table.getElement();
      document.getElementById('drilldown-table').appendChild(tableEl);
      table.render();
    }
  }

  function groupMethodsByTest(methods) {
    const groups = new Map();
    methods.forEach((m, i) => {
      const key = m.metaData?.sign || (m.metaData?.testID || '') + '|' + (m.metaData?.name || m.name || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...m, _index: i });
    });
    return Array.from(groups.values()).map(runs => {
      const sorted = runs.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
      const primary = sorted[sorted.length - 1];
      const retries = sorted.slice(0, -1).reverse();
      return { primary, retries };
    });
  }

  function renderClassMethods(containerId, classPathVal, meta, onLoadResultFile, onGetScreenshotUrl, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, reports, currentReport, breadcrumb, onBreadcrumbClick) {
    const container = document.getElementById(containerId);
    if (!container) return;

    classPath = classPathVal;
    classMeta = meta;
    const methods = meta?.methods || [];
    const grouped = groupMethodsByTest(methods);

    const methodRows = grouped.map((g, i) => {
      const p = g.primary;
      return {
        id: `m-${i}-${p.metaData?.sessionID || i}`,
        ...p,
        retries: g.retries,
        _index: i,
        historyTimelineTrackHtml: '<span class="history-badge-loading">…</span>'
      };
    });

    const passCount = methodRows.filter(r => r.result === 'pass').length;
    const failCount = methodRows.filter(r => r.result === 'fail').length;
    const skipCount = methodRows.filter(r => r.result === 'skip').length;
    const totalCount = methodRows.length;

    let html = breadcrumbHtml(breadcrumb || [], onBreadcrumbClick);
    html += '<div class="drilldown-header">';
    html += '<h2>' + Utils.escapeHtml(getDisplayName(classPath)) + '</h2>';
    html += statusBarHtml(passCount, failCount, skipCount, totalCount);
    html += '</div>';

    html += '<div class="filters-placeholder" id="drilldown-filters">';
    html += '<div class="report-filters">';
    html += `<button class="report-filter-chip pass active" data-status="all" title="Show all"><span class="count">${totalCount}</span> All</button>`;
    html += `<button class="report-filter-chip pass" data-status="pass" title="Click: include → exclude → clear"><span class="count">${passCount}</span> Passed</button>`;
    html += `<button class="report-filter-chip fail" data-status="fail" title="Click: include → exclude → clear"><span class="count">${failCount}</span> Failed</button>`;
    html += `<button class="report-filter-chip skip" data-status="skip" title="Click: include → exclude → clear"><span class="count">${skipCount}</span> Skipped</button>`;
    html += '</div></div>';
    html += '<div class="table-placeholder" id="drilldown-table"></div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    const getScreenshotUrl = (typeof onGetScreenshotUrl === 'function' ? onGetScreenshotUrl : () => null);

    const table = TableComponent.createTable('drilldown-table', {
      columns: [
        {
          key: 'testID',
          label: 'Test ID',
          sortKey: 'testID',
          value: (r) => r.metaData?.testID
        },
        {
          key: 'result',
          label: 'Status',
          sortKey: 'result',
          render: (v) => Utils.statusBadge(v)
        },
        {
          key: 'historyTimeline',
          label: 'History',
          sortKey: 'startTime',
          value: (r) => r.startTime,
          render: (v, row) => row.historyTimelineTrackHtml || '<span class="history-timeline-empty">—</span>'
        },
        {
          key: 'name',
          label: 'Name',
          sortKey: 'name',
          value: (r) => r.metaData?.name || r.name,
          render: (v) => Utils.escapeHtml(v || '-')
        },
        {
          key: 'failureReason',
          label: 'Failure reason',
          sortKey: 'failureReason',
          value: (r) => r.failureReason,
          render: (v, row) => {
            if (row.result === 'pass') return '-';
            if (row.failureReason === undefined) return '<span class="failure-reason-placeholder">—</span>';
            if (!row.failureReason) return '-';
            const cls = row.result === 'fail' ? 'failure-reason-text fail' : 'failure-reason-text skip';
            return '<span class="' + cls + '" title="' + Utils.escapeHtml(row.failureReason) + '">' + Utils.escapeHtml(row.failureReason) + '</span>';
          }
        },
        {
          key: 'startTime',
          label: 'Start',
          sortKey: 'startTime',
          value: (r) => r.startTime,
          render: (v) => Utils.formatExecutionSortDateTime(v)
        },
        {
          key: 'duration',
          label: 'Duration',
          sortKey: 'duration',
          value: (r) => r.duration,
          render: (v, r) => (r.loading ? '…' : Utils.renderStandardDurationCell(r.duration))
        }
      ],
      data: methodRows,
      idField: 'id',
      searchFields: [
        (r) => r.metaData?.name,
        (r) => r.metaData?.testID,
        (r) => r.failureReason,
        (r) => {
          const md = r.metaData || {};
          return ['author', 'Feature', 'module', 'platform', 'type', 'priority', 'reference']
            .map(k => md[k])
            .filter(Boolean)
            .map(v => Array.isArray(v) ? v.join(' ') : String(v))
            .join(' ');
        }
      ],
      sortable: true,
      pageSize: 25,
      expandableRow: (row) => '<div class="expand-content" data-expand-parent="' + Utils.escapeHtml(row.id) + '"><div class="expand-loading">Loading checkpoints...</div></div>',
      onExpand: (row, container) => {
        (async () => {
          const formats = typeof Utils.loadMetadataFormats === 'function' ? await Utils.loadMetadataFormats() : null;
          const renderContent = (data) => {
            const err = data?.errorTrace || data?.errorMessage;
            if (row.result === 'fail' || row.result === 'skip') row.failureReason = err ? Utils.formatFailureReason(err) : '';
            removeOrphanMethodMetaBubbles();
            container.innerHTML = renderMethodDetail(row, data, getScreenshotUrl, onLoadResultFile, onLoadHistory, reports, formats);
            bindMethodDetailTabs(container);
            bindCheckpointExpand(container);
            bindScreenshotClicks(container);
            bindAttachmentLinks(container);
            bindMethodDetailMetaPopover(container);
            bindRetryExpand(container, row, onLoadResultFile, getScreenshotUrl);
            bindHistoryTab(container, row, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, classPathVal);
          };
          if (row._loadedResultData) {
            renderContent(row._loadedResultData);
            return;
          }
          onLoadResultFile(row).then((result) => {
            const data = result?.data ?? result;
            if (!data) {
              const rfn = row?.metaData?.resultFileName;
              const dir = result?.attemptedDir ? ` Looked in: ${Utils.escapeHtml(result.attemptedDir)}` : '';
              const hint = rfn ? ` (resultFileName: ${Utils.escapeHtml(rfn)}.json)` : '';
              container.innerHTML = '<p class="expand-error">Failed to load result file.' + hint + dir + '</p>';
              return;
            }
            row._loadedResultData = data;
            renderContent(data);
            table.setData(methodRows);
          }).catch(() => {
            container.innerHTML = '<p class="expand-error">Failed to load checkpoints.</p>';
          });
        })();
      }
    });

    if (table) {
      const filtersContainer = document.getElementById('drilldown-filters');
      if (filtersContainer) {
        const searchWrap = document.createElement('div');
        searchWrap.className = 'filters-bar';
        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search by name or Test ID...';
        input.className = 'filter-input';
        input.addEventListener('input', Utils.debounce(() => table.setSearch(input.value), 200));
        searchWrap.appendChild(input);
        filtersContainer.appendChild(searchWrap);

        const chipFilterState = { pass: null, fail: null, skip: null };
        function applyChipFilter() {
          const inc = Object.entries(chipFilterState).filter(([, v]) => v === 'include').map(([k]) => k);
          const exc = Object.entries(chipFilterState).filter(([, v]) => v === 'exclude').map(([k]) => k);
          if (inc.length === 0 && exc.length === 0) {
            table.setFilter('status', null);
          } else {
            table.setFilter('status', (row) => {
              if (inc.length > 0 && !inc.includes(row.result)) return false;
              if (exc.length > 0 && exc.includes(row.result)) return false;
              return true;
            });
          }
        }
        function updateChipStates() {
          const hasAny = Object.values(chipFilterState).some(Boolean);
          filtersContainer.querySelector('.report-filter-chip[data-status="all"]')?.classList.toggle('active', !hasAny);
          filtersContainer.querySelectorAll('.report-filter-chip[data-status]').forEach((c) => {
            if (c.dataset.status === 'all') return;
            const v = chipFilterState[c.dataset.status];
            c.classList.remove('chip-include', 'chip-exclude');
            if (v === 'include') c.classList.add('chip-include');
            else if (v === 'exclude') c.classList.add('chip-exclude');
          });
        }
        filtersContainer.querySelectorAll('.report-filter-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            const status = chip.dataset.status;
            if (status === 'all') {
              Object.keys(chipFilterState).forEach((k) => { chipFilterState[k] = null; });
            } else if (chipFilterState[status] !== undefined) {
              const next = chipFilterState[status] === null ? 'include' : chipFilterState[status] === 'include' ? 'exclude' : null;
              chipFilterState[status] = next;
            }
            updateChipStates();
            applyChipFilter();
          });
        });
      }

      const tableContainer = document.getElementById('drilldown-table');
      if (tableContainer) {
        const tableEl = table.getElement();
        tableContainer.appendChild(tableEl);
        table.render();
      }

      /* Preload history badges (P-P-F-P-P) */
      const toLoadHistory = methodRows.filter(r => r.metaData?.testID && onLoadHistory);
      if (toLoadHistory.length) {
        Promise.allSettled(toLoadHistory.map(row => onLoadHistory(row.metaData.testID))).then(results => {
          results.forEach((settled, i) => {
            const row = toLoadHistory[i];
            if (!row) return;
            const history = settled.status === 'fulfilled' ? settled.value : [];
            row.historyTimeline = Utils.buildHistoryTimeline(row, history, currentReport);
            row.historyTimelineTrackHtml = Utils.renderHistoryTimelineTrack(row.historyTimeline);
          });
          table.setData(methodRows);
        });
      }

      container._qafTestCasesForHistory = methodRows;

      if (onBreadcrumbClick) {
        container.querySelectorAll('.drilldown-breadcrumb a.breadcrumb-link').forEach(a => {
          a.addEventListener('click', (e) => {
            e.preventDefault();
            onBreadcrumbClick(parseInt(a.dataset.index, 10));
          });
        });
      }
    }
  }

  /**
   * Non-screenshot files (video, trace, etc.) — paths relative to class dir, same as checkpoint screenshots.
   */
  function renderAttachmentSection(data, getClassRelativeUrl) {
    const list = data?.attachments;
    if (!list || !list.length) return '';
    let html = '<div class="method-detail-attachments">';
    html += '<h4 class="method-section-title">Attachments</h4>';
    html += '<ul class="method-attachment-list">';
    list.forEach((att) => {
      if (!att || !att.path) return;
      const url = typeof getClassRelativeUrl === 'function' ? getClassRelativeUrl(att.path) : null;
      if (!url) return;
      const label = att.name || att.path;
      const ct = att.contentType || '';
      html += '<li class="method-attachment-item">';
      html += '<a href="' + Utils.escapeHtml(url) + '" class="method-attachment-link" target="_blank" rel="noopener">' + Utils.escapeHtml(label) + '</a>';
      if (ct) html += ' <span class="method-attachment-type">' + Utils.escapeHtml(ct) + '</span>';
      html += '</li>';
    });
    html += '</ul></div>';
    return html;
  }

  /** Result tab: attachments + steps / command log / empty state */
  function renderResultTabContent(row, data, getScreenshotUrl) {
    let html = '';
    html += renderAttachmentSection(data, getScreenshotUrl);
    const checkPoints = data?.checkPoints || data?.checkpoints;
    const seleniumLog = data?.seleniumLog;
    const result = row.result || 'unknown';
    if (checkPoints?.length) {
      html += '<div class="method-detail-steps">';
      html += '<h4 class="method-section-title">Steps</h4>';
      html += renderCheckPoints(checkPoints, getScreenshotUrl);
      html += '</div>';
    } else if (seleniumLog?.length) {
      html += '<div class="method-detail-steps">';
      html += '<h4 class="method-section-title">Command Log</h4>';
      html += renderSeleniumLog(seleniumLog);
      html += '</div>';
    } else {
      const hasAttachments = data?.attachments?.length;
      if (!hasAttachments) {
        html += '<div class="method-detail-steps">';
        const err = data?.errorTrace || data?.errorMessage;
        const alreadyShownAbove = (result === 'fail' || result === 'skip') && err;
        if (err && !alreadyShownAbove) {
          html += '<h4 class="method-section-title">Exception</h4>';
          html += '<pre class="error-trace">' + Utils.escapeHtml(String(err)) + '</pre>';
        } else {
          html += '<p class="expand-empty">' + (alreadyShownAbove ? 'No steps or command logs. See failure reason above.' : 'No steps or command logs available.') + '</p>';
        }
        html += '</div>';
      }
    }
    return html;
  }

  function bindAttachmentLinks(container) {
    container.querySelectorAll('.method-attachment-link').forEach((a) => {
      a.addEventListener('click', async (e) => {
        const pathOrUrl = a.getAttribute('href');
        if (!pathOrUrl) return;
        if (typeof DataLoader !== 'undefined' && DataLoader.isFileApi && DataLoader.isFileApi()) {
          e.preventDefault();
          const blobUrl = await DataLoader.getFileBlobUrl(pathOrUrl);
          if (blobUrl) window.open(blobUrl, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }

  function metaKeyHasFormatter(formats, key) {
    return !!(formats && typeof formats === 'object' && typeof formats[key] === 'string' && formats[key].trim().length > 0);
  }

  function isMetaRawValueEmpty(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0 || v.every(isMetaRawValueEmpty);
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  }

  /** True when formatted HTML has no visible text (strips tags / nbsp). */
  function isMetaDisplayHtmlEmpty(html) {
    if (html == null) return true;
    const s = String(html)
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return s === '';
  }

  /**
   * Case-insensitive: hidden from inline chip row only (bubble shows full metaData except `name`).
   */
  const METHOD_META_KEYS_EXCLUDE_INLINE_LOWER = new Set([
    'sign',
    'resultfilename',
    'reference',
    'lineno',
    'enabled',
    'feature'
  ]);

  function isMethodMetaKeyExcludedFromInline(key) {
    if (key == null) return false;
    return METHOD_META_KEYS_EXCLUDE_INLINE_LOWER.has(String(key).toLowerCase());
  }

  /**
   * Ordered rows for method header chips (forBubble false) or metadata bubble (forBubble true).
   * Bubble includes every meta key except `name` (duplicates title). Chips omit keys in
   * METHOD_META_KEYS_EXCLUDE_INLINE_LOWER plus noisy/internal fields above.
   * @returns {{ label: string, valueHtml: string, chipKind: 'duration'|'start'|'meta' }[]}
   */
  function collectMethodDetailMetaRows(row, formats, forBubble) {
    const md = row.metaData || {};
    const labelKeys = ['author', 'Feature', 'module', 'platform', 'type', 'priority', 'reference'];
    const labelMap = {
      author: 'Author',
      Feature: 'Feature',
      module: 'Module',
      platform: 'Platform',
      type: 'Type',
      priority: 'Priority',
      reference: 'Reference'
    };
    const skip = new Set(labelKeys);
    skip.add('name');
    if (md.testID) skip.add('testID');

    const entries = [];

    if (!isMetaRawValueEmpty(md.testID)) {
      entries.push({
        key: 'testID',
        title: 'Test ID',
        valueHtml: Utils.formatMetadataDisplay(formats, 'testID', md.testID),
        hasFmt: metaKeyHasFormatter(formats, 'testID')
      });
    }

    labelKeys.forEach((k) => {
      if (!forBubble && isMethodMetaKeyExcludedFromInline(k)) return;
      const v = md[k];
      if (isMetaRawValueEmpty(v)) return;
      entries.push({
        key: k,
        title: labelMap[k] || k,
        valueHtml: Utils.formatMetadataDisplay(formats, k, v),
        hasFmt: metaKeyHasFormatter(formats, k)
      });
    });

    Object.keys(md)
      .sort()
      .forEach((k) => {
        if (skip.has(k)) return;
        if (!forBubble && isMethodMetaKeyExcludedFromInline(k)) return;
        const v = md[k];
        if (isMetaRawValueEmpty(v)) return;
        entries.push({
          key: k,
          title: k,
          valueHtml: Utils.formatMetadataDisplay(formats, k, v),
          hasFmt: metaKeyHasFormatter(formats, k)
        });
      });

    entries.sort((a, b) => {
      const pri = Number(b.hasFmt) - Number(a.hasFmt);
      if (pri !== 0) return pri;
      return a.key.localeCompare(b.key);
    });

    const entriesFiltered = entries.filter((e) => !isMetaDisplayHtmlEmpty(e.valueHtml));

    const rows = [];
    if (row.duration != null && !isNaN(Number(row.duration))) {
      const durHtml = Utils.renderStandardDurationCell(row.duration);
      if (!isMetaDisplayHtmlEmpty(durHtml)) {
        rows.push({ label: 'Duration', valueHtml: durHtml, chipKind: 'duration' });
      }
    }
    if (row.startTime != null && String(Utils.formatExecutionSortDateTime(row.startTime)).trim() !== '') {
      rows.push({
        label: 'Start',
        valueHtml: Utils.escapeHtml(Utils.formatExecutionSortDateTime(row.startTime)),
        chipKind: 'start'
      });
    }
    entriesFiltered.forEach((e) => {
      rows.push({ label: e.title, valueHtml: e.valueHtml, chipKind: 'meta' });
    });
    return rows;
  }

  function buildMethodDetailMetaRowInnerHtml(row, formats) {
    const t = (s) => Utils.escapeHtml(String(s));
    return collectMethodDetailMetaRows(row, formats, false)
      .map((r) => {
        const open =
          '<span class="method-meta-tag method-meta-item" title="' + t(r.label) + '"><span class="method-meta-tag-inner">';
        const close = '</span></span>';
        if (r.chipKind === 'duration') {
          return open + '<span class="method-meta-duration">' + r.valueHtml + '</span>' + close;
        }
        return open + '<span class="method-meta-value-inline">' + r.valueHtml + '</span>' + close;
      })
      .join('');
  }

  function buildMethodMetadataBubbleInnerHtml(row, formats) {
    const rows = collectMethodDetailMetaRows(row, formats, true);
    if (!rows.length) return '';
    let h = '<div class="method-detail-meta-bubble-tags">';
    rows.forEach((r) => {
      h +=
        '<div class="method-meta-bubble-tag">' +
        '<span class="method-meta-bubble-tag-k">' +
        Utils.escapeHtml(r.label) +
        '</span>' +
        '<span class="method-meta-bubble-tag-v">' +
        r.valueHtml +
        '</span>' +
        '</div>';
    });
    h += '</div>';
    return h;
  }

  /** Popover may be reparented to body; remove leftovers so they do not cover the UI after re-render. */
  function removeOrphanMethodMetaBubbles() {
    document.querySelectorAll('body > .method-detail-meta-bubble').forEach((el) => el.remove());
  }

  function bindMethodDetailMetaPopover(container) {
    const wrap = container.querySelector('.method-detail-meta-wrap');
    if (!wrap) return;
    const flow = wrap.querySelector('.method-detail-meta-flow');
    const btn = wrap.querySelector('.method-detail-meta-more');
    const bubble = wrap.querySelector('.method-detail-meta-bubble');
    if (!flow || !btn || !bubble) return;

    let keydownClose;
    let winResizeReposition;
    let showTimer;
    let hideTimer;
    const hoverMs = 140;
    const hideDelayMs = 200;

    function clearHoverTimers() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    }

    function scheduleHide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => closeBubble(), hideDelayMs);
    }

    function closeBubble() {
      clearHoverTimers();
      bubble.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (bubble.id) btn.removeAttribute('aria-describedby');
      if (bubble.parentElement === document.body) {
        if (wrap.isConnected) wrap.appendChild(bubble);
        else bubble.remove();
      }
      if (keydownClose) {
        document.removeEventListener('keydown', keydownClose);
        keydownClose = null;
      }
      if (winResizeReposition) {
        window.removeEventListener('resize', winResizeReposition);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', winResizeReposition);
          window.visualViewport.removeEventListener('scroll', winResizeReposition);
        }
        winResizeReposition = null;
      }
    }

    function openBubble() {
      if (bubble.parentElement !== document.body) document.body.appendChild(bubble);
      bubble.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (bubble.id) btn.setAttribute('aria-describedby', bubble.id);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          positionBubble();
        });
      });
      keydownClose = (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          closeBubble();
        }
      };
      document.addEventListener('keydown', keydownClose);
      winResizeReposition = () => {
        if (!bubble.hidden) positionBubble();
      };
      window.addEventListener('resize', winResizeReposition);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', winResizeReposition);
        window.visualViewport.addEventListener('scroll', winResizeReposition);
      }
    }

    function positionBubble() {
      const margin = 10;
      const vv = window.visualViewport;
      const vScopeLeft = vv ? vv.offsetLeft : 0;
      const vScopeTop = vv ? vv.offsetTop : 0;
      const vW = vv ? vv.width : window.innerWidth;
      const vH = vv ? vv.height : window.innerHeight;
      const useW = Math.max(200, Math.floor(vW - margin * 2));

      bubble.style.boxSizing = 'border-box';
      bubble.style.width = useW + 'px';
      bubble.style.maxWidth = useW + 'px';
      const br = btn.getBoundingClientRect();
      const left = vScopeLeft + margin;
      bubble.style.left = left + 'px';
      bubble.style.right = 'auto';

      const gap = 6;
      let top = br.bottom + gap;
      bubble.style.top = top + 'px';
      bubble.style.maxHeight = Math.max(120, vScopeTop + vH - margin - top) + 'px';

      let r = bubble.getBoundingClientRect();
      if (r.bottom > vScopeTop + vH - margin) {
        top = br.top - r.height - gap;
        bubble.style.top = Math.max(vScopeTop + margin, top) + 'px';
        r = bubble.getBoundingClientRect();
      }
      if (r.top < vScopeTop + margin) {
        top = vScopeTop + margin;
        bubble.style.top = top + 'px';
        bubble.style.maxHeight = Math.max(100, vScopeTop + vH - margin - top) + 'px';
      } else if (r.bottom > vScopeTop + vH - margin) {
        bubble.style.maxHeight = Math.max(100, vScopeTop + vH - margin - r.top) + 'px';
      }
    }

    function updateOverflowHint() {
      if (!bubble.hidden) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const needsMore = flow.scrollWidth > flow.clientWidth + 2;
          btn.hidden = !needsMore;
        });
      });
    }

    function onBtnEnter() {
      clearHoverTimers();
      showTimer = setTimeout(() => {
        const tags = bubble.querySelector('.method-detail-meta-bubble-tags');
        if (!tags || !tags.children.length) return;
        openBubble();
      }, hoverMs);
    }

    function onBtnLeave() {
      clearTimeout(showTimer);
      scheduleHide();
    }

    function onBubbleEnter() {
      clearHoverTimers();
    }

    function onBubbleLeave() {
      scheduleHide();
    }

    const canHover = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (canHover) {
      btn.addEventListener('mouseenter', onBtnEnter);
      btn.addEventListener('mouseleave', onBtnLeave);
      bubble.addEventListener('mouseenter', onBubbleEnter);
      bubble.addEventListener('mouseleave', onBubbleLeave);
      btn.addEventListener('focus', () => {
        clearHoverTimers();
        const tags = bubble.querySelector('.method-detail-meta-bubble-tags');
        if (!tags || !tags.children.length) return;
        openBubble();
      });
      btn.addEventListener('blur', () => {
        setTimeout(() => {
          const ae = document.activeElement;
          if (bubble.contains(ae) || ae === btn) return;
          scheduleHide();
        }, 0);
      });
    } else {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tags = bubble.querySelector('.method-detail-meta-bubble-tags');
        if (!tags || !tags.children.length) return;
        if (!bubble.hidden) closeBubble();
        else openBubble();
      });
    }

    bubble.addEventListener('focusout', () => {
      setTimeout(() => {
        if (bubble.hidden) return;
        const ae = document.activeElement;
        if (!bubble.contains(ae) && ae !== btn) closeBubble();
      }, 0);
    });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (bubble.hidden) updateOverflowHint();
        else positionBubble();
      });
      ro.observe(flow);
    }

    updateOverflowHint();
  }

  function renderMethodDetail(row, data, getScreenshotUrl, onLoadResultFile, onLoadHistory, reports, formats) {
    const md = row.metaData || {};
    const name = md.name || row.name || 'Test';
    const result = row.result || 'unknown';
    const retries = row.retries || [];

    let html = '<div class="method-detail qaf-style">';

    /* Header: name, status; single-line meta chips + … popover when clipped */
    html += '<div class="method-detail-header">';
    html += '<div class="method-detail-title-row">';
    html += '<h3 class="method-detail-name">' + Utils.escapeHtml(name) + '</h3>';
    html += Utils.statusBadge(result);
    if (retries.length > 0) html += '<span class="retry-badge">' + retries.length + ' retr' + (retries.length === 1 ? 'y' : 'ies') + '</span>';
    html += '</div>';
    const metaInner = buildMethodDetailMetaRowInnerHtml(row, formats);
    if (metaInner) {
      const bubbleBody = buildMethodMetadataBubbleInnerHtml(row, formats);
      const bubbleDomId = 'mmb-' + String(row.id != null ? row.id : 'row').replace(/[^a-zA-Z0-9_-]/g, '_');
      html += '<div class="method-detail-meta-wrap">';
      html +=
        '<div class="method-detail-meta-row method-detail-meta-flow method-detail-meta-flow--clamped">' +
        metaInner +
        '</div>';
      html +=
        '<button type="button" class="method-detail-meta-more" aria-expanded="false" aria-label="All metadata" title="Hover for all metadata" hidden>' +
        '<span class="method-detail-meta-more-icon" aria-hidden="true">…</span>' +
        '</button>';
      html +=
        '<div class="method-detail-meta-bubble" id="' +
        Utils.escapeHtml(bubbleDomId) +
        '" hidden role="tooltip">' +
        '<div class="method-detail-meta-bubble-inner">' +
        (bubbleBody || '') +
        '</div></div>';
      html += '</div>';
    }
    html += '</div>';

    /* Failure/Skip reason - when not passed */
    const errorTrace = data?.errorTrace || data?.errorMessage;
    if ((result === 'fail' || result === 'skip') && errorTrace) {
      html += '<div class="method-detail-failure">';
      html += '<details class="failure-details ' + result + '"><summary class="failure-summary">' + (result === 'fail' ? 'Failure' : 'Skip') + ' reason</summary><pre class="error-trace">' + Utils.escapeHtml(String(errorTrace)) + '</pre></details>';
      html += '</div>';
    }

    const testID = md.testID;
    const hasPreloadedHistory =
      typeof onLoadHistory === 'function' &&
      Array.isArray(row.fullHistoryEntries) &&
      row.fullHistoryEntries.length > 0;
    const showHistoryTab =
      testID &&
      typeof onLoadHistory === 'function' &&
      (reports?.length > 1 || hasPreloadedHistory);

    /* Tabs: Result + Retries (when present) + History */
    html += '<div class="method-detail-tabs">';
    html += '<div class="method-detail-tab-list" role="tablist">';
    html += '<button class="method-detail-tab active" role="tab" data-tab="result" aria-selected="true">Result</button>';
    if (retries.length > 0) {
      html += '<button class="method-detail-tab" role="tab" data-tab="retries" aria-selected="false">Retries (' + retries.length + ')</button>';
    }
    if (showHistoryTab) {
      html += '<button class="method-detail-tab" role="tab" data-tab="history" aria-selected="false">History</button>';
    }
    html += '</div>';

    /* Tab panel: Result */
    html += '<div class="method-detail-tab-panel active" data-panel="result" role="tabpanel">';
    html += renderResultTabContent(row, data, getScreenshotUrl);
    html += '</div>';

    /* Tab panel: Retries */
    if (retries.length > 0) {
      html += '<div class="method-detail-tab-panel" data-panel="retries" role="tabpanel" hidden>';
      html += '<div class="retries-list">';
      retries.forEach((retry, idx) => {
        const retryId = 'retry-' + row.id + '-' + idx;
        html += '<div class="retry-item" data-retry-id="' + retryId + '">';
        html += '<div class="retry-header" data-retry-index="' + idx + '">';
        html += '<span class="retry-expand">▶</span>';
        html += Utils.statusBadge(retry.result || 'unknown');
        html += '<span class="retry-meta">';
        if (retry.duration != null) html += Utils.renderStandardDurationCell(retry.duration);
        if (retry.startTime != null) {
          html += ' <span class="retry-start-dt">' + Utils.escapeHtml(Utils.formatExecutionSortDateTime(retry.startTime)) + '</span>';
        }
        html += '</span>';
        html += '</div>';
        html += '<div class="retry-body" id="' + retryId + '" style="display:none"><div class="retry-loading">Loading...</div></div>';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    }

    /* Tab panel: History */
    if (showHistoryTab) {
      html += '<div class="method-detail-tab-panel" data-panel="history" role="tabpanel" hidden>';
      html += '<div class="history-panel" data-test-id="' + Utils.escapeHtml(testID) + '"></div>';
      html += '</div>';
    }

    html += '</div></div>';
    return html;
  }

  function checkpointStatusFromType(type) {
    if (!type) return 'info';
    const t = String(type).toLowerCase();
    if (t.includes('pass') || t === 'pass') return 'pass';
    if (t.includes('fail') || t === 'fail') return 'fail';
    return 'info';
  }

  function renderCheckPoints(checkPoints, getScreenshotUrl, parentPath = '') {
    if (!checkPoints?.length) return '';
    const depth = parentPath ? parentPath.split('-').length - 1 : 0;
    let html = '<div class="checkpoints' + (depth > 0 ? ' checkpoint-children' : '') + '">';
    checkPoints.forEach((cp, i) => {
      const status = checkpointStatusFromType(cp.type);
      const hasSub = cp.subCheckPoints && cp.subCheckPoints.length > 0;
      const cpId = parentPath ? parentPath + '-' + i : 'cp-' + i;
      const screenshotUrl = (cp.screenshot && cp.screenshot.trim()) ? getScreenshotUrl(cp.screenshot) : null;

      html += '<div class="checkpoint" data-depth="' + depth + '" data-status="' + status + '">';
      html += '<div class="checkpoint-header' + (hasSub ? ' has-children' : '') + '" data-cp-id="' + cpId + '">';
      html += '<span class="checkpoint-status-icon status-' + status + '">' + (status === 'pass' ? '✓' : status === 'fail' ? '✗' : '○') + '</span>';
      const msg = cp.message || '';
      const placeholders = [];
      const noLinks = msg.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, text) => {
        const ph = '__LINK_' + placeholders.length + '__';
        placeholders.push({ ph, url, text });
        return ph;
      });
      let safeMsg = Utils.escapeHtml(noLinks);
      placeholders.forEach(({ ph, url, text }) => {
        safeMsg = safeMsg.replace(ph, '<a href="' + Utils.escapeHtml(url) + '" target="_blank" rel="noopener">' + Utils.escapeHtml(text.trim()) + '</a>');
      });
      html += '<span class="checkpoint-message">' + safeMsg + '</span>';
      if (hasSub) {
        html += '<span class="checkpoint-expand" data-expand-for="' + cpId + '">▶</span>';
      }
      if (screenshotUrl) {
        html += '<a href="' + Utils.escapeHtml(screenshotUrl) + '" target="_blank" class="checkpoint-screenshot" title="View screenshot">Screenshot</a>';
      }
      if (cp.duration != null && cp.duration > 0) {
        html += '<span class="checkpoint-duration">' + Utils.formatDuration(cp.duration) + '</span>';
      }
      html += '</div>';
      if (hasSub) {
        html += '<div class="checkpoint-children-wrap" id="' + cpId + '" style="display:none">';
        html += renderCheckPoints(cp.subCheckPoints, getScreenshotUrl, cpId);
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function bindMethodDetailTabs(container) {
    const tabList = container.querySelector('.method-detail-tab-list');
    if (!tabList) return;
    tabList.querySelectorAll('.method-detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        tabList.querySelectorAll('.method-detail-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.tab === tabId);
          t.setAttribute('aria-selected', t.dataset.tab === tabId);
        });
        container.querySelectorAll('.method-detail-tab-panel').forEach(panel => {
          const isActive = panel.dataset.panel === tabId;
          panel.classList.toggle('active', isActive);
          panel.hidden = !isActive;
        });
      });
    });
  }

  function getAnalysedStatus(history) {
    if (!history?.length) return null;
    const hasPass = history.some(h => h.method?.result === 'pass');
    const hasFail = history.some(h => h.method?.result === 'fail');
    if (!hasPass && !hasFail) return 'Pending';
    const chronological = [...history].sort((a, b) => (a.method?.startTime || 0) - (b.method?.startTime || 0));
    const results = chronological.map(h => h.method?.result);
    let transitions = 0;
    for (let i = 1; i < results.length; i++) {
      const curr = results[i];
      const prev = results[i - 1];
      if ((curr === 'pass' || curr === 'fail') && (prev === 'pass' || prev === 'fail') && curr !== prev) transitions++;
    }
    const last = history[0]?.method?.result;
    if (transitions >= 2) return 'Unstable';
    if (last === 'pass' && hasFail) return 'Fixed';
    if (last === 'fail' && hasPass) return 'Broken';
    return null;
  }

  function bindHistoryTab(container, row, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, classPath) {
    const historyTab = container.querySelector('.method-detail-tab[data-tab="history"]');
    const historyPanel = container.querySelector('.method-detail-tab-panel[data-panel="history"]');
    if (!historyTab || !historyPanel || !onLoadHistory) return;
    const testID = row.metaData?.testID;
    if (!testID) return;

    function renderHistoryList(panel, historySlice) {
      let html = '<div class="history-list">';
      historySlice.forEach((h, idx) => {
        const report = h.report;
        const method = h.method;
        const parts = [report?.name || report?.dir || 'Unknown'];
        if (h.testsetPath) parts.push(getDisplayName(h.testsetPath));
        if (classPath) parts.push(getDisplayName(classPath));
        if (method.metaData?.testID) parts.push(method.metaData.testID);
        const breadcrumb = parts.join(' > ');
        const isFailed = method.result === 'fail' || method.result === 'skip';
        const rawFail = method.errorTrace || method.errorMessage || '';
        let failureReason = h.failureReason || '';
        if (isFailed && !failureReason && rawFail) failureReason = Utils.formatFailureReason(rawFail);
        html += '<div class="history-item" data-history-index="' + idx + '">';
        html += '<div class="history-item-header">';
        html += '<span class="history-expand">▶</span>';
        html += Utils.statusBadge(method.result || 'unknown');
        html += '<div class="history-item-info">';
        if (isFailed) html += '<div class="history-failure-reason" data-history-index="' + idx + '">' + Utils.escapeHtml(failureReason) + '</div>';
        html += '<span class="history-item-name">' + Utils.escapeHtml(breadcrumb) + '</span>';
        html += '</div>';
        html += '<span class="history-item-meta">';
        html += Utils.renderStandardDurationCell(method.duration);
        if (method.startTime != null) {
          html +=
            ' <span class="history-item-dt">' +
            Utils.escapeHtml(Utils.formatExecutionSortDateTime(method.startTime)) +
            '</span>';
        }
        html += '</span>';
        html += '</div>';
        html += '<div class="history-item-body" style="display:none"><div class="history-loading-item">Loading...</div></div>';
        html += '</div>';
      });
      html += '</div>';
      panel.innerHTML = html;
      bindHistoryItemExpand(panel, historySlice, onLoadHistoryItemResult, getScreenshotUrlFor, classPath, row);
      if (onLoadHistoryItemResult) {
        historySlice.forEach((h, idx) => {
          if (h.method?.result !== 'fail' && h.method?.result !== 'skip') return;
          if (h.failureReason) return;
          const el = panel.querySelector('.history-failure-reason[data-history-index="' + idx + '"]');
          if (!el) return;
          const execDir = h.report?.dir;
          const testsetPath = h.testsetPath;
          const resultFileName = h.method?.metaData?.resultFileName;
          onLoadHistoryItemResult(execDir, testsetPath, classPath, resultFileName).then((result) => {
            const data = result?.data ?? result;
            const errorTrace = data?.errorTrace || data?.errorMessage;
            const reason = errorTrace ? Utils.formatFailureReason(errorTrace) : '';
            if (reason && el.parentNode) el.textContent = reason;
          }).catch(() => {});
        });
      }
    }

    historyTab.addEventListener('click', () => {
      const panelBody = historyPanel.querySelector('.history-panel');
      if (!panelBody || panelBody.dataset.loaded === 'true') return;
      panelBody.dataset.loaded = 'true';
      panelBody.innerHTML = '<div class="history-loading">Loading past executions...</div>';
      onLoadHistory(testID).then((history) => {
        if (!history?.length) {
          panelBody.innerHTML = '<p class="expand-empty">No past executions found for this test.</p>';
          return;
        }
        const analysedStatus = getAnalysedStatus(history);
        let html = '';
        if (analysedStatus) {
          html += '<div class="history-analysed-status"><span class="history-analysed-label">Trend:</span> ' + Utils.analysisBadge(analysedStatus) + '</div>';
        }
        panelBody.innerHTML = html;
        const holder = document.createElement('div');
        renderHistoryList(holder, history);
        while (holder.firstChild) panelBody.appendChild(holder.firstChild);
      }).catch(() => {
        panelBody.innerHTML = '<p class="expand-error">Failed to load history.</p>';
      });
    });
  }
  function bindHistoryItemExpand(panelBody, history, onLoadHistoryItemResult, getScreenshotUrlFor, classPath, row) {
    if (!onLoadHistoryItemResult || !getScreenshotUrlFor) return;
    panelBody.querySelectorAll('.history-item-header').forEach((header) => {
      header.addEventListener('click', () => {
        const itemEl = header.closest('.history-item');
        const idx = parseInt(itemEl?.dataset?.historyIndex, 10);
        const bodyEl = itemEl?.querySelector('.history-item-body');
        const expandEl = header.querySelector('.history-expand');
        if (!bodyEl || idx < 0 || idx >= history.length) return;
        const h = history[idx];
        const isHidden = bodyEl.style.display === 'none';
        bodyEl.style.display = isHidden ? 'block' : 'none';
        if (expandEl) expandEl.textContent = isHidden ? '▼' : '▶';
        if (isHidden && bodyEl.querySelector('.history-loading-item')) {
          const execDir = h.report?.dir;
          const testsetPath = h.testsetPath;
          const resultFileName = h.method?.metaData?.resultFileName;
          onLoadHistoryItemResult(execDir, testsetPath, classPath, resultFileName).then((result) => {
            const data = result?.data ?? result;
            if (!data) {
              bodyEl.innerHTML = '<p class="expand-error">No result file.</p>';
              return;
            }
            const getScreenshotUrl = getScreenshotUrlFor(execDir, h.testsetPath || row?.testsetPath || testsetPath, classPath);
            const checkPoints = data?.checkPoints || data?.checkpoints;
            const seleniumLog = data?.seleniumLog;
            const errorTrace = data?.errorTrace || data?.errorMessage;
            const resultStatus = h.method?.result || 'unknown';
            let content = renderAttachmentSection(data, getScreenshotUrl);
            if (checkPoints?.length) {
              content += '<div class="method-detail-steps"><h4 class="method-section-title">Steps</h4>';
              content += renderCheckPoints(checkPoints, getScreenshotUrl);
              content += '</div>';
            } else if (seleniumLog?.length) {
              content += '<div class="method-detail-steps"><h4 class="method-section-title">Command Log</h4>';
              content += renderSeleniumLog(seleniumLog);
              content += '</div>';
            }
            if ((resultStatus === 'fail' || resultStatus === 'skip') && errorTrace) {
              content += '<div class="method-detail-failure">';
              content += '<details class="failure-details ' + resultStatus + '"><summary class="failure-summary">' + (resultStatus === 'fail' ? 'Failure' : 'Skip') + ' reason</summary><pre class="error-trace">' + Utils.escapeHtml(String(errorTrace)) + '</pre></details>';
              content += '</div>';
            }
            if (!content.trim()) {
              content = errorTrace
                ? '<div class="method-detail-steps"><h4 class="method-section-title">Exception</h4><pre class="error-trace">' + Utils.escapeHtml(String(errorTrace)) + '</pre></div>'
                : '<p class="expand-empty">No steps or command logs available.</p>';
            }
            bodyEl.innerHTML = content;
            bindCheckpointExpand(bodyEl);
            bindScreenshotClicks(bodyEl);
            bindAttachmentLinks(bodyEl);
          }).catch(() => {
            bodyEl.innerHTML = '<p class="expand-error">Failed to load.</p>';
          });
        }
      });
    });
  }

  function toggleCheckpointExpand(header) {
    const cpId = header.dataset.cpId;
    const expandEl = header.querySelector('.checkpoint-expand');
    const childrenEl = document.getElementById(cpId);
    if (childrenEl) {
      const isHidden = childrenEl.style.display === 'none';
      childrenEl.style.display = isHidden ? 'block' : 'none';
      if (expandEl) expandEl.textContent = isHidden ? '▼' : '▶';
    }
  }

  function bindCheckpointExpand(container) {
    container.querySelectorAll('.checkpoint-header.has-children').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        toggleCheckpointExpand(header);
      });
    });
    container.querySelectorAll('.checkpoint-header.has-children .checkpoint-message').forEach(msg => {
      msg.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        e.stopPropagation();
        const header = msg.closest('.checkpoint-header.has-children');
        if (header) toggleCheckpointExpand(header);
      });
    });
    container.querySelectorAll('.checkpoint-expand').forEach(expand => {
      expand.addEventListener('click', (e) => {
        e.stopPropagation();
        const header = expand.closest('.checkpoint-header');
        if (header) toggleCheckpointExpand(header);
      });
    });
  }

  function bindRetryExpand(container, row, onLoadResultFile, getScreenshotUrl) {
    const retries = row.retries || [];
    container.querySelectorAll('.retry-header').forEach(header => {
      header.addEventListener('click', () => {
        const idx = parseInt(header.dataset.retryIndex, 10);
        const retry = retries[idx];
        if (!retry) return;
        const itemEl = header.closest('.retry-item');
        const bodyEl = itemEl ? itemEl.querySelector('.retry-body') : null;
        const expandEl = header.querySelector('.retry-expand');
        if (!bodyEl) return;
        const isHidden = bodyEl.style.display === 'none';
        bodyEl.style.display = isHidden ? 'block' : 'none';
        if (expandEl) expandEl.textContent = isHidden ? '▼' : '▶';
        if (isHidden && bodyEl.querySelector('.retry-loading')) {
          onLoadResultFile(retry).then((result) => {
            const data = result?.data ?? result;
            if (!data) {
              bodyEl.innerHTML = '<p class="expand-error">No result file.</p>';
              return;
            }
            bodyEl.innerHTML = renderResultTabContent(retry, data, getScreenshotUrl);
            bindCheckpointExpand(bodyEl);
            bindScreenshotClicks(bodyEl);
            bindAttachmentLinks(bodyEl);
          }).catch(() => {
            bodyEl.innerHTML = '<p class="expand-error">Failed to load.</p>';
          });
        }
      });
    });
  }

  function bindScreenshotClicks(container) {
    container.querySelectorAll('.checkpoint-screenshot').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pathOrUrl = a.getAttribute('href');
        if (!pathOrUrl) return;
        let url = pathOrUrl;
        let isBlobUrl = false;
        if (typeof DataLoader !== 'undefined' && DataLoader.isFileApi && DataLoader.isFileApi()) {
          const blobUrl = await DataLoader.getFileBlobUrl(pathOrUrl);
          if (blobUrl) {
            url = blobUrl;
            isBlobUrl = true;
          }
        }
        openScreenshotModal(url, isBlobUrl);
      });
    });
  }

  function openScreenshotModal(url, isBlobUrl = false) {
    let overlay = document.getElementById('screenshot-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'screenshot-overlay';
      overlay.className = 'screenshot-overlay';
      overlay.innerHTML = '<div class="screenshot-overlay-backdrop"></div><div class="screenshot-overlay-content">' +
        '<div class="screenshot-overlay-header"><button type="button" class="screenshot-overlay-close" aria-label="Close">&times;</button></div>' +
        '<div class="screenshot-overlay-body"><img alt="Screenshot" /></div></div>';
      const close = () => {
        overlay.classList.remove('open');
        const blobUrl = overlay._blobUrl;
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          overlay._blobUrl = null;
        }
      };
      overlay.querySelector('.screenshot-overlay-backdrop').addEventListener('click', close);
      overlay.querySelector('.screenshot-overlay-close').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      overlay.querySelector('.screenshot-overlay-content').addEventListener('click', (e) => e.stopPropagation());
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });

      const content = overlay.querySelector('.screenshot-overlay-content');
      const header = overlay.querySelector('.screenshot-overlay-header');
      let dragStartX, dragStartY, contentStartX, contentStartY;
      header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.screenshot-overlay-close')) return;
        e.preventDefault();
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = content.getBoundingClientRect();
        contentStartX = rect.left;
        contentStartY = rect.top;
        content.classList.add('screenshot-dragging');
        content.style.left = contentStartX + 'px';
        content.style.top = contentStartY + 'px';
        const onMove = (ev) => {
          const dx = ev.clientX - dragStartX;
          const dy = ev.clientY - dragStartY;
          content.style.left = (contentStartX + dx) + 'px';
          content.style.top = (contentStartY + dy) + 'px';
        };
        const onUp = () => {
          content.classList.remove('screenshot-dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      document.body.appendChild(overlay);
    }
    const img = overlay.querySelector('img');
    const content = overlay.querySelector('.screenshot-overlay-content');
    if (overlay._blobUrl) {
      URL.revokeObjectURL(overlay._blobUrl);
      overlay._blobUrl = null;
    }
    overlay._blobUrl = isBlobUrl ? url : null;
    const imgSrc = (url.startsWith('blob:') || url.startsWith('http:') || url.startsWith('https:'))
      ? url
      : new URL(url, window.location.href).href;
    img.src = imgSrc;
    img.onerror = () => { img.alt = 'Screenshot failed to load'; };
    img.onload = () => { img.alt = 'Screenshot'; };
    content.classList.remove('screenshot-dragging');
    content.style.left = '';
    content.style.top = '';
    overlay.classList.add('open');
  }

  function renderSeleniumLog(logs) {
    if (!logs || !logs.length) return '<p>No command logs.</p>';
    let html = '<div class="selenium-log">';
    logs.forEach((entry, i) => {
      html += renderLogEntry(entry, i, 0);
    });
    html += '</div>';
    return html;
  }

  function renderLogEntry(entry, idx, depth) {
    const indent = depth * 16;
    const hasSub = entry.subLogs && entry.subLogs.length > 0;
    const resultClass = entry.result === 'success' ? 'log-success' : (String(entry.result || '').includes('Exception') || String(entry.result || '').includes('Error') ? 'log-error' : 'log-info');
    let html = `<div class="log-entry" style="margin-left:${indent}px" data-depth="${depth}">`;
    html += `<span class="log-cmd ${resultClass}">${Utils.escapeHtml(entry.commandName || '')}</span>`;
    if (entry.duration != null) html += ` <span class="log-duration">${Utils.formatDuration(entry.duration)}</span>`;
    if (entry.args && entry.args.length) {
      html += ` <span class="log-args">${Utils.escapeHtml(JSON.stringify(entry.args))}</span>`;
    }
    if (entry.result && entry.result !== 'null' && entry.result !== 'success') {
      html += ` <span class="log-result ${resultClass}">${Utils.escapeHtml(String(entry.result).substring(0, 200))}${String(entry.result).length > 200 ? '...' : ''}</span>`;
    }
    html += '</div>';
    if (hasSub) {
      entry.subLogs.forEach((sub, j) => {
        html += renderLogEntry(sub, j, depth + 1);
      });
    }
    return html;
  }

  async function renderMethodDetailAndBind(container, row, data, getScreenshotUrl, onLoadResultFile, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, classPathVal, reportsList) {
    removeOrphanMethodMetaBubbles();
    const formats = typeof Utils.loadMetadataFormats === 'function' ? await Utils.loadMetadataFormats() : null;
    container.innerHTML = renderMethodDetail(row, data, getScreenshotUrl, onLoadResultFile, onLoadHistory, reportsList, formats);
    bindMethodDetailMetaPopover(container);
    bindMethodDetailTabs(container);
    bindCheckpointExpand(container);
    bindScreenshotClicks(container);
    bindAttachmentLinks(container);
    bindRetryExpand(container, row, onLoadResultFile, getScreenshotUrl);
    bindHistoryTab(container, row, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, classPathVal);
  }

  return {
    renderExecutionTestsets,
    renderTestsetsList,
    renderTestsetClasses,
    renderClassesList,
    renderClassMethods,
    renderMethodDetailAndBind,
    getExecDir: () => execDir,
    getTestsetPath: () => testsetPath,
    getClassPath: () => classPath
  };
})();
