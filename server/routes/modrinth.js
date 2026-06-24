const express = require('express');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const { serverDir } = require('../config');

const router = express.Router();

const API = 'https://api.modrinth.com/v2';
const LOADERS = ['paper', 'spigot', 'bukkit', 'fabric', 'forge', 'neoforge'];
const MOD_LOADERS = ['fabric', 'forge', 'neoforge'];
const SLUG_RE = /^[a-zA-Z0-9\-_]{1,64}$/;

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').slice(0, 100);
  const loader = LOADERS.includes(req.query.loader) ? req.query.loader : 'paper';
  const projectType = MOD_LOADERS.includes(loader) ? 'mod' : 'plugin';
  const facets = JSON.stringify([[`project_type:${projectType}`], [`categories:${loader}`]]);
  try {
    const r = await fetch(`${API}/search?query=${encodeURIComponent(q)}&facets=${encodeURIComponent(facets)}&limit=12`);
    if (!r.ok) return res.status(502).json({ error: `Modrinth search failed (HTTP ${r.status})` });
    const j = await r.json();
    res.json((j.hits || []).map(h => ({
      slug: h.slug,
      title: h.title,
      description: h.description,
      icon: h.icon_url,
      downloads: h.downloads
    })));
  } catch (e) {
    res.status(502).json({ error: `Modrinth unreachable: ${e.message}` });
  }
});

router.post('/install', async (req, res) => {
  const { slug, loader } = req.body;
  if (!SLUG_RE.test(slug || '')) return res.status(400).json({ error: 'Invalid project slug' });
  if (!LOADERS.includes(loader)) return res.status(400).json({ error: 'Invalid loader' });

  try {
    const r = await fetch(`${API}/project/${slug}/version?loaders=${encodeURIComponent(JSON.stringify([loader]))}`);
    if (!r.ok) return res.status(502).json({ error: `Modrinth lookup failed (HTTP ${r.status})` });
    const versions = await r.json();
    if (!Array.isArray(versions) || !versions.length) {
      return res.status(404).json({ error: `No ${loader}-compatible version found` });
    }
    const v = versions[0]; // Modrinth returns newest first
    const file = v.files.find(f => f.primary) || v.files[0];
    if (!file) return res.status(404).json({ error: 'Version has no files' });

    const destDir = path.join(serverDir(), MOD_LOADERS.includes(loader) ? 'mods' : 'plugins');
    fs.mkdirSync(destDir, { recursive: true });
    const name = (file.filename || '').split(/[\\/]/).pop();
    if (!/^[\w.\-+ ]{1,200}\.jar$/i.test(name)) {
      return res.status(400).json({ error: `Unexpected file name from Modrinth: ${name}` });
    }
    // only pull binaries from Modrinth's own CDN, never an arbitrary URL in the API response
    let host;
    try { host = new URL(file.url).hostname; } catch (e) { return res.status(400).json({ error: 'Invalid download URL from Modrinth' }); }
    if (!host.endsWith('modrinth.com')) {
      return res.status(400).json({ error: `Refusing download from untrusted host: ${host}` });
    }
    const dl = await fetch(file.url);
    if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status})`);
    await finished(Readable.fromWeb(dl.body).pipe(fs.createWriteStream(path.join(destDir, name))));
    res.json({ ok: true, file: name, version: v.version_number });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
