const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const mc = require('../minecraft');
const { serverDir } = require('../config');
const { readProperties } = require('./properties');

function backupsDir() {
  const dir = path.join(serverDir(), '..', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function levelName() {
  return readProperties(path.join(serverDir(), 'server.properties'))['level-name'] || 'world';
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
    output.on('close', () => resolve({ file: path.basename(file), size: archive.pointer() }));
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(worldDir, name);
    archive.finalize();
  });
}

module.exports = { createBackup, backupsDir, levelName };
