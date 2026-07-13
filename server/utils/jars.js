const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const { serverDir, saveConfig } = require('../config');
const { compareSemver } = require('./updater');

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
  const res = await paperFetch(PAPER_API);
  if (!res.ok) throw new Error(`PaperMC version list request failed (HTTP ${res.status})`);
  const data = await res.json();
  return Object.values(data.versions || {}).flat();
}

async function getLatestVersion(type) {
  if (type === 'paper') {
    const all = await paperVersions();
    // newest stable release (skip -pre/-rc), falling back to the very newest build
    return all.find(v => !v.includes('-')) || all[0];
  }
  const res = await fetch(MOJANG_MANIFEST);
  if (!res.ok) throw new Error(`Mojang version manifest request failed (HTTP ${res.status})`);
  const manifest = await res.json();
  return manifest.latest.release;
}

// Resolve the newest STABLE Paper build for a given MC version. Returns
// { id, url } where `id` is the numeric build number (higher = newer) and `url`
// is its server jar download. Used both to download a jar and to compare the
// installed build against the latest at update-check time.
async function resolvePaperBuild(version) {
  const res = await paperFetch(`${PAPER_API}/versions/${version}/builds`);
  const noBuild = `Paper hasn't released a server build for Minecraft ${version} yet. Download the Vanilla jar instead and switch to Paper once they release it.`;
  if (res.status === 404) throw new Error(noBuild);
  if (!res.ok) throw new Error(`PaperMC builds request failed for ${version} (HTTP ${res.status})`);
  const builds = await res.json();
  if (!Array.isArray(builds) || !builds.length) throw new Error(noBuild);
  // Fill v3 build shape we rely on: each entry is
  //   { id: <number>, channel: "STABLE"|"BETA"|..., downloads: { "server:default": { url } } }
  // We pick the newest build (numeric `id` descending) on the STABLE channel,
  // falling back to the newest build overall, then read its
  // downloads['server:default'].url. Guard if that shape is missing.
  const sorted = [...builds].sort((a, b) => b.id - a.id);
  const build = sorted.find(b => b.channel === 'STABLE') || sorted[0];
  if (!build) throw new Error(noBuild);
  const dl = build.downloads && build.downloads['server:default'];
  if (!dl || !dl.url) throw new Error(`No server download for Paper ${version} build ${build.id}`);
  return { id: build.id, url: dl.url };
}

async function resolveJarUrl(type, version) {
  if (type === 'paper') {
    return (await resolvePaperBuild(version)).url;
  }
  const manifestRes = await fetch(MOJANG_MANIFEST);
  if (!manifestRes.ok) throw new Error(`Mojang version manifest request failed (HTTP ${manifestRes.status})`);
  const manifest = await manifestRes.json();
  const entry = manifest.versions.find(v => v.id === version);
  if (!entry) throw new Error(`Unknown vanilla version ${version}`);
  const metaRes = await fetch(entry.url);
  if (!metaRes.ok) throw new Error(`Mojang version metadata request failed for ${version} (HTTP ${metaRes.status})`);
  const meta = await metaRes.json();
  if (!meta.downloads || !meta.downloads.server) throw new Error(`No server jar for ${version}`);
  return meta.downloads.server.url;
}

// Decide whether the installed jar has an available update, at BUILD granularity
// for Paper. `installed` is the persisted string: "vanilla 1.21.4",
// "paper 1.21.4" (legacy, no build) or "paper 1.21.4 132" (with build id).
// Returns { type, version, build, latestVersion, latestBuild, updateAvailable }.
// Paper intentionally stays on its installed MC version line — a new Minecraft
// version never gets auto-selected here, only newer builds of the SAME version
// (a missing stored build — legacy config — is treated as outdated so we
// re-resolve to the newest build once). Jumping MC versions is a manual choice
// made elsewhere (e.g. the jar picker UI), not something startup auto-applies.
async function checkJarUpdate(installed) {
  const [type, version, buildStr] = installed.split(' ');
  const build = buildStr && /^\d+$/.test(buildStr) ? parseInt(buildStr, 10) : null;

  if (type === 'paper' && version) {
    const latestBuild = (await resolvePaperBuild(version)).id;
    const updateAvailable = build == null || latestBuild > build;
    return { type, version, build, latestVersion: version, latestBuild, updateAvailable };
  }

  // Vanilla (or unknown/malformed) — MC version only, no build concept.
  const latestVersion = await getLatestVersion(type);
  const updateAvailable = !!(latestVersion && version && compareSemver(latestVersion, version) === 1);
  return { type, version, build: null, latestVersion, latestBuild: null, updateAvailable };
}

async function downloadJar(type, version, log = () => {}) {
  let url, build = null;
  if (type === 'paper') {
    const info = await resolvePaperBuild(version);
    url = info.url;
    build = info.id;
  } else {
    url = await resolveJarUrl(type, version);
  }
  log(`[dashboard] Downloading ${type} ${version}…`);
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status})`);
  // Unique temp name per download so two concurrent downloads can't both write
  // the same 'server.jar.download' and corrupt each other's stream.
  const tmp = path.join(serverDir(), `server.jar.download.${process.pid}.${Date.now()}`);
  await finished(Readable.fromWeb(dl.body).pipe(fs.createWriteStream(tmp)));
  const size = fs.statSync(tmp).size;
  // Sanity floor: a real server jar is tens of MB; anything under 1 MiB is almost
  // certainly an HTML error page or a truncated download, so reject it.
  if (size < 1024 * 1024) {
    fs.unlinkSync(tmp);
    throw new Error('Downloaded file is suspiciously small — aborted');
  }
  fs.renameSync(tmp, path.join(serverDir(), 'server.jar'));
  // Record the Paper build id as a 3rd token so the update checker can detect
  // "same MC version, newer build". Vanilla has no build concept — stays 2 tokens.
  const installedJar = build != null ? `${type} ${version} ${build}` : `${type} ${version}`;
  saveConfig({ jarFile: 'server.jar', installedJar });
  log(`[dashboard] Downloaded ${type} ${version}${build != null ? ` build ${build}` : ''} (${(size / 1048576).toFixed(1)} MB) as server.jar`);
  return size;
}

module.exports = { getLatestVersion, resolveJarUrl, resolvePaperBuild, checkJarUpdate, downloadJar, paperVersions, PAPER_API, MOJANG_MANIFEST };
