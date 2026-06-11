const express = require('express');
const path = require('path');
const { readProperties, writeProperties } = require('../utils/properties');
const { getConfig, saveConfig, serverDir } = require('../config');

const router = express.Router();

const propsFile = () => path.join(serverDir(), 'server.properties');

router.get('/properties', (req, res) => {
  res.json(readProperties(propsFile()));
});

router.put('/properties', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Expected an object of properties' });
  }
  writeProperties(propsFile(), req.body);
  res.json({ ok: true });
});

router.get('/config', (req, res) => {
  res.json(getConfig());
});

router.put('/config', (req, res) => {
  const allowed = ['jarFile', 'javaPath', 'minRam', 'maxRam', 'jvmArgs'];
  const patch = {};
  for (const key of allowed) {
    if (typeof req.body[key] === 'string') patch[key] = req.body[key].trim();
  }
  if (patch.minRam && !/^\d+[MG]$/i.test(patch.minRam)) return res.status(400).json({ error: 'Min RAM must look like 1G or 512M' });
  if (patch.maxRam && !/^\d+[MG]$/i.test(patch.maxRam)) return res.status(400).json({ error: 'Max RAM must look like 2G or 2048M' });
  res.json(saveConfig(patch));
});

module.exports = router;
