const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const extract = require('extract-zip');
const { serverDir, saveConfig } = require('../config');
const { createBackup } = require('./backup');

const API = 'https://api.modrinth.com/v2';
const UA = { headers: { 'User-Agent': `chunkdeck/${require('../../package.json').version} (chunkdeck.dev)` } };
const VERSION_ID_RE = /^[a-zA-Z0-9]{8}$/;
const PACK_CAP = 1024 * 1024 * 1024;   // 1 GB
const FILE_CAP = 250 * 1024 * 1024;    // 250 MB per mod
const PROTECTED_RE = /^(server\.jar|eula\.txt|server\.properties|whitelist\.json|ops\.json|banned-[\w.]*\.json|world[^/]*\/|mods-backup-|\.mrpack-tmp-|backups\/)/i;

const state = { running: false, step: null, detail: '', done: false, error: null, summary: null };

const status = () => ({ ...state });
const isRunning = () => state.running;

function log(msg) { require('../minecraft').pushLog(msg); }

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

// Path is safe when it's relative, normalizes inside the server dir, and isn't protected.
function safeRel(rel) {
  const norm = path.posix.normalize(String(rel).replace(/\\/g, '/'));
  if (!norm || norm.startsWith('/') || norm.startsWith('..') || /^[a-z]:/i.test(norm)) return null;
  if (PROTECTED_RE.test(norm)) return null;
  return norm;
}

async function fetchJson(url, what) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${what} failed (HTTP ${r.status})`);
  return r.json();
}

async function downloadTo(url, dest, cap, what) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${what} download failed (HTTP ${r.status})`);
  await finished(Readable.fromWeb(r.body).pipe(fs.createWriteStream(dest)));
  const size = fs.statSync(dest).size;
  if (cap && size > cap) { fs.unlinkSync(dest); throw new Error(`${what} exceeds the size cap`); }
  return size;
}

function sha512Of(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('hex');
}

async function install({ versionId, backupWorld = true }) {
  if (state.running) throw Object.assign(new Error('A modpack install is already running'), { status: 409 });
  const mc = require('../minecraft');
  if (mc.status !== 'offline') throw Object.assign(new Error('Stop the server before installing a modpack'), { status: 409 });
  if (!VERSION_ID_RE.test(versionId || '')) throw Object.assign(new Error('Invalid version id'), { status: 400 });
  Object.assign(state, { running: true, step: 'download', detail: '', done: false, error: null, summary: null });
  job(versionId, !!backupWorld)
    .catch(e => { state.error = e.message; log(`[dashboard] Modpack install failed: ${e.message}`); })
    .finally(() => { state.running = false; });
  return { started: true };
}

async function job(versionId, backupWorld) {
  const dir = serverDir();
  const tmp = path.join(dir, `.mrpack-tmp-${Date.now()}`);
  try {
    // 1. resolve version + project
    const v = await fetchJson(`${API}/version/${versionId}`, 'Modrinth version lookup');
    const project = await fetchJson(`${API}/project/${v.project_id}`, 'Modrinth project lookup');
    if (project.project_type !== 'modpack') throw new Error('That version does not belong to a modpack');
    const file = (v.files || []).find(f => f.primary) || (v.files || [])[0];
    if (!file || !/\.mrpack$/i.test(file.filename || '')) throw new Error('No .mrpack file in this version');
    let host; try { host = new URL(file.url).hostname; } catch (e) { throw new Error('Bad download URL'); }
    if (!(host === 'modrinth.com' || host.endsWith('.modrinth.com'))) throw new Error(`Refusing pack download from untrusted host: ${host}`);

    fs.mkdirSync(tmp, { recursive: true });
    state.detail = `Downloading ${project.title}…`;
    log(`[dashboard] Downloading modpack ${project.title} (${v.version_number})…`);
    const packFile = path.join(tmp, 'pack.mrpack');
    await downloadTo(file.url, packFile, PACK_CAP, 'Modpack');
    await extract(packFile, { dir: path.join(tmp, 'x') });
    const index = JSON.parse(fs.readFileSync(path.join(tmp, 'x', 'modrinth.index.json'), 'utf8'));
    if (index.formatVersion !== 1 || index.game !== 'minecraft') throw new Error('Unsupported modpack format');

    // 2. loader + mc from dependencies
    const deps = index.dependencies || {};
    const mcVersion = deps.minecraft;
    if (!mcVersion) throw new Error('Modpack does not declare a Minecraft version');
    let loaderType = null, loaderVer = null;
    if (deps['fabric-loader']) { loaderType = 'fabric'; loaderVer = deps['fabric-loader']; }
    else if (deps.neoforge) { loaderType = 'neoforge'; loaderVer = deps.neoforge; }
    else if (deps.forge) { loaderType = 'forge'; loaderVer = deps.forge; }
    else if (deps['quilt-loader']) throw new Error("Quilt modpacks aren't supported yet");
    else throw new Error('Modpack declares no supported mod loader');

    // 3. backups
    if (backupWorld) {
      state.detail = 'Backing up world…';
      try { const b = await createBackup(); log(`[dashboard] World backup before modpack: ${b.file}`); }
      catch (e) { log(`[dashboard] World backup skipped: ${e.message}`); }
    }
    const modsDir = path.join(dir, 'mods');
    if (fs.existsSync(modsDir) && fs.readdirSync(modsDir).length) {
      const bak = path.join(dir, `mods-backup-${stamp()}`);
      fs.renameSync(modsDir, bak);
      log(`[dashboard] Existing mods moved to ${path.basename(bak)}/`);
    }

    // 4. loader server (pinned)
    state.step = 'loader';
    state.detail = `Installing ${loaderType} ${mcVersion}…`;
    await require('./jars').downloadJar(loaderType, mcVersion, log, { pinnedLoader: loaderVer, keepModpackName: true });

    // 5. files
    state.step = 'mods';
    const entries = (index.files || []).filter(f => !(f.env && f.env.server === 'unsupported'));
    const skipped = [];
    let installed = 0, idx = 0;
    const work = entries.slice();
    const worker = async () => {
      for (;;) {
        const entry = work.shift();
        if (!entry) return;
        const n = ++idx;
        state.detail = `Mods ${n}/${entries.length}`;
        const rel = safeRel(entry.path);
        if (!rel) { skipped.push({ file: entry.path, reason: 'blocked path' }); continue; }
        if ((entry.fileSize || 0) > FILE_CAP) { skipped.push({ file: rel, reason: 'file too large' }); continue; }
        const url = (entry.downloads || []).find(u => { try { return new URL(u).hostname === 'cdn.modrinth.com'; } catch (e) { return false; } });
        if (!url) { skipped.push({ file: rel, reason: 'no Modrinth download' }); continue; }
        const dest = path.join(dir, ...rel.split('/'));
        const dtmp = path.join(tmp, `dl-${n}`);
        try {
          await downloadTo(url, dtmp, FILE_CAP, rel);
          const want = entry.hashes && entry.hashes.sha512;
          if (want && sha512Of(dtmp) !== want) { skipped.push({ file: rel, reason: 'hash mismatch' }); fs.unlinkSync(dtmp); continue; }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.renameSync(dtmp, dest);
          installed++;
        } catch (e) {
          skipped.push({ file: rel, reason: e.message });
          try { fs.unlinkSync(dtmp); } catch (e2) { /* nothing to clean */ }
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    log(`[dashboard] Modpack files: ${installed} installed, ${skipped.length} skipped`);

    // 6. overrides (server-overrides wins by copying second)
    state.step = 'overrides';
    for (const ovName of ['overrides', 'server-overrides']) {
      const src = path.join(tmp, 'x', ovName);
      if (!fs.existsSync(src)) continue;
      const copyDir = (from, relBase) => {
        for (const name of fs.readdirSync(from)) {
          const fromPath = path.join(from, name);
          const rel = relBase ? `${relBase}/${name}` : name;
          if (fs.statSync(fromPath).isDirectory()) { copyDir(fromPath, rel); continue; }
          const safe = safeRel(rel);
          if (!safe) { skipped.push({ file: rel, reason: 'blocked override' }); continue; }
          const dest = path.join(dir, ...safe.split('/'));
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(fromPath, dest);
        }
      };
      copyDir(src, '');
      log(`[dashboard] Applied ${ovName}/`);
    }

    // 7. finish
    saveConfig({ modpackName: project.title });
    state.summary = { installed, skipped, loader: loaderType, loaderVersion: loaderVer, mc: mcVersion, name: project.title };
    state.detail = '';
    state.done = true;
    log(`[dashboard] Modpack "${project.title}" installed — ${loaderType} ${mcVersion}. Start the server when ready.`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { install, status, isRunning };
