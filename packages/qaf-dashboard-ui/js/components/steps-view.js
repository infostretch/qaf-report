/**
 * @author Chirag Jayswal, QAF team
 * Execution-wide unique test steps from top-level checkpoints only, deduped by {@link Utils.normalizeStepSignature};
 * the Step column shows {@link Utils.formatStepKey} (placeholders, not concrete values).
 */
const StepsViewComponent = (function () {
  /** Top-level `checkPoints` only — each root `message` is counted; `subCheckPoints` are excluded. */
  function forEachTopLevelCheckpoint(list, fn) {
    if (!Array.isArray(list)) return;
    list.forEach((cp) => fn(cp));
  }

  function checkpointMessageText(cp) {
    const msg = cp?.message;
    if (msg == null) return '';
    return typeof msg === 'string' ? msg : String(msg);
  }

  /** Strip leading Gherkin-style keywords so they do not affect deduplication or labels. */
  function stripLeadingBddPrefix(text) {
    if (!text || typeof text !== 'string') return '';
    let s = text.replace(/\s+/g, ' ').trim();
    const re = /^(?:(?:Given|When|Then|And|But)\s+|\*\s+)/i;
    while (s.length && re.test(s)) {
      s = s.replace(re, '').trim();
    }
    return s;
  }

  /** Map checkpoint `type` to pass / fail / not-run (skip, info, pending, unknown → not-run). */
  function checkpointOutcomeBucket(type) {
    if (type == null || type === '') return 'not-run';
    const t = String(type).toLowerCase();
    if (t === 'pass' || t.includes('pass')) return 'pass';
    if (t === 'fail' || t.includes('fail')) return 'fail';
    return 'not-run';
  }

  /** Normalized key for {@code row.metaData.testID} (trimmed string). */
  function rowTestIdKey(row) {
    const id = row?.metaData?.testID;
    if (id == null) return null;
    const s = String(id).trim();
    return s !== '' ? s : null;
  }

  /**
   * One bucket per deduped step from its aggregate Pass/Fail/Not run columns (mutually exclusive).
   * fail&gt;0 → failing; else pass&gt;0 → passing; else not-run only.
   */
  function stepOutcomeBucket(rec) {
    const f = rec.failCount || 0;
    const p = rec.passCount || 0;
    const n = rec.notRunCount || 0;
    if (f > 0) return 'fail';
    if (p > 0) return 'pass';
    if (n > 0) return 'not-run';
    return 'not-run';
  }

  function ingestCheckpoints(list, row, index) {
    forEachTopLevelCheckpoint(list, (cp) => {
      const msg = checkpointMessageText(cp);
      const trimmed = msg.replace(/\s+/g, ' ').trim();
      if (!trimmed) return;
      const forSig = stripLeadingBddPrefix(trimmed.replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/gi, '$1'));
      const sig = Utils.normalizeStepSignature(forSig);
      if (!sig) return;
      let rec = index.get(sig);
      const stepKey = Utils.formatStepKey(forSig);
      if (!stepKey) return;
      const plain = stripLeadingBddPrefix(trimmed.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (!plain) return;
      if (!rec) {
        rec = {
          signature: sig,
          stepKey,
          display: plain,
          occurrences: 0,
          testIds: new Set(),
          passCount: 0,
          failCount: 0,
          notRunCount: 0
        };
        index.set(sig, rec);
      } else {
        rec.stepKey = Utils.pickStepDisplayLabel(rec.stepKey, stepKey);
        rec.display = Utils.pickStepDisplayLabel(rec.display, plain);
      }
      rec.occurrences += 1;
      const outcome = checkpointOutcomeBucket(cp.type);
      if (outcome === 'pass') rec.passCount += 1;
      else if (outcome === 'fail') rec.failCount += 1;
      else rec.notRunCount += 1;
      const tidStep = rowTestIdKey(row);
      if (tidStep) rec.testIds.add(tidStep);
    });
  }

  function ingestResultPayload(data, row, index) {
    const payload = data?.data ?? data;
    if (!payload || typeof payload !== 'object') return;
    const cps = payload.checkPoints || payload.checkpoints;
    if (cps?.length) ingestCheckpoints(cps, row, index);
  }

  async function mapPool(items, concurrency, iterator) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await iterator(items[i], i);
      }
    }
    const n = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: n }, () => worker()));
    return out;
  }

  /**
   * @param {string} containerId
   * @param {object} options
   * @param {Array} options.testCases — same shape as testcase view rows (metaData, testsetPath, classPath, execDirForResult)
   * @param {string} options.execDir
   * @param {function} options.loadResultFile — (row) => Promise<result>
   * @param {Array} [options.breadcrumb]
   * @param {function} [options.onBreadcrumbClick]
   * @param {function} [options.onProgress] — (done, total) => void
   */
  async function render(containerId, options) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { testCases, loadResultFile, breadcrumb, onBreadcrumbClick, onProgress } = options;
    const rows = (testCases || []).filter((r) => r.metaData?.resultFileName && (r.execDirForResult || options.execDir));

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

    html += '<div class="steps-view">';
    html += '<div class="steps-header">';
    html += '<h2>Test steps</h2>';
    html += '<p class="steps-desc">Only <strong>top-level</strong> <code>checkPoints[].message</code> values are used; nested <code>subCheckPoints</code> are excluded. Leading <code>Given</code>/<code>When</code>/<code>Then</code>/<code>And</code>/<code>But</code>/<code>*</code> prefixes are ignored. The <strong>Step</strong> column is the parameterized step key (numbers, URLs, quoted values, etc. replaced; <code>${param}</code> names kept). Toolbar counts are per <strong>unique step</strong> (after dedup): <strong>Total</strong> = Passing + Failing + Not run; a step is <strong>Failing</strong> if its Fail column &gt; 0, else <strong>Passing</strong> if Pass &gt; 0, else <strong>Not run</strong> if only not-run checkpoints. Column totals come from checkpoint <code>type</code>. <code>seleniumLog</code> is not used. Hover a step for an example runtime message.</p>';
    html += '<p id="steps-progress" class="steps-progress" aria-live="polite"></p>';
    html +=
      '<div class="steps-toolbar">' +
      '<div class="steps-toolbar-badges" id="steps-toolbar-badges" aria-live="polite"></div>' +
      '<input type="search" class="filter-input filter-search" placeholder="Search steps…" id="steps-search">' +
      '</div>';
    html += '</div>';
    html += '<div id="steps-table-mount"></div>';
    html += '</div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    if (onBreadcrumbClick) {
      container.querySelectorAll('.drilldown-breadcrumb a.breadcrumb-link').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          onBreadcrumbClick(parseInt(a.dataset.index, 10));
        });
      });
    }

    const progressEl = document.getElementById('steps-progress');
    const mount = document.getElementById('steps-table-mount');
    if (!rows.length) {
      if (progressEl) progressEl.textContent = 'No result files in scope — run tests or pick an execution with results.';
      return;
    }

    const index = new Map();
    let done = 0;
    await mapPool(rows, 6, async (row) => {
      try {
        const result = await loadResultFile(row);
        ingestResultPayload(result, row, index);
      } catch (e) {
        /* skip missing/corrupt */
      } finally {
        done += 1;
        if (progressEl) progressEl.textContent = 'Scanned ' + done + ' / ' + rows.length + ' result files…';
        if (onProgress) onProgress(done, rows.length);
      }
    });

    const bucketRank = { fail: 0, pass: 1, 'not-run': 2 };
    const list = Array.from(index.values()).sort((a, b) => {
      const ra = bucketRank[stepOutcomeBucket(a)];
      const rb = bucketRank[stepOutcomeBucket(b)];
      if (ra !== rb) return ra - rb;
      const fa = a.failCount || 0;
      const fb = b.failCount || 0;
      if (fb !== fa) return fb - fa;
      const pa = a.passCount || 0;
      const pb = b.passCount || 0;
      if (pb !== pa) return pb - pa;
      const na = a.notRunCount || 0;
      const nb = b.notRunCount || 0;
      if (nb !== na) return nb - na;
      const ta = a.testIds.size;
      const tb = b.testIds.size;
      if (tb !== ta) return tb - ta;
      return b.occurrences - a.occurrences;
    });

    if (progressEl) {
      progressEl.textContent =
        list.length === 0
          ? 'No steps found in JSON results (top-level checkpoints only).'
          : 'Found ' + list.length + ' unique step(s) from ' + rows.length + ' files.';
    }

    let uniqPassingSteps = 0;
    let uniqFailingSteps = 0;
    let uniqNotRunSteps = 0;
    list.forEach((rec) => {
      const b = stepOutcomeBucket(rec);
      if (b === 'fail') uniqFailingSteps += 1;
      else if (b === 'pass') uniqPassingSteps += 1;
      else uniqNotRunSteps += 1;
    });
    const badgesEl = document.getElementById('steps-toolbar-badges');
    if (badgesEl) {
      const n = list.length;
      badgesEl.innerHTML =
        '<span class="steps-badge steps-badge-total" title="Same as Passing + Failing + Not run — one bucket per unique step.">' +
        '<span class="steps-badge-label">Total steps</span> <span class="steps-badge-value">' +
        n +
        '</span></span>' +
        '<button type="button" class="steps-badge steps-badge-pass" data-steps-filter="pass" aria-pressed="false" title="Steps with Fail=0 and Pass&gt;0. Click to filter; click again to clear.">' +
        '<span class="steps-badge-label">Passing</span> <span class="steps-badge-value">' +
        uniqPassingSteps +
        '</span></button>' +
        '<button type="button" class="steps-badge steps-badge-fail" data-steps-filter="fail" aria-pressed="false" title="Steps with any failing checkpoint (Fail&gt;0). Click to filter; click again to clear.">' +
        '<span class="steps-badge-label">Failing</span> <span class="steps-badge-value">' +
        uniqFailingSteps +
        '</span></button>' +
        '<button type="button" class="steps-badge steps-badge-not-run" data-steps-filter="not-run" aria-pressed="false" title="Steps with Fail=0, Pass=0, Not run&gt;0. Click to filter; click again to clear.">' +
        '<span class="steps-badge-label">Not run</span> <span class="steps-badge-value">' +
        uniqNotRunSteps +
        '</span></button>';
    }

    if (!list.length || !mount || typeof TableComponent === 'undefined') return;

    const tableRows = list.map((r, i) => ({
      id: 'step-' + i,
      display: r.display,
      stepKey: r.stepKey,
      signature: r.signature,
      occurrences: r.occurrences,
      tests: r.testIds.size,
      testIds: Array.from(r.testIds),
      passCount: r.passCount,
      failCount: r.failCount,
      notRunCount: r.notRunCount
    }));

    const table = TableComponent.createTable('steps-table-mount', {
      columns: [
        {
          key: 'stepKey',
          label: 'Step',
          sortKey: 'stepKey',
          render: (v, row) =>
            '<code class="steps-sig steps-col-step-key" title="' +
            Utils.escapeHtml('Runtime: ' + String(row.display || '').slice(0, 400)) +
            '">' +
            Utils.escapeHtml(String(v || '')) +
            '</code>'
        },
        {
          key: 'occurrences',
          label: 'Calls',
          sortKey: 'occurrences',
          render: (v) => String(v ?? 0)
        },
        {
          key: 'tests',
          label: 'Tests',
          sortKey: 'tests',
          render: (v) => String(v ?? 0)
        },
        {
          key: 'passCount',
          label: 'Pass',
          sortKey: 'passCount',
          render: (v) => String(v ?? 0)
        },
        {
          key: 'failCount',
          label: 'Fail',
          sortKey: 'failCount',
          render: (v) => String(v ?? 0)
        },
        {
          key: 'notRunCount',
          label: 'Not run',
          sortKey: 'notRunCount',
          render: (v) => String(v ?? 0)
        }
      ],
      data: tableRows,
      idField: 'id',
      searchFields: [(r) => r.stepKey, (r) => r.display, (r) => r.signature],
      sortable: true,
      pageSize: 50
    });

    if (table && mount) {
      mount.innerHTML = '';
      mount.appendChild(table.getElement());
      table.render();
    }

    const searchEl = document.getElementById('steps-search');
    if (searchEl && table) {
      searchEl.addEventListener('input', Utils.debounce(() => table.setSearch(searchEl.value), 200));
    }

    let activeStepsBucketFilter = null;
    function syncStepsFilterBadges() {
      if (!badgesEl) return;
      badgesEl.querySelectorAll('[data-steps-filter]').forEach((btn) => {
        const v = btn.getAttribute('data-steps-filter');
        const on = activeStepsBucketFilter === v;
        btn.classList.toggle('steps-badge-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function rowMatchesStepBucket(row, bucket) {
      const f = row.failCount ?? 0;
      const p = row.passCount ?? 0;
      const n = row.notRunCount ?? 0;
      if (bucket === 'fail') return f > 0;
      if (bucket === 'pass') return f === 0 && p > 0;
      if (bucket === 'not-run') return f === 0 && p === 0 && n > 0;
      return true;
    }

    if (badgesEl && table) {
      badgesEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-steps-filter]');
        if (!btn || !table) return;
        const next = btn.getAttribute('data-steps-filter');
        if (activeStepsBucketFilter === next) {
          activeStepsBucketFilter = null;
          table.setFilter('stepBucket', null);
        } else {
          activeStepsBucketFilter = next;
          table.setFilter('stepBucket', (row) => rowMatchesStepBucket(row, next));
        }
        syncStepsFilterBadges();
      });
    }
  }

  return { render, ingestResultPayload };
})();
