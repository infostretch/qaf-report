/**
 * @author Chirag Jayswal, QAF team
 * Charts view - graphs and visualizations for test execution data
 */
const ChartsViewComponent = (function () {
  if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
  }
  const COLORS = {
    pass: '#2e7d32',
    fail: '#c62828',
    skip: '#757575'
  };

  function getThemeColors() {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return {
      pass: style.getPropertyValue('--color-pass')?.trim() || COLORS.pass,
      fail: style.getPropertyValue('--color-fail')?.trim() || COLORS.fail,
      skip: style.getPropertyValue('--color-skip')?.trim() || COLORS.skip,
      text: style.getPropertyValue('--color-text')?.trim() || '#212121',
      textMuted: style.getPropertyValue('--color-text-muted')?.trim() || '#757575'
    };
  }

  function getBarDataLabelsOpt(c) {
    if (typeof ChartDataLabels === 'undefined') return {};
    return { datalabels: { display: false } };
  }

  function createBarLabelsPlugin(c) {
    return {
      id: 'bar-labels-custom',
      afterDatasetsDraw(chart) {
        if (chart.config.type !== 'bar' || chart.config.options?.indexAxis !== 'y') return;
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        const datasets = chart.data.datasets;
        if (!datasets || datasets.length === 0) return;
        ctx.save();
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        datasets.forEach((ds, dsIdx) => {
          const meta = chart.getDatasetMeta(dsIdx);
          if (!meta || !meta.data) return;
          meta.data.forEach((el, i) => {
            const v = ds.data?.[i];
            if (v == null || Number(v) <= 0) return;
            const label = (ds.label || '').toLowerCase();
            const isSkip = label.indexOf('skip') >= 0;
            const txt = String(v);
            const x = (el.base + el.x) / 2;
            const y = el.y;
            ctx.fillStyle = isSkip ? '#1a1a1a' : '#ffffff';
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.lineWidth = 2;
            ctx.strokeText(txt, x, y);
            ctx.fillText(txt, x, y);
          });
        });
        ctx.restore();
      }
    };
  }

  function getLineDataLabelsOpt(c) {
    if (typeof ChartDataLabels === 'undefined') return {};
    return {
      datalabels: {
        display: (ctx) => (ctx.raw != null && ctx.raw > 0),
        formatter: (v) => v,
        color: c.text,
        font: { size: 9, weight: 'bold' },
        anchor: 'end',
        align: 'top',
        offset: 2
      }
    };
  }

  function breadcrumbHtml(breadcrumb) {
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

  let chartInstances = [];
  let trendChartInstances = [];
  const TREND_PAGE_SIZE = 10;
  let trendOffset = 0;
  let trendOffsetPersisted = 0;
  let trendReportsData = [];
  let trendSelectedDirs = new Set();
  let trendOnSelectionChange = null;
  function destroyCharts() {
    if (typeof ChartBarCard !== 'undefined') {
      ChartBarCard.teardownChartCardWindowControls();
    }
    chartInstances.forEach((c) => {
      try { c.destroy(); } catch (e) {}
    });
    chartInstances = [];
    trendChartInstances.forEach((c) => {
      try { c.destroy(); } catch (e) {}
    });
    trendChartInstances = [];
  }

  function destroyTrendChartsOnly() {
    trendChartInstances.forEach((c) => {
      try { c.destroy(); } catch (e) {}
    });
    trendChartInstances = [];
  }

  function renderStatusChart(canvasId, pass, fail, skip, total, onSegmentClick, comparisonExecutions) {
    const canvas = document.getElementById(canvasId);
    const wrapper = canvas?.parentElement;
    if (!wrapper || typeof Chart === 'undefined') return;
    const c = getThemeColors();
    const keys = ['pass', 'fail', 'skip'];
    const values = [pass, fail, skip];
    if (comparisonExecutions && comparisonExecutions.length > 1) {
      wrapper.classList.add('chart-status-multi-donut');
      const labels = ['Pass', 'Fail', 'Skip'];
      const datasets = comparisonExecutions.map((exec) => {
        const execPass = exec.pass ?? 0;
        const execFail = exec.fail ?? 0;
        const execSkip = exec.skip ?? 0;
        return {
          data: [execPass, execFail, execSkip],
          backgroundColor: [c.pass, c.fail, c.skip],
          borderWidth: 0,
          weight: 1,
          datalabels: { display: false }
        };
      });
      const chart = new Chart(canvas, {
        type: 'doughnut',
        data: { labels, datasets },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: true,
          cutout: '50%',
          spacing: 2,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const execIdx = ctx.datasetIndex;
                  const exec = comparisonExecutions[execIdx];
                  const total = (exec?.pass ?? 0) + (exec?.fail ?? 0) + (exec?.skip ?? 0);
                  return (exec?.name || 'Exec ' + (execIdx + 1)).slice(0, 20) + ' · ' + ctx.label + ': ' + ctx.raw + (total > 0 ? ' (' + Math.round((ctx.raw / total) * 100) + '%)' : '');
                }
              }
            }
          }
        }
      });
      chartInstances.push(chart);
      return;
    }
    const data = values.filter((v) => v > 0);
    const labels = ['Pass', 'Fail', 'Skip'].filter((_, i) => values[i] > 0);
    const colors = [c.pass, c.fail, c.skip].filter((_, i) => values[i] > 0);
    const keyIndices = keys.filter((_, i) => values[i] > 0);
    const datalabelsOpt = typeof ChartDataLabels !== 'undefined' ? {
      datalabels: {
        formatter: (value) => {
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return pct + '%';
        },
        color: '#fff',
        font: { size: 14, weight: 'bold' },
        textStrokeColor: 'rgba(0,0,0,0.4)',
        textStrokeWidth: 1,
        anchor: 'center',
        align: 'center'
      }
    } : {};
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 0 }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          ...datalabelsOpt,
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => (ctx.raw != null ? ctx.label + ': ' + ctx.raw + ' / ' + total : ctx.label),
              afterLabel: () => 'Click to drill down'
            }
          }
        },
        cutout: '60%',
        onClick: (ev, elements) => {
          if (elements.length > 0 && onSegmentClick && keyIndices[elements[0].index]) {
            onSegmentClick(keyIndices[elements[0].index]);
          }
        }
      }
    });
    chartInstances.push(chart);
  }

  function formatExecDate(ts) {
    return ts != null && !isNaN(ts) ? (typeof Utils !== 'undefined' && Utils.formatDateOnly ? Utils.formatDateOnly(ts) : new Date(ts).toLocaleDateString()) : '-';
  }

  function formatExecLabel(ts) {
    if (ts == null || isNaN(ts)) return '-';
    return new Date(ts).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderTrendBar(canvasId, reportsData, onExecutionToggle, selectedDirs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const c = getThemeColors();
    const sorted = [...reportsData].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    const labels = sorted.map((r) => formatExecLabel(r.startTime));
    const isSelected = (r) => selectedDirs && selectedDirs.has(r.dir);
    const dimmed = (color, r) => (isSelected(r) ? color : (color + '80'));
    const clickPlugin = {
      id: 'trend-bar-label-click',
      afterEvent(chart, args) {
        if (args.event.type !== 'click' || !onExecutionToggle || !chart.scales?.y) return;
        const pos = Chart.helpers.getRelativePosition(args.event, chart);
        const value = chart.scales.y.getValueForPixel(pos.y);
        const idx = Math.round(value);
        if (idx >= 0 && idx < sorted.length && sorted[idx]) {
          onExecutionToggle(sorted[idx]);
        }
      }
    };
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Pass', data: sorted.map((r) => r.pass ?? 0), backgroundColor: sorted.map((r) => dimmed(c.pass, r)), borderColor: sorted.map((r) => isSelected(r) ? '#1565c0' : 'transparent'), borderWidth: sorted.map((r) => isSelected(r) ? 2 : 0) },
          { label: 'Fail', data: sorted.map((r) => r.fail ?? 0), backgroundColor: sorted.map((r) => dimmed(c.fail, r)), borderColor: sorted.map((r) => isSelected(r) ? '#1565c0' : 'transparent'), borderWidth: sorted.map((r) => isSelected(r) ? 2 : 0) },
          { label: 'Skip', data: sorted.map((r) => r.skip ?? 0), backgroundColor: sorted.map((r) => dimmed(c.skip, r)), borderColor: sorted.map((r) => isSelected(r) ? '#1565c0' : 'transparent'), borderWidth: sorted.map((r) => isSelected(r) ? 2 : 0) }
        ]
      },
      plugins: [clickPlugin, createBarLabelsPlugin(c)],
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { stacked: true, ticks: { color: c.textMuted } },
          y: { stacked: true, ticks: { color: c.text } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterTitle: (ctx) => {
                const r = sorted[ctx[0]?.dataIndex];
                if (!r) return '';
                const total = (r.pass ?? 0) + (r.fail ?? 0) + (r.skip ?? 0);
                return 'Date: ' + formatExecDate(r.startTime) + ' · Total: ' + total;
              },
              afterLabel: () => 'Click to toggle selection for comparison'
            }
          }
        }
      }
    });
    trendChartInstances.push(chart);
  }

  function formatDurationShort(ms) {
    if (ms == null || isNaN(ms)) return '-';
    const sec = Math.round(ms / 1000);
    return sec < 60 ? sec + 's' : Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
  }

  function renderTrendLine(canvasId, reportsData, onExecutionToggle, selectedDirs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const c = getThemeColors();
    const sorted = [...reportsData].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    const labels = sorted.map((r) => formatExecLabel(r.startTime));
    const durationData = sorted.map((r) => (r.duration != null ? Math.round(r.duration / 1000) : null));
    const isSelected = (r) => selectedDirs && selectedDirs.has(r.dir);
    const pointRadius = sorted.map((r) => isSelected(r) ? 6 : 3);
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Pass', data: sorted.map((r) => r.pass ?? 0), borderColor: c.pass, backgroundColor: c.pass + '20', fill: true, tension: 0.2, pointRadius },
          { label: 'Fail', data: sorted.map((r) => r.fail ?? 0), borderColor: c.fail, backgroundColor: c.fail + '20', fill: true, tension: 0.2, pointRadius },
          { label: 'Skip', data: sorted.map((r) => r.skip ?? 0), borderColor: c.skip, backgroundColor: c.skip + '20', fill: true, tension: 0.2, pointRadius },
          { label: 'Duration (s)', data: durationData, borderColor: '#1565c0', backgroundColor: 'transparent', fill: false, tension: 0.2, yAxisID: 'yDuration', pointRadius }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: c.textMuted } },
          y: { beginAtZero: true, ticks: { color: c.textMuted } },
          yDuration: { type: 'linear', position: 'right', beginAtZero: true, ticks: { color: '#1565c0' }, grid: { drawOnChartArea: false } }
        },
        plugins: {
          ...getLineDataLabelsOpt(c),
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterTitle: (ctx) => {
                const r = sorted[ctx[0]?.dataIndex];
                if (!r) return '';
                const total = (r.pass ?? 0) + (r.fail ?? 0) + (r.skip ?? 0);
                let line = 'Date: ' + formatExecDate(r.startTime) + ' · Total: ' + total;
                if (r.duration != null) line += ' · Duration: ' + formatDurationShort(r.duration);
                return line;
              },
              afterLabel: () => 'Click point to toggle selection for comparison'
            }
          }
        },
        onClick: (ev, elements) => {
          if (elements.length > 0 && onExecutionToggle) {
            const idx = elements[0].index;
            if (sorted[idx]) onExecutionToggle(sorted[idx]);
          }
        }
      }
    });
    trendChartInstances.push(chart);
  }

  function render(containerId, options) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const {
      breadcrumb,
      onBreadcrumbClick,
      headerStats,
      execMeta,
      testsetsWithStats,
      modulesWithStats,
      reportsData,
      reports,
      onStatusClick,
      onExecutionClick,
      onExecutionToggle,
      onSelectionChange,
      selectedReportDirs,
      comparisonExecutions,
      onSuiteClick,
      onModuleClick
    } = options;

    destroyCharts();

    const pass = headerStats?.pass ?? execMeta?.pass ?? 0;
    const fail = headerStats?.fail ?? execMeta?.fail ?? 0;
    const skip = headerStats?.skip ?? execMeta?.skip ?? 0;
    const total = pass + fail + skip;

    let html = breadcrumbHtml(breadcrumb);
    const hasSuiteData = testsetsWithStats && testsetsWithStats.some((t) => (t.executions?.length > 0) || (t.pass || 0) + (t.fail || 0) + (t.skip || 0) > 0);
    const hasReportsData = reportsData && reportsData.length > 0;
    const hasTrendNav = hasReportsData && reportsData.length > TREND_PAGE_SIZE;
    const trendNavHtml = hasTrendNav
      ? '<div class="chart-trend-nav"><button type="button" class="btn-trend-prev" aria-label="Older">◀ Older</button><span class="chart-trend-range"></span><button type="button" class="btn-trend-next" aria-label="Newer">Newer ▶</button></div>'
      : '';
    const trendControlsHtml = hasReportsData ? '<div class="chart-trend-controls"><div class="chart-trend-selection-hint" id="chart-trend-selection-hint"></div>' + trendNavHtml + '</div>' : '';
    const toolbar = ChartBarCard.chartCardToolbarHtml();
    html += '<div class="charts-header"><h2>Charts</h2>' + trendControlsHtml + '</div>';
    html += '<div class="charts-grid charts-grid-quad">';
    html +=
      '<div class="chart-card">' +
      '<div class="chart-card-header">' +
      '<h3>Status breakdown</h3>' +
      toolbar +
      '</div>' +
      '<div class="chart-card-body"><div class="chart-wrap chart-donut"><canvas id="chart-status-donut"></canvas></div></div>' +
      '</div>';
    if (hasReportsData) {
      html +=
        '<div class="chart-card" id="chart-trend-bar-card">' +
        '<div class="chart-card-header">' +
        '<h3>Trend by execution</h3>' +
        toolbar +
        '</div>' +
        '<div class="chart-card-body"><div class="chart-trend-wrap"><div class="chart-wrap chart-trend"><canvas id="chart-trend-bar"></canvas></div></div></div>' +
        '</div>';
    }
    if (hasSuiteData || (modulesWithStats && modulesWithStats.length > 0)) {
      const hasModuleData = modulesWithStats && modulesWithStats.some((t) => (t.executions?.length > 0) || (t.pass || 0) + (t.fail || 0) + (t.skip || 0) > 0);
      if (hasSuiteData) {
        const suiteHasMulti = !!(comparisonExecutions && comparisonExecutions.length > 1);
        html += ChartBarCard.getBarCardHtml({
          title: 'By suite',
          cardClass: 'chart-card-suite',
          canvasId: 'chart-suite-bar',
          tableWrapId: 'chart-suite-table-wrap',
          toggleButtonId: 'chart-suite-table-toggle',
          isMultiExec: suiteHasMulti,
          includeToolbar: true,
          chartWrapClass: 'chart-suite'
        });
      }
      if (hasModuleData) {
        const isMultiExec = !!(comparisonExecutions && comparisonExecutions.length > 1);
        html += ChartBarCard.getBarCardHtml({
          title: 'By module',
          cardClass: 'chart-card-module',
          canvasId: 'chart-module-bar',
          tableWrapId: 'chart-module-table-wrap',
          toggleButtonId: 'chart-module-table-toggle',
          isMultiExec,
          includeToolbar: true,
          chartWrapClass: 'chart-suite'
        });
      }
    }
    if (hasReportsData) {
      html +=
        '<div class="chart-card chart-trend-line-card" id="chart-trend-line-card">' +
        '<div class="chart-card-header">' +
        '<h3>Trend (line)</h3>' +
        toolbar +
        '</div>' +
        '<div class="chart-card-body"><div class="chart-trend-wrap"><div class="chart-wrap chart-trend"><canvas id="chart-trend-line"></canvas></div></div></div>' +
        '</div>';
    }
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

    trendReportsData = reportsData || [];
    trendOnSelectionChange = onSelectionChange;
    trendOffset = options.initialTrendOffset ?? trendOffsetPersisted;
    trendSelectedDirs = new Set(selectedReportDirs || (options.initialSelectedDir ? [options.initialSelectedDir] : []));

    function updateSelectionHint() {
      const hintEl = container.querySelector('#chart-trend-selection-hint');
      if (!hintEl) return;
      const n = trendSelectedDirs.size;
      if (n === 0) {
        hintEl.innerHTML = '<span class="chart-trend-hint">Click a bar or point to add executions to comparison</span>';
      } else if (n === 1) {
        hintEl.innerHTML = '<span class="chart-trend-hint">1 execution selected</span> <button type="button" class="btn-trend-clear" id="btn-trend-clear">Clear</button>';
      } else {
        hintEl.innerHTML = '<span class="chart-trend-hint">' + n + ' executions selected for comparison</span> <button type="button" class="btn-trend-clear" id="btn-trend-clear">Clear</button>';
      }
      container.querySelector('#btn-trend-clear')?.addEventListener('click', () => {
        trendSelectedDirs.clear();
        updateSelectionHint();
        updateTrendCharts();
        if (trendOnSelectionChange) trendOnSelectionChange([]);
      });
    }

    function handleExecutionToggle(report) {
      if (trendSelectedDirs.has(report.dir)) {
        trendSelectedDirs.delete(report.dir);
      } else {
        trendSelectedDirs.add(report.dir);
      }
      const selected = trendReportsData.filter((r) => trendSelectedDirs.has(r.dir));
      updateSelectionHint();
      updateTrendCharts();
      if (trendOnSelectionChange) trendOnSelectionChange(selected);
    }

    function getTrendSlice() {
      if (!trendReportsData.length) return [];
      const start = Math.min(trendOffset, Math.max(0, trendReportsData.length - TREND_PAGE_SIZE));
      const slice = trendReportsData.slice(start, start + TREND_PAGE_SIZE);
      return [...slice].reverse();
    }

    function updateTrendCharts() {
      const slice = getTrendSlice();
      if (slice.length > 0) {
        destroyTrendChartsOnly();
        const handler = trendOnSelectionChange ? handleExecutionToggle : onExecutionClick;
        renderTrendBar('chart-trend-bar', slice, handler, trendSelectedDirs);
        renderTrendLine('chart-trend-line', slice, handler, trendSelectedDirs);
        updateSelectionHint();
      }
      container.querySelectorAll('.chart-trend-range').forEach((rangeEl) => {
        if (trendReportsData.length > TREND_PAGE_SIZE) {
          const start = trendOffset + 1;
          const end = Math.min(trendOffset + TREND_PAGE_SIZE, trendReportsData.length);
          rangeEl.textContent = start + '–' + end + ' of ' + trendReportsData.length;
        }
      });
      container.querySelectorAll('.btn-trend-prev').forEach((btn) => {
        btn.disabled = trendOffset >= trendReportsData.length - TREND_PAGE_SIZE;
      });
      container.querySelectorAll('.btn-trend-next').forEach((btn) => {
        btn.disabled = trendOffset <= 0;
      });
    }

    requestAnimationFrame(() => {
      if (total > 0) renderStatusChart('chart-status-donut', pass, fail, skip, total, onStatusClick, comparisonExecutions);
      if (reportsData && reportsData.length > 0) {
        const slice = getTrendSlice();
        const handler = trendOnSelectionChange ? handleExecutionToggle : ((r) => onExecutionClick && onExecutionClick(r));
        renderTrendBar('chart-trend-bar', slice, handler, trendSelectedDirs);
        renderTrendLine('chart-trend-line', slice, handler, trendSelectedDirs);
        updateSelectionHint();
        if (reportsData.length > TREND_PAGE_SIZE) {
          container.querySelectorAll('.btn-trend-prev').forEach((btn) => {
            btn.addEventListener('click', () => {
              trendOffset = Math.min(trendOffset + 1, trendReportsData.length - TREND_PAGE_SIZE);
              trendOffsetPersisted = trendOffset;
              updateTrendCharts();
            });
          });
          container.querySelectorAll('.btn-trend-next').forEach((btn) => {
            btn.addEventListener('click', () => {
              trendOffset = Math.max(0, trendOffset - 1);
              trendOffsetPersisted = trendOffset;
              updateTrendCharts();
            });
          });
          container.querySelectorAll('.chart-trend-range').forEach((rangeEl) => {
            rangeEl.textContent = '1–' + Math.min(TREND_PAGE_SIZE, trendReportsData.length) + ' of ' + trendReportsData.length;
          });
          container.querySelectorAll('.btn-trend-next').forEach((btn) => {
            btn.disabled = true;
          });
        }
      }
      if (testsetsWithStats && testsetsWithStats.length > 0) {
        const hasSuiteData = testsetsWithStats.some((t) => (t.executions?.length > 0) || (t.pass || 0) + (t.fail || 0) + (t.skip || 0) > 0);
        if (hasSuiteData) {
          ChartBarCard.renderPassFailSkipComparisonTable('chart-suite-table-wrap', {
            primaryColumnLabel: 'Suite',
            getRowKey: (item) => item.path,
            getRowLabelTable: (item) => ChartBarCard.getDisplayNamePath(item.path),
            items: testsetsWithStats,
            comparisonExecutions,
            formatExecLabel,
            tableExtraClass: 'chart-suite-table'
          });
          ChartBarCard.createAlignedHorizontalBarChart(
            'chart-suite-bar',
            {
              items: testsetsWithStats,
              comparisonExecutions,
              getRowKey: (item) => item.path,
              getChartYLabel: (item) => ChartBarCard.getDisplayNamePath(item.path).slice(0, 20),
              getGroupKey: (item) => item.path,
              onBarClick: onSuiteClick,
              tooltipAfterLabel: 'Click label or bar to view suite'
            },
            chartInstances
          );
        }
      }
      if (modulesWithStats && modulesWithStats.length > 0) {
        const hasModuleData = modulesWithStats.some((t) => (t.executions?.length > 0) || (t.pass || 0) + (t.fail || 0) + (t.skip || 0) > 0);
        if (hasModuleData) {
          ChartBarCard.renderPassFailSkipComparisonTable('chart-module-table-wrap', {
            primaryColumnLabel: 'Module',
            getRowKey: (item) => item.path || item.module,
            getRowLabelTable: (item) => item.path || item.module || '-',
            items: modulesWithStats,
            comparisonExecutions,
            formatExecLabel
          });
          ChartBarCard.createAlignedHorizontalBarChart(
            'chart-module-bar',
            {
              items: modulesWithStats,
              comparisonExecutions,
              getRowKey: (item) => item.path || item.module,
              getChartYLabel: (item) => String(item.path || item.module || '-').slice(0, 20),
              onBarClick: onModuleClick,
              tooltipAfterLabel: 'Click label or bar to filter by module'
            },
            chartInstances
          );
        }
      }
      ChartBarCard.bindTableToggle(container, '#chart-module-table-toggle', 'chart-module-table-wrap');
      ChartBarCard.bindTableToggle(container, '#chart-suite-table-toggle', 'chart-suite-table-wrap');
      ChartBarCard.bindChartCardWindowControls(container);
    });
  }

  return { render, destroyCharts };
})();
