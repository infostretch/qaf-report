import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const p = path.join(root, 'packages/qaf-dashboard-ui/js/components/drilldown.js');
let text = fs.readFileSync(p, 'utf8');
let lines = text.split(/\r?\n/);
const newBind = `  function bindHistoryTab(container, row, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, classPath, detailOptions) {
    const historyTab = container.querySelector('.method-detail-tab[data-tab="history"]');
    const historyPanel = container.querySelector('.method-detail-tab-panel[data-panel="history"]');
    if (!historyTab || !historyPanel || !onLoadHistory) return;
    const testID = row.metaData?.testID;
    if (!testID) return;
    const opts = detailOptions || {};
    const runParamFilter = opts.runParamFilter || {};

    function renderHistoryList(panel, historySlice) {
      let html = '<div class="history-list">';
      historySlice.forEach((h, idx) => {
        const report = h.report;
        const method = h.method;
        const parts = [report?.name || report?.dir || 'Unknown'];
        if (h.testsetPath) parts.push(getDisplayName(h.testsetPath));
        if (classPath) parts.push(getDisplayName(classPath));
        if (method.metaData?.testID) parts.push(method.metaData.testID);
        const rpNote =
          h.runParameters && Object.keys(h.runParameters).length
            ? ' · ' + Utils.formatRunParamComboLabel(h.runParameters, Object.keys(h.runParameters).sort())
            : '';
        const breadcrumb = parts.join(' > ') + rpNote;
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
        const filtered = Utils.filterHistoryByRunParamFilter ? Utils.filterHistoryByRunParamFilter(history, runParamFilter) : history.slice();
        if (!filtered.length) {
          panelBody.innerHTML = '<p class="expand-empty">No executions match the current run-parameter filters.</p>';
          return;
        }
        const analysedStatus = getAnalysedStatus(filtered);
        let html = '';
        if (analysedStatus) {
          html += '<div class="history-analysed-status"><span class="history-analysed-label">Trend:</span> ' + Utils.analysisBadge(analysedStatus) + '</div>';
        }
        const allKeys = new Set();
        filtered.forEach((e) => {
          const rp = e.runParameters;
          if (rp && typeof rp === 'object') Object.keys(rp).forEach((k) => allKeys.add(k));
        });
        const grpKeys = [...allKeys].filter((k) => {
          const v = runParamFilter[k];
          return !v || v === Utils.RUN_PARAM_ALL;
        }).sort();
        if (grpKeys.length <= 0 || filtered.length <= 1) {
          panelBody.innerHTML = html;
          renderHistoryList(panelBody, filtered);
          return;
        }
        const groups = new Map();
        filtered.forEach((h) => {
          const rk = Utils.serializeRunParamCombo(h.runParameters || {}, grpKeys);
          const lab = Utils.formatRunParamComboLabel(h.runParameters || {}, grpKeys);
          if (!groups.has(rk)) groups.set(rk, { label: lab, rows: [] });
          groups.get(rk).rows.push(h);
        });
        const ordered = [...groups.entries()].sort((a, b) => String(a[1].label).localeCompare(String(b[1].label)));
        html += '<div class="history-subtabs" role="tablist">';
        ordered.forEach((_, i) => {
          const lab = ordered[i][1].label;
          html +=
            '<button type="button" role="tab" class="history-subtab' +
            (i === 0 ? ' active' : '') +
            '" data-hist-tab="' +
            i +
            '">' +
            Utils.escapeHtml(lab) +
            '</button>';
        });
        html += '</div>';
        html += '<div class="history-subpanels">';
        ordered.forEach((x, i) => {
          html +=
            '<div class="history-subpanel' +
            (i === 0 ? '' : ' hidden') +
            '" data-hist-panel="' +
            i +
            '"><div class="history-subpanel-inner"></div></div>';
        });
        html += '</div>';
        panelBody.innerHTML = html;
        ordered.forEach((x, i) => {
          const inner = panelBody.querySelector('.history-subpanel[data-hist-panel="' + i + '"] .history-subpanel-inner');
          if (inner) renderHistoryList(inner, x[1].rows);
        });
        panelBody.querySelectorAll('.history-subtab').forEach((btn) => {
          btn.addEventListener('click', () => {
            const i = btn.dataset.histTab;
            panelBody.querySelectorAll('.history-subtab').forEach((b) => b.classList.toggle('active', b === btn));
            panelBody.querySelectorAll('.history-subpanel').forEach((pan) => {
              pan.classList.toggle('hidden', pan.dataset.histPanel !== i);
            });
          });
        });
      }).catch(() => {
        panelBody.innerHTML = '<p class="expand-error">Failed to load history.</p>';
      });
    });
  }`.split('\n');
const start = lines.findIndex((l) => l.startsWith('  function bindHistoryTab('));
const end = lines.findIndex((l, i) => i > start && l.startsWith('  function bindHistoryItemExpand('));
if (start < 0 || end < 0) throw new Error('splice');
lines.splice(start, end - start, ...newBind);
text = lines.join('\n');
text = text.replace(
  'async function renderMethodDetailAndBind(container, row, data, getScreenshotUrl, onLoadResultFile, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, classPathVal, reportsList) {',
  'async function renderMethodDetailAndBind(container, row, data, getScreenshotUrl, onLoadResultFile, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, classPathVal, reportsList, detailOptions = {}) {'
);
text = text.replace(
  'bindHistoryTab(container, row, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, classPathVal);',
  'bindHistoryTab(container, row, onLoadHistory, onLoadHistoryItemResult, getScreenshotUrlFor, classPathVal, detailOptions);'
);
fs.writeFileSync(p, text, 'utf8');
console.log('drilldown ok');