/**
 * @author Chirag Jayswal, QAF team
 * Extract archive entries from a buffer (zip / tar / tgz / raw xml|json).
 * Shared by reporting server and sync upload inbox.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { entriesFromPlainReportBuffer } = require('../qaf-import/upload-from-archive.js');

let AdmZip;
let tar;
let unzipper;
try {
  AdmZip = require('adm-zip');
} catch (e) {
  AdmZip = null;
}
try {
  tar = require('tar');
} catch (e) {
  tar = null;
}
try {
  unzipper = require('unzipper');
} catch (e) {
  unzipper = null;
}

function walkDir(dir, base = dir) {
  const out = [];
  const names = fs.readdirSync(dir);
  for (const name of names) {
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (stat.isDirectory()) {
      out.push(...walkDir(full, base));
    } else {
      out.push({ rel, full });
    }
  }
  return out;
}

function extractWithTar(buf) {
  if (!tar) throw new Error('tar required. Run: npm install');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-upload-'));
  try {
    const ext = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b ? '.tgz' : '.tar';
    const archivePath = path.join(tmpDir, 'archive' + ext);
    fs.writeFileSync(archivePath, buf);
    tar.x({ file: archivePath, cwd: tmpDir, sync: true });
    const files = walkDir(tmpDir);
    return files.map(({ rel, full }) => ({
      name: rel,
      data: fs.readFileSync(full)
    }));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function extractWithUnzipper(buf) {
  if (!unzipper) throw new Error('unzipper required. Run: npm install');
  const dir = await unzipper.Open.buffer(buf, { tailSize: 65536 });
  const entries = [];
  for (const f of dir.files) {
    if (f.type === 'Directory') continue;
    const data = await f.buffer();
    entries.push({ name: (f.path || f.fileName || '').replace(/\\/g, '/'), data });
  }
  return entries;
}

function findZipOffset(buf) {
  if (buf.length < 2) return -1;
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 0;
  const max = Math.min(buf.length - 2, 64 * 1024);
  for (let i = 0; i < max; i++) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b) return i;
  }
  return -1;
}

function extractEntriesFromBuf(buf) {
  const isGzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (isGzip && tar) return extractWithTar(buf);
  const zipOffset = findZipOffset(buf);
  if (zipOffset >= 0 && AdmZip) {
    try {
      const zip = new AdmZip(zipOffset > 0 ? buf.subarray(zipOffset) : buf);
      return zip
        .getEntries()
        .filter((e) => !e.isDirectory)
        .map((e) => ({
          name: e.entryName.replace(/\\/g, '/'),
          data: e.getData()
        }));
    } catch (e) {
      if (/invalid|unsupported|no end header/i.test(e.message) && unzipper) {
        throw { useUnzipper: true, buf: zipOffset > 0 ? buf.subarray(zipOffset) : buf };
      }
      throw e;
    }
  }
  if (zipOffset >= 0 && !AdmZip) throw new Error('adm-zip required. Run: npm install');
  if (isGzip && !tar) throw new Error('tar required for .tgz files. Run: npm install');
  if (tar) return extractWithTar(buf);
  throw new Error('Unsupported format. Use .zip, .tgz, .tar, or a raw .xml / .json report.');
}

/**
 * @param {Buffer} buf
 * @returns {Promise<{ name: string, data: Buffer }[]>}
 */
async function resolveRawEntries(buf) {
  try {
    try {
      return extractEntriesFromBuf(buf);
    } catch (e) {
      if (e && e.useUnzipper) return await extractWithUnzipper(e.buf || buf);
      throw e;
    }
  } catch (e) {
    const plain = entriesFromPlainReportBuffer(buf);
    if (plain) return plain;
    throw e;
  }
}

module.exports = {
  resolveRawEntries,
  extractEntriesFromBuf,
  archiveExtractCapabilities: () => ({ AdmZip: !!AdmZip, tar: !!tar, unzipper: !!unzipper })
};
