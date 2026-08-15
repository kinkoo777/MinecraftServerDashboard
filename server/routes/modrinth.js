const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const { serverDir } = require('../config');

const router = express.Router();

const API = 'https://api.modrinth.com/v2';
const LOADERS = ['paper', 'spigot', 'bukkit', 'fabric', 'forge', 'neoforge'];
const MOD_LOADERS = ['fabric', 'forge', 'neoforge'];
const SLUG_RE = /^[a-zA-Z0-9\-_]{1,64}$/;
const VERSION_ID_RE = /^[a-zA-Z0-9]{8}$/; // Modrinth version ids are 8-char base62
const JAR_NAME_RE = /^[\w.\-+ ]{1,200}\.jar$/i;

const UA_HEADERS = { 'User-Agent': `chunkdeck/${require('../../package.json').version} (chunkdeck.dev)` };
const mrFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...UA_HEADERS, ...(opts.headers || {}) } });
const SORTS = ['relevance', 'downloads', 'updated', 'newest'];
const PROJECT_TYPES = ['plugin', 'mod', 'modpack'];
const GAME_VERSION_RE = /^[\w.\-]{1,32}$/;
const CATEGORY_RE = /^[a-z0-9\-_]{1,32}$/i;
let categoryCache = { at: 0, data: null };

function dirFor(loader) {
  return path.join(serverDir(), MOD_LOADERS.includes(loader) ? 'mods' : 'plugins');
}

// Download a resolved Modrinth version's primary jar into destDir. Returns the
// written filename. Enforces the same guards as before: safe filename + the
// binary must come from Modrinth's own CDN, never an arbitrary URL in the response.
async function downloadVersion(v, destDir) {
  const file = (v.files || []).find(f => f.primary) || (v.files || [])[0];
  if (!file) throw Object.assign(new Error('Version has no files'), { status: 404 });
  const name = (file.filename || '').split(/[\\/]/).pop();
  if (!JAR_NAME_RE.test(name)) {
    throw Object.assign(new Error(`Unexpected file name from Modrinth: ${name}`), { status: 400 });
  }
  let host;
  try { host = new URL(file.url).hostname; } catch (e) {
    throw Object.assign(new Error('Invalid download URL from Modrinth'), { status: 400 });
  }
  if (!(host === 'modrinth.com' || host.endsWith('.modrinth.com'))) {
    throw Object.assign(new Error(`Refusing download from untrusted host: ${host}`), { status: 400 });
  }
  fs.mkdirSync(destDir, { recursive: true });
  const dl = await mrFetch(file.url);
  if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status})`);
  await finished(Readable.fromWeb(dl.body).pipe(fs.createWriteStream(path.join(destDir, name))));
  return name;
}

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').slice(0, 100);
  let loader = LOADERS.includes(req.query.loader) ? req.query.loader : null;
  const type = PROJECT_TYPES.includes(req.query.type) ? req.query.type
    : (MOD_LOADERS.includes(loader) ? 'mod' : 'plugin'); // legacy calls: infer from loader
  if (!loader) loader = type === 'plugin' ? 'paper' : 'fabric';
  const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'relevance';
  const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), 1000);
  const facets = [[`project_type:${type}`], [`categories:${loader}`]];
  if (GAME_VERSION_RE.test(req.query.gameVersion || '')) facets.push([`versions:${req.query.gameVersion}`]);
  if (CATEGORY_RE.test(req.query.category || '')) facets.push([`categories:${req.query.category}`]);
  try {
    const r = await mrFetch(`${API}/search?query=${encodeURIComponent(q)}&facets=${encodeURIComponent(JSON.stringify(facets))}&limit=20&offset=${offset}&index=${sort}`);
    if (!r.ok) return res.status(502).json({ error: `Modrinth search failed (HTTP ${r.status})` });
    const j = await r.json();
    res.json({
      total: j.total_hits || 0,
      hits: (j.hits || []).map(h => ({
        slug: h.slug, title: h.title, description: h.description,
        icon: h.icon_url, downloads: h.downloads
      }))
    });
  } catch (e) {
    res.status(502).json({ error: `Modrinth unreachable: ${e.message}` });
  }
});

router.get('/categories', async (req, res) => {
  const type = PROJECT_TYPES.includes(req.query.type) ? req.query.type : 'mod';
  const now = Date.now();
  if (categoryCache.at > now - 3600000 && categoryCache.data) {
    return res.json(categoryCache.data[type] || []);
  }
  try {
    const r = await mrFetch(`${API}/tag/category`);
    if (!r.ok) return res.status(502).json({ error: `Modrinth categories failed (HTTP ${r.status})` });
    const all = await r.json();
    const data = {};
    for (const t of PROJECT_TYPES) {
      data[t] = all.filter(c => c.project_type === t && c.header === 'categories').map(c => c.name);
    }
    categoryCache = { at: now, data };
    res.json(data[type] || []);
  } catch (e) {
    res.status(502).json({ error: `Modrinth unreachable: ${e.message}` });
  }
});

router.get('/project/:slug', async (req, res) => {
  if (!SLUG_RE.test(req.params.slug)) return res.status(400).json({ error: 'Invalid project slug' });
  try {
    const r = await mrFetch(`${API}/project/${req.params.slug}`);
    if (r.status === 404) return res.status(404).json({ error: 'Project not found' });
    if (!r.ok) return res.status(502).json({ error: `Modrinth lookup failed (HTTP ${r.status})` });
    const p = await r.json();
    res.json({
      slug: p.slug, title: p.title, description: p.description, body: p.body || '',
      icon: p.icon_url, downloads: p.downloads, followers: p.followers,
      categories: p.categories || [], projectType: p.project_type,
      gameVersions: p.game_versions || [], loaders: p.loaders || [],
      sourceUrl: /^https:\/\//.test(p.source_url || '') ? p.source_url : null,
      gallery: (p.gallery || [])
        .filter(g => { try { const h = new URL(g.url).hostname; return h === 'modrinth.com' || h.endsWith('.modrinth.com'); } catch (e) { return false; } })
        .slice(0, 12).map(g => ({ url: g.url, title: g.title || '' }))
    });
  } catch (e) {
    res.status(502).json({ error: `Modrinth unreachable: ${e.message}` });
  }
});

router.get('/project/:slug/versions', async (req, res) => {
  if (!SLUG_RE.test(req.params.slug)) return res.status(400).json({ error: 'Invalid project slug' });
  const qs = [];
  if (LOADERS.includes(req.query.loader)) qs.push(`loaders=${encodeURIComponent(JSON.stringify([req.query.loader]))}`);
  if (GAME_VERSION_RE.test(req.query.gameVersion || '')) qs.push(`game_versions=${encodeURIComponent(JSON.stringify([req.query.gameVersion]))}`);
  try {
    const r = await mrFetch(`${API}/project/${req.params.slug}/version${qs.length ? '?' + qs.join('&') : ''}`);
    if (r.status === 404) return res.status(404).json({ error: 'Project not found' });
    if (!r.ok) return res.status(502).json({ error: `Modrinth lookup failed (HTTP ${r.status})` });
    const list = await r.json();
    res.json((Array.isArray(list) ? list : []).slice(0, 50).map(v => {
      const f = (v.files || []).find(x => x.primary) || (v.files || [])[0] || {};
      return {
        id: v.id, versionNumber: v.version_number, versionType: v.version_type,
        gameVersions: v.game_versions || [], loaders: v.loaders || [],
        datePublished: v.date_published, size: f.size || 0
      };
    }));
  } catch (e) {
    res.status(502).json({ error: `Modrinth unreachable: ${e.message}` });
  }
});

// Identify installed jars by SHA1 and report which ones have a newer compatible
// Modrinth version available. Read-only: never downloads or modifies anything.
router.get('/check-updates', async (req, res) => {
  const dir = req.query.path === 'mods' ? 'mods' : (req.query.path === 'plugins' ? 'plugins' : null);
  if (!dir) return res.status(400).json({ error: 'Invalid path' });

  const dirPath = path.join(serverDir(), dir);
  let files;
  try {
    files = fs.readdirSync(dirPath).filter(n => n.toLowerCase().endsWith('.jar'));
  } catch (e) {
    return res.json({ items: [] }); // no such folder yet
  }
  if (!files.length) return res.json({ items: [] });

  // SHA1 every jar; a jar Modrinth knows will match one of these exactly
  const hashes = {};
  for (const f of files) {
    try {
      hashes[f] = crypto.createHash('sha1').update(fs.readFileSync(path.join(dirPath, f))).digest('hex');
    } catch (e) { /* unreadable — treated as unmatched below */ }
  }

  let matchMap = {};
  try {
    const r = await mrFetch(`${API}/version_files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: Object.values(hashes), algorithm: 'sha1' })
    });
    if (!r.ok) return res.status(502).json({ error: `Modrinth lookup failed (HTTP ${r.status})` });
    matchMap = await r.json();
  } catch (e) {
    return res.status(502).json({ error: `Modrinth unreachable: ${e.message}` });
  }

  // Gather the matched version per file + the set of projects to fetch metadata for
  const matched = {};
  const projectIds = new Set();
  for (const f of files) {
    const v = hashes[f] && matchMap[hashes[f]];
    if (v && v.project_id) { matched[f] = v; projectIds.add(v.project_id); }
  }

  // Bulk-fetch slug/title so the UI can name projects (optional — failure is non-fatal)
  const meta = {};
  if (projectIds.size) {
    try {
      const r = await mrFetch(`${API}/projects?ids=${encodeURIComponent(JSON.stringify([...projectIds]))}`);
      if (r.ok) for (const p of await r.json()) meta[p.id] = { slug: p.slug, title: p.title };
    } catch (e) { /* names are nice-to-have */ }
  }

  // Newest compatible version for a matched jar: filter the project's version list
  // by the SAME loaders the installed jar declared (a paper plugin may be tagged
  // bukkit/spigot/folia, not "paper", so guessing the loader would miss versions).
  const latestCache = {};
  async function latestFor(v) {
    const loaders = (v.loaders && v.loaders.length) ? v.loaders : null;
    const key = v.project_id + '|' + (loaders ? loaders.join(',') : '');
    if (key in latestCache) return latestCache[key];
    const q = loaders ? `?loaders=${encodeURIComponent(JSON.stringify(loaders))}` : '';
    let newest = null;
    try {
      const r = await mrFetch(`${API}/project/${v.project_id}/version${q}`);
      if (r.ok) { const vs = await r.json(); newest = Array.isArray(vs) && vs.length ? vs[0] : null; }
    } catch (e) { /* leave null — reported as no update */ }
    latestCache[key] = newest;
    return newest;
  }

  const items = [];
  for (const f of files) {
    const cur = matched[f];
    if (!cur) { items.push({ file: f, matched: false }); continue; }
    const newest = await latestFor(cur);
    const m = meta[cur.project_id] || {};
    const updateAvailable = !!(newest && newest.id !== cur.id &&
      new Date(newest.date_published) > new Date(cur.date_published));
    items.push({
      file: f,
      matched: true,
      projectId: cur.project_id,
      slug: m.slug || null,
      title: m.title || null,
      currentVersion: cur.version_number,
      latestVersion: newest ? newest.version_number : cur.version_number,
      updateAvailable,
      latestVersionId: newest ? newest.id : null
    });
  }
  res.json({ items });
});

// Install a project's newest compatible version (slug + loader) OR, for an update,
// a specific resolved version (versionId). `replaceFile` names the stale jar of the
// same project to remove so an update doesn't leave two jars behind.
router.post('/install', async (req, res) => {
  const { slug, loader, versionId, replaceFile } = req.body;
  if (!LOADERS.includes(loader)) return res.status(400).json({ error: 'Invalid loader' });
  const destDir = dirFor(loader);

  try {
    let v;
    if (versionId != null && versionId !== '') {
      if (!VERSION_ID_RE.test(versionId)) return res.status(400).json({ error: 'Invalid version id' });
      const r = await mrFetch(`${API}/version/${versionId}`);
      if (r.status === 404) return res.status(404).json({ error: 'Version not found' });
      if (!r.ok) return res.status(502).json({ error: `Modrinth lookup failed (HTTP ${r.status})` });
      v = await r.json();
    } else {
      if (!SLUG_RE.test(slug || '')) return res.status(400).json({ error: 'Invalid project slug' });
      const gv = GAME_VERSION_RE.test(req.body.gameVersion || '') ? req.body.gameVersion : null;
      const q = `loaders=${encodeURIComponent(JSON.stringify([loader]))}` + (gv ? `&game_versions=${encodeURIComponent(JSON.stringify([gv]))}` : '');
      const r = await mrFetch(`${API}/project/${slug}/version?${q}`);
      if (!r.ok) return res.status(502).json({ error: `Modrinth lookup failed (HTTP ${r.status})` });
      const versions = await r.json();
      if (!Array.isArray(versions) || !versions.length) {
        return res.status(404).json({ error: `No ${loader}${gv ? ' / MC ' + gv : ''}-compatible version found` });
      }
      v = versions[0]; // Modrinth returns newest first
    }

    const name = await downloadVersion(v, destDir);

    // Remove the jar being replaced (same safe-filename guard; must stay inside destDir)
    if (replaceFile) {
      const old = String(replaceFile).split(/[\\/]/).pop();
      if (JAR_NAME_RE.test(old) && old !== name) {
        const oldPath = path.join(destDir, old);
        if (oldPath.startsWith(destDir + path.sep) && fs.existsSync(oldPath)) fs.rmSync(oldPath);
      }
    }

    res.json({ ok: true, file: name, version: v.version_number });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});

module.exports = router;
