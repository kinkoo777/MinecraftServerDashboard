const express = require('express');
const fs = require('fs');
const path = require('path');
const { levelName } = require('../utils/backup');
const { regionDir } = require('../utils/worldpaths');
const anvil = require('../utils/anvil');
const png = require('../utils/png');

const router = express.Router();

const DIMS = ['overworld', 'nether', 'end'];

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
