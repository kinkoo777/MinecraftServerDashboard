const express = require('express');
const fs = require('fs');
const path = require('path');
const { serverDir } = require('../config');
const { levelName } = require('../utils/backup');
const anvil = require('../utils/anvil');
const png = require('../utils/png');

const router = express.Router();

const DIMENSIONS = {
  overworld: () => path.join(serverDir(), levelName(), 'region'),
  nether: () => path.join(serverDir(), levelName(), 'DIM-1', 'region'),
  end: () => path.join(serverDir(), levelName(), 'DIM1', 'region')
};

router.get('/regions', (req, res) => {
  const dim = DIMENSIONS[req.query.dim] ? req.query.dim : 'overworld';
  const dir = DIMENSIONS[dim]();
  const regions = anvil.listRegions(dir);
  const available = Object.keys(DIMENSIONS).filter(d => fs.existsSync(DIMENSIONS[d]()) && anvil.listRegions(DIMENSIONS[d]()).length);
  res.json({
    dim,
    dimensions: available,
    level: levelName(),
    regions: regions.map(r => ({ rx: r.rx, rz: r.rz }))
  });
});

router.get('/region/:dim/:rx/:rz.png', (req, res) => {
  const dim = DIMENSIONS[req.params.dim] ? req.params.dim : 'overworld';
  const rx = Number(req.params.rx);
  const rz = Number(req.params.rz);
  if (!Number.isInteger(rx) || !Number.isInteger(rz) || Math.abs(rx) > 100000 || Math.abs(rz) > 100000) {
    return res.status(400).json({ error: 'Invalid region coordinates' });
  }
  const file = path.join(DIMENSIONS[dim](), `r.${rx}.${rz}.mca`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Region not found' });
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
