/**
 * @author Chirag Jayswal, QAF team
 * Probe qaf-report-core HTTP API (optional when UI is static-only).
 */
(function (global) {
  'use strict';

  let cached = null;

  async function probeServerCapabilities() {
    if (cached) return cached;
    try {
      const r = await fetch('/api/health', { method: 'GET' });
      if (!r.ok) throw new Error('bad status');
      const j = await r.json().catch(() => ({}));
      cached = {
        hasServerApi: true,
        upload: j.upload !== false,
        importFormats: Array.isArray(j.importFormats) ? j.importFormats : null
      };
    } catch {
      cached = { hasServerApi: false, upload: false };
    }
    return cached;
  }

  global.ServerCapabilities = { probeServerCapabilities };
})(typeof globalThis !== 'undefined' ? globalThis : window);
