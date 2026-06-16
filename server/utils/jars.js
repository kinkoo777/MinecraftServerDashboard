const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const { serverDir, saveConfig } = require('../config');

const PAPER_API = 'https://api.papermc.io/v2/projects/paper';
const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

async function getLatestVersion(type) {
  if (type === 'paper') {
    const data = await (await fetch(PAPER_API)).json();
    return data.versions[data.versions.length - 1];
  }
  const manifest = await (await fetch(MOJANG_MANIFEST)).json();
  return manifest.latest.release;
}

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

module.exports = { getLatestVersion, resolveJarUrl, downloadJar, PAPER_API, MOJANG_MANIFEST };
