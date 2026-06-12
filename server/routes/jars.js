const express = require('express');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const mc = require('../minecraft');
const { serverDir, saveConfig, getConfig } = require('../config');

const router = express.Router();

const PAPER_API = 'https://api.papermc.io/v2/projects/paper';
const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const VERSION_RE = /^[\w.\-]{1,32}$/;

router.get('/versions', async (req, res) => {
  try {
    const [paperRes, mojangRes] = await Promise.all([fetch(PAPER_API), fetch(MOJANG_MANIFEST)]);
    const paper = await paperRes.json();
    const mojang = await mojangRes.json();
    res.json({
      paper: paper.versions.slice(-15).reverse(),
      vanilla: mojang.versions.filter(v => v.type === 'release').slice(0, 15).map(v => v.id)
    });
  } catch (e) {
    res.status(502).json({ error: `Could not reach version APIs: ${e.message}` });
  }
});

// Compare the installed jar against the newest available build of the same line
router.get('/check', async (req, res) => {
  const installed = getConfig().installedJar; // "paper 1.21.4" or ""
  if (!installed) return res.json({ installed: null });
  const [type, version] = installed.split(' ');
  try {
    if (type === 'paper') {
      const data = await (await fetch(PAPER_API)).json();
      const latest = data.versions[data.versions.length - 1];
      return res.json({ installed, type, version, latest, updateAvailable: latest !== version });
    }
    const manifest = await (await fetch(MOJANG_MANIFEST)).json();
    const latest = manifest.latest.release;
    return res.json({ installed, type, version, latest, updateAvailable: latest !== version });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

async function resolveJarUrl(type, version) {
  if (type === 'paper') {
    const builds = (await (await fetch(`${PAPER_API}/versions/${version}/builds`)).json()).builds;
    if (!builds || !builds.length) throw new Error(`No Paper builds for ${version}`);
    const build = builds.filter(b => b.channel === 'default').pop() || builds[builds.length - 1];
    return `${PAPER_API}/versions/${version}/builds/${build.build}/downloads/${build.downloads.application.name}`;
  }
  const manifest = await (await fetch(MOJANG_MANIFEST)).json();
  const entry = manifest.versions.find(v => v.id === version);
  if (!entry) throw new Error(`Unknown vanilla version ${version}`);
  const meta = await (await fetch(entry.url)).json();
  if (!meta.downloads || !meta.downloads.server) throw new Error(`No server jar for ${version}`);
  return meta.downloads.server.url;
}

router.post('/download', async (req, res) => {
  const { type, version } = req.body;
  if (!['paper', 'vanilla'].includes(type)) return res.status(400).json({ error: 'Type must be paper or vanilla' });
  if (!VERSION_RE.test(version || '')) return res.status(400).json({ error: 'Invalid version' });
  if (mc.status !== 'offline') return res.status(409).json({ error: 'Stop the server before changing the jar' });

  try {
    const url = await resolveJarUrl(type, version);
    mc.pushLog(`[dashboard] Downloading ${type} ${version}…`);
    const dl = await fetch(url);
    if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status})`);
    const tmp = path.join(serverDir(), 'server.jar.download');
    await finished(Readable.fromWeb(dl.body).pipe(fs.createWriteStream(tmp)));
    const size = fs.statSync(tmp).size;
    if (size < 1024 * 1024) {
      fs.unlinkSync(tmp);
      throw new Error('Downloaded file is suspiciously small — aborted');
    }
    fs.renameSync(tmp, path.join(serverDir(), 'server.jar'));
    saveConfig({ jarFile: 'server.jar', installedJar: `${type} ${version}` });
    mc.pushLog(`[dashboard] Downloaded ${type} ${version} (${(size / 1048576).toFixed(1)} MB) as server.jar`);
    res.json({ ok: true, size, jarFile: 'server.jar' });
  } catch (e) {
    mc.pushLog(`[dashboard] Jar download failed: ${e.message}`);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
