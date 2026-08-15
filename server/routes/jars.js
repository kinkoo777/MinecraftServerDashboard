const express = require('express');
const mc = require('../minecraft');
const { getConfig } = require('../config');
const { checkJarUpdate, downloadJar, paperVersions, MOJANG_MANIFEST } = require('../utils/jars');
const loaders = require('../utils/loaders');

const router = express.Router();
const VERSION_RE = /^[\w.\-]{1,32}$/;

router.get('/versions', async (req, res) => {
  const val = (r, fallback = []) => r.status === 'fulfilled' ? r.value : fallback;
  const [paperR, mojangR, fabricR, neoR, forgeR] = await Promise.allSettled([
    paperVersions(),
    fetch(MOJANG_MANIFEST).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    loaders.mcListFor('fabric'),
    loaders.mcListFor('neoforge'),
    loaders.mcListFor('forge')
  ]);
  if (paperR.status === 'rejected' && mojangR.status === 'rejected') {
    return res.status(502).json({ error: 'Could not reach version APIs' });
  }
  res.json({
    paper: val(paperR).slice(0, 60),
    vanilla: mojangR.status === 'fulfilled' ? mojangR.value.versions.filter(v => v.type === 'release').slice(0, 30).map(v => v.id) : [],
    fabric: val(fabricR).slice(0, 40),
    neoforge: val(neoR).slice(0, 40),
    forge: val(forgeR).slice(0, 60)
  });
});

// Compare the installed jar against the newest available build of the same line.
// For Paper this detects same-MC-version build bumps, not just MC version changes.
router.get('/check', async (req, res) => {
  const installed = getConfig().installedJar;
  if (!installed) return res.json({ installed: null });
  try {
    const info = await checkJarUpdate(installed);
    return res.json({
      installed,
      type: info.type,
      version: info.version,
      latest: info.latestVersion,
      build: info.build,
      latestBuild: info.latestBuild,
      updateAvailable: info.updateAvailable
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.post('/download', async (req, res) => {
  const { type, version } = req.body;
  if (!['paper', 'vanilla', 'fabric', 'neoforge', 'forge'].includes(type)) return res.status(400).json({ error: 'Unknown server type' });
  if (!VERSION_RE.test(version || '')) return res.status(400).json({ error: 'Invalid version' });
  if (mc.status !== 'offline') return res.status(409).json({ error: 'Stop the server before changing the jar' });
  try {
    const size = await downloadJar(type, version, msg => mc.pushLog(msg));
    res.json({ ok: true, size, jarFile: 'server.jar' });
  } catch (e) {
    mc.pushLog(`[dashboard] Jar download failed: ${e.message}`);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
