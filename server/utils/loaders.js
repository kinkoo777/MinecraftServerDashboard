const FABRIC_META = 'https://meta.fabricmc.net/v2';
const NEOFORGE_API = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';
const NEOFORGE_DL = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FORGE_DL = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const UA = { headers: { 'User-Agent': 'chunkdeck/1.1.0 (chunkdeck.dev)' } };

const MODDED_TYPES = ['fabric', 'neoforge', 'forge'];

async function getJson(url, what) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${what} request failed (HTTP ${r.status})`);
  return r.json();
}

// numeric-aware compare for '54.1.0' / '21.4.63-beta' style strings
function cmpDotted(a, b) {
  const pa = String(a).split(/[.-]/), pb = String(b).split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = parseInt(pa[i], 10), y = parseInt(pb[i], 10);
    if (!isNaN(x) && !isNaN(y)) { if (x !== y) return x - y; continue; }
    if ((pa[i] || '') !== (pb[i] || '')) return (pa[i] || '') < (pb[i] || '') ? -1 : 1;
  }
  return 0;
}

async function fabricGameVersions() {
  const games = await getJson(`${FABRIC_META}/versions/game`, 'Fabric game version list');
  return games.filter(g => g.stable).map(g => g.version); // meta returns newest first
}

async function fabricLatestLoader() {
  const list = await getJson(`${FABRIC_META}/versions/loader`, 'Fabric loader list');
  const stable = list.find(l => l.stable) || list[0];
  if (!stable) throw new Error('No Fabric loader versions found');
  return stable.version;
}

async function fabricInstallerVersion() {
  const list = await getJson(`${FABRIC_META}/versions/installer`, 'Fabric installer list');
  const stable = list.find(i => i.stable) || list[0];
  if (!stable) throw new Error('No Fabric installer versions found');
  return stable.version;
}

// NeoForge legacy 3-part '21.4.157' belongs to MC 1.21.4; new calendar-scheme
// 4-part '26.2.0.48-beta' belongs to MC 26.2 (third segment = MC patch, 0 = none).
function neoToMc(v) {
  const parts = String(v).split('-')[0].split('.');
  if (parts.length === 4) {
    const [a, b, c] = parts;
    return c === '0' ? `${a}.${b}` : `${a}.${b}.${c}`;
  }
  if (parts.length === 3) {
    const [a, b] = parts;
    return b === '0' ? `1.${a}` : `1.${a}.${b}`;
  }
  return null;
}

async function neoforgeVersionMap() {
  const data = await getJson(NEOFORGE_API, 'NeoForge version list');
  const best = {}; // mc -> { stable, any }
  for (const v of data.versions || []) {
    const mc = neoToMc(v);
    if (!mc) continue;
    const slot = best[mc] || (best[mc] = { stable: null, any: null });
    if (!slot.any || cmpDotted(v, slot.any) > 0) slot.any = v;
    if (!/beta|rc/i.test(v) && (!slot.stable || cmpDotted(v, slot.stable) > 0)) slot.stable = v;
  }
  const map = {};
  for (const [mc, s] of Object.entries(best)) map[mc] = s.stable || s.any;
  return map;
}

// promos: { "1.21.4-recommended": "54.1.0", "1.21.4-latest": "54.1.3", ... }
async function forgeVersionMap() {
  const data = await getJson(FORGE_PROMOS, 'Forge promotions');
  const map = {};
  for (const [key, fv] of Object.entries(data.promos || {})) {
    const m = key.match(/^(.+)-(recommended|latest)$/);
    if (!m) continue;
    if (m[2] === 'recommended') map[m[1]] = fv; // recommended always wins
    else if (!map[m[1]]) map[m[1]] = fv;        // latest only as fallback
  }
  return map;
}

async function latestLoaderFor(type, mc) {
  if (type === 'fabric') return fabricLatestLoader();
  const map = type === 'neoforge' ? await neoforgeVersionMap() : await forgeVersionMap();
  const v = map[mc];
  if (!v) throw new Error(`${type === 'neoforge' ? 'NeoForge' : 'Forge'} has no build for Minecraft ${mc}`);
  return v;
}

// MC versions newest-first, for version pickers
async function mcListFor(type) {
  if (type === 'fabric') return fabricGameVersions();
  const map = type === 'neoforge' ? await neoforgeVersionMap() : await forgeVersionMap();
  return Object.keys(map).sort((a, b) => cmpDotted(b, a));
}

// Minimum Java major for an MC version. Post-2025 date-style versions (e.g. "26.2") need 21.
function requiredJava(mc) {
  let m = String(mc).match(/^1\.(\d+)(?:\.(\d+))?/);
  if (!m) return /^\d{2}\./.test(String(mc)) ? 21 : null;
  const minor = +m[1], patch = +(m[2] || 0);
  if (minor >= 21 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const { spawn } = require('child_process');
const INSTALLER_CAP = 100 * 1024 * 1024;

async function downloadToFile(url, dest, cap, what) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${what} download failed (HTTP ${r.status})`);
  const len = Number(r.headers.get('content-length') || 0);
  if (cap && len > cap) throw new Error(`${what} is too large (${(len / 1048576).toFixed(0)} MB)`);
  try {
    await finished(Readable.fromWeb(r.body).pipe(fs.createWriteStream(dest)));
    const size = fs.statSync(dest).size;
    if (cap && size > cap) throw new Error(`${what} exceeded the size cap`);
    return size;
  } catch (e) {
    try { fs.unlinkSync(dest); } catch (e2) { /* nothing to clean */ }
    throw e;
  }
}

function runInstaller(jarPath, dir, log, extraFlag) {
  return new Promise((resolve, reject) => {
    const java = require('../config').getConfig().javaPath || 'java';
    const proc = spawn(java, ['-jar', jarPath, extraFlag || '--installServer'], { cwd: dir });
    let out = '';
    const onData = (d) => {
      out += d.toString();
      for (const line of d.toString().split(/\r?\n/)) if (line.trim()) log(`[installer] ${line.trim()}`);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (e) => reject(new Error(`Could not run the installer with Java: ${e.message}`)));
    proc.on('exit', (code) => {
      if (code === 0) return resolve();
      const tail = out.trim().split('\n').slice(-8).join('\n');
      reject(Object.assign(new Error(`Installer exited with code ${code}. Last output:\n${tail}`), { installerFailed: true }));
    });
  });
}

const VENDOR_DIRS = { neoforge: 'libraries/net/neoforged/neoforge', forge: 'libraries/net/minecraftforge/forge' };

function findArgfile(dir, type) {
  const base = path.join(dir, ...VENDOR_DIRS[type].split('/'));
  let subs;
  try { subs = fs.readdirSync(base); } catch (e) { return null; }
  const name = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
  const cands = [];
  for (const sub of subs) {
    const f = path.join(base, sub, name);
    try { cands.push({ f, mtime: fs.statSync(f).mtimeMs }); } catch (e) { /* not a version dir */ }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.mtime - a.mtime);
  return path.relative(dir, cands[0].f).split(path.sep).join('/');
}

function findLegacyForgeJar(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { return null; }
  return names.filter(n => /^forge-.*\.jar$/i.test(n) && !/installer/i.test(n)).sort().pop() || null;
}

async function installLoaderServer(type, mc, log = () => {}, pinnedLoader = null) {
  const dir = require('../config').serverDir();
  if (type === 'fabric') {
    const loader = pinnedLoader || await fabricLatestLoader();
    const installer = await fabricInstallerVersion();
    log(`[dashboard] Downloading Fabric ${mc} (loader ${loader})…`);
    const url = `${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(loader)}/${encodeURIComponent(installer)}/server/jar`;
    const tmp = path.join(dir, `server.jar.download.${process.pid}.${Date.now()}`);
    const size = await downloadToFile(url, tmp, INSTALLER_CAP, 'Fabric server launcher');
    if (size < 50 * 1024) { fs.unlinkSync(tmp); throw new Error('Fabric launcher download is suspiciously small — aborted'); }
    fs.renameSync(tmp, path.join(dir, 'server.jar'));
    log(`[dashboard] Fabric ${mc} (loader ${loader}) installed as server.jar`);
    return { loaderVersion: loader, jarFile: 'server.jar', size };
  }
  const ver = pinnedLoader || await latestLoaderFor(type, mc);
  const url = type === 'forge'
    ? `${FORGE_DL}/${mc}-${ver}/forge-${mc}-${ver}-installer.jar`
    : `${NEOFORGE_DL}/${ver}/neoforge-${ver}-installer.jar`;
  const instPath = path.join(dir, `.${type}-installer-${Date.now()}.jar`);
  log(`[dashboard] Downloading ${type} ${ver} installer…`);
  const size = await downloadToFile(url, instPath, INSTALLER_CAP, `${type} installer`);
  log(`[dashboard] Running the ${type} installer — this can take a few minutes…`);
  try {
    try {
      await runInstaller(instPath, dir, log);
    } catch (e) {
      // some NeoForge builds only accept the dashed flag
      if (type === 'neoforge' && e.installerFailed) await runInstaller(instPath, dir, log, '--install-server');
      else throw e;
    }
  } finally {
    try { fs.unlinkSync(instPath); } catch (e) { /* already gone */ }
    try { fs.unlinkSync(instPath + '.log'); } catch (e) { /* no log */ }
  }
  const argfile = findArgfile(dir, type);
  const legacy = !argfile && type === 'forge' ? findLegacyForgeJar(dir) : null;
  if (!argfile && !legacy) throw new Error(`The ${type} installer finished but no launch files were found — try again or pick another version`);
  log(`[dashboard] ${type} ${ver} for MC ${mc} installed (${argfile ? 'argfile launch' : `legacy jar ${legacy}`})`);
  return { loaderVersion: ver, jarFile: legacy || 'server.jar', size };
}

module.exports = {
  MODDED_TYPES, cmpDotted, requiredJava,
  fabricGameVersions, fabricLatestLoader, fabricInstallerVersion,
  neoforgeVersionMap, forgeVersionMap, latestLoaderFor, mcListFor,
  FABRIC_META, NEOFORGE_DL, FORGE_DL, UA,
  installLoaderServer, findArgfile, findLegacyForgeJar
};
