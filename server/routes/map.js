const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mc = require('../minecraft');
const { levelName } = require('../utils/backup');
const { regionDir } = require('../utils/worldpaths');
const anvil = require('../utils/anvil');
const png = require('../utils/png');

const router = express.Router();

const DIMS = ['overworld', 'nether', 'end'];

/* ---------- Rendered-PNG cache (keyed by file path + mtime) ---------- */
const renderCache = new Map(); // file -> { mtime, buf, etag }
const CACHE_MAX = 300;

function renderRegion(file) {
  const mtime = fs.statSync(file).mtimeMs;
  const hit = renderCache.get(file);
  if (hit && hit.mtime === mtime) return hit;
  const grid = anvil.readRegionHeights(file);
  const buf = grid ? png.encode(grid.width, grid.height, anvil.heightsToRGBA(grid)) : null;
  const entry = { mtime, buf, etag: buf ? '"' + crypto.createHash('md5').update(buf).digest('hex') + '"' : null };
  renderCache.set(file, entry);
  if (renderCache.size > CACHE_MAX) renderCache.delete(renderCache.keys().next().value);
  return entry;
}

/* ---------- Gentle streaming pre-generation ---------- */
// Generates small batches with pauses so the server never lags hard, tracking
// progress. Force-loads a batch, lets it generate, saves, releases it, repeats.
let job = null; // { active, done, total, dim }

function chunkBatches(ccx, ccz, radius, step) {
  const minX = ccx - radius, maxX = ccx + radius, minZ = ccz - radius, maxZ = ccz + radius;
  const b = [];
  for (let x = minX; x <= maxX; x += step)
    for (let z = minZ; z <= maxZ; z += step)
      b.push([x, z, Math.min(x + step - 1, maxX), Math.min(z + step - 1, maxZ)]);
  return b;
}

function runBatch(batches, i) {
  if (!job || !job.active) return;
  if (mc.status !== 'online') { job.active = false; mc.pushLog('[dashboard] Map generation stopped (server offline).'); return; }
  if (i >= batches.length) {
    job.active = false;
    mc.sendCommand('save-all flush', { quiet: true });
    mc.pushLog(`[dashboard] Map generation complete — ${job.done} chunks.`);
    return;
  }
  const [x1, z1, x2, z2] = batches[i];
  const n = (x2 - x1 + 1) * (z2 - z1 + 1);
  try { mc.sendCommand(`forceload add ${x1 * 16} ${z1 * 16} ${x2 * 16} ${z2 * 16}`, { quiet: true }); }
  catch (e) { job.active = false; return; }
  setTimeout(() => {
    if (!job || !job.active) return;
    try {
      mc.sendCommand('save-all flush', { quiet: true });
      mc.sendCommand(`forceload remove ${x1 * 16} ${z1 * 16} ${x2 * 16} ${z2 * 16}`, { quiet: true });
    } catch (e) { /* ignore */ }
    job.done += n;
    setTimeout(() => runBatch(batches, i + 1), 700); // breathe between batches
  }, 3800); // let the batch generate
}

router.post('/pregenerate', (req, res) => {
  if (mc.status !== 'online') {
    return res.status(409).json({ error: 'Start the server first — generation uses the running server.' });
  }
  if (job && job.active) return res.status(409).json({ error: 'Already generating — wait for it to finish or stop it.' });
  const radius = Math.min(16, Math.max(1, Math.round(Number(req.body.radius) || 6)));
  const ccx = Math.round((Number(req.body.centerX) || 0) / 16);
  const ccz = Math.round((Number(req.body.centerZ) || 0) / 16);
  const total = (2 * radius + 1) ** 2;
  const batches = chunkBatches(ccx, ccz, radius, 5); // 5×5 = 25 chunks/batch, gentle
  job = { active: true, done: 0, total, dim: 'overworld' };
  mc.pushLog(`[dashboard] Generating ${total} chunks around spawn (gently, in the background)…`);
  runBatch(batches, 0);
  res.json({ ok: true, total });
});

router.get('/pregenerate/status', (req, res) => {
  res.json(job ? { active: job.active, done: Math.min(job.done, job.total), total: job.total } : { active: false, done: 0, total: 0 });
});

router.post('/pregenerate/stop', (req, res) => {
  if (job) job.active = false;
  res.json({ ok: true });
});

/* ---------- Region listing & rendering ---------- */
router.get('/regions', (req, res) => {
  const dim = DIMS.includes(req.query.dim) ? req.query.dim : 'overworld';
  const dir = regionDir(dim);
  const regions = dir ? anvil.listRegions(dir) : [];
  const available = DIMS.filter(d => { const dd = regionDir(d); return dd && anvil.listRegions(dd).length; });
  res.json({
    dim,
    dimensions: available,
    level: levelName(),
    regions: regions.map(r => ({ rx: r.rx, rz: r.rz }))
  });
});

router.get('/region/:dim/:rx/:rz.png', (req, res) => {
  const dim = DIMS.includes(req.params.dim) ? req.params.dim : 'overworld';
  const rx = Number(req.params.rx);
  const rz = Number(req.params.rz);
  if (!Number.isInteger(rx) || !Number.isInteger(rz) || Math.abs(rx) > 100000 || Math.abs(rz) > 100000) {
    return res.status(400).json({ error: 'Invalid region coordinates' });
  }
  const dir = regionDir(dim);
  const file = dir ? path.join(dir, `r.${rx}.${rz}.mca`) : null;
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Region not found' });
  try {
    const { buf, etag } = renderRegion(file);
    if (!buf) return res.status(204).end(); // file exists but no generated chunks yet
    if (etag && req.headers['if-none-match'] === etag) return res.status(304).end();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache'); // revalidate via ETag, but skip re-download when unchanged
    if (etag) res.setHeader('ETag', etag);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: `Could not render region: ${e.message}` });
  }
});

module.exports = router;
