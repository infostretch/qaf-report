/**
 * @author Chirag Jayswal, QAF team
 * Shared rules for synthetic testID and module when harness omits them.
 * Loaded in browser before utils.js; required by scripts/build-test-history-index.js in Node.
 */
(function (global) {
  'use strict';

  function getTestIdFromMeta(meta) {
    if (!meta) return null;
    if (meta.testID != null && String(meta.testID).trim() !== '') return String(meta.testID).trim();
    if (meta.name != null && String(meta.name).trim() !== '') return String(meta.name).trim();
    return null;
  }

  function getClassNameFromSign(sign) {
    if (!sign || typeof sign !== 'string') return null;
    const m = sign.match(/^([A-Za-z0-9_]+)\./);
    return m ? m[1] : null;
  }

  /**
   * Module from feature path: first segment after features/ or feature/ (e.g. features/a/b/c.feature -> a).
   */
  function getModuleFromPath(path) {
    if (!path || typeof path !== 'string') return null;
    const normalized = String(path).replace(/\\/g, '/').trim();
    const match = normalized.match(/(?:^|\/)(?:features?|feature)\/([^/]+)/i);
    if (match) return match[1];
    const parts = normalized.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : (parts[0] || null);
  }

  /**
   * @param {object} method - { metaData, testsetPath? }
   * @param {string} classPath
   */
  function getModuleFromMethod(method, classPath) {
    const md = method?.metaData;
    if (md?.module != null && md.module !== '') {
      const m = md.module;
      return Array.isArray(m) ? (m[0] || null) : String(m);
    }
    let refStr = md?.reference != null ? (Array.isArray(md.reference) ? md.reference[0] : md.reference) : null;
    if (refStr && typeof refStr === 'object' && refStr.dir) {
      refStr = refStr.dir + '/' + (refStr.file || '');
    }
    if (typeof refStr === 'string') {
      const lower = refStr.toLowerCase();
      if (lower.endsWith('.feature') || lower.endsWith('.bdd')) {
        const fromPath = getModuleFromPath(refStr);
        if (fromPath) return fromPath;
      }
    }
    const fromSign = getClassNameFromSign(md?.sign);
    if (fromSign) return fromSign;
    let pathToUse = typeof refStr === 'string' ? refStr : null;
    if (!pathToUse) pathToUse = classPath;
    if (pathToUse && typeof pathToUse === 'object' && pathToUse.dir) {
      pathToUse = pathToUse.dir + '/' + (pathToUse.file || '');
    }
    let result = getModuleFromPath(pathToUse || classPath);
    if (!result && method?.testsetPath) result = getModuleFromPath(method.testsetPath);
    return result || '-';
  }

  const ReportMetaHelpers = {
    getTestIdFromMeta,
    getClassNameFromSign,
    getModuleFromPath,
    getModuleFromMethod
  };

  global.ReportMetaHelpers = ReportMetaHelpers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReportMetaHelpers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
