const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { safePath } = require('../config');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const dir = safePath(req.query.path || '');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) { cb(e); }
    },
    // strip any path prefix; Windows browsers may send "C:\fakepath\name.jar"
    filename: (req, file, cb) => {
      let name = (file.originalname || '').split(/[\\/]/).pop();
      if (!name || name === '.' || name === '..') name = 'upload.bin';
      cb(null, name);
    }
  }),
  limits: { fileSize: 1024 * 1024 * 1024 } // 1 GB
});

router.get('/', (req, res) => {
  const dir = safePath(req.query.path || '');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return res.status(404).json({ error: 'Folder not found' });
  }
  const items = fs.readdirSync(dir, { withFileTypes: true }).map((e) => {
    try {
      const st = fs.statSync(path.join(dir, e.name));
      return { name: e.name, dir: st.isDirectory(), size: st.size, modified: st.mtimeMs };
    } catch (err) { return null; } // broken symlink etc. — skip
  }).filter(Boolean);
  items.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
  res.json({ path: req.query.path || '', items });
});

router.get('/download', (req, res) => {
  const file = safePath(req.query.path || '');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(file);
});

// Read a small text file for inline viewing/editing
router.get('/content', (req, res) => {
  const file = safePath(req.query.path || '');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return res.status(404).json({ error: 'File not found' });
  }
  if (fs.statSync(file).size > 512 * 1024) return res.status(413).json({ error: 'File too large to edit inline' });
  res.json({ content: fs.readFileSync(file, 'utf8') });
});

router.put('/content', (req, res, next) => {
  try {
    const content = req.body.content ?? '';
    if (Buffer.byteLength(content, 'utf8') > 512 * 1024) {
      return res.status(413).json({ error: 'File too large to save inline' });
    }
    const file = safePath(req.body.path || '');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      return res.status(400).json({ error: 'Target is a directory' });
    }
    fs.writeFileSync(file, content);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/upload', (req, res, next) => {
  upload.array('files')(req, res, (err) => {
    if (err) return next(err);
    res.json({ ok: true, count: (req.files || []).length });
  });
});

router.post('/mkdir', (req, res, next) => {
  try {
    fs.mkdirSync(safePath(req.body.path || ''), { recursive: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/rename', (req, res, next) => {
  try {
    const from = safePath(req.body.from || '');
    if (!fs.existsSync(from)) return res.status(404).json({ error: 'Source not found' });
    fs.renameSync(from, safePath(req.body.to || ''));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/', (req, res, next) => {
  try {
    const target = safePath(req.query.path || '');
    if (target === safePath('')) return res.status(400).json({ error: 'Cannot delete the server root' });
    fs.rmSync(target, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
