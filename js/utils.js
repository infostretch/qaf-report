/**
 * @author Chirag Jayswal, QAF team
 * Utility helpers for the Test Reporting Dashboard
 */
const Utils = {
  /**
   * Format duration in ms to human-readable string (e.g. "1m 2s" or "102s")
   */
  formatDuration(ms) {
    if (ms == null || isNaN(ms)) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    parts.push(`${seconds % 60}s`);
    return parts.join(' ');
  },

  /** Stopwatch icon — pair with {@link #renderStandardDurationCell}. */
  standardDurationIconSvg() {
    return (
      '<svg class="duration-standard-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="12" cy="15" r="7" stroke="currentColor" stroke-width="1.75"/>' +
      '<path d="M12 11v4l2.5 1.2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
      '<path d="M9 2.5h6M12 2.5V6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
      '</svg>'
    );
  },

  /**
   * Duration for tables, popovers, and tooltips (icon + same format as {@link #formatDuration}).
   */
  renderStandardDurationCell(ms) {
    if (ms == null || isNaN(Number(ms))) {
      return '<span class="duration-standard duration-standard--empty"><span class="duration-standard-value">—</span></span>';
    }
    const t = this.formatDuration(Number(ms));
    return (
      '<span class="duration-standard" title="' +
      this.escapeHtml(t) +
      '">' +
      this.standardDurationIconSvg() +
      '<span class="duration-standard-value">' +
      this.escapeHtml(t) +
      '</span></span>'
    );
  },

  /**
   * Lexicographically sortable execution timestamp for display (local): YYYY-MM-DD HH:mm:ss
   */
  formatExecutionSortDateTime(ts) {
    if (ts == null || isNaN(Number(ts))) return '—';
    const d = new Date(Number(ts));
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds())
    );
  },

  historyTimelineNodeClass(result) {
    if (result === 'pass') return 'is-pass';
    if (result === 'fail') return 'is-fail';
    if (result === 'skip') return 'is-skip';
    if (result === 'not-run') return 'is-not-run';
    return 'is-unknown';
  },

  /**
   * Horizontal history track (connected nodes); used in By Test Case and suite class tables.
   */
  renderHistoryTimelineTrack(timeline) {
    if (!timeline?.length) {
      return '<span class="history-timeline-empty">—</span>';
    }
    let html = '<div class="history-timeline" role="group" aria-label="Run history">';
    timeline.forEach((item, i) => {
      const cls = this.historyTimelineNodeClass(item.result);
      const cur = item.isCurrent ? ' is-current' : '';
      const label = 'Run ' + (i + 1) + ': ' + (item.result || 'unknown');
      html +=
        '<button type="button" class="history-node ' +
        cls +
        cur +
        '" data-run-index="' +
        (i + 1) +
        '" aria-label="' +
        this.escapeHtml(label) +
        '"><span class="history-node-ring"><span class="history-node-dot"></span></span></button>';
    });
    html += '</div>';
    return html;
  },

  methodDurationMsFromMethod(m) {
    if (!m) return null;
    if (m.duration != null && m.duration !== '') {
      const n = Number(m.duration);
      return Number.isFinite(n) ? n : null;
    }
    if (m.endTime != null && m.startTime != null) return m.endTime - m.startTime;
    return null;
  },

  /**
   * Timeline entries for hover popover: includes formatted failure, execution start time, durations.
   */
  buildHistoryTimeline(tc, historyEntries, currentReport) {
    const MAX = 8;
    const chronological = [...(historyEntries || [])].reverse();
    const includeCurrent = tc.result !== 'not-run';
    const pastSlots = MAX - (includeCurrent ? 1 : 0);
    const pastHist = chronological.slice(-pastSlots);
    const timeline = [];
    pastHist.forEach((h) => {
      const m = h.method || {};
      const rawErr = m.errorTrace || m.errorMessage || '';
      const trimmed = String(rawErr).trim();
      const failureReason =
        (m.result === 'fail' || m.result === 'skip') && trimmed ? this.formatFailureReason(rawErr) : '';
      timeline.push({
        result: m.result || 'unknown',
        durationMs: this.methodDurationMsFromMethod(m),
        stack: failureReason || trimmed,
        failureReason: failureReason || trimmed,
        reportLabel: h.report?.name || h.report?.dir || '',
        startTime: m.startTime != null ? m.startTime : h.report?.startTime
      });
    });
    if (includeCurrent) {
      const fr = String(tc.failureReason || '').trim();
      timeline.push({
        result: tc.result,
        durationMs: tc.duration != null ? tc.duration : null,
        stack: fr,
        failureReason: fr,
        reportLabel: currentReport?.name || 'Current',
        startTime: tc.startTime != null ? tc.startTime : currentReport?.startTime,
        isCurrent: true
      });
    }
    return timeline;
  },

  /**
   * Format timestamp (epoch ms) to locale string
   */
  formatTimestamp(ts) {
    if (ts == null || isNaN(ts)) return '-';
    return new Date(ts).toLocaleString();
  },

  /**
   * Format timestamp to time only (no date)
   */
  formatTimeOnly(ts) {
    if (ts == null || isNaN(ts)) return '-';
    return new Date(ts).toLocaleTimeString();
  },

  /**
   * Format timestamp to date only
   */
  formatDateOnly(ts) {
    if (ts == null || isNaN(ts)) return '-';
    return new Date(ts).toLocaleDateString();
  },

  /**
   * Create status badge HTML - for test case result only (pass, fail, skip, not-run, pending)
   */
  statusBadge(status) {
    const cls =
      status === 'pass'
        ? 'badge-pass'
        : status === 'fail'
          ? 'badge-fail'
          : status === 'not-run'
            ? 'badge-not-run'
            : status === 'pending'
              ? 'badge-pending'
              : 'badge-skip';
    const label =
      status === 'not-run'
        ? '—'
        : status === 'pending'
          ? 'UnExecuted'
          : status || 'unknown';
    return `<span class="badge badge-status ${cls}">${label}</span>`;
  },

  /**
   * Create analysis/trend tag HTML - for calculated status (broken, fixed, unstable)
   * Distinct from test result status; use for history-based analysis
   */
  analysisBadge(tag) {
    if (!tag) return '';
    const t = String(tag).toLowerCase();
    const cls = t === 'fixed' ? 'tag-fixed' : t === 'broken' ? 'tag-broken' : t === 'unstable' ? 'tag-unstable' : 'tag-other';
    const label = tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' ');
    return `<span class="tag tag-trend ${cls}" title="Trend (history-based)">${label}</span>`;
  },

  /**
   * Escape HTML for safe display
   */
  escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Format failure/skip reason for display - strip package prefix, clean message
   * e.g. "java.lang.AssertionError: 1 verification failed. ..." -> "AssertionError: 1 verification failed"
   */
  formatFailureReason(errorTrace) {
    if (!errorTrace || typeof errorTrace !== 'string') return '';
    const firstLine = String(errorTrace).split('\n')[0].trim();
    if (!firstLine) return '';
    const match = firstLine.match(/^(?:\w+\.)*(\w+(?:Exception|Error)):\s*(.+)$/);
    if (match) {
      let [, excType, msg] = match;
      msg = msg.trim();
      const advisoryIdx = msg.search(/\s+You can check\/set value of/i);
      if (advisoryIdx > 0) msg = msg.substring(0, advisoryIdx).trim();
      msg = msg.replace(/\.\s*\.\.\.\s*$/, '').trim();
      return excType + ': ' + msg;
    }
    return firstLine;
  },

  /**
   * Extract module from path. Reference/classPath format: "features/X/..." or "feature/X/...".
   * Dir name after feature dir is the module. Falls back to first path segment if no feature prefix.
   * Handles absolute paths and Windows backslashes.
   */
  getModuleFromPath(path) {
    if (typeof ReportMetaHelpers !== 'undefined' && ReportMetaHelpers.getModuleFromPath) {
      return ReportMetaHelpers.getModuleFromPath(path);
    }
    if (!path || typeof path !== 'string') return null;
    const normalized = String(path).replace(/\\/g, '/').trim();
    const match = normalized.match(/(?:^|\/)(?:features?|feature)\/([^/]+)/i);
    if (match) return match[1];
    const parts = normalized.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : (parts[0] || null);
  },

  /**
   * Stable test id: metaData.testID, or metaData.name when testID is absent.
   */
  getTestId(meta) {
    if (typeof ReportMetaHelpers !== 'undefined' && ReportMetaHelpers.getTestIdFromMeta) {
      return ReportMetaHelpers.getTestIdFromMeta(meta);
    }
    if (!meta) return null;
    if (meta.testID != null && String(meta.testID).trim() !== '') return String(meta.testID).trim();
    if (meta.name != null && String(meta.name).trim() !== '') return String(meta.name).trim();
    return null;
  },

  /**
   * Get module for a test case row. Uses metaData.module if present; else reference ending in .feature/.bdd (path);
   * else class name from sign; else classPath/testsetPath heuristics.
   */
  getModule(row) {
    if (typeof ReportMetaHelpers !== 'undefined' && ReportMetaHelpers.getModuleFromMethod) {
      const method = { metaData: row?.metaData, testsetPath: row?.testsetPath };
      return ReportMetaHelpers.getModuleFromMethod(method, row?.classPath);
    }
    const md = row?.metaData;
    if (md?.module != null && md.module !== '') {
      const m = md.module;
      return Array.isArray(m) ? (m[0] || null) : String(m);
    }
    const ref = md?.reference;
    let pathToUse = ref != null
      ? (Array.isArray(ref) ? ref[0] : ref)
      : row?.classPath;
    if (pathToUse && typeof pathToUse === 'object' && pathToUse.dir) {
      pathToUse = pathToUse.dir + '/' + (pathToUse.file || '');
    }
    let result = this.getModuleFromPath(pathToUse || row?.classPath);
    if (!result && row?.testsetPath) {
      result = this.getModuleFromPath(row.testsetPath);
    }
    return result || '-';
  },

  /**
   * Debounce function calls
   */
  debounce(fn, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Join URL path segments (handles . and ..).
   */
  resolvePathSegments(base, relative) {
    if (!base || relative == null || relative === '') return null;
    const parts = (base + '/' + relative).split('/').filter(Boolean);
    const result = [];
    for (const p of parts) {
      if (p === '..') result.pop();
      else if (p !== '.') result.push(p);
    }
    return result.join('/');
  },

  /**
   * Resolve checkpoint/attachment paths from QAF or Playwright JSON.
   * Legacy QAF uses "../img/..." relative to the json/ exec root (sibling folder to json/).
   * Playwright-style paths (e.g. attachments/...) are relative to the class directory.
   */
  resolveReportAssetRelativePath(execDir, testsetPath, classPath, relativePath) {
    if (!relativePath || typeof relativePath !== 'string' || !relativePath.trim()) return null;
    let p = relativePath.trim();
    while (p.startsWith('./')) p = p.slice(2);
    const legacyFromExecRoot = p.startsWith('../');
    let base;
    if (legacyFromExecRoot) {
      base = execDir;
    } else {
      if (!execDir || testsetPath == null || classPath == null || classPath === '') return null;
      base = [execDir, testsetPath, classPath].join('/').replace(/\/+/g, '/');
    }
    if (!base) return null;
    return this.resolvePathSegments(base, p);
  },

  _metadataFormatsFallbackPromise: undefined,

  /**
   * Load optional metadata_formats.json. When DataLoader is active, uses the same rules as data:
   * HTTP — file next to the dashboard page; File folder pick — metadata_formats.json at the picked
   * root (same level as test-results/). Missing file → null. Object keys are arbitrary metaData names.
   */
  loadMetadataFormats() {
    if (typeof DataLoader !== 'undefined' && typeof DataLoader.loadMetadataFormats === 'function') {
      return DataLoader.loadMetadataFormats();
    }
    if (this._metadataFormatsFallbackPromise === undefined) {
      this._metadataFormatsFallbackPromise = fetch(new URL('metadata_formats.json', window.location.href), {
        cache: 'force-cache'
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((obj) => (obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null))
        .catch(() => null);
    }
    return this._metadataFormatsFallbackPromise;
  },

  /**
   * HTML for one metadata field when metadata_formats.json defines formats[metaKey].
   * If there is no config, no entry for this key, or the template is empty, returns escaped text only.
   * Template strings are trusted (your file); values from reports are always escaped.
   * Include the value in the template using any one of:
   *   {0}, {1}, … (each replaced with the same escaped string for that field),
   *   __VALUE__, {{value}}, or %s (same).
   * Example italic: "<i>{0}</i>", "<i>__VALUE__</i>", or empty "<i></i>" / "<span class=\"x\"></span>"
   * (value inserted between the opening and closing tag when the inner HTML is empty).
   * Otherwise the template is ignored and only the escaped value is returned.
   */
  formatMetadataDisplay(formats, metaKey, rawValue) {
    if (rawValue == null) return '';
    let display;
    if (Array.isArray(rawValue)) {
      display = rawValue.map((x) => (x == null ? '' : String(x))).join(', ');
    } else if (typeof rawValue === 'object') {
      display = JSON.stringify(rawValue);
    } else {
      display = String(rawValue);
    }
    if (display === '') return '';
    const safe = this.escapeHtml(display);
    if (!formats || typeof formats !== 'object') return safe;
    const tmpl = formats[metaKey];
    if (typeof tmpl !== 'string' || !tmpl.length) return safe;

    if (/\{\d+\}/.test(tmpl)) {
      return tmpl.replace(/\{\d+\}/g, () => safe);
    }
    if (tmpl.includes('__VALUE__')) {
      return tmpl.split('__VALUE__').join(safe);
    }
    if (tmpl.includes('{{value}}')) {
      return tmpl.split('{{value}}').join(safe);
    }
    if (tmpl.includes('%s')) {
      return tmpl.replace(/%s/g, () => safe);
    }
    const wrapMatch = tmpl.match(/^(\s*)(<(\w+)(?:\s[^>]*)?>)(\s*)([\s\S]*?)(<\/\3\s*>)(\s*)$/i);
    if (wrapMatch) {
      const inner = wrapMatch[5];
      if (!inner.trim()) {
        return wrapMatch[2] + safe + wrapMatch[6];
      }
    }
    return safe;
  },

  /**
   * True if a checkpoint "url …" argument is empty/whitespace or looks like a URL / placeholder / query fragment
   * (so empty url, messy `{url}"#&pad=…`, `http://…`, etc. dedupe to the same step key).
   * @param {string} inner — text inside the quotes, not including delimiters
   */
  isUrlLikeOrEmptyForStepKey(inner) {
    if (inner == null) return true;
    const t = String(inner).replace(/\s+/g, ' ').trim();
    if (!t) return true;
    if (/\{url\}/i.test(t)) return true;
    if (/https?:\/\//i.test(t)) return true;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return true;
    if (/^\/{2}[^\s/]/i.test(t)) return true;
    if (/[[\]/%]/.test(t)) return true;
    if (/[#&=?]/.test(t)) return true;
    if (/\s\.\w+[/:]|^\.?\//.test(t)) return true;
    return false;
  },

  /**
   * Strip HTML/tags, quoted literals, numbers, URLs, etc. Optional: collapse every {@code ${…}} to {@code ${p}} for dedup keys.
   * @param {string} raw
   * @param {{ collapseParamNames?: boolean }} [opts]
   * @returns {string} transformed line (not lowercased)
   */
  _applyStepKeyTransforms(raw, opts) {
    if (raw == null || typeof raw !== 'string') return '';
    const collapseParamNames = opts && opts.collapseParamNames;
    let s = typeof raw.normalize === 'function' ? raw.normalize('NFKC') : raw;
    s = s.replace(/<[^>]{0,2000}>/gi, ' ');
    s = s.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
    s = s.replace(/[\u201C\u201D\u201E\u201F]/g, '"');
    s = s.replace(/\u00A0/g, ' ');
    if (collapseParamNames) {
      s = s.replace(/\$\{[^}]+\}/g, '${p}');
    }
    // Normalize `url '…'` / `url "…"` before generic quote rules so broken `\'` closings and mixed `"#&…` still match.
    // `\s*` after `url` allows `url''`; `(?i)` makes `URL` / `Url` match.
    s = s.replace(/\burl\s*'([^']*)'/gi, (m, inner) => {
      if (!this.isUrlLikeOrEmptyForStepKey(inner)) return m;
      const cut = m.indexOf("'");
      return cut >= 0 ? m.slice(0, cut) + '{url}' : m;
    });
    s = s.replace(/\burl\s*"([^"]*)"/gi, (m, inner) => {
      if (!this.isUrlLikeOrEmptyForStepKey(inner)) return m;
      const cut = m.indexOf('"');
      return cut >= 0 ? m.slice(0, cut) + '{url}' : m;
    });
    s = s.replace(/'([^'\\]|\\.)*'/g, "''");
    s = s.replace(/"([^"\\]|\\.)*"/g, '""');
    s = s.replace(/\[[^\]]{0,2000}\]/g, '[]');
    s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '#id');
    s = s.replace(/\b\d+(?:\.\d+)?\b/g, '#');
    s = s.replace(/https?:\/\/[^\s<'"]+/gi, '{url}');
    s = s.replace(/\s+/g, ' ').trim();
    // Merge straggling `url ''` / `url ""` (e.g. smart quotes missed earlier, or bare `{url}` vs quoted empty) into `url {url}`.
    s = s.replace(/\burl\s*(?:''|"")/gi, 'url {url}');
    return s;
  },

  /**
   * Normalize a BDD / checkpoint step line for deduplication (similar in spirit to QAF step matching:
   * {@literal @QAFTestStep} descriptions use {param} placeholders; runtime messages expand arguments).
   * Strips HTML, normalizes ${...} to ${p}, quoted literals, numbers, URLs, so different calls map to one key.
   * @param {string} raw
   * @returns {string} lowercase signature usable as Map key
   */
  normalizeStepSignature(raw) {
    return this._applyStepKeyTransforms(raw, { collapseParamNames: true }).toLowerCase();
  },

  /**
   * Human-readable step key: same value-stripping as {@link normalizeStepSignature}, but keeps {@code ${param}} names
   * and original letter casing (no collapse to {@code ${p}}, no lowercasing).
   * @param {string} raw
   * @returns {string}
   */
  formatStepKey(raw) {
    return this._applyStepKeyTransforms(raw, { collapseParamNames: false });
  },

  /**
   * Prefer a display label that keeps template ${...} placeholders when present; shorter if tied.
   */
  pickStepDisplayLabel(current, candidate) {
    if (!candidate || !String(candidate).trim()) return current || '';
    if (!current || !String(current).trim()) return String(candidate).trim();
    const a = String(current).trim();
    const b = String(candidate).trim();
    const score = (s) => (/\$\{[^}]+\}/.test(s) ? 4 : 0);
    const sb = score(b);
    const sa = score(a);
    if (sb > sa) return b;
    if (sb < sa) return a;
    if (b.length < a.length) return b;
    return a;
  },

};
