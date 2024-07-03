/**
 * @author Chirag Jayswal, QAF team
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

function isImageContentType(ct, filename) {
  const c = String(ct || '').toLowerCase();
  if (c.startsWith('image/')) return true;
  const ext = path.extname(filename || '').toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext);
}

/**
 * @param {Array<{name?:string, contentType?:string, path?:string, body?:string|Buffer}>} attachments
 * @param {string} classAbsDir absolute path to class folder
 * @param {{ warn?: (m:string)=>void }} [opts]
 */
async function processAttachments(attachments, classAbsDir, opts = {}) {
  const warn = opts.warn || (() => {});
  const checkPoints = [];
  const extraAttachments = [];
  const attDir = path.join(classAbsDir, 'attachments');
  await fsp.mkdir(attDir, { recursive: true });

  let idx = 0;
  for (const att of attachments || []) {
    const baseFromName = sanitizeFileName(att.name || (att.path ? path.basename(att.path) : `file_${idx}`));
    let outBase = `${idx}_${baseFromName}`;
    if (!path.extname(outBase) && att.path) {
      const ext = path.extname(att.path);
      if (ext) outBase += ext;
    } else if (!path.extname(outBase)) {
      const ext = extFromContentType(att.contentType);
      if (ext) outBase += ext;
    }

    const relPath = path.join('attachments', outBase).replace(/\\/g, '/');
    const absDest = path.join(classAbsDir, relPath);

    try {
      if (att.path && typeof att.path === 'string') {
        if (fs.existsSync(att.path)) {
          await fsp.copyFile(att.path, absDest);
        } else {
          warn(`Attachment source missing: ${att.path}`);
          idx++;
          continue;
        }
      } else if (att.body != null) {
        const buf = Buffer.isBuffer(att.body) ? att.body : Buffer.from(String(att.body), 'base64');
        await fsp.writeFile(absDest, buf);
      } else {
        warn(`Attachment skipped (no path/body): ${att.name || idx}`);
        idx++;
        continue;
      }
    } catch (e) {
      warn(`Attachment copy failed: ${e.message}`);
      idx++;
      continue;
    }

    const ct = att.contentType || '';
    if (isImageContentType(ct, outBase)) {
      checkPoints.push({
        message: att.name || outBase,
        type: 'info',
        screenshot: relPath
      });
    } else {
      extraAttachments.push({
        name: att.name || outBase,
        path: relPath,
        contentType: ct || undefined
      });
    }
    idx++;
  }

  return { checkPoints, extraAttachments };
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'file';
}

function extFromContentType(ct) {
  const c = String(ct || '').toLowerCase();
  if (c.includes('png')) return '.png';
  if (c.includes('jpeg') || c === 'image/jpg') return '.jpg';
  if (c.includes('gif')) return '.gif';
  if (c.includes('webp')) return '.webp';
  if (c.includes('zip')) return '.zip';
  if (c.includes('webm')) return '.webm';
  if (c.includes('mp4')) return '.mp4';
  if (c.includes('json')) return '.json';
  return '';
}

function formatErrorFromResult(errors, singleError) {
  if (singleError && typeof singleError === 'object') {
    const msg = singleError.message || singleError.value || '';
    const stack = singleError.stack || '';
    if (stack) return String(stack);
    if (msg) return String(msg);
  }
  if (!errors || !errors.length) return '';
  const e = errors[0];
  if (typeof e === 'string') return e;
  const msg = e.message || e.text || '';
  const stack = e.stack || '';
  return stack || msg || '';
}

function mapPlaywrightStatus(status) {
  switch (status) {
    case 'passed':
      return 'pass';
    case 'failed':
      return 'fail';
    case 'skipped':
      return 'skip';
    case 'timedOut':
    case 'interrupted':
      return 'fail';
    default:
      return 'fail';
  }
}

module.exports = {
  processAttachments,
  formatErrorFromResult,
  mapPlaywrightStatus,
  isImageContentType
};
