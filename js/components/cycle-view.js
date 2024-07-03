/**
 * @author Chirag Jayswal, QAF team
 * Cycle view - same test catalog as By Test Case; Cycle status is from the selected period; Trend matches testcase “trend” (fixed/broken/unstable, pass/fail across history).
 */
const CycleViewComponent = (function () {
  const NO_EXCLUDE = '__cycle_all__';

  function getDisplayName(path) {
    if (!path) return '-';
    const parts = String(path).split('/');
    const last = parts[parts.length - 1] || path;
    return last.replace(/\.feature$/, '').replace(/_/g, ' ');
  }

  function getFeatureClass(row) {
    const ref = row.metaData?.reference;
    if (ref != null && ref !== '') {
      return Array.isArray(ref) ? ref.join(', ') : String(ref);
    }
    return getDisplayName(row.classPath) || getDisplayName(row.testsetPath) || '-';
  }

  /**
   * Compute cycle status from history already filtered to the selected period.
   * No runs in period → pending (UnExecuted). Pass if passed at least once, then fail, then skip.
   */
  function getCycleStatus(history) {
    if (!history?.length) return 'pending';
    const hasPass = history.some((e) => e.method?.result === 'pass');
    const hasFail = history.some((e) => e.method?.result === 'fail');
    const hasSkip = history.some((e) => e.method?.result === 'skip');
    if (hasPass) return 'pass';
    if (hasFail) return 'fail';
    if (hasSkip) return 'skip';
    return 'not-run';
  }

  /**
   * Compute overall status: fixed, broken, unstable, pass, fail, skip, not-run
   */
  function getOverallStatus(history) {
    if (!history?.length) return 'not-run';
    const results = history.map((e) => e.method?.result).filter(Boolean);
    const last = results[0];
    const hasPass = results.includes('pass');
    const hasFail = results.includes('fail');
    const allSkip = results.every((r) => r === 'skip');
    if (allSkip) return 'skip';
    const transitions = results.reduce((n, r, i) => {
      if (i === 0) return 0;
      const prev = results[i - 1];
      if ((prev === 'pass' || prev === 'fail') && (r === 'pass' || r === 'fail') && prev !== r) return n + 1;
      return n;
    }, 0);
    if (transitions >= 2) return 'unstable';
    if (last === 'pass' && hasFail) return 'fixed';
    if (last === 'fail' && hasPass) return 'broken';
    if (last === 'pass') return 'pass';
    if (last === 'fail') return 'fail';
    if (last === 'skip') return 'skip';
    return 'not-run';
  }

  function overallStatusBadge(status) {
    const trendStatuses = ['fixed', 'broken', 'unstable'];
    if (trendStatuses.includes(status)) {
      return Utils.analysisBadge(status);
    }
    return Utils.statusBadge(status);
  }

  function toDate(ts) {
    if (ts == null || isNaN(ts)) return null;
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function dateToMs(d) {
    if (!d) return null;
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  }

  /** Cycle filter chip / include key: pending and not-run both map to unexecuted. */
  function cycleStatusFilterKey(cs) {
    const x = cs || 'not-run';
    return x === 'pending' || x === 'not-run' ? 'unexecuted' : x;
  }

  /** End of local calendar day for an `YYYY-MM-DD` date input value (inclusive “To” in range). */
  function dateInputToEndOfDayMs(dateStr) {
    if (!dateStr) return null;
    const parts = String(dateStr).split('-').map((x) => parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => isNaN(n))) return null;
    const end = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
    return end.getTime();
  }

  function formatDateForInput(ts) {
    if (ts == null || isNaN(ts)) return '';
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  let chartInstances = [];

  function destroyCharts() {
    if (typeof ChartBarCard !== 'undefined') {
      ChartBarCard.teardownChartCardWindowControls();
    }
    chartInstances.forEach((c) => {
      try { c.destroy(); } catch (e) {}
    });
    chartInstances = [];
  }

  function renderOverallDonut(canvasId, counts, onSegmentClick) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const colors = {
      pass: style.getPropertyValue('--color-pass')?.trim() || '#2e7d32',
      fail: style.getPropertyValue('--color-fail')?.trim() || '#c62828',
      skip: style.getPropertyValue('--color-skip')?.trim() || '#757575',
      fixed: '#1976d2',
      broken: '#d32f2f',
      unstable: '#f57c00',
      'not-run': style.getPropertyValue('--color-text-muted')?.trim() || '#757575'
    };
    const labels = [];
    const data = [];
    const bgColors = [];
    const keys = [];
    ['pass', 'fail', 'fixed', 'broken', 'unstable', 'skip', 'not-run'].forEach((s) => {
      if ((counts[s] || 0) > 0) {
        labels.push(s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' '));
        data.push(counts[s]);
        bgColors.push(colors[s] || '#999');
        keys.push(s);
      }
    });
    if (data.length === 0) return;
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { afterLabel: (ctx) => 'Click to filter table' } }
        },
        cutout: '60%',
        onClick: (ev, elements) => {
          if (elements.length > 0 && onSegmentClick) {
            const idx = elements[0].index;
            if (keys[idx]) onSegmentClick(keys[idx]);
          }
        }
      }
    });
    chartInstances.push(chart);
  }

  function renderCycleStatusDonut(canvasId, counts, onSegmentClick) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const colors = {
      pass: style.getPropertyValue('--color-pass')?.trim() || '#2e7d32',
      fail: style.getPropertyValue('--color-fail')?.trim() || '#c62828',
      skip: style.getPropertyValue('--color-skip')?.trim() || '#757575',
      unexecuted: '#795548'
    };
    const labels = [];
    const data = [];
    const bgColors = [];
    const keys = [];
    const unex = (counts.pending || 0) + (counts['not-run'] || 0);
    ['pass', 'fail', 'skip'].forEach((s) => {
      if ((counts[s] || 0) > 0) {
        labels.push(s.charAt(0).toUpperCase() + s.slice(1));
        data.push(counts[s]);
        bgColors.push(colors[s] || '#999');
        keys.push(s);
      }
    });
    if (unex > 0) {
      labels.push('UnExecuted');
      data.push(unex);
      bgColors.push(colors.unexecuted);
      keys.push('unexecuted');
    }
    if (data.length === 0) return;
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { afterLabel: () => 'Click to filter table' } }
        },
        cutout: '60%',
        onClick: (ev, elements) => {
          if (elements.length > 0 && onSegmentClick) {
            const idx = elements[0].index;
            if (keys[idx]) onSegmentClick(keys[idx]);
          }
        }
      }
    });
    chartInstances.push(chart);
  }

  function pickLatestFullHistoryEntry(row) {
    const list = row.fullHistoryEntries;
    if (!Array.isArray(list) || !list.length) return null;
    return list[0];
  }

  /**
   * Prefer the row’s catalog result file; if UnExecuted in-period (no file), use latest execution from full history so detail + History match By Test Case.
   */
  function resolveRowForCycleExpand(row, defaultExecDir) {
    if (row.metaData?.resultFileName && (row.execDirForResult || defaultExecDir)) {
      return { detailRow: row, canLoadResultFile: true };
    }
    const h = pickLatestFullHistoryEntry(row);
    if (!h?.method || !h.report?.dir) {
      return { detailRow: row, canLoadResultFile: false };
    }
    const m = h.method;
    const detailRow = {
      ...row,
      testsetPath: h.testsetPath || row.testsetPath,
      execDirForResult: h.report.dir,
      metaData: { ...(row.metaData || {}), ...(m.metaData || {}) },
      result: m.result || row.result || 'not-run',
      retries: m.retries || row.retries || []
    };
    const canLoad = !!(detailRow.metaData?.resultFileName && (detailRow.execDirForResult || defaultExecDir));
    return { detailRow, canLoadResultFile: canLoad };
  }

  function render(containerId, options) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const {
      breadcrumb,
      onBreadcrumbClick,
      cycleRows,
      dateFrom,
      dateTo,
      dateMin,
      dateMax,
      onDateChange,
      reports,
      reportsInRange,
      execDir,
      showProjectBreakdown = false
    } = options;

    const defaultExecDir = execDir || reportsInRange?.[0]?.dir;

    const minStr = formatDateForInput(dateMin);
    const maxStr = formatDateForInput(dateMax);

    destroyCharts();

    const baseCycleRows = cycleRows || [];
    const displayRows = baseCycleRows;

    const counts = { pass: 0, fail: 0, skip: 0, 'not-run': 0, fixed: 0, broken: 0, unstable: 0 };
    const cycleStatusCounts = { pass: 0, fail: 0, skip: 0, pending: 0, 'not-run': 0 };
    displayRows.forEach((r) => {
      const st = r.overallStatus || 'not-run';
      counts[st] = (counts[st] || 0) + 1;
      const cs = r.cycleStatus || 'not-run';
      cycleStatusCounts[cs] = (cycleStatusCounts[cs] || 0) + 1;
    });

    const total = displayRows.length;
    const fromStr = dateFrom ? new Date(dateFrom).toLocaleDateString() : '';
    const toStr = dateTo ? new Date(dateTo).toLocaleDateString() : '';
    const execCount = reportsInRange?.length || 0;

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

    html += '<div class="cycle-view">';
    html += '<div class="cycle-header">';
    html += '<h2>Cycle Report</h2>';
    html += '<p class="cycle-desc">Test case status across selected date range. Cycle status = pass if passed at least once in range. Tests with no execution in the range appear as UnExecuted.</p>';
    html += '<div class="cycle-date-range">';
    html += '<label>From <input type="date" id="cycle-date-from" value="' + formatDateForInput(dateFrom) + '" min="' + minStr + '" max="' + maxStr + '"></label>';
    html += '<label>To <input type="date" id="cycle-date-to" value="' + formatDateForInput(dateTo) + '" min="' + minStr + '" max="' + maxStr + '"></label>';
    html += '<button type="button" class="btn btn-sm btn-primary" id="cycle-apply">Apply</button>';
    html += '<span class="cycle-date-info">' + execCount + ' execution(s) in range</span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="cycle-charts">';
    html += '<div class="chart-card cycle-chart-card--donut"><h3>Trend</h3><div class="chart-wrap chart-donut"><canvas id="cycle-chart-overall"></canvas></div></div>';
    html += '<div class="chart-card cycle-chart-card--donut"><h3>Cycle status</h3><div class="chart-wrap chart-donut"><canvas id="cycle-chart-cycle-status"></canvas></div></div>';
    html += '<div id="cycle-bar-standard-wrap" class="cycle-bars-stack">';
    html += ChartBarCard.getBarCardHtml({
      title: 'By module',
      cardClass: '',
      cardId: 'cycle-by-module-card',
      canvasId: 'cycle-chart-bar',
      tableWrapId: 'cycle-module-table-wrap',
      toggleButtonId: 'cycle-module-table-toggle',
      isMultiExec: false,
      chartWrapClass: 'chart-suite'
    });
    if (showProjectBreakdown) {
      html += ChartBarCard.getBarCardHtml({
        title: 'By project',
        cardClass: '',
        cardId: 'cycle-by-project-card',
        canvasId: 'cycle-chart-bar-project',
        tableWrapId: 'cycle-project-table-wrap',
        toggleButtonId: 'cycle-project-table-toggle',
        isMultiExec: false,
        chartWrapClass: 'chart-suite'
      });
    }
    html += '</div>';
    html += '</div>';

    html += '<div class="cycle-filters">';
    html += '<div class="cycle-stats">';
    html += '<button type="button" class="stat-card stat-toggle active" data-status="all"><span class="stat-value">' + total + '</span> Total</button>';
    html += '<span class="stat-group-label">Result</span>';
    html += '<span class="stat-group stat-group-result">';
    if ((cycleStatusCounts.pass || 0) > 0) html += '<button type="button" class="stat-card stat-toggle pass" data-status="pass" data-filter-type="cycle" title="Click: include → exclude → clear"><span class="stat-value">' + (cycleStatusCounts.pass || 0) + '</span> Pass</button>';
    if ((cycleStatusCounts.fail || 0) > 0) html += '<button type="button" class="stat-card stat-toggle fail" data-status="fail" data-filter-type="cycle" title="Click: include → exclude → clear"><span class="stat-value">' + (cycleStatusCounts.fail || 0) + '</span> Fail</button>';
    if ((cycleStatusCounts.skip || 0) > 0) html += '<button type="button" class="stat-card stat-toggle skip" data-status="skip" data-filter-type="cycle" title="Click: include → exclude → clear"><span class="stat-value">' + (cycleStatusCounts.skip || 0) + '</span> Skip</button>';
    const cycleUnexTotal = (cycleStatusCounts.pending || 0) + (cycleStatusCounts['not-run'] || 0);
    if (cycleUnexTotal > 0) {
      html +=
        '<button type="button" class="stat-card stat-toggle pending" data-status="unexecuted" data-filter-type="cycle" title="Click: include → exclude → clear"><span class="stat-value">' +
        cycleUnexTotal +
        '</span> UnExecuted</button>';
    }
    html += '</span>';
    if ((counts.fixed || 0) > 0 || (counts.broken || 0) > 0 || (counts.unstable || 0) > 0) {
      html += '<span class="stat-group-label">Trend</span>';
      html += '<span class="stat-group stat-group-trend">';
      if ((counts.fixed || 0) > 0) html += '<button type="button" class="stat-card stat-toggle fixed" data-status="fixed" data-filter-type="overall" title="Click: include → exclude → clear"><span class="stat-value">' + counts.fixed + '</span> Fixed</button>';
      if ((counts.broken || 0) > 0) html += '<button type="button" class="stat-card stat-toggle broken" data-status="broken" data-filter-type="overall" title="Click: include → exclude → clear"><span class="stat-value">' + counts.broken + '</span> Broken</button>';
      if ((counts.unstable || 0) > 0) html += '<button type="button" class="stat-card stat-toggle unstable" data-status="unstable" data-filter-type="overall" title="Click: include → exclude → clear"><span class="stat-value">' + counts.unstable + '</span> Unstable</button>';
      html += '</span>';
    }
    html += '</div>';
    html += '<div class="cycle-search-wrap"><input type="search" class="filter-input filter-search" placeholder="Search test ID, name, suite..." id="cycle-search">';
    html += '<select class="filter-select" id="cycle-group-by" title="Group by"><option value="">Group by...</option>';
    html += '<option value="testsetPath">Suite</option><option value="reference">Feature / Class</option>';
    html += '<option value="overallStatus">Trend</option><option value="cycleStatus">Cycle status</option><option value="module">Module</option>';
    if (showProjectBreakdown) {
      html += '<option value="project">Project</option>';
    }
    html += '<option value="failureByCycleStatus">Failure</option>';
    html += '</select></div>';
    html += '</div>';
    html += '<div id="cycle-filter-tags" class="cycle-filter-tags hidden"></div>';
    html += '<div class="table-placeholder" id="cycle-table"></div>';
    html += '</div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    if (onBreadcrumbClick) {
      container.querySelectorAll('.drilldown-breadcrumb a.breadcrumb-link').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const idx = parseInt(a.dataset.index, 10);
          onBreadcrumbClick(idx);
        });
      });
    }

    const applyBtn = document.getElementById('cycle-apply');
    const fromInput = document.getElementById('cycle-date-from');
    const toInput = document.getElementById('cycle-date-to');
    if (fromInput && toInput) {
      const syncDateConstraints = () => {
        const fromVal = fromInput.value;
        const toVal = toInput.value;
        toInput.min = fromVal || minStr;
        fromInput.max = toVal || maxStr;
        if (fromVal && toVal && fromVal > toVal) {
          toInput.value = fromVal;
        }
      };
      fromInput.addEventListener('change', syncDateConstraints);
      fromInput.addEventListener('input', syncDateConstraints);
      toInput.addEventListener('change', () => {
        const fromVal = fromInput.value;
        const toVal = toInput.value;
        fromInput.max = toVal || maxStr;
        if (fromVal && toVal && fromVal > toVal) {
          fromInput.value = toVal;
        }
      });
      toInput.addEventListener('input', () => {
        const fromVal = fromInput.value;
        const toVal = toInput.value;
        fromInput.max = toVal || maxStr;
        if (fromVal && toVal && fromVal > toVal) {
          fromInput.value = toVal;
        }
      });
      syncDateConstraints();
    }
    if (applyBtn && fromInput && toInput && onDateChange) {
      applyBtn.addEventListener('click', () => {
        let fromVal = fromInput.value;
        let toVal = toInput.value;
        if (fromVal && toVal && fromVal > toVal) {
          toVal = fromVal;
          toInput.value = fromVal;
        }
        const from = fromVal ? dateToMs(fromVal) : null;
        const to = toVal ? dateInputToEndOfDayMs(toVal) : null;
        onDateChange(from, to);
      });
    }

    const columns = [];
    if (showProjectBreakdown) {
      columns.push({
        key: 'project',
        label: 'Project',
        sortKey: 'projectLabel',
        value: (r) => r.projectLabel || r.projectId || '-',
        render: (v) => Utils.escapeHtml(String(v || '-'))
      });
    }
    columns.push(
      { key: 'testID', label: 'Test ID', sortKey: 'testID', value: (r) => r.metaData?.testID },
      { key: 'name', label: 'Name', sortKey: 'name', value: (r) => r.metaData?.name || r.name, render: (v) => Utils.escapeHtml((v || '').substring(0, 50)) + ((v || '').length > 50 ? '…' : '') },
      { key: 'cycleStatus', label: 'Cycle status', sortKey: 'cycleStatus', value: (r) => r.cycleStatus, render: (v, row) => {
        const badge = Utils.statusBadge(v);
        if (v === 'fail' && row.lastFailureReason) {
          const reason = Utils.escapeHtml(String(row.lastFailureReason).substring(0, 60)) + (row.lastFailureReason.length > 60 ? '…' : '');
          return badge + ' <span class="cycle-failure-reason" title="' + Utils.escapeHtml(row.lastFailureReason) + '">' + reason + '</span>';
        }
        return badge;
      }},
      { key: 'overallStatus', label: 'Trend', sortKey: 'overallStatus', render: (v) => overallStatusBadge(v) },
      { key: 'runsInRange', label: 'Runs', sortKey: 'runsInRange', render: (v) => v ?? '-' },
      { key: 'lastExecutionDate', label: 'Last Execution', sortKey: 'lastExecutionDate', value: (r) => r.lastExecutionDate, render: (v) => Utils.formatTimestamp(v) },
      { key: 'status', label: 'Status', sortKey: 'status', render: (v) => Utils.statusBadge(v) },
      { key: 'lastFailureReason', label: 'Failure', sortKey: 'lastFailureReason', value: (r) => r.lastFailureReason || '-', render: (v, row) => {
        if (!v || (row.cycleStatus !== 'fail' && row.overallStatus !== 'fail' && row.overallStatus !== 'broken' && row.overallStatus !== 'unstable')) return '-';
        return '<span class="failure-reason-text" title="' + Utils.escapeHtml(v) + '">' + Utils.escapeHtml(String(v).substring(0, 40)) + (v.length > 40 ? '…' : '') + '</span>';
      }},
      { key: 'failureByCycleStatus', label: 'Failure (by cycle)', sortKey: 'failureByCycleStatus', value: (r) => {
        if (r.cycleStatus === 'fail' || r.cycleStatus === 'skip') return (r.lastFailureReason || r.failureReason || '(no reason)');
        return 'Others';
      }, render: (v, row) => {
        if (row.cycleStatus === 'fail' || row.cycleStatus === 'skip') return Utils.escapeHtml((v || '-').substring(0, 40)) + ((v || '').length > 40 ? '…' : '');
        return Utils.escapeHtml(v || 'Others');
      }}
    );

    const allReportsForHistory = reports || reportsInRange || [];
    const reportsFilteredForRow = (row) => {
      const pid = row.projectId != null ? String(row.projectId) : '';
      if (pid !== '') {
        return allReportsForHistory.filter((r) => String(r.projectId || '') === pid);
      }
      return allReportsForHistory.filter((r) => !r.projectId || String(r.projectId).trim() === '');
    };

    const loadResultFileForRow = (row) => {
      const dir = row.execDirForResult || defaultExecDir;
      if (!dir || !row.metaData?.resultFileName) return Promise.resolve(null);
      return DataLoader.loadResultFile(dir, row.testsetPath, row.classPath, row.metaData.resultFileName);
    };
    const getScreenshotUrlForRow = (row) => (screenshotPath) => {
      const rawDir = row.execDirForResult || defaultExecDir;
      const execDirForAssets = DataLoader.resolveReportPath(rawDir);
      const resolved = Utils.resolveReportAssetRelativePath(
        execDirForAssets,
        row.testsetPath,
        row.classPath,
        screenshotPath
      );
      if (!resolved) return null;
      const prefix = DataLoader.isFileApi && DataLoader.isFileApi() ? '' : './';
      return prefix + resolved;
    };
    const loadHistoryForRow = (row) => (testID) => {
      if (Array.isArray(row.fullHistoryEntries)) {
        return Promise.resolve(row.fullHistoryEntries);
      }
      if (Array.isArray(row.cycleHistoryEntries)) {
        return Promise.resolve(row.cycleHistoryEntries);
      }
      return DataLoader.loadTestHistory(testID, row.classPath, NO_EXCLUDE, reportsFilteredForRow(row));
    };
    const loadHistoryItemResult = (execDirVal, testsetPathVal, classPathVal, resultFileName) =>
      DataLoader.loadResultFile(execDirVal, testsetPathVal, classPathVal, resultFileName);
    const getScreenshotUrlFor = (execDirVal, testsetPathVal, classPathVal) => (path) => {
      const baseDir = DataLoader.resolveReportPath(execDirVal);
      const resolved = Utils.resolveReportAssetRelativePath(baseDir, testsetPathVal, classPathVal, path);
      if (!resolved) return null;
      const prefix = DataLoader.isFileApi && DataLoader.isFileApi() ? '' : './';
      return prefix + resolved;
    };
    const loadForRetry = (row) => (r) => {
      const execDirVal = r.report?.dir || row.execDirForResult || defaultExecDir;
      const resultFileName = (r.metaData || r).resultFileName;
      if (!execDirVal || !resultFileName) return Promise.resolve(null);
      return DataLoader.loadResultFile(execDirVal, row.testsetPath, row.classPath, resultFileName);
    };
    const onRenderMethodDetail = (container, row, data) => {
      DrilldownComponent.renderMethodDetailAndBind(
        container,
        row,
        data,
        getScreenshotUrlForRow(row),
        loadForRetry(row),
        loadHistoryForRow(row),
        loadHistoryItemResult,
        getScreenshotUrlFor,
        row.classPath,
        reportsFilteredForRow(row)
      );
    };
    const expandableRow = (row) => '<div class="expand-content" data-expand-parent="' + Utils.escapeHtml(row.id) + '"><div class="expand-loading">Loading steps...</div></div>';

    const tableContainer = document.getElementById('cycle-table');
    if (tableContainer) {
      tableContainer.innerHTML = '';
      const groupByValueGetters = {
        testsetPath: (r) => getDisplayName(r.testsetPath),
        reference: (r) => getFeatureClass(r),
        module: (r) => (Utils.getModule ? Utils.getModule(r) : r.metaData?.module) || '-'
      };
      if (showProjectBreakdown) {
        groupByValueGetters.project = (r) => r.projectLabel || r.projectId || 'Default';
      }
      const searchFields = [
        (r) => r.metaData?.testID,
        (r) => r.metaData?.name,
        (r) => getDisplayName(r.testsetPath),
        (r) => getFeatureClass(r),
        (r) => (Utils.getModule ? Utils.getModule(r) : r.metaData?.module) || '',
        (r) => r.lastFailureReason || r.failureReason || ''
      ];
      if (showProjectBreakdown) {
        searchFields.splice(1, 0, (r) => r.projectLabel || r.projectId || '');
      }
      const table = TableComponent.createTable('cycle-table', {
        columns,
        data: displayRows || [],
        idField: 'id',
        groupByValueGetters,
        searchFields,
        sortable: true,
        pageSize: 25,
        getGroupCounts: (rows) => ({
          pass: rows.filter(r => r.cycleStatus === 'pass').length,
          fail: rows.filter(r => r.cycleStatus === 'fail' || r.cycleStatus === 'skip').length,
          total: rows.length
        }),
        expandableRow,
        expandStatusKey: 'cycleStatus',
        onExpand: (row, expandContainer) => {
          const { detailRow, canLoadResultFile } = resolveRowForCycleExpand(row, defaultExecDir);
          if (canLoadResultFile) {
            loadResultFileForRow(detailRow).then((result) => {
              const data = result?.data ?? result;
              if (!data) {
                expandContainer.innerHTML = '<p class="expand-error">Failed to load result file.</p>';
                return;
              }
              onRenderMethodDetail(expandContainer, detailRow, data);
              expandContainer.closest('.expand-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }).catch(() => {
              expandContainer.innerHTML = '<p class="expand-error">Failed to load steps.</p>';
            });
            return;
          }
          if (Array.isArray(row.fullHistoryEntries) && row.fullHistoryEntries.length > 0 && row.metaData?.testID) {
            onRenderMethodDetail(expandContainer, detailRow, {});
            expandContainer.closest('.expand-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          expandContainer.innerHTML =
            '<p class="expand-hint">No execution results on record for this test.</p>';
          expandContainer.closest('.expand-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
      tableContainer.appendChild(table.getElement());
      table.render();
      tableContainer._cycleTable = table;
      const state = {
        cycleFilter: { pass: null, fail: null, skip: null, unexecuted: null },
        overallFilter: { pass: null, fail: null, skip: null, 'not-run': null, fixed: null, broken: null, unstable: null },
        moduleFilter: null,
        projectFilter: null,
        baseCycleRows
      };
      tableContainer._cycleState = state;
      tableContainer._baseCycleRows = baseCycleRows;
      tableContainer._displayCycleRows = displayRows;
      const applyFilters = () => {
        const cycleInclude = ['pass', 'fail', 'skip', 'unexecuted'].filter((s) => state.cycleFilter[s] === 'include');
        const cycleExclude = ['pass', 'fail', 'skip', 'unexecuted'].filter((s) => state.cycleFilter[s] === 'exclude');
        const overallInclude = ['pass', 'fail', 'skip', 'not-run', 'fixed', 'broken', 'unstable'].filter((s) => state.overallFilter[s] === 'include');
        const overallExclude = ['pass', 'fail', 'skip', 'not-run', 'fixed', 'broken', 'unstable'].filter((s) => state.overallFilter[s] === 'exclude');
        table.setFilter('cycleStatus', (r) => {
          const key = cycleStatusFilterKey(r.cycleStatus);
          if (cycleInclude.length > 0 && !cycleInclude.includes(key)) return false;
          if (cycleExclude.length > 0 && cycleExclude.includes(key)) return false;
          return true;
        });
        table.setFilter('overallStatus', (r) => {
          const os = r.overallStatus || 'not-run';
          if (overallInclude.length > 0 && !overallInclude.includes(os)) return false;
          if (overallExclude.length > 0 && overallExclude.includes(os)) return false;
          return true;
        });
        table.setFilter('module', (r) => !state.moduleFilter || (Utils.getModule ? Utils.getModule(r) : r.metaData?.module) === state.moduleFilter);
        if (showProjectBreakdown) {
          table.setFilter(
            'project',
            (r) =>
              !state.projectFilter ||
              String(r.projectLabel || r.projectId || '') === state.projectFilter
          );
        }
      };
      tableContainer._applyFilters = applyFilters;
      const getRowsForCurrentFilters = () => {
        const cycleInclude = ['pass', 'fail', 'skip', 'unexecuted'].filter((s) => state.cycleFilter[s] === 'include');
        const cycleExclude = ['pass', 'fail', 'skip', 'unexecuted'].filter((s) => state.cycleFilter[s] === 'exclude');
        const overallInclude = ['pass', 'fail', 'skip', 'not-run', 'fixed', 'broken', 'unstable'].filter((s) => state.overallFilter[s] === 'include');
        const overallExclude = ['pass', 'fail', 'skip', 'not-run', 'fixed', 'broken', 'unstable'].filter((s) => state.overallFilter[s] === 'exclude');
        return (tableContainer._displayCycleRows || displayRows || []).filter((r) => {
          const cKey = cycleStatusFilterKey(r.cycleStatus);
          const os = r.overallStatus || 'not-run';
          if (cycleInclude.length > 0 && !cycleInclude.includes(cKey)) return false;
          if (cycleExclude.length > 0 && cycleExclude.includes(cKey)) return false;
          if (overallInclude.length > 0 && !overallInclude.includes(os)) return false;
          if (overallExclude.length > 0 && overallExclude.includes(os)) return false;
          if (state.moduleFilter && (Utils.getModule ? Utils.getModule(r) : r.metaData?.module) !== state.moduleFilter) return false;
          if (
            showProjectBreakdown &&
            state.projectFilter &&
            String(r.projectLabel || r.projectId || '') !== state.projectFilter
          ) {
            return false;
          }
          return true;
        });
      };
      const updateStatsDisplay = () => {
        const rows = getRowsForCurrentFilters();
        const cycleCounts = { pass: 0, fail: 0, skip: 0, unexecuted: 0 };
        const overallCounts = { fixed: 0, broken: 0, unstable: 0 };
        rows.forEach((r) => {
          const cs = r.cycleStatus || 'not-run';
          const os = r.overallStatus || 'not-run';
          const ck = cycleStatusFilterKey(cs);
          if (ck === 'unexecuted') cycleCounts.unexecuted++;
          else if (['pass', 'fail', 'skip'].includes(ck)) cycleCounts[ck]++;
          if (['fixed', 'broken', 'unstable'].includes(os)) overallCounts[os]++;
        });
        const total = rows.length;
        const allEl = container.querySelector('.stat-toggle[data-status="all"] .stat-value');
        if (allEl) allEl.textContent = total;
        ['pass', 'fail', 'skip', 'unexecuted'].forEach((s) => {
          const el = container.querySelector('.stat-toggle[data-status="' + s + '"][data-filter-type="cycle"] .stat-value');
          if (el) el.textContent = cycleCounts[s] || 0;
        });
        ['fixed', 'broken', 'unstable'].forEach((s) => {
          const el = container.querySelector('.stat-toggle[data-status="' + s + '"][data-filter-type="overall"] .stat-value');
          if (el) el.textContent = overallCounts[s] || 0;
        });
      };
      tableContainer._updateStatsDisplay = updateStatsDisplay;
      const statusLabels = { pass: 'Pass', fail: 'Fail', fixed: 'Fixed', broken: 'Broken', unstable: 'Unstable', skip: 'Skip', unexecuted: 'UnExecuted' };
      const updateFilterTags = () => {
        const tagsEl = document.getElementById('cycle-filter-tags');
        if (!tagsEl || !state) return;
        const tags = [];
        ['pass', 'fail', 'skip', 'unexecuted'].forEach((s) => {
          const v = state.cycleFilter[s];
          if (v) tags.push({ type: 'cycle', key: s, label: 'Cycle ' + (v === 'include' ? '=' : '≠') + ' ' + (statusLabels[s] || s) });
        });
        ['pass', 'fail', 'skip', 'not-run', 'fixed', 'broken', 'unstable'].forEach((s) => {
          const v = state.overallFilter[s];
          if (v) tags.push({ type: 'overall', key: s, label: 'Trend ' + (v === 'include' ? '=' : '≠') + ' ' + (statusLabels[s] || s) });
        });
        if (state.moduleFilter) {
          tags.push({ type: 'module', key: state.moduleFilter, label: 'Module: ' + state.moduleFilter });
        }
        if (showProjectBreakdown && state.projectFilter) {
          tags.push({ type: 'project', key: state.projectFilter, label: 'Project: ' + state.projectFilter });
        }
        if (tags.length === 0) {
          tagsEl.classList.add('hidden');
          tagsEl.innerHTML = '';
          return;
        }
        tagsEl.classList.remove('hidden');
        tagsEl.innerHTML = tags.map((t) =>
          '<span class="filter-tag" data-type="' + t.type + '" data-key="' + Utils.escapeHtml(t.key) + '">' +
          Utils.escapeHtml(t.label) + ' <button type="button" class="filter-tag-remove" aria-label="Remove">×</button></span>'
        ).join('');
        tagsEl.querySelectorAll('.filter-tag-remove').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tag = btn.closest('.filter-tag');
            const type = tag?.dataset.type;
            const key = tag?.dataset.key;
            if (type === 'cycle' && state.cycleFilter[key] != null) state.cycleFilter[key] = null;
            else if (type === 'overall' && state.overallFilter[key] != null) state.overallFilter[key] = null;
            else if (type === 'module') state.moduleFilter = null;
            else if (type === 'project') state.projectFilter = null;
            updateBadgeStates();
            applyFilters();
            tableContainer?._updateStatsDisplay?.();
            updateFilterTags();
          });
        });
      };
      tableContainer._updateFilterTags = updateFilterTags;
      const updateBadgeStates = () => {
        container.querySelector('.stat-toggle[data-status="all"]')?.classList.remove('stat-include', 'stat-exclude');
        const hasAnyFilter =
          Object.values(state.cycleFilter).some(Boolean) ||
          Object.values(state.overallFilter).some(Boolean) ||
          !!state.moduleFilter ||
          !!(showProjectBreakdown && state.projectFilter);
        container.querySelector('.stat-toggle[data-status="all"]')?.classList.toggle('active', !hasAnyFilter);
        container.querySelectorAll('.stat-toggle[data-status][data-filter-type]').forEach((b) => {
          const status = b.dataset.status;
          const type = b.dataset.filterType;
          const filter = type === 'cycle' ? state.cycleFilter : state.overallFilter;
          const v = filter[status];
          b.classList.remove('stat-include', 'stat-exclude');
          if (v === 'include') b.classList.add('stat-include');
          else if (v === 'exclude') b.classList.add('stat-exclude');
        });
      };
      container.querySelectorAll('.stat-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const status = btn.dataset.status;
          const filterType = btn.dataset.filterType;
          if (status === 'all') {
            Object.keys(state.cycleFilter).forEach((k) => { state.cycleFilter[k] = null; });
            Object.keys(state.overallFilter).forEach((k) => { state.overallFilter[k] = null; });
            state.moduleFilter = null;
            state.projectFilter = null;
          } else if (filterType === 'cycle') {
            const next = state.cycleFilter[status] === null ? 'include' : state.cycleFilter[status] === 'include' ? 'exclude' : null;
            state.cycleFilter[status] = next;
          } else if (filterType === 'overall') {
            const next = state.overallFilter[status] === null ? 'include' : state.overallFilter[status] === 'include' ? 'exclude' : null;
            state.overallFilter[status] = next;
          }
          updateBadgeStates();
          applyFilters();
          tableContainer._updateFilterTags?.();
        });
      });

      tableContainer._updateBadgeStates = updateBadgeStates;

      const paintCycleCharts = () => {
        const tc = document.getElementById('cycle-table');
        const st = tc?._cycleState;
        const chartRows = tc?._displayCycleRows || [];
        const countsLocal = { pass: 0, fail: 0, skip: 0, 'not-run': 0, fixed: 0, broken: 0, unstable: 0 };
        const cycleStatusCountsLocal = { pass: 0, fail: 0, skip: 0, pending: 0, 'not-run': 0 };
        chartRows.forEach((r) => {
          const stt = r.overallStatus || 'not-run';
          countsLocal[stt] = (countsLocal[stt] || 0) + 1;
          const cs = r.cycleStatus || 'not-run';
          cycleStatusCountsLocal[cs] = (cycleStatusCountsLocal[cs] || 0) + 1;
        });
        destroyCharts();
        const tbl = tc?._cycleTable;
        const onSegmentClick = (status) => {
          if (!tbl || !st) return;
          Object.keys(st.overallFilter).forEach((k) => { st.overallFilter[k] = null; });
          if (st.overallFilter[status] !== undefined) st.overallFilter[status] = 'include';
          updateBadgeStates();
          tc?._applyFilters?.();
          tc?._updateStatsDisplay?.();
          tc?._updateFilterTags?.();
          paintCycleCharts();
        };
        const onCycleStatusSegmentClick = (status) => {
          if (!tbl || !st) return;
          Object.keys(st.cycleFilter).forEach((k) => { st.cycleFilter[k] = null; });
          if (['pass', 'fail', 'skip', 'unexecuted'].includes(status)) st.cycleFilter[status] = 'include';
          updateBadgeStates();
          tc?._applyFilters?.();
          tc?._updateStatsDisplay?.();
          tc?._updateFilterTags?.();
          paintCycleCharts();
        };
        const onModuleClick = (moduleName) => {
          if (!tbl || !st) return;
          st.moduleFilter = st.moduleFilter === moduleName ? null : moduleName;
          st.projectFilter = null;
          Object.keys(st.cycleFilter).forEach((k) => { st.cycleFilter[k] = null; });
          Object.keys(st.overallFilter).forEach((k) => { st.overallFilter[k] = null; });
          updateBadgeStates();
          tc?._applyFilters?.();
          tc?._updateStatsDisplay?.();
          tc?._updateFilterTags?.();
          paintCycleCharts();
        };
        const onProjectClick = (projectLabel) => {
          if (!tbl || !st || !showProjectBreakdown) return;
          st.projectFilter = st.projectFilter === projectLabel ? null : projectLabel;
          st.moduleFilter = null;
          Object.keys(st.cycleFilter).forEach((k) => { st.cycleFilter[k] = null; });
          Object.keys(st.overallFilter).forEach((k) => { st.overallFilter[k] = null; });
          updateBadgeStates();
          tc?._applyFilters?.();
          tc?._updateStatsDisplay?.();
          tc?._updateFilterTags?.();
          paintCycleCharts();
        };
        if (Object.values(countsLocal).some((v) => v > 0)) {
          renderOverallDonut('cycle-chart-overall', countsLocal, onSegmentClick);
        }
        const cycleChartsHost = container.querySelector('.cycle-charts');
        const cycleTooltip = 'Click to filter. Click again or use Clear to reset.';
        if (chartRows.length > 0) {
          const moduleItems = ChartBarCard.aggregateCycleItemsByModule(chartRows);
          if (moduleItems.length > 0) {
            ChartBarCard.renderCycleAggregateTable('cycle-module-table-wrap', moduleItems, 'Module');
            ChartBarCard.createCycleAlignedBarChart('cycle-chart-bar', moduleItems, onModuleClick, chartInstances, cycleTooltip);
          }
        }
        if (showProjectBreakdown && chartRows.length > 0) {
          const projectItems = ChartBarCard.aggregateCycleItemsByProject(chartRows);
          if (projectItems.length > 0) {
            ChartBarCard.renderCycleAggregateTable('cycle-project-table-wrap', projectItems, 'Project');
            ChartBarCard.createCycleAlignedBarChart('cycle-chart-bar-project', projectItems, onProjectClick, chartInstances, cycleTooltip);
          }
        }
        ChartBarCard.bindTableToggle(container, '#cycle-module-table-toggle', 'cycle-module-table-wrap');
        if (showProjectBreakdown) {
          ChartBarCard.bindTableToggle(container, '#cycle-project-table-toggle', 'cycle-project-table-wrap');
        }
        if (cycleChartsHost) ChartBarCard.bindChartCardWindowControls(cycleChartsHost);
        if (Object.values(cycleStatusCountsLocal).some((v) => v > 0)) {
          renderCycleStatusDonut('cycle-chart-cycle-status', cycleStatusCountsLocal, onCycleStatusSegmentClick);
        }
      };
      tableContainer._paintCycleCharts = paintCycleCharts;

      const searchEl = document.getElementById('cycle-search');
      if (searchEl) {
        searchEl.addEventListener('input', Utils.debounce(() => {
          table.setSearch(searchEl.value);
        }, 200));
      }

      const groupEl = document.getElementById('cycle-group-by');
      groupEl?.addEventListener('change', () => {
        const val = groupEl.value;
        table.setGroupBy(val || null);
      });
    }

    requestAnimationFrame(() => {
      const tableContainer = document.getElementById('cycle-table');
      const table = tableContainer?._cycleTable;
      const state = tableContainer?._cycleState;
      const onSegmentClick = (status) => {
        if (!table || !state) return;
        Object.keys(state.overallFilter).forEach((k) => { state.overallFilter[k] = null; });
        if (state.overallFilter[status] !== undefined) state.overallFilter[status] = 'include';
        tableContainer?._updateBadgeStates?.();
        tableContainer?._applyFilters?.();
        tableContainer?._updateStatsDisplay?.();
        tableContainer?._updateFilterTags?.();
      };
      const onCycleStatusSegmentClick = (status) => {
        if (!table || !state) return;
        Object.keys(state.cycleFilter).forEach((k) => { state.cycleFilter[k] = null; });
        if (['pass', 'fail', 'skip', 'unexecuted'].includes(status)) state.cycleFilter[status] = 'include';
        tableContainer?._updateBadgeStates?.();
        tableContainer?._applyFilters?.();
        tableContainer?._updateStatsDisplay?.();
        tableContainer?._updateFilterTags?.();
      };
      const onModuleClick = (moduleName) => {
        if (!table || !state) return;
        state.moduleFilter = state.moduleFilter === moduleName ? null : moduleName;
        state.projectFilter = null;
        Object.keys(state.cycleFilter).forEach((k) => { state.cycleFilter[k] = null; });
        Object.keys(state.overallFilter).forEach((k) => { state.overallFilter[k] = null; });
        tableContainer?._updateBadgeStates?.();
        tableContainer?._applyFilters?.();
        tableContainer?._updateStatsDisplay?.();
        tableContainer?._updateFilterTags?.();
      };
      const onProjectClick = (projectLabel) => {
        if (!table || !state || !showProjectBreakdown) return;
        state.projectFilter = state.projectFilter === projectLabel ? null : projectLabel;
        state.moduleFilter = null;
        Object.keys(state.cycleFilter).forEach((k) => { state.cycleFilter[k] = null; });
        Object.keys(state.overallFilter).forEach((k) => { state.overallFilter[k] = null; });
        tableContainer?._updateBadgeStates?.();
        tableContainer?._applyFilters?.();
        tableContainer?._updateStatsDisplay?.();
        tableContainer?._updateFilterTags?.();
      };
      if (Object.values(counts).some((v) => v > 0)) {
        renderOverallDonut('cycle-chart-overall', counts, onSegmentClick);
      }
      const cycleChartsHost = container.querySelector('.cycle-charts');
      const cycleTooltip = 'Click to filter. Click again or use Clear to reset.';
      if (cycleRows && cycleRows.length > 0) {
        const moduleItems = ChartBarCard.aggregateCycleItemsByModule(cycleRows);
        if (moduleItems.length > 0) {
          ChartBarCard.renderCycleAggregateTable('cycle-module-table-wrap', moduleItems, 'Module');
          ChartBarCard.createCycleAlignedBarChart(
            'cycle-chart-bar',
            moduleItems,
            onModuleClick,
            chartInstances,
            cycleTooltip
          );
        }
      }
      if (showProjectBreakdown && cycleRows && cycleRows.length > 0) {
        const projectItems = ChartBarCard.aggregateCycleItemsByProject(cycleRows);
        if (projectItems.length > 0) {
          ChartBarCard.renderCycleAggregateTable('cycle-project-table-wrap', projectItems, 'Project');
          ChartBarCard.createCycleAlignedBarChart(
            'cycle-chart-bar-project',
            projectItems,
            onProjectClick,
            chartInstances,
            cycleTooltip
          );
        }
      }
      ChartBarCard.bindTableToggle(container, '#cycle-module-table-toggle', 'cycle-module-table-wrap');
      if (showProjectBreakdown) {
        ChartBarCard.bindTableToggle(container, '#cycle-project-table-toggle', 'cycle-project-table-wrap');
      }
      if (cycleChartsHost) {
        ChartBarCard.bindChartCardWindowControls(cycleChartsHost);
      }
      if (Object.values(cycleStatusCounts).some((v) => v > 0)) {
        renderCycleStatusDonut('cycle-chart-cycle-status', cycleStatusCounts, onCycleStatusSegmentClick);
      }
    });
  }

  return { render, destroyCharts, NO_EXCLUDE, getCycleStatus, getOverallStatus };
})();
