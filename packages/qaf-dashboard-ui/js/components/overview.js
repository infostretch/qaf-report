/**
 * @author Chirag Jayswal, QAF team
 * Overview - execution list and summary cards
 */
const OverviewComponent = (function () {
  function render(containerId, rootMetaInfo, onExecutionClick) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const reports = rootMetaInfo?.reports || [];
    if (reports.length === 0) {
      container.innerHTML = '<p class="empty-state">No test reports found. Select a folder containing test-results.</p>';
      return;
    }

    let html = '<div class="overview-summary overview-simple">';
    html += '<div class="execution-list-simple">';
    reports.forEach((r, i) => {
      const dateStr = Utils.formatDateOnly(r.startTime);
      const name = (r.name || r.dir || 'Unknown').replace(/_/g, ' ');
      html += `<button class="execution-card" data-index="${i}">
        <span class="execution-card-name">${Utils.escapeHtml(name)}</span>
        <span class="execution-card-date">${Utils.escapeHtml(dateStr)}</span>
      </button>`;
    });
    html += '</div></div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    container.querySelectorAll('.execution-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        const report = reports[idx];
        if (report && onExecutionClick) {
          onExecutionClick(report);
        }
      });
    });
  }

  return { render };
})();
