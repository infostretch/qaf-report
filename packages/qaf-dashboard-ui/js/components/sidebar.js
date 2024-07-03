/**
 * @author Chirag Jayswal, QAF team
 * Sidebar - drill-down tree with meaningful details (counts, duration, status)
 */
const SidebarComponent = (function () {
  function getStatus(pass, fail, skip, total) {
    if (total === 0) return 'empty';
    if (fail > 0) return 'fail';
    if (skip > 0 && pass === 0) return 'skip';
    return 'pass';
  }

  function formatShortDuration(ms) {
    if (ms == null || isNaN(ms)) return '';
    const sec = Math.round(ms / 1000);
    return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
  }

  function getDisplayName(path, fallback) {
    if (!path) return fallback || 'Unknown';
    const parts = path.split('/');
    const last = parts[parts.length - 1] || path;
    return last.replace(/\.feature$/, '').replace(/_/g, ' ');
  }

  function renderExecutionHeader(execMeta) {
    const status = getStatus(execMeta?.pass, execMeta?.fail, execMeta?.skip, execMeta?.total);
    const duration = execMeta?.endTime && execMeta?.startTime
      ? execMeta.endTime - execMeta.startTime
      : null;
    const dateStr = execMeta?.startTime ? Utils.formatDateOnly(execMeta.startTime) : '';
    return `
      <div class="sidebar-exec-header">
        <h3>${Utils.escapeHtml(execMeta?.name || 'Execution')}</h3>
        <div class="sidebar-exec-stats">
          <span>${Utils.statusBadge(status)}</span>
          <span class="pass">${execMeta?.pass ?? 0} pass</span>
          <span class="fail">${execMeta?.fail ?? 0} fail</span>
          <span class="skip">${execMeta?.skip ?? 0} skip</span>
          <span>${execMeta?.total ?? 0} total</span>
          ${duration ? `<span>${formatShortDuration(duration)}</span>` : ''}
          ${dateStr ? `<span class="sidebar-exec-date">${Utils.escapeHtml(dateStr)}</span>` : ''}
        </div>
      </div>
    `;
  }

  function renderTestsets(testsets, selectedPath, collapsed) {
    if (!testsets?.length) return '';
    const collapseClass = collapsed ? 'collapsed' : '';
    let html = '<div class="sidebar-section sidebar-section-collapsible ' + collapseClass + '">';
    html += '<button class="sidebar-section-title sidebar-section-toggle" type="button" aria-expanded="' + !collapsed + '">';
    html += '<span>Suites</span><span class="sidebar-toggle-icon">▼</span>';
    html += '</button>';
    html += '<div class="sidebar-section-body">';
    testsets.forEach((ts) => {
      const isSelected = ts.path === selectedPath;
      const status = getStatus(ts.pass, ts.fail, ts.skip, ts.total);
      const name = getDisplayName(ts.path, ts.path);
      html += `
        <button class="sidebar-item ${isSelected ? 'selected' : ''}" data-path="${Utils.escapeHtml(ts.path)}" data-type="testset">
          <span class="sidebar-item-name">${Utils.escapeHtml(name)}</span>
          <span class="sidebar-item-meta">
            ${Utils.statusBadge(status)}
            <span class="pass">${ts.pass ?? 0}P</span>
            <span class="fail">${ts.fail ?? 0}F</span>
            <span class="skip">${ts.skip ?? 0}S</span>
            ${ts.duration ? `<span>${formatShortDuration(ts.duration)}</span>` : ''}
          </span>
        </button>
      `;
    });
    html += '</div></div>';
    return html;
  }

  function renderClasses(classes, selectedPath) {
    if (!classes?.length) return '';
    let html = '<div class="sidebar-section"><div class="sidebar-section-title">Classes / Features</div>';
    classes.forEach((cls) => {
      const isSelected = cls.path === selectedPath;
      const status = getStatus(cls.pass, cls.fail, cls.skip, cls.total);
      const name = getDisplayName(cls.path, cls.path);
      html += `
        <button class="sidebar-item ${isSelected ? 'selected' : ''}" data-path="${Utils.escapeHtml(cls.path)}" data-type="class">
          <span class="sidebar-item-name">${Utils.escapeHtml(name)}</span>
          <span class="sidebar-item-meta">
            ${Utils.statusBadge(status)}
            <span class="pass">${cls.pass ?? 0}P</span>
            <span class="fail">${cls.fail ?? 0}F</span>
            <span class="skip">${cls.skip ?? 0}S</span>
            <span>${cls.total ?? 0} tests</span>
          </span>
        </button>
      `;
    });
    html += '</div>';
    return html;
  }

  function renderOverview(reports, selectedReport, onExecutionClick, collapsed) {
    if (!reports?.length) return '<div class="sidebar-loading">No executions found</div>';
    const collapseClass = collapsed ? 'collapsed' : '';
    let html = '<div class="sidebar-section sidebar-section-collapsible ' + collapseClass + '">';
    html += '<button class="sidebar-section-title sidebar-section-toggle" type="button" aria-expanded="' + !collapsed + '">';
    html += '<span>Executions</span><span class="sidebar-toggle-icon">▼</span>';
    html += '</button>';
    html += '<div class="sidebar-section-body">';
    reports.forEach((r, i) => {
      const name = (r.name || r.dir || 'Unknown').replace(/_/g, ' ');
      const isSelected = selectedReport && (r.dir === selectedReport.dir || r === selectedReport);
      html += `
        <button class="sidebar-item sidebar-exec-item ${isSelected ? 'selected' : ''}" data-index="${i}">
          <span class="sidebar-item-name">${Utils.escapeHtml(name)}</span>
          <span class="sidebar-item-meta">${Utils.formatTimestamp(r.startTime)}</span>
        </button>
      `;
    });
    html += '</div></div>';
    return html;
  }

  function render(containerId, config) {
    const {
      execMeta,
      testsets,
      classes,
      selectedTestset,
      selectedClass,
      onTestsetSelect,
      onClassSelect,
      reports,
      onExecutionClick,
      selectedReport
    } = config;
    const container = document.getElementById(containerId);
    if (!container) return;

    const collapseExecutions = !!selectedReport;
    let html = '';
    if (reports?.length) {
      html += renderOverview(reports, selectedReport, onExecutionClick, collapseExecutions);
    }
    if (execMeta) {
      html += renderExecutionHeader(execMeta);
    }
    if (testsets?.length) {
      const collapseSuites = !!selectedTestset;
      html += renderTestsets(testsets, selectedTestset, collapseSuites);
    }
    if (classes?.length) {
      html += renderClasses(classes, selectedClass);
    }

    container.innerHTML = html || '<div class="sidebar-loading">Select a folder to load test results</div>';

    container.querySelectorAll('.sidebar-section-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const section = toggle.closest('.sidebar-section-collapsible');
        if (section) {
          section.classList.toggle('collapsed');
          toggle.setAttribute('aria-expanded', section.classList.contains('collapsed') ? 'false' : 'true');
        }
      });
    });

    container.querySelectorAll('.sidebar-exec-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        const report = reports?.[idx];
        if (report && onExecutionClick) onExecutionClick(report);
      });
    });

    container.querySelectorAll('.sidebar-item[data-type="testset"]').forEach(btn => {
      btn.addEventListener('click', () => onTestsetSelect && onTestsetSelect(btn.dataset.path));
    });
    container.querySelectorAll('.sidebar-item[data-type="class"]').forEach(btn => {
      btn.addEventListener('click', () => onClassSelect && onClassSelect(btn.dataset.path));
    });
  }

  return {
    render,
    getDisplayName,
    getStatus,
    formatShortDuration
  };
})();
