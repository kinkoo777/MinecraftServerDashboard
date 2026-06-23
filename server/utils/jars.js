const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const { serverDir, saveConfig } = require('../config');

// PaperMC's old v2 API is frozen at the 1.21.x line and never receives the newer
// (26.x) Minecraft versions — those only exist on the v3 "Fill" API. Use v3 for Paper.
const PAPER_API = 'https://fill.papermc.io/v3/projects/paper';
const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const PAPER_UA = 'MinecraftServerDashboard (server jar updater)';

const paperFetch = (url) => fetch(url, { headers: { 'User-Agent': PAPER_UA } });

// v3 lists versions grouped by minor, newest-first within each group:
//   { versions: { "26.2": ["26.2","26.2-rc-2"], "1.21": ["1.21.11", ...], ... } }
// Flatten to a single newest-first list of version strings.
async function paperVersions() {
  const data = await (await paperFetch(PAPER_API)).json();
  return Object.values(data.versions || {}).flat();
}

async function getLatestVersion(type) {
  if (type === 'paper') {
    const all = await paperVersions();
    // newest stable release (skip -pre/-rc), falling back to the very newest build
    return all.find(v => !v.includes('-')) || all[0];
  }
  const manifest = await (await fetch(MOJANG_MANIFEST)).json();
  return manifest.latest.release;
}

async function resolveJarUrl(type, version) {
  if (type === 'paper') {
    const res = await paperFetch(`${PAPER_API}/versions/${version}/builds`);
    const noBuild = `Paper hasn't released a server build for Minecraft ${version} yet. Download the Vanilla jar instead and switch to Paper once they release it.`;
    if (res.status === 404) throw new Error(noBuild);
    const builds = await res.json();
    if (!Array.isArray(builds) || !builds.length) throw new Error(noBuild);
    // newest build of the STABLE channel, else the newest build overall
    const sorted = [...builds].sort((a, b) => b.id - a.id);
    const build = sorted.find(b => b.channel === 'STABLE') || sorted[0];
    const dl = build.downloads && build.downloads['server:default'];
    if (!dl || !dl.url) throw new Error(`No server download for Paper ${version} build ${build.id}`);
    return dl.url;
  }
  const manifest = await (await fetch(MOJANG_MANIFEST)).json();
  const entry = manifest.versions.find(v => v.id === version);
  if (!entry) throw new Error(`Unknown vanilla version ${version}`);
  const meta = await (await fetch(entry.url)).json();
  if (!meta.downloads || !meta.downloads.server) throw new Error(`No server jar for ${version}`);
  return meta.downloads.server.url;
}

async function downloadJar(type, version, log = () => {}) {
  const url = await resolveJarUrl(type, version);
  log(`[dashboard] Downloading ${type} ${version}…`);
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
  log(`[dashboard] Downloaded ${type} ${version} (${(size / 1048576).toFixed(1)} MB) as server.jar`);
  return size;
}

module.exports = { getLatestVersion, resolveJarUrl, downloadJar, paperVersions, PAPER_API, MOJANG_MANIFEST };
