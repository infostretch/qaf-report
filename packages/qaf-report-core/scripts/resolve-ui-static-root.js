/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Directory containing index.html, js/, css/, assets/ for the dashboard UI.
 * @param {{ projectRoot?: string }} [opts]
 * @returns {string}
 */
function resolveUiStaticRoot(opts = {}) {
  const projectRoot = opts.projectRoot
    ? path.resolve(opts.projectRoot)
    : process.cwd();

  if (process.env.QAF_STATIC_ROOT) {
    return path.resolve(process.env.QAF_STATIC_ROOT);
  }

  try {
    const pkg = require.resolve('qaf-dashboard-ui/package.json');
    return path.dirname(pkg);
  } catch {
    const nested = path.join(projectRoot, 'node_modules', 'qaf-dashboard-ui');
    if (fs.existsSync(path.join(nested, 'index.html'))) {
      return nested;
    }
  }

  return path.join(projectRoot, 'node_modules', 'qaf-dashboard-ui');
}

module.exports = { resolveUiStaticRoot };
