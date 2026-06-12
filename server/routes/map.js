const express = require('express');
const fs = require('fs');
const path = require('path');
const mc = require('../minecraft');
const { levelName } = require('../utils/backup');
const { regionDir } = require('../utils/worldpaths');
const anvil = require('../utils/anvil');
const png = require('../utils/png');

const router = express.Router();

const DIMS = ['overworld', 'nether', 'end'];

/* Pre-generate chunks around a center using the server's own generator
   (vanilla /forceload). After they generate and save, the map renders them.
   This is the only accurate way to "see the map by seed" without walking. */
router.post('/pregenerate', (req, res) => {
  if (mc.status !== 'online') {
    return res.status(409).json({ error: 'Start the server first — generation uses the running server.' });
  }
  const radius = Math.min(12, Math.max(1, Math.round(Number(req.body.radius) || 6))); // in chunks
  const ccx = Math.round((Number(req.body.centerX) || 0) / 16); // center chunk X
  const ccz = Math.round((Number(req.body.centerZ) || 0) / 16);
  const minX = ccx - radius, maxX = ccx + radius;
  const minZ = ccz - radius, maxZ = ccz + radius;
  const chunks = (maxX - minX + 1) * (maxZ - minZ + 1);

  // forceload is capped at 256 chunks per command, so batch into ≤16×16 blocks
  const batches = [];
  for (let x = minX; x <= maxX; x += 16) {
    for (let z = minZ; z <= maxZ; z += 16) {
      batches.push([x * 16, z * 16, Math.min(x + 15, maxX) * 16, Math.min(z + 15, maxZ) * 16]);
    }
  }

  try {
    mc.pushLog(`[dashboard] Pre-generating ${chunks} chunks around (${ccx * 16}, ${ccz * 16})…`);
    for (const [x1, z1, x2, z2] of batches) mc.sendCommand(`forceload add ${x1} ${z1} ${x2} ${z2}`, { quiet: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const waitMs = Math.min(50000, Math.max(5000, chunks * 60));
  // after generation settles: save to disk, then release the forceloads
  setTimeout(() => {
    if (mc.status !== 'online') return;
    try {
      mc.sendCommand('save-all flush', { quiet: true });
      setTimeout(() => {
        if (mc.status !== 'online') return;
        for (const [x1, z1, x2, z2] of batches) mc.sendCommand(`forceload remove ${x1} ${z1} ${x2} ${z2}`, { quiet: true });
        mc.pushLog(`[dashboard] Pre-generation done — ${chunks} chunks saved. Open the Map page.`);
      }, 3000);
    } catch (e) { /* server stopped mid-way */ }
  }, waitMs);

  res.json({ ok: true, chunks, estSeconds: Math.ceil(waitMs / 1000) + 3 });
});

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
    const grid = anvil.readRegionHeights(file);
    if (!grid) return res.status(204).end(); // file exists but no generated chunks
    const rgba = anvil.heightsToRGBA(grid);
    const buf = png.encode(grid.width, grid.height, rgba);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: `Could not render region: ${e.message}` });
  }
});

module.exports = router;
