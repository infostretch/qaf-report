/**
 * @author Chirag Jayswal, QAF team
 * Execution by Test Case - flattened view with overview, filters, grouping, analysis
 */
const TestCaseViewComponent = (function () {
  function getDisplayName(path) {
    if (!path) return 'Unknown';
    const parts = String(path).split('/');
    const last = parts[parts.length - 1] || path;
    return last.replace(/\.feature$/, '').replace(/_/g, ' ');
  }

  let historyPopoverHideTimer = null;
  let historyPopoverDelegationBound = false;

  function ensureHistoryPopoverDelegation() {
    if (historyPopoverDelegationBound) return;
    historyPopoverDelegationBound = true;
    const pop = document.getElementById('history-run-popover');
    if (!pop) return;

    function cancelHide() {
      clearTimeout(historyPopoverHideTimer);
    }

    function hideSoon() {
      clearTimeout(historyPopoverHideTimer);
      historyPopoverHideTimer = setTimeout(() => {
        pop.classList.add('hidden');
        pop.setAttribute('aria-hidden', 'true');
      }, 120);
    }

    function fillAndShow(anchor, item, runIndex) {
      cancelHide();
      const stackRaw = (item.failureReason || item.stack || '').trim();
      const passMsg = item.result === 'pass' && !stackRaw;
      const stackDisplay = passMsg ? 'Execution passed' : stackRaw || (item.result === 'fail' ? '(no stacktrace)' : '—');
      const preClass = passMsg ? 'history-popover-pre is-pass-msg' : 'history-popover-pre';
      const durMs =
        item.durationMs != null && item.durationMs !== '' && !isNaN(Number(item.durationMs))
          ? Number(item.durationMs)
          : null;

      pop.innerHTML =
        '<div class="history-popover-inner">' +
        '<div class="history-popover-hdr"><span>#' +
        runIndex +
        '</span><span class="history-popover-run-name">' +
        Utils.escapeHtml(item.reportLabel || '') +
        '</span></div>' +
        '<div class="history-popover-summary">' +
        '<div class="history-popover-summary-row">' +
        Utils.statusBadge(item.result) +
        Utils.renderStandardDurationCell(durMs) +
        '<span class="history-popover-exec-dt" title="Execution start">' +
        Utils.escapeHtml(Utils.formatExecutionSortDateTime(item.startTime)) +
        '</span>' +
        '</div></div>' +
        '<div class="history-popover-stack">' +
        '<div class="history-popover-stack-hdr"><span>Stacktrace</span><button type="button" class="history-popover-copy">Copy to clipboard</button></div>' +
        '<pre class="' +
        preClass +
        '" role="log">' +
        Utils.escapeHtml(stackDisplay) +
        '</pre>' +
        '</div></div>';

      const copyBtn = pop.querySelector('.history-popover-copy');
      const preEl = pop.querySelector('.history-popover-pre');
      if (copyBtn && preEl) {
        copyBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const t = preEl.textContent || '';
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
        });
      }

      pop.classList.remove('hidden');
      pop.setAttribute('aria-hidden', 'false');
      const rect = anchor.getBoundingClientRect();
      requestAnimationFrame(() => {
        const pw = pop.offsetWidth;
        const ph = pop.offsetHeight;
        let left = Math.round(rect.left + rect.width / 2 - pw / 2);
        let top = Math.round(rect.bottom + 8);
        left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
        if (top + ph > window.innerHeight - 8) top = Math.round(rect.top - ph - 8);
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
      });
    }

    document.addEventListener(
      'mouseover',
      (e) => {
        const n = e.target.closest('.history-node');
        if (!n) return;
        const panel = n.closest('#drilldown-panel');
        if (!panel || panel.classList.contains('hidden')) return;
        const rows = panel._qafTestCasesForHistory;
        if (!rows) return;
        const tr = n.closest('tr[data-row-id]');
        if (!tr) return;
        const row = rows.find((r) => String(r.id) === String(tr.dataset.rowId));
        const runIndex = parseInt(n.dataset.runIndex, 10);
        if (!row || !row.historyTimeline || !runIndex) return;
        const item = row.historyTimeline[runIndex - 1];
        if (!item) return;
        fillAndShow(n, item, runIndex);
      },
      true
    );

    document.addEventListener(
      'mouseout',
      (e) => {
        const n = e.target.closest('.history-node');
        if (!n) return;
        const rel = e.relatedTarget;
        if (rel && (n.contains(rel) || pop.contains(rel))) return;
        hideSoon();
      },
      true
    );

    pop.addEventListener('mouseenter', cancelHide);
    pop.addEventListener('mouseleave', hideSoon);
  }

  function getMetaValue(row, key) {
    const v = row.metaData?.[key];
    if (v == null) return '';
    return Array.isArray(v) ? v.join(', ') : String(v);
  }

  function getFeatureClass(row) {
    const ref = row.metaData?.reference;
    if (ref != null && ref !== '') {
      return Array.isArray(ref) ? ref.join(', ') : String(ref);
    }
    return getDisplayName(row.classPath) || getDisplayName(row.testsetPath) || '-';
  }

  function extractMetadataKeys(rows) {
    const keys = new Set();
    rows.forEach((r) => {
      Object.keys(r.metaData || {}).forEach((k) => {
        if (!['testID', 'name', 'resultFileName', 'sessionID', 'sign'].includes(k)) keys.add(k);
      });
    });
    return Array.from(keys).sort();
  }

  function getAnalysis(rows) {
    const failReasons = {};
    const byStatus = { pass: 0, fail: 0, skip: 0 };
    const flaky = [];
    rows.forEach((r) => {
      byStatus[r.result] = (byStatus[r.result] || 0) + 1;
      if (r.result === 'fail' || r.result === 'skip') {
        const reason = r.failureReason || '(no reason)';
        failReasons[reason] = (failReasons[reason] || 0) + 1;
      }
      if (r.historyAnalysis === 'Unstable') flaky.push(r);
    });
    const topFailures = Object.entries(failReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { byStatus, topFailures, flaky };
  }

  function render(
    containerId,
    {
      testCases,
      onLoadHistory,
      onLoadResultFile,
      onRenderMethodDetail,
      reports,
      execDir,
      breadcrumb,
      onBreadcrumbClick,
      initialStatusFilter,
      initialModuleFilter
    }
  ) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const pass = testCases.filter((t) => t.result === 'pass').length;
    const fail = testCases.filter((t) => t.result === 'fail').length;
    const skip = testCases.filter((t) => t.result === 'skip').length;
    const notRun = testCases.filter((t) => t.result === 'not-run').length;
    const total = testCases.length;
    const analysis = getAnalysis(testCases);
    const metaKeys = extractMetadataKeys(testCases);

    let html = '';
    if (breadcrumb?.length) {
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
    }

    html += '<div class="testcase-view">';
    html += '<div class="testcase-overview">';
    html += '<div class="testcase-stats testcase-filter-toggles">';
    html += '<button type="button" class="stat-card stat-toggle active" data-status="all" title="Show all"><span class="stat-value">' + total + '</span> Total</button>';
    html += '<span class="stat-group-label">Result</span>';
    html += '<span class="stat-group stat-group-result">';
    html += '<button type="button" class="stat-card stat-toggle pass" data-status="pass" data-filter-type="result" title="Click: include → exclude → clear"><span class="stat-value">' + pass + '</span> Pass</button>';
    html += '<button type="button" class="stat-card stat-toggle fail" data-status="fail" data-filter-type="result" title="Click: include → exclude → clear"><span class="stat-value">' + fail + '</span> Fail</button>';
    html += '<button type="button" class="stat-card stat-toggle skip" data-status="skip" data-filter-type="result" title="Click: include → exclude → clear"><span class="stat-value">' + skip + '</span> Skip</button>';
    if (notRun > 0) html += '<button type="button" class="stat-card stat-toggle not-run" data-status="not-run" data-filter-type="result" title="Click: include → exclude → clear"><span class="stat-value">' + notRun + '</span> Not run</button>';
    html += '</span>';
    if (analysis.flaky.length > 0) {
      html += '<span class="stat-group-label">Trend</span>';
      html += '<span class="stat-group stat-group-trend">';
      html += '<button type="button" class="stat-card stat-toggle unstable" data-status="unstable" data-filter-type="trend" title="Click: include → exclude → clear"><span class="stat-value">' + analysis.flaky.length + '</span> Unstable</button>';
      html += '</span>';
    }
    html += '</div>';

    if (analysis.topFailures.length > 0) {
      html += '<div class="testcase-analysis">';
      html += '<h4>Top failure reasons</h4>';
      html += '<ul class="failure-reasons-list">';
      analysis.topFailures.forEach(([reason, count]) => {
        html += '<li><span class="failure-count">' + count + '</span> ' + Utils.escapeHtml(reason) + '</li>';
      });
      html += '</ul></div>';
    }

    html += '<div class="testcase-filters">';
    html += '<div class="filters-row">';
    html += '<input type="search" class="filter-input filter-search" placeholder="Search test ID, name, failure..." id="testcase-search">';
    html += '<select class="filter-select" id="testcase-group-by" title="Group by"><option value="">Group by...</option>';
    html += '<option value="testsetPath">Suite</option><option value="reference">Feature / Class</option>';
    html += '<option value="result">Status</option><option value="failureReason">Failure</option><option value="module">Module</option>';
    html += '</select>';
    html += '<select class="filter-select" id="testcase-filter-failure"><option value="">All failures</option>';
    const uniqueReasons = [...new Set(testCases.filter((t) => t.failureReason).map((t) => t.failureReason))].sort();
    uniqueReasons.forEach((r) => {
      html += '<option value="' + Utils.escapeHtml(r) + '">' + Utils.escapeHtml(r.substring(0, 60)) + (r.length > 60 ? '…' : '') + '</option>';
    });
    html += '</select>';
    html += '</div></div>';
    html += '</div>';

    html += '<div class="table-placeholder" id="testcase-table"></div>';
    html += '</div>';

    container.innerHTML = html;
    container.classList.remove('hidden');
    ensureHistoryPopoverDelegation();

    const tableContainer = document.getElementById('testcase-table');
    if (!tableContainer) return;

    const columns = [
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
        key: 'historyAnalysis',
        label: 'Trend',
        sortKey: 'historyAnalysis',
        value: (r) => r.historyAnalysis || '',
        render: (v, row) => row.historyAnalysis === 'Unstable' ? Utils.analysisBadge('Unstable') : '—'
      },
      {
        key: 'historyTimeline',
        label: 'History',
        sortKey: 'startTime',
        value: (r) => r.startTime,
        render: (v, row) => row.historyTimelineTrackHtml || '—'
      },
      {
        key: 'name',
        label: 'Name',
        sortKey: 'name',
        value: (r) => r.metaData?.name || r.name,
        render: (v) => Utils.escapeHtml((v || '').substring(0, 50)) + ((v || '').length > 50 ? '…' : '')
      },
      {
        key: 'failureReason',
        label: 'Failure',
        sortKey: 'failureReason',
        value: (r) => r.failureReason,
        render: (v, row) => {
          if (row.result === 'pass' || row.result === 'not-run') return '-';
          if (!v) return '-';
          return '<span class="failure-reason-text ' + row.result + '" title="' + Utils.escapeHtml(v) + '">' + Utils.escapeHtml(v.substring(0, 40)) + (v.length > 40 ? '…' : '') + '</span>';
        }
      },
      {
        key: 'duration',
        label: 'Duration',
        sortKey: 'duration',
        value: (r) => r.duration,
        render: (v, row) => Utils.renderStandardDurationCell(row.duration)
      }
    ];

    const expandableRow = onRenderMethodDetail ? (row) =>
      '<div class="expand-content" data-expand-parent="' + Utils.escapeHtml(row.id) + '"><div class="expand-loading">Loading steps...</div></div>' : null;

    const table = TableComponent.createTable('testcase-table', {
      columns,
      data: testCases,
      idField: 'id',
      groupByValueGetters: (() => {
        const g = {
          testsetPath: (r) => getDisplayName(r.testsetPath),
          reference: (r) => getFeatureClass(r),
          module: (r) => (Utils.getModule ? Utils.getModule(r) : r.metaData?.module) || '-'
        };
        return g;
      })(),
      searchFields: [
        (r) => r.metaData?.testID,
        (r) => r.metaData?.name,
        (r) => r.failureReason,
        (r) => getDisplayName(r.testsetPath),
        (r) => getFeatureClass(r),
        (r) => (Utils.getModule ? Utils.getModule(r) : r.metaData?.module) || '',
        (r) => metaKeys.map((k) => getMetaValue(r, k)).join(' ')
      ],
      sortable: true,
      pageSize: 25,
      getGroupCounts: (rows) => ({
        pass: rows.filter(r => r.result === 'pass').length,
        fail: rows.filter(r => r.result === 'fail').length,
        total: rows.length
      }),
      expandableRow,
      onExpand: onRenderMethodDetail ? (row, container) => {
        if (!onLoadResultFile) return;
        onLoadResultFile(row).then((result) => {
          const data = result?.data ?? result;
          if (!data) {
            container.innerHTML = '<p class="expand-error">Failed to load result file.</p>';
            return;
          }
          onRenderMethodDetail(container, row, data);
          container.closest('.expand-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }).catch(() => {
          container.innerHTML = '<p class="expand-error">Failed to load steps.</p>';
        });
      } : undefined
    });

    if (table) {
      document.getElementById('testcase-table').appendChild(table.getElement());
      table.render();
    }

    const searchEl = document.getElementById('testcase-search');
    if (searchEl) {
      searchEl.addEventListener('input', Utils.debounce(() => table.setSearch(searchEl.value), 200));
    }

    const failureEl = document.getElementById('testcase-filter-failure');
    const statusFilterState = { pass: null, fail: null, skip: null, 'not-run': null, unstable: null };
    if (initialStatusFilter && ['pass', 'fail', 'skip', 'unstable'].includes(initialStatusFilter)) {
      statusFilterState[initialStatusFilter] = 'include';
    }
    let moduleFilter = initialModuleFilter || null;

    function applyFilters() {
      const failureVal = failureEl?.value || '';
      table.setFilter('failure', failureVal ? (r) => r.failureReason === failureVal : null);
      table.setFilter('module', moduleFilter ? (r) => (Utils.getModule ? Utils.getModule(r) : r.metaData?.module) === moduleFilter : null);
      const resultInclude = ['pass', 'fail', 'skip', 'not-run'].filter((s) => statusFilterState[s] === 'include');
      const resultExclude = ['pass', 'fail', 'skip', 'not-run'].filter((s) => statusFilterState[s] === 'exclude');
      const unstableInclude = statusFilterState.unstable === 'include';
      const unstableExclude = statusFilterState.unstable === 'exclude';
      const statusFilter = () => {
        if (resultInclude.length === 0 && resultExclude.length === 0 && !unstableInclude && !unstableExclude) return null;
        return (r) => {
          if (resultInclude.length > 0 && !resultInclude.includes(r.result)) return false;
          if (resultExclude.length > 0 && resultExclude.includes(r.result)) return false;
          if (unstableInclude && r.historyAnalysis !== 'Unstable') return false;
          if (unstableExclude && r.historyAnalysis === 'Unstable') return false;
          return true;
        };
      };
      table.setFilter('status', statusFilter());
    }

    function updateBadgeStates() {
      const hasAny = Object.values(statusFilterState).some(Boolean);
      container.querySelector('.stat-toggle[data-status="all"]')?.classList.toggle('active', !hasAny);
      container.querySelectorAll('.stat-toggle[data-status][data-filter-type]').forEach((b) => {
        const status = b.dataset.status;
        const v = statusFilterState[status];
        b.classList.remove('stat-include', 'stat-exclude');
        if (v === 'include') b.classList.add('stat-include');
        else if (v === 'exclude') b.classList.add('stat-exclude');
      });
    }

    updateBadgeStates();

    container.querySelectorAll('.stat-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const status = btn.dataset.status;
        const filterType = btn.dataset.filterType;
        if (status === 'all') {
          Object.keys(statusFilterState).forEach((k) => { statusFilterState[k] = null; });
        } else if (filterType && statusFilterState[status] !== undefined) {
          const next = statusFilterState[status] === null ? 'include' : statusFilterState[status] === 'include' ? 'exclude' : null;
          statusFilterState[status] = next;
        }
        updateBadgeStates();
        applyFilters();
      });
    });

    failureEl?.addEventListener('change', applyFilters);

    applyFilters();

    const groupEl = document.getElementById('testcase-group-by');
    groupEl?.addEventListener('change', () => {
      const val = groupEl.value;
      table.setGroupBy(val || null);
    });

    if (onBreadcrumbClick) {
      container.querySelectorAll('.drilldown-breadcrumb a.breadcrumb-link').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          onBreadcrumbClick(parseInt(a.dataset.index, 10));
        });
      });
    }

    container._qafTestCasesForHistory = testCases;

    return { table, testCases };
  }

  return {
    render,
    getDisplayName
  };
})();
