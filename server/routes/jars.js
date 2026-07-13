const express = require('express');
const mc = require('../minecraft');
const { getConfig } = require('../config');
const { checkJarUpdate, downloadJar, paperVersions, MOJANG_MANIFEST } = require('../utils/jars');

const router = express.Router();
const VERSION_RE = /^[\w.\-]{1,32}$/;

router.get('/versions', async (req, res) => {
  try {
    const [paperList, mojangRes] = await Promise.all([paperVersions(), fetch(MOJANG_MANIFEST)]);
    if (!mojangRes.ok) throw new Error(`Mojang version manifest request failed (HTTP ${mojangRes.status})`);
    const mojang = await mojangRes.json();
    res.json({
      paper: paperList.slice(0, 60),
      vanilla: mojang.versions.filter(v => v.type === 'release').slice(0, 30).map(v => v.id)
    });
  } catch (e) {
    res.status(502).json({ error: `Could not reach version APIs: ${e.message}` });
  }
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
  if (!['paper', 'vanilla'].includes(type)) return res.status(400).json({ error: 'Type must be paper or vanilla' });
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
