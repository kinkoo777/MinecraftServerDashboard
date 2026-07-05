const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const mc = require('../minecraft');
const { serverDir, getConfig } = require('../config');
const { readProperties } = require('./properties');

// keep only the newest N backups (0 = unlimited)
function prune() {
  const keep = getConfig().backupKeep;
  if (!keep) return;
  const dir = backupsDir();
  const zips = fs.readdirSync(dir)
    .filter(f => f.endsWith('.zip'))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const z of zips.slice(keep)) fs.unlinkSync(path.join(dir, z.f));
}

function backupsDir() {
  const dir = path.join(serverDir(), '..', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function levelName() {
  const raw = readProperties(path.join(serverDir(), 'server.properties'))['level-name'] || 'world';
  // level-name feeds directly into filesystem paths (world dir, backup file names,
  // and a recursive force-delete on world reset) — reject anything that isn't a
  // single path segment instead of letting a crafted value escape serverDir.
  const safe = /^[^/\\]+$/.test(raw) && raw !== '.' && raw !== '..';
  return safe ? raw : 'world';
}

function createBackup() {
  return new Promise((resolve, reject) => {
    const name = levelName();
    const worldDir = path.join(serverDir(), name);
    if (!fs.existsSync(worldDir)) return reject(new Error('World folder not found'));
    if (mc.status === 'online') mc.sendCommand('save-all');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(backupsDir(), `${name}-${stamp}.zip`);
    const output = fs.createWriteStream(file);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', () => {
      try { prune(); } catch (e) { /* pruning is best-effort */ }
      try { require('../reports').event('backup'); } catch (e) { /* reports optional */ }
      resolve({ file: path.basename(file), size: archive.pointer() });
    });
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(worldDir, name);
    archive.finalize();
  });
}

module.exports = { createBackup, backupsDir, levelName };
