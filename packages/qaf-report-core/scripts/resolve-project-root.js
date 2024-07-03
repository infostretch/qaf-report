/**
 * @author Chirag Jayswal, QAF team
 * Default directory for projects.json, test-results/, and per-project folders.
 *
 * npm workspace scripts often run with cwd = packages/qaf-report-core; data should
 * still resolve to the monorepo root unless QAF_PROJECT_ROOT is set.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @returns {string} Absolute path to dashboard data root.
 */
function resolveProjectRoot() {
  if (process.env.QAF_PROJECT_ROOT) {
    return path.resolve(process.env.QAF_PROJECT_ROOT);
  }
  const cwd = process.cwd();
  const base = path.basename(cwd);
  const parentBase = path.basename(path.dirname(cwd));
  if (base === 'qaf-report-core' && parentBase === 'packages') {
    const repoRoot = path.resolve(cwd, '..', '..');
    const pkgPath = path.join(repoRoot, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.workspaces && Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) {
        return repoRoot;
      }
    } catch (e) {
      /* use cwd */
    }
  }
  return cwd;
}

module.exports = { resolveProjectRoot };
