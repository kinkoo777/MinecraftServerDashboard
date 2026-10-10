const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

/* Dashboard-managed Java. When the configured Java (Settings → Java path) is missing
   or too old for the installed Minecraft version, a Temurin runtime is downloaded
   from Adoptium into ./java/jre-<major>/ and used instead — no admin rights, package
   manager or PATH changes needed. Several majors can sit side by side. */

const DIR = path.join(__dirname, '..', '..', 'java');
const API = 'https://api.adoptium.net/v3/assets/latest';
const LATEST = 25; // what the newest Minecraft needs — fetched on first run, before a server is picked
const OS = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform];
const ARCH = { x64: 'x64', arm64: 'aarch64', arm: 'arm' }[process.arch];
const EXE = process.platform === 'win32' ? 'java.exe' : 'java';

// Major version of a java binary (8, 17, 21, 25…), or null if it can't be run.
function javaMajor(bin) {
  let r;
  try { r = spawnSync(bin, ['-version'], { encoding: 'utf8', timeout: 15000, windowsHide: true }); } catch (e) { return null; }
  if (!r || r.error || r.status !== 0) return null;
  const m = /version "(\d+)(?:\.(\d+))?/.exec(`${r.stderr || ''}${r.stdout || ''}`);
  if (!m) return null;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]); // "1.8.0_402" -> 8
}

// macOS archives nest the runtime under Contents/Home
function binIn(root) {
  for (const sub of [['bin'], ['Contents', 'Home', 'bin']]) {
    const f = path.join(root, ...sub, EXE);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// Smallest managed runtime that satisfies `need`
function managed(need) {
  let names;
  try { names = fs.readdirSync(DIR); } catch (e) { return null; }
  const found = [];
  for (const n of names) {
    const m = /^jre-(\d+)$/.exec(n);
    const bin = m && +m[1] >= (need || 0) ? binIn(path.join(DIR, n)) : null;
    if (bin) found.push({ bin, major: +m[1] });
  }
  found.sort((a, b) => a.major - b.major);
  return found[0] || null;
}

// Which Java to launch with: the configured one if it's good enough, else a managed
// one. bin is null when neither fits (major = what the configured Java is, if any).
function pick(need) {
  const configured = require('../config').getConfig().javaPath || 'java';
  const major = javaMajor(configured);
  if (major && (!need || major >= need)) return { bin: configured, major, managed: false };
  const m = managed(need);
  if (m) return { ...m, managed: true };
  return { bin: null, major, managed: false };
}

async function install(major, log) {
  if (!OS || !ARCH) throw new Error(`No Java download is available for ${process.platform}/${process.arch} — install Java ${major} yourself and set Settings → Java path`);
  const feature = major === 16 ? 17 : major; // 16 was never an LTS; 1.17 runs fine on 17
  const { UA } = require('./loaders');
  let asset = null;
  for (const image of ['jre', 'jdk']) { // a few old majors only ship as a JDK
    const r = await fetch(`${API}/${feature}/hotspot?os=${OS}&architecture=${ARCH}&image_type=${image}&vendor=eclipse`, UA);
    if (!r.ok) continue;
    const list = await r.json();
    asset = Array.isArray(list) && list[0] && list[0].binary && list[0].binary.package;
    if (asset && asset.link) break;
    asset = null;
  }
  if (!asset) throw new Error(`Adoptium has no Java ${feature} build for ${OS}/${ARCH} — install it yourself and set Settings → Java path`);

  fs.mkdirSync(DIR, { recursive: true });
  const archive = path.join(DIR, `${asset.name}.download`);
  const tmp = path.join(DIR, `.extract-${feature}-${process.pid}`);
  const dest = path.join(DIR, `jre-${feature}`);
  log(`[dashboard] Downloading Java ${feature} (${(asset.size / 1048576).toFixed(0)} MB) — one-time setup…`);
  try {
    const dl = await fetch(asset.link, UA);
    if (!dl.ok) throw new Error(`Java download failed (HTTP ${dl.status})`);
    const hash = crypto.createHash('sha256');
    const body = Readable.fromWeb(dl.body);
    body.on('data', (c) => hash.update(c));
    await finished(body.pipe(fs.createWriteStream(archive)));
    if (asset.checksum && hash.digest('hex') !== asset.checksum) throw new Error('Java download is corrupted (checksum mismatch) — try again');

    log(`[dashboard] Unpacking Java ${feature}…`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    if (asset.name.endsWith('.zip')) {
      await require('extract-zip')(archive, { dir: tmp });
    } else {
      try { execFileSync('tar', ['xzf', archive, '-C', tmp]); } catch (e) {
        if (e.code === 'ENOENT') throw new Error('Could not unpack Java: the "tar" command was not found');
        throw e;
      }
    }
    // the archive holds a single top-level folder, e.g. jdk-25.0.1+8-jre
    const top = fs.readdirSync(tmp).map(n => path.join(tmp, n)).find(p => fs.statSync(p).isDirectory());
    if (!top || !binIn(top)) throw new Error('The Java download did not contain a runtime');
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(top, dest);
    if (!javaMajor(binIn(dest))) {
      fs.rmSync(dest, { recursive: true, force: true });
      throw new Error(`The downloaded Java ${feature} does not run on this machine`);
    }
    log(`[dashboard] Java ${feature} is ready`);
  } finally {
    fs.rmSync(archive, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

let installing = null; // one download at a time

// Like pick(), but downloads a runtime when nothing suitable is installed.
async function ensure(need, log = () => {}) {
  while (installing) await installing.catch(() => {});
  let got = pick(need);
  if (got.bin) return got;
  installing = install(need || LATEST, log).finally(() => { installing = null; });
  await installing;
  got = pick(need);
  if (!got.bin) throw new Error(`Java ${need || LATEST} was installed but could not be started`);
  return got;
}

module.exports = { javaMajor, pick, ensure, LATEST };
