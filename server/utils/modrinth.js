const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const { getConfig, serverDir } = require('../config');

/* Modrinth helpers shared by the Content routes, the live-map installer and the
   "install missing mod" fix. */

const API = 'https://api.modrinth.com/v2';
const MOD_LOADERS = ['fabric', 'forge', 'neoforge'];
const JAR_NAME_RE = /^[\w.\-+ ]{1,200}\.jar$/i;
const UA_HEADERS = { 'User-Agent': `chunkdeck/${require('../../package.json').version} (chunkdeck.dev)` };
const mrFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...UA_HEADERS, ...(opts.headers || {}) } });

function dirFor(loader) {
  return path.join(serverDir(), MOD_LOADERS.includes(loader) ? 'mods' : 'plugins');
}

// What the active server can load: { type, mc, loader } — loader is null for vanilla
// (or nothing installed), which takes neither mods nor plugins.
function serverTarget() {
  const [type, mc] = (getConfig().installedJar || '').split(' ');
  const loader = MOD_LOADERS.includes(type) ? type : (type === 'paper' ? 'paper' : null);
  return { type: type || null, mc: mc || null, loader };
}

// Download a resolved Modrinth version's primary jar into destDir. Returns the
// written filename. Guards: safe filename + the binary must come from Modrinth's
// own CDN, never an arbitrary URL in the response.
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

// Newest version of a project for a loader (+ Minecraft version), or null when the
// project doesn't exist or has no compatible build. Modrinth returns newest first.
async function latestVersion(slug, loader, gameVersion) {
  const q = `loaders=${encodeURIComponent(JSON.stringify([loader]))}` +
    (gameVersion ? `&game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}` : '');
  const r = await mrFetch(`${API}/project/${encodeURIComponent(slug)}/version?${q}`);
  if (r.status === 404) return null;
  if (!r.ok) throw Object.assign(new Error(`Modrinth lookup failed (HTTP ${r.status})`), { status: 502 });
  const versions = await r.json();
  return Array.isArray(versions) && versions.length ? versions[0] : null;
}

// Mod ids a mod jar declares (its own id + ids it "provides"), read from the loader
// metadata inside the jar. Empty when the jar has none.
function jarModIds(file) {
  const yauzl = require('yauzl');
  const WANT = ['META-INF/mods.toml', 'META-INF/neoforge.mods.toml', 'fabric.mod.json', 'quilt.mod.json'];
  return new Promise((resolve) => {
    const ids = new Set();
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return resolve(ids);
      zip.on('error', () => resolve(ids));
      zip.on('end', () => resolve(ids));
      zip.on('entry', (entry) => {
        if (!WANT.includes(entry.fileName) || entry.uncompressedSize > 1048576) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => {
          if (e) return zip.readEntry();
          const chunks = [];
          stream.on('data', c => chunks.push(c));
          stream.on('error', () => zip.readEntry());
          stream.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (entry.fileName.endsWith('.toml')) {
              // only [[mods]] tables — [[dependencies.x]] tables name OTHER mods
              for (const block of text.split(/^\s*\[\[/m)) {
                if (!/^mods\]\]/.test(block)) continue;
                const m = /^\s*modId\s*=\s*["']([^"']+)["']/m.exec(block);
                if (m) ids.add(m[1].toLowerCase());
              }
            } else {
              try {
                const j = JSON.parse(text);
                const meta = j.quilt_loader || j;
                if (typeof meta.id === 'string') ids.add(meta.id.toLowerCase());
                for (const p of [].concat(meta.provides || [])) ids.add(String(p.id || p).toLowerCase());
              } catch (_) {
                const m = /"id"\s*:\s*"([^"]+)"/.exec(text);
                if (m) ids.add(m[1].toLowerCase());
              }
            }
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

// Install the mod that declares mod id `id` for the active server. The id is what a
// crash log names, which is usually — not always — the Modrinth slug, so likely slugs
// are tried first, then a search; a download only counts when the jar really declares
// that id. Returns { id, file, title } or throws.
async function installModById(id) {
  const { loader, mc } = serverTarget();
  if (!MOD_LOADERS.includes(loader)) throw Object.assign(new Error('This server does not load mods'), { status: 400 });
  const destDir = dirFor(loader);
  const dashed = id.replace(/_/g, '-');
  const slugs = [...new Set([id, dashed, `${dashed}-api`, dashed.replace(/-?(api|lib)$/, '')].filter(Boolean))];
  try {
    const facets = JSON.stringify([['project_type:mod'], [`categories:${loader}`], ...(mc ? [[`versions:${mc}`]] : [])]);
    const r = await mrFetch(`${API}/search?query=${encodeURIComponent(dashed.replace(/-/g, ' '))}&facets=${encodeURIComponent(facets)}&limit=3`);
    if (r.ok) for (const h of (await r.json()).hits || []) if (!slugs.includes(h.slug)) slugs.push(h.slug);
  } catch (e) { /* search is only a fallback */ }

  let sawBuild = false;
  for (const slug of slugs) {
    let v;
    try { v = await latestVersion(slug, loader, mc); } catch (e) { continue; }
    if (!v) continue;
    sawBuild = true;
    const before = new Set(fs.existsSync(destDir) ? fs.readdirSync(destDir) : []);
    let name;
    try { name = await downloadVersion(v, destDir); } catch (e) { continue; }
    if ((await jarModIds(path.join(destDir, name))).has(id.toLowerCase())) return { id, file: name, slug };
    if (!before.has(name)) fs.rmSync(path.join(destDir, name), { force: true }); // a different mod — don't leave it behind
  }
  throw Object.assign(new Error(sawBuild
    ? `Could not find the mod "${id}" on Modrinth — search for it on the Content page`
    : `No ${loader}${mc ? ` / Minecraft ${mc}` : ''} build of "${id}" was found on Modrinth`), { status: 404 });
}

module.exports = { API, MOD_LOADERS, JAR_NAME_RE, UA_HEADERS, mrFetch, dirFor, serverTarget, downloadVersion, latestVersion, jarModIds, installModById };
