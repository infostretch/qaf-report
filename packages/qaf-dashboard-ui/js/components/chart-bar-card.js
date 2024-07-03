/**
 * @author Chirag Jayswal, QAF team
 * Reusable horizontal stacked bar chart card (Chart view "By module" shell):
 * card header, optional min/max toolbar, data table toggle, scroll/layout aligned with bar rows.
 * Caller supplies all data; no fetch or server assumptions.
 */
const ChartBarCard = (function () {
  const MODULE_ROW_HEIGHT = 22;
  const MODULE_CHART_OFFSET_PER_BAR = 30 / 26;

  const COLORS = {
    pass: '#2e7d32',
    fail: '#c62828',
    skip: '#757575'
  };

  function getThemeColorsPassFailSkip() {
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

  function getBarDataLabelsOpt() {
    if (typeof ChartDataLabels === 'undefined') return {};
    return { datalabels: { display: false } };
  }

  /** Pass/fail/skip segment counts on bars (Chart view). */
  function createBarLabelsPluginPassFailSkip() {
    return {
      id: 'bar-labels-custom',
      afterDatasetsDraw(chart) {
        if (chart.config.type !== 'bar' || chart.config.options?.indexAxis !== 'y') return;
        const ctx = chart.ctx;
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

  /** Cycle view 7-stack: light text on pass/fail/fixed/broken/unstable; dark on skip/not-run. */
  function createBarLabelsPluginMultiStack() {
    return {
      id: 'bar-labels-multi-stack',
      afterDatasetsDraw(chart) {
        if (chart.config.type !== 'bar' || chart.config.options?.indexAxis !== 'y') return;
        const ctx = chart.ctx;
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
            const useDarkText =
              label.includes('skip') || label.includes('not run') || label.toLowerCase().includes('unexecuted');
            const txt = String(v);
            const x = (el.base + el.x) / 2;
            const y = el.y;
            ctx.fillStyle = useDarkText ? '#1a1a1a' : '#ffffff';
            ctx.strokeStyle = useDarkText ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)';
            ctx.lineWidth = 2;
            ctx.strokeText(txt, x, y);
            ctx.fillText(txt, x, y);
          });
        });
        ctx.restore();
      }
    };
  }

  function chartCardToolbarHtml() {
    const minSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14"/></svg>';
    const maxSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
    const restoreSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4v4M9 21H5v-4M21 3l-7 7M3 21l7-7"/></svg>';
    return (
      '<div class="chart-card-toolbar" role="toolbar" aria-label="Chart window">' +
      '<button type="button" class="chart-card-btn chart-card-btn-min" title="Minimize" aria-label="Minimize">' +
      minSvg +
      '</button>' +
      '<button type="button" class="chart-card-btn chart-card-btn-max" title="Maximize" aria-label="Maximize">' +
      maxSvg +
      '</button>' +
      '<button type="button" class="chart-card-btn chart-card-btn-restore hidden" title="Restore" aria-label="Restore">' +
      restoreSvg +
      '</button>' +
      '</div>'
    );
  }

  /**
   * @param {object} options
   * @param {string} options.title
   * @param {string} options.canvasId
   * @param {string} options.tableWrapId
   * @param {string} [options.toggleButtonId]
   * @param {string} [options.cardClass] extra classes on root (e.g. chart-card-module, chart-card-suite)
   * @param {string} [options.cardId]
   * @param {boolean} [options.isMultiExec]
   * @param {boolean} [options.includeToolbar]
   * @param {string} [options.chartWrapClass] default chart-suite
   */
  function getBarCardHtml(options) {
    const title = options.title || '';
    const canvasId = options.canvasId || '';
    const tableWrapId = options.tableWrapId || '';
    const toggleButtonId = options.toggleButtonId;
    const cardClass = options.cardClass || '';
    const cardId = options.cardId || '';
    const isMultiExec = !!options.isMultiExec;
    const includeToolbar = options.includeToolbar !== false;
    const chart_wrapClass = options.chartWrapClass || 'chart-suite';

    let classes = 'chart-card chart-bar-card' + (cardClass ? ' ' + cardClass : '');
    if (isMultiExec) classes += ' chart-card-module-multi';
    const idAttr = cardId ? ' id="' + Utils.escapeHtml(cardId) + '"' : '';
    const toolbar = includeToolbar ? chartCardToolbarHtml() : '';
    const toggleHtml = toggleButtonId
      ? '<button type="button" class="chart-table-toggle-btn" id="' +
        Utils.escapeHtml(toggleButtonId) +
        '" title="Chart only — click to show chart and table" aria-label="Chart only — click to show chart and table" aria-pressed="false" data-chart-table-mode="chart"><span class="chart-table-icon">&#9638;</span></button>'
      : '';

    return (
      '<div class="' +
      Utils.escapeHtml(classes) +
      '"' +
      idAttr +
      '>' +
      '<div class="chart-card-header">' +
      '<div class="chart-card-header-main chart-title-row">' +
      '<h3>' +
      Utils.escapeHtml(title) +
      '</h3>' +
      toggleHtml +
      '</div>' +
      toolbar +
      '</div>' +
      '<div class="chart-card-body"><div class="chart-module-scroll-wrap"><div class="chart-module-layout chart-view-mode--chart" data-chart-table-mode="chart">' +
      '<div class="chart-wrap ' +
      Utils.escapeHtml(chart_wrapClass) +
      '"><canvas id="' +
      Utils.escapeHtml(canvasId) +
      '"></canvas></div>' +
      '<div class="chart-module-table-wrap hidden" id="' +
      Utils.escapeHtml(tableWrapId) +
      '"></div>' +
      '</div></div></div>' +
      '</div>'
    );
  }

  function getDisplayNamePath(path) {
    if (!path) return '-';
    const parts = String(path).split('/');
    return parts[parts.length - 1]?.replace(/_/g, ' ') || path;
  }

  function defaultFormatExecLabel(ts) {
    if (ts == null || isNaN(ts)) return '-';
    return new Date(ts).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function resizeChartsInElement(el) {
    if (typeof Chart === 'undefined' || !el) return;
    el.querySelectorAll('canvas').forEach((canvas) => {
      const ch = Chart.getChart(canvas);
      if (ch) ch.resize();
    });
  }

  /** Upper bound: card width ≤ this × measured table width (intrinsic content). */
  const CHART_BAR_TABLE_WIDTH_CAP_RATIO = 2;

  /**
   * Measure table natural size without constraining wraps (table may start hidden).
   * @returns {{ width: number, height: number }|null}
   */
  function measureChartTableInWrap(tableWrap) {
    if (!tableWrap) return null;
    const table = tableWrap.querySelector('table');
    if (!table) return null;
    const wasHidden = tableWrap.classList.contains('hidden');
    const cssTextBefore = tableWrap.style.cssText;
    tableWrap.classList.remove('hidden');
    const sep = cssTextBefore.length && !/;\s*$/.test(cssTextBefore.trim()) ? ';' : '';
    tableWrap.style.cssText =
      cssTextBefore +
      sep +
      'position:fixed;left:-99999px;top:0;visibility:hidden;width:max-content;max-width:none;display:block;pointer-events:none;';
    const width = Math.ceil(Math.max(table.scrollWidth, table.offsetWidth));
    const height = Math.ceil(table.offsetHeight);
    tableWrap.style.cssText = cssTextBefore;
    if (wasHidden) tableWrap.classList.add('hidden');
    return { width, height };
  }

  /**
   * Maximized bar card: width = header/chart/table natural size, capped by viewport (not always 100%).
   */
  function syncMaximizedBarCardLayout(cardEl) {
    const layout = cardEl.querySelector('.chart-module-layout');
    const tableWrap = cardEl.querySelector('.chart-module-table-wrap');
    const scrollWrap = cardEl.querySelector('.chart-module-scroll-wrap');
    if (!layout || !scrollWrap) return;

    const mode =
      layout.getAttribute('data-chart-table-mode') ||
      layout.dataset.chartTableMode ||
      (layout.classList.contains('chart-view-mode--table-only')
        ? 'table-only'
        : layout.classList.contains('chart-view-mode--both')
          ? 'both'
          : 'chart');
    const measured = measureChartTableInWrap(tableWrap);
    const tw = measured?.width ?? 0;
    const th = measured?.height ?? 0;
    const gap = 24;
    const cardPad = 32;
    const viewportCap = Math.max(240, window.innerWidth - 40);
    const canvas = cardEl.querySelector('.chart-module-scroll-wrap canvas');

    const chartCssWidth = () => {
      if (!canvas) return 0;
      if (typeof Chart !== 'undefined') {
        const ch = Chart.getChart(canvas);
        const cnv = ch?.canvas || canvas;
        const r = cnv.getBoundingClientRect();
        const w = Math.ceil(r.width || cnv.clientWidth || 0);
        if (w > 0) return w;
      }
      const r2 = canvas.getBoundingClientRect();
      return Math.ceil(r2.width || canvas.clientWidth || 0);
    };

    let chartW = chartCssWidth();
    if (chartW < 160 && (mode === 'chart' || mode === 'both')) chartW = 280;

    let bodyInner = 0;
    if (mode === 'table-only') bodyInner = tw;
    else if (mode === 'chart') bodyInner = chartW;
    else bodyInner = chartW + (tw > 0 ? gap + tw : 0);

    const headerEl = cardEl.querySelector('.chart-card-header');
    const headerW = headerEl ? Math.ceil(headerEl.scrollWidth) : 0;
    let total = Math.max(bodyInner, headerW) + cardPad;
    total = Math.min(Math.max(total, 240), viewportCap);
    cardEl.style.setProperty('--maximized-bar-card-width', total + 'px');
    cardEl.style.setProperty('width', total + 'px', 'important');
    cardEl.style.setProperty('max-width', viewportCap + 'px', 'important');
    cardEl.style.removeProperty('--chart-bar-card-max-width');

    const chartWrap = layout.querySelector('.chart-wrap');
    const chartH = parseFloat(layout.style.height) || parseFloat(chartWrap?.style.height) || layout.offsetHeight || 0;
    let targetH = chartH;
    if (mode === 'table-only' && th > 0) targetH = th;
    else if (mode === 'both' && th > 0) targetH = Math.max(chartH, th);
    if (targetH > 0) {
      layout.style.height = targetH + 'px';
      if (chartWrap) chartWrap.style.height = targetH + 'px';
    }
    scrollWrap.style.maxHeight = 'none';
    resizeChartsInElement(cardEl);

    requestAnimationFrame(() => {
      resizeChartsInElement(cardEl);
      const layoutScroll = Math.ceil(layout.scrollWidth);
      let cw = chartCssWidth();
      if (cw < 160 && (mode === 'chart' || mode === 'both')) cw = 280;
      let inner = 0;
      if (mode === 'table-only') inner = Math.max(tw, layoutScroll);
      else if (mode === 'chart') inner = Math.max(cw, layoutScroll);
      else inner = Math.max(cw + (tw > 0 ? gap + tw : 0), layoutScroll);
      let next = Math.max(inner, headerEl ? Math.ceil(headerEl.scrollWidth) : 0) + cardPad;
      next = Math.min(Math.max(next, 240), viewportCap);
      if (Math.abs(next - total) > 1) {
        cardEl.style.setProperty('--maximized-bar-card-width', next + 'px');
        cardEl.style.setProperty('width', next + 'px', 'important');
        cardEl.style.setProperty('max-width', viewportCap + 'px', 'important');
        resizeChartsInElement(cardEl);
      }
    });
  }

  /**
   * Set --chart-bar-card-max-width and stretch chart/table row height to fit all table rows.
   * @param {Element|null} cardEl .chart-bar-card
   */
  function syncBarCardLayoutFromTable(cardEl) {
    if (!cardEl || !cardEl.classList || !cardEl.classList.contains('chart-bar-card')) return;
    if (!cardEl.classList.contains('chart-card--maximized')) {
      cardEl.style.removeProperty('--maximized-bar-card-width');
      cardEl.style.removeProperty('width');
      cardEl.style.removeProperty('max-width');
    }
    if (cardEl.classList.contains('chart-card--maximized')) {
      syncMaximizedBarCardLayout(cardEl);
      return;
    }
    const tableWrap = cardEl.querySelector('.chart-module-table-wrap');
    const layout = cardEl.querySelector('.chart-module-layout');
    const scrollWrap = cardEl.querySelector('.chart-module-scroll-wrap');
    if (!layout || !scrollWrap) return;

    const mode = layout.dataset.chartTableMode || 'chart';
    const measured = measureChartTableInWrap(tableWrap);
    const tw = measured?.width ?? 0;
    const host = cardEl.closest('.cycle-charts, .charts-grid');
    const hostW =
      host && host.clientWidth > 0 ? host.clientWidth : document.documentElement.clientWidth || window.innerWidth;
    if (tw > 0) {
      const capPx = Math.min(hostW, Math.round(CHART_BAR_TABLE_WIDTH_CAP_RATIO * tw));
      cardEl.style.setProperty('--chart-bar-card-max-width', capPx + 'px');
    } else {
      cardEl.style.removeProperty('--chart-bar-card-max-width');
    }

    const th = measured?.height ?? 0;
    const chartWrap = layout.querySelector('.chart-wrap');
    const chartH = parseFloat(layout.style.height) || parseFloat(chartWrap?.style.height) || layout.offsetHeight || 0;
    let targetH = chartH;
    if (mode === 'table-only' && th > 0) targetH = th;
    else if (mode === 'both' && th > 0) targetH = Math.max(chartH, th);
    if (targetH > 0) {
      layout.style.height = targetH + 'px';
      if (chartWrap) chartWrap.style.height = targetH + 'px';
    }
    scrollWrap.style.minHeight = '';
    scrollWrap.style.maxHeight = 'none';
    resizeChartsInElement(cardEl);
  }

  let chartCardResizeContainer = null;
  let chartCardResizeListener = null;
  let chartCardEscapeHandler = null;
  let chartCardLayoutObserver = null;

  function teardownChartCardWindowControls() {
    if (chartCardResizeListener) {
      window.removeEventListener('resize', chartCardResizeListener);
      chartCardResizeListener = null;
      chartCardResizeContainer = null;
    }
    if (chartCardLayoutObserver) {
      chartCardLayoutObserver.disconnect();
      chartCardLayoutObserver = null;
    }
    if (chartCardEscapeHandler) {
      document.removeEventListener('keydown', chartCardEscapeHandler);
      chartCardEscapeHandler = null;
    }
    document.getElementById('chart-card-max-backdrop')?.classList.add('hidden');
  }

  function bindChartCardWindowControls(container) {
    const backdropId = 'chart-card-max-backdrop';
    let backdrop = document.getElementById(backdropId);
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = backdropId;
      backdrop.className = 'chart-card-max-backdrop hidden';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
    }

    function syncBackdrop() {
      const any = container.querySelector('.chart-card--maximized');
      if (any) backdrop.classList.remove('hidden');
      else backdrop.classList.add('hidden');
    }

    function setCardState(card, state) {
      card.classList.remove('chart-card--minimized', 'chart-card--maximized');
      const minB = card.querySelector('.chart-card-btn-min');
      const maxB = card.querySelector('.chart-card-btn-max');
      const restB = card.querySelector('.chart-card-btn-restore');
      if (state === 'minimized') {
        card.classList.add('chart-card--minimized');
        minB?.classList.add('hidden');
        maxB?.classList.add('hidden');
        restB?.classList.remove('hidden');
      } else if (state === 'maximized') {
        card.classList.add('chart-card--maximized');
        minB?.classList.add('hidden');
        maxB?.classList.add('hidden');
        restB?.classList.remove('hidden');
      } else {
        minB?.classList.remove('hidden');
        maxB?.classList.remove('hidden');
        restB?.classList.add('hidden');
      }
      syncBackdrop();
      requestAnimationFrame(() => {
        if (card.classList.contains('chart-bar-card')) syncBarCardLayoutFromTable(card);
        resizeChartsInElement(card);
        if (card.classList.contains('chart-bar-card')) {
          requestAnimationFrame(() => {
            syncBarCardLayoutFromTable(card);
            resizeChartsInElement(card);
          });
        }
      });
    }

    container.querySelectorAll('.chart-card').forEach((card) => {
      card.querySelector('.chart-card-btn-min')?.addEventListener('click', (e) => {
        e.stopPropagation();
        setCardState(card, 'minimized');
      });
      card.querySelector('.chart-card-btn-max')?.addEventListener('click', (e) => {
        e.stopPropagation();
        container.querySelectorAll('.chart-card--maximized').forEach((c) => {
          if (c !== card) setCardState(c, 'normal');
        });
        setCardState(card, 'maximized');
      });
      card.querySelector('.chart-card-btn-restore')?.addEventListener('click', (e) => {
        e.stopPropagation();
        setCardState(card, 'normal');
      });
    });

    backdrop.onclick = () => {
      container.querySelectorAll('.chart-card--maximized').forEach((c) => setCardState(c, 'normal'));
    };

    if (chartCardResizeListener) {
      window.removeEventListener('resize', chartCardResizeListener);
    }
    chartCardResizeContainer = container;
    chartCardResizeListener = () => {
      if (!chartCardResizeContainer) return;
      chartCardResizeContainer.querySelectorAll('.chart-card').forEach((card) => {
        resizeChartsInElement(card);
      });
      chartCardResizeContainer.querySelectorAll('.chart-bar-card').forEach((card) => {
        syncBarCardLayoutFromTable(card);
      });
    };
    window.addEventListener('resize', chartCardResizeListener);

    if (chartCardLayoutObserver) {
      chartCardLayoutObserver.disconnect();
      chartCardLayoutObserver = null;
    }
    if (typeof ResizeObserver !== 'undefined') {
      chartCardLayoutObserver = new ResizeObserver(() => {
        container.querySelectorAll('.chart-bar-card').forEach((c) => syncBarCardLayoutFromTable(c));
      });
      chartCardLayoutObserver.observe(container);
    }

    if (chartCardEscapeHandler) {
      document.removeEventListener('keydown', chartCardEscapeHandler);
    }
    chartCardEscapeHandler = (ev) => {
      if (ev.key !== 'Escape') return;
      const maxed = container.querySelector('.chart-card--maximized');
      if (!maxed) return;
      ev.preventDefault();
      maxed.querySelector('.chart-card-btn-restore')?.click();
    };
    document.addEventListener('keydown', chartCardEscapeHandler);
  }

  /**
   * Cycle: chart only (default) → chart + table → table only → chart only.
   * @param {Element} layout .chart-module-layout
   * @param {Element} tableWrap .chart-module-table-wrap
   * @param {Element|null} btn toggle button
   * @param {'chart'|'both'|'table-only'} mode
   */
  function setBarCardTableViewMode(layout, tableWrap, btn, mode) {
    if (!layout || !tableWrap) return;
    const valid = mode === 'chart' || mode === 'both' || mode === 'table-only';
    const m = valid ? mode : 'chart';
    layout.dataset.chartTableMode = m;
    layout.classList.remove('chart-view-mode--chart', 'chart-view-mode--both', 'chart-view-mode--table-only');
    layout.classList.add('chart-view-mode--' + m);
    if (m === 'chart') {
      tableWrap.classList.add('hidden');
    } else {
      tableWrap.classList.remove('hidden');
    }
    if (btn) {
      btn.dataset.chartTableMode = m;
      btn.classList.remove('pressed', 'chart-table-toggle--both', 'chart-table-toggle--table-only');
      if (m === 'both') {
        btn.classList.add('pressed', 'chart-table-toggle--both');
      } else if (m === 'table-only') {
        btn.classList.add('pressed', 'chart-table-toggle--table-only');
      }
      const titles = {
        chart: 'Chart only — click for chart + table',
        both: 'Chart + table — click for table only',
        'table-only': 'Table only — click for chart only'
      };
      btn.title = titles[m];
      btn.setAttribute('aria-label', titles[m]);
      btn.setAttribute('aria-pressed', m === 'chart' ? 'false' : 'true');
    }
    const card = layout.closest('.chart-bar-card');
    if (card) {
      requestAnimationFrame(() => {
        resizeChartsInElement(card);
        syncBarCardLayoutFromTable(card);
      });
    }
  }

  /** @param {Element|string} root @param {string} toggleSelector @param {string} wrapId */
  function bindTableToggle(root, toggleSelector, wrapId) {
    const container = typeof root === 'string' ? document.querySelector(root) : root;
    if (!container) return;
    const btn = container.querySelector(toggleSelector);
    if (!btn) return;
    btn.addEventListener('click', function () {
      const tableWrap = document.getElementById(wrapId);
      if (!tableWrap) return;
      const layout = tableWrap.closest('.chart-module-layout');
      if (!layout) return;
      const cur = layout.dataset.chartTableMode || btn.dataset.chartTableMode || 'chart';
      const order = ['chart', 'both', 'table-only'];
      let idx = order.indexOf(cur);
      if (idx < 0) idx = 0;
      const next = order[(idx + 1) % order.length];
      setBarCardTableViewMode(layout, tableWrap, this, next);
    });
  }

  /**
   * @param {string|Element} wrapElOrId
   * @param {object} config
   * @param {string} config.primaryColumnLabel
   * @param {function} config.getRowKey
   * @param {function} config.getRowLabelTable — label for table name column
   * @param {Array} config.items
   * @param {Array} [config.comparisonExecutions]
   * @param {function} [config.formatExecLabel]
   * @param {string} [config.tableExtraClass] e.g. chart-suite-table
   */
  function renderPassFailSkipComparisonTable(wrapElOrId, config) {
    const wrap = typeof wrapElOrId === 'string' ? document.getElementById(wrapElOrId) : wrapElOrId;
    if (!wrap) return;
    const primaryColumnLabel = config.primaryColumnLabel || 'Row';
    const getRowKey = config.getRowKey;
    const getRowLabelTable = config.getRowLabelTable;
    const comparisonExecutions = config.comparisonExecutions;
    const formatExecLabel = config.formatExecLabel || defaultFormatExecLabel;
    const tableExtraClass = config.tableExtraClass ? ' ' + config.tableExtraClass : '';

    const hasExecutions = (t) => t.executions?.length > 0;
    const hasLegacyStats = (t) => (t.pass || 0) + (t.fail || 0) + (t.skip || 0) > 0;
    const items = (config.items || []).filter((t) => hasExecutions(t) || hasLegacyStats(t));
    if (items.length === 0) return;

    const pathToExecs = new Map(items.map((t) => [getRowKey(t), t.executions || []]));
    const sortedExecs = comparisonExecutions && comparisonExecutions.length > 1
      ? [...comparisonExecutions].sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
      : [];
    const execCount = sortedExecs.length;

    let tableHtml =
      '<table class="chart-module-table' +
      tableExtraClass +
      '"><thead><tr><th>' +
      Utils.escapeHtml(primaryColumnLabel) +
      '</th><th>Execution</th><th>Pass</th><th>Fail</th><th>Skip</th><th>Total</th></tr></thead><tbody>';
    let totalPass = 0;
    let totalFail = 0;
    let totalSkip = 0;

    if (execCount > 1) {
      items.forEach((item) => {
        const rowName = getRowLabelTable(item).slice(0, 25);
        const execs = pathToExecs.get(getRowKey(item)) || [];
        const statsByExec = sortedExecs.map((exec) => {
          const e = execs.find((x) => x.dir === exec.dir);
          return { p: e?.pass ?? 0, f: e?.fail ?? 0, s: e?.skip ?? 0 };
        });
        const hasChange = statsByExec.length > 1 && new Set(statsByExec.map((x) => x.p + ',' + x.f + ',' + x.s)).size > 1;
        const rowClass = hasChange ? ' class="chart-module-row-changed"' : '';
        let isFirst = true;
        sortedExecs.forEach((exec, idx) => {
          const st = statsByExec[idx] || { p: 0, f: 0, s: 0 };
          const p = st.p;
          const f = st.f;
          const s = st.s;
          const rowTotal = p + f + s;
          const execLabel =
            exec.startTime != null && !isNaN(exec.startTime)
              ? formatExecLabel(exec.startTime)
              : (exec.name || exec.dir || 'Exec').slice(0, 20);
          tableHtml += '<tr' + rowClass + '>';
          if (isFirst) {
            tableHtml += '<td class="chart-module-name" rowspan="' + execCount + '">' + Utils.escapeHtml(rowName) + '</td>';
            isFirst = false;
          }
          tableHtml +=
            '<td class="chart-module-exec">' +
            Utils.escapeHtml(execLabel) +
            '</td><td class="pass">' +
            p +
            '</td><td class="fail">' +
            f +
            '</td><td class="skip">' +
            s +
            '</td><td class="chart-module-total">' +
            rowTotal +
            '</td></tr>';
          totalPass += p;
          totalFail += f;
          totalSkip += s;
        });
      });
    } else {
      items.forEach((item) => {
        const rowName = getRowLabelTable(item).slice(0, 30);
        const p = item.executions?.[0]?.pass ?? item.pass ?? 0;
        const f = item.executions?.[0]?.fail ?? item.fail ?? 0;
        const s = item.executions?.[0]?.skip ?? item.skip ?? 0;
        const rowTotal = p + f + s;
        tableHtml +=
          '<tr><td class="chart-module-name">' +
          Utils.escapeHtml(rowName) +
          '</td><td class="chart-module-exec">—</td><td class="pass">' +
          p +
          '</td><td class="fail">' +
          f +
          '</td><td class="skip">' +
          s +
          '</td><td class="chart-module-total">' +
          rowTotal +
          '</td></tr>';
        totalPass += p;
        totalFail += f;
        totalSkip += s;
      });
    }

    const grandTotal = totalPass + totalFail + totalSkip;
    tableHtml +=
      '<tr class="chart-module-total-row"><th colspan="2">Total</th><td class="pass">' +
      totalPass +
      '</td><td class="fail">' +
      totalFail +
      '</td><td class="skip">' +
      totalSkip +
      '</td><td class="chart-module-total">' +
      grandTotal +
      '</td></tr>';
    tableHtml += '</tbody></table>';
    wrap.innerHTML = tableHtml;
    const tableCard = wrap.closest('.chart-bar-card');
    if (tableCard) requestAnimationFrame(() => syncBarCardLayoutFromTable(tableCard));
  }

  /**
   * @param {string|HTMLCanvasElement} canvasIdOrEl
   * @param {object} config
   * @param {Array} config.items
   * @param {Array} [config.comparisonExecutions]
   * @param {function} config.getRowKey
   * @param {function} config.getChartYLabel — short label per item row
   * @param {function} [config.getGroupKey] — for boundaries; default getRowKey(module)
   * @param {function} config.onBarClick — (rowKey) => void
   * @param {string} [config.tooltipAfterLabel]
   * @param {Array} config.chartInstances — mutate: push Chart
   */
  function createAlignedHorizontalBarChart(canvasIdOrEl, config, chartInstances) {
    const canvas = typeof canvasIdOrEl === 'string' ? document.getElementById(canvasIdOrEl) : canvasIdOrEl;
    if (!canvas || typeof Chart === 'undefined') return;
    const c = getThemeColorsPassFailSkip();
    const getRowKey = config.getRowKey;
    const getChartYLabel = config.getChartYLabel;
    const getGroupKey = config.getGroupKey || getRowKey;
    const comparisonExecutions = config.comparisonExecutions;
    const onBarClick = config.onBarClick;
    const tooltipAfterLabel = config.tooltipAfterLabel || '';

    const hasExecutions = (t) => t.executions?.length > 0;
    const hasLegacyStats = (t) => (t.pass || 0) + (t.fail || 0) + (t.skip || 0) > 0;
    const items = (config.items || []).filter((t) => hasExecutions(t) || hasLegacyStats(t));
    if (items.length === 0) return;

    const pathToExecs = new Map(items.map((t) => [getRowKey(t), t.executions || []]));
    const sortedExecs = comparisonExecutions && comparisonExecutions.length > 1
      ? [...comparisonExecutions].sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
      : [];
    const execCount = Math.max(1, sortedExecs.length);
    const flattenedRows = [];

    if (execCount > 1) {
      items.forEach((item) => {
        const execs = pathToExecs.get(getRowKey(item)) || [];
        sortedExecs.forEach((exec) => {
          const e = execs.find((x) => x.dir === exec.dir);
          flattenedRows.push({
            group: item,
            pass: e?.pass ?? 0,
            fail: e?.fail ?? 0,
            skip: e?.skip ?? 0
          });
        });
      });
    } else {
      items.forEach((item) => {
        const p = item.executions?.[0]?.pass ?? item.pass ?? 0;
        const f = item.executions?.[0]?.fail ?? item.fail ?? 0;
        const s = item.executions?.[0]?.skip ?? item.skip ?? 0;
        flattenedRows.push({ group: item, pass: p, fail: f, skip: s });
      });
    }

    const dataRows = flattenedRows.length;
    const totalRows = dataRows + 2;
    const layoutHeight = totalRows * MODULE_ROW_HEIGHT + Math.round(dataRows * MODULE_CHART_OFFSET_PER_BAR);
    const layout = canvas.closest('.chart-module-layout');
    const wrap = canvas.parentElement;
    const scrollWrap = canvas.closest('.chart-module-scroll-wrap');
    if (layout) {
      layout.style.height = layoutHeight + 'px';
      layout.style.setProperty('--module-row-height', MODULE_ROW_HEIGHT + 'px');
    }
    if (wrap) wrap.style.height = layoutHeight + 'px';
    if (scrollWrap) scrollWrap.style.setProperty('--module-row-height', MODULE_ROW_HEIGHT + 'px');

    const labels = flattenedRows.map((r) => getChartYLabel(r.group));
    const passData = flattenedRows.map((r) => r.pass);
    const failData = flattenedRows.map((r) => r.fail);
    const skipData = flattenedRows.map((r) => r.skip);

    const barClickPlugin = {
      id: 'bar-row-click',
      afterEvent(chart, args) {
        if (args.event.type !== 'click' || !onBarClick || !chart.scales?.y || flattenedRows.length === 0) return;
        const pos = Chart.helpers.getRelativePosition(args.event, chart);
        const value = chart.scales.y.getValueForPixel(pos.y);
        const idx = Math.round(value);
        if (idx >= 0 && idx < flattenedRows.length && flattenedRows[idx]) {
          onBarClick(getRowKey(flattenedRows[idx].group));
        }
      }
    };

    const boundaryPlugin = {
      id: 'bar-group-boundaries',
      afterDraw(chart) {
        const yScale = chart.scales.y;
        if (!yScale || flattenedRows.length < 2) return;
        const ctx = chart.ctx;
        const boundaries = [];
        for (let i = 0; i < flattenedRows.length - 1; i++) {
          const a = getGroupKey(flattenedRows[i].group);
          const b = getGroupKey(flattenedRows[i + 1].group);
          if (a !== b) boundaries.push(i + 0.5);
        }
        if (boundaries.length === 0) return;
        const left = chart.scales.x.left;
        const right = chart.scales.x.right;
        ctx.save();
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-border') || '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        boundaries.forEach((mid) => {
          const y = yScale.getPixelForValue(mid);
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
        });
        ctx.restore();
      }
    };

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Pass', data: passData, backgroundColor: c.pass, stack: 'stack' },
          { label: 'Fail', data: failData, backgroundColor: c.fail, stack: 'stack' },
          { label: 'Skip', data: skipData, backgroundColor: c.skip, stack: 'stack' }
        ]
      },
      plugins: (typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : []).concat([
        barClickPlugin,
        boundaryPlugin,
        createBarLabelsPluginPassFailSkip()
      ]),
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        layout: {
          padding: { top: MODULE_ROW_HEIGHT, bottom: MODULE_ROW_HEIGHT }
        },
        datasets: {
          bar: {
            maxBarThickness: MODULE_ROW_HEIGHT,
            categoryPercentage: 1,
            barPercentage: 0.95
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: c.textMuted } },
          y: {
            stacked: true,
            ticks: { color: c.text },
            grid: { display: false }
          }
        },
        plugins: {
          ...getBarDataLabelsOpt(),
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const row = flattenedRows[ctx.dataIndex];
                const tot = (row?.pass ?? 0) + (row?.fail ?? 0) + (row?.skip ?? 0);
                return ctx.dataset.label + ': ' + (ctx.raw ?? 0) + (tot > 0 ? ' / ' + tot : '');
              },
              afterLabel: () => tooltipAfterLabel
            }
          }
        }
      }
    });
    chartInstances.push(chart);
    const suiteCard = canvas.closest('.chart-bar-card');
    if (suiteCard) requestAnimationFrame(() => syncBarCardLayoutFromTable(suiteCard));
  }


  /** Map row cycleStatus to in-period buckets (matches cycle donut / table filters). */
  function bucketForCycleStatus(r) {
    const raw = r.cycleStatus || 'not-run';
    if (raw === 'pass' || raw === 'fail' || raw === 'skip') return raw;
    if (raw === 'pending' || raw === 'not-run') return 'unexecuted';
    return 'unexecuted';
  }

  function aggregateCycleItemsByModule(cycleRows) {
    const byModule = new Map();
    (cycleRows || []).forEach((r) => {
      const mod =
        (typeof Utils !== 'undefined' && Utils.getModule ? Utils.getModule(r) : r.metaData?.module) || '-';
      if (!byModule.has(mod)) {
        byModule.set(mod, { path: mod, pass: 0, fail: 0, skip: 0, unexecuted: 0 });
      }
      const s = bucketForCycleStatus(r);
      const m = byModule.get(mod);
      m[s] = (m[s] || 0) + 1;
    });
    return Array.from(byModule.values())
      .filter((t) => (t.pass || 0) + (t.fail || 0) + (t.skip || 0) + (t.unexecuted || 0) > 0)
      .sort((a, b) => {
        const ta = (a.pass || 0) + (a.fail || 0) + (a.skip || 0) + (a.unexecuted || 0);
        const tb = (b.pass || 0) + (b.fail || 0) + (b.skip || 0) + (b.unexecuted || 0);
        return tb - ta;
      });
  }

  function aggregateCycleItemsByProject(cycleRows) {
    const byProject = new Map();
    (cycleRows || []).forEach((r) => {
      const proj =
        r.projectLabel != null && String(r.projectLabel).trim() !== ''
          ? String(r.projectLabel).trim()
          : r.projectId != null && String(r.projectId).trim() !== ''
            ? String(r.projectId).trim()
            : 'Default';
      if (!byProject.has(proj)) {
        byProject.set(proj, {
          path: proj,
          pass: 0,
          fail: 0,
          skip: 0,
          unexecuted: 0
        });
      }
      const s = bucketForCycleStatus(r);
      const m = byProject.get(proj);
      m[s] = (m[s] || 0) + 1;
    });
    return Array.from(byProject.values())
      .filter((t) => (t.pass || 0) + (t.fail || 0) + (t.skip || 0) + (t.unexecuted || 0) > 0)
      .sort((a, b) => {
        const ta = (a.pass || 0) + (a.fail || 0) + (a.skip || 0) + (a.unexecuted || 0);
        const tb = (b.pass || 0) + (b.fail || 0) + (b.skip || 0) + (b.unexecuted || 0);
        return tb - ta;
      });
  }

  function getCycleStatusColors() {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return {
      pass: style.getPropertyValue('--color-pass')?.trim() || '#2e7d32',
      fail: style.getPropertyValue('--color-fail')?.trim() || '#c62828',
      skip: style.getPropertyValue('--color-skip')?.trim() || '#757575',
      unexecuted: '#795548',
      fixed: '#1976d2',
      broken: '#d32f2f',
      unstable: '#f57c00',
      'not-run': style.getPropertyValue('--color-text-muted')?.trim() || '#757575'
    };
  }

  function renderCycleAggregateTable(wrapElOrId, items, primaryColumnLabel) {
    const wrap = typeof wrapElOrId === 'string' ? document.getElementById(wrapElOrId) : wrapElOrId;
    if (!wrap || !items || items.length === 0) return;

    let tableHtml =
      '<table class="chart-module-table chart-cycle-status-table"><thead><tr><th>' +
      Utils.escapeHtml(primaryColumnLabel) +
      '</th><th>Pass</th><th>Fail</th><th>Skip</th><th>UnExecuted</th><th>Total</th></tr></thead><tbody>';

    let sumP = 0;
    let sumF = 0;
    let sumS = 0;
    let sumUx = 0;

    items.forEach((t) => {
      const p = t.pass || 0;
      const f = t.fail || 0;
      const s = t.skip || 0;
      const ux = (t.unexecuted || 0) + (t.pending || 0) + (t['not-run'] || 0);
      const tot = p + f + s + ux;
      sumP += p;
      sumF += f;
      sumS += s;
      sumUx += ux;
      const name = String(t.path || '-').slice(0, 28);
      tableHtml +=
        '<tr><td class="chart-module-name">' +
        Utils.escapeHtml(name) +
        '</td><td class="pass">' +
        p +
        '</td><td class="fail">' +
        f +
        '</td><td class="skip">' +
        s +
        '</td><td>' +
        ux +
        '</td><td class="chart-module-total">' +
        tot +
        '</td></tr>';
    });

    const grand = sumP + sumF + sumS + sumUx;
    tableHtml +=
      '<tr class="chart-module-total-row"><th>Total</th><td class="pass">' +
      sumP +
      '</td><td class="fail">' +
      sumF +
      '</td><td class="skip">' +
      sumS +
      '</td><td>' +
      sumUx +
      '</td><td class="chart-module-total">' +
      grand +
      '</td></tr>';
    tableHtml += '</tbody></table>';
    wrap.innerHTML = tableHtml;
    const cycleTableCard = wrap.closest('.chart-bar-card');
    if (cycleTableCard) requestAnimationFrame(() => syncBarCardLayoutFromTable(cycleTableCard));
  }

  /** In-period stacked bars (cycle view by module / project): align with cycle status donut. */
  const CYCLE_PERIOD_KEYS = ['pass', 'fail', 'skip', 'unexecuted'];
  const CYCLE_PERIOD_LABELS = ['Pass', 'Fail', 'Skip', 'UnExecuted'];

  function createCycleAlignedBarChart(canvasIdOrEl, items, onCategoryClick, chartInstances, tooltipAfterLabel) {
    const canvas = typeof canvasIdOrEl === 'string' ? document.getElementById(canvasIdOrEl) : canvasIdOrEl;
    if (!canvas || typeof Chart === 'undefined' || !items || items.length === 0) return;

    const colors = getCycleStatusColors();
    const text = getComputedStyle(document.documentElement).getPropertyValue('--color-text')?.trim() || '#212121';
    const textMuted = getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted')?.trim() || '#757575';

    const flattenedRows = items.map((item) => ({ item }));
    const dataRows = flattenedRows.length;
    const totalRows = dataRows + 2;
    const layoutHeight = totalRows * MODULE_ROW_HEIGHT + Math.round(dataRows * MODULE_CHART_OFFSET_PER_BAR);
    const layout = canvas.closest('.chart-module-layout');
    const wrap = canvas.parentElement;
    const scrollWrap = canvas.closest('.chart-module-scroll-wrap');
    if (layout) {
      layout.style.height = layoutHeight + 'px';
      layout.style.setProperty('--module-row-height', MODULE_ROW_HEIGHT + 'px');
    }
    if (wrap) wrap.style.height = layoutHeight + 'px';
    if (scrollWrap) scrollWrap.style.setProperty('--module-row-height', MODULE_ROW_HEIGHT + 'px');

    const labels = items.map((t) => String(t.path || '-').slice(0, 22));

    const clickPlugin = {
      id: 'cycle-bar-card-click',
      afterEvent(chart, args) {
        if (args.event.type !== 'click' || !onCategoryClick || !chart.scales?.y || items.length === 0) return;
        const pos = Chart.helpers.getRelativePosition(args.event, chart);
        const value = chart.scales.y.getValueForPixel(pos.y);
        const idx = Math.round(value);
        if (idx >= 0 && idx < items.length && items[idx]) {
          onCategoryClick(items[idx].path);
        }
      }
    };

    const datasets = CYCLE_PERIOD_KEYS.map((k, i) => ({
      label: CYCLE_PERIOD_LABELS[i],
      data: items.map((t) => t[k] || 0),
      backgroundColor: colors[k] || '#999',
      stack: 'stack'
    }));

    const chart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      plugins: (typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : []).concat([
        clickPlugin,
        createBarLabelsPluginMultiStack()
      ]),
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        layout: {
          padding: { top: MODULE_ROW_HEIGHT, bottom: MODULE_ROW_HEIGHT }
        },
        datasets: {
          bar: {
            maxBarThickness: MODULE_ROW_HEIGHT,
            categoryPercentage: 1,
            barPercentage: 0.95
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: textMuted } },
          y: {
            stacked: true,
            ticks: { color: text },
            grid: { display: false }
          }
        },
        plugins: {
          ...getBarDataLabelsOpt(),
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: () => tooltipAfterLabel || 'Click to filter. Click again or use Clear to reset.'
            }
          }
        }
      }
    });
    chartInstances.push(chart);
    const cycleBarCard = canvas.closest('.chart-bar-card');
    if (cycleBarCard) requestAnimationFrame(() => syncBarCardLayoutFromTable(cycleBarCard));
  }

  return {
    MODULE_ROW_HEIGHT,
    MODULE_CHART_OFFSET_PER_BAR,
    chartCardToolbarHtml,
    getBarCardHtml,
    getDisplayNamePath,
    defaultFormatExecLabel,
    resizeChartsInElement,
    syncBarCardLayoutFromTable,
    bindChartCardWindowControls,
    teardownChartCardWindowControls,
    bindTableToggle,
    setBarCardTableViewMode,
    renderPassFailSkipComparisonTable,
    createAlignedHorizontalBarChart,
    aggregateCycleItemsByModule,
    aggregateCycleItemsByProject,
    renderCycleAggregateTable,
    createCycleAlignedBarChart
  };
})();
