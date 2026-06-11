const express = require('express');
const fs = require('fs');
const path = require('path');
const extractZip = require('extract-zip');
const mc = require('../minecraft');
const { serverDir } = require('../config');
const { readProperties } = require('../utils/properties');
const { createBackup, backupsDir, levelName } = require('../utils/backup');

const router = express.Router();

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    try {
      total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    } catch (e) { /* broken symlink etc. — skip */ }
  }
  return total;
}

function requireOffline(res) {
  if (mc.status !== 'offline') {
    res.status(409).json({ error: 'Stop the server first' });
    return false;
  }
  return true;
}

router.get('/', (req, res) => {
  const name = levelName();
  const props = readProperties(path.join(serverDir(), 'server.properties'));
  const backups = fs.readdirSync(backupsDir())
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const st = fs.statSync(path.join(backupsDir(), f));
      return { name: f, size: st.size, created: st.mtimeMs };
    })
    .sort((a, b) => b.created - a.created);
  res.json({
    name,
    seed: props['level-seed'] || '(random)',
    exists: fs.existsSync(path.join(serverDir(), name)),
    size: dirSize(path.join(serverDir(), name)),
    backups
  });
});

router.post('/backup', async (req, res) => {
  try {
    res.json({ ok: true, ...(await createBackup()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/backup/:name', (req, res) => {
  const file = path.join(backupsDir(), path.basename(req.params.name));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Backup not found' });
  res.download(file);
});

router.delete('/backup/:name', (req, res) => {
  const file = path.join(backupsDir(), path.basename(req.params.name));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

router.post('/restore', async (req, res) => {
  if (!requireOffline(res)) return;
  const file = path.join(backupsDir(), path.basename(req.body.name || ''));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Backup not found' });
  const worldDir = path.join(serverDir(), levelName());
  if (fs.existsSync(worldDir)) fs.rmSync(worldDir, { recursive: true, force: true });
  await extractZip(file, { dir: serverDir() });
  res.json({ ok: true });
});

router.delete('/', (req, res) => {
  if (!requireOffline(res)) return;
  const worldDir = path.join(serverDir(), levelName());
  if (fs.existsSync(worldDir)) fs.rmSync(worldDir, { recursive: true, force: true });
  res.json({ ok: true });
});

module.exports = router;
