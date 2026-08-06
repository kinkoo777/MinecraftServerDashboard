# ChunkDeck 1.1.0 Implementation Plan — Modded Servers, Content Hub, Modpacks, Schedule Presets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship ChunkDeck 1.1.0: installable Fabric/NeoForge/Forge servers with a working launch path, a full Modrinth browse experience (Content hub), one-click `.mrpack` modpack installs, and multi-task schedule preset bundles.

**Architecture:** Node/Express backend + vanilla-JS SPA, no build step, no test framework (verification = `node -e` module checks + manual UI checks against a running dashboard). New server code goes in `server/utils/loaders.js`, `server/utils/mrpack.js`, `server/utils/schedule-presets.js`; existing routers (`jars`, `modrinth`, `schedules`) gain endpoints; the client gets `client/js/discover.js` and edits to `plugins.js`, `schedules.js`, `setup.js`, `settings.js`.

**Tech Stack:** Node ≥18 built-in `fetch`/`stream`, `extract-zip` (already a dependency), Express 4, vanilla JS + DOMParser.

**Spec:** `specs/2026-08-06-mods-and-schedule-presets-design.md` (approved). The spec wins on any conflict.

## Global Constraints

- Outbound hosts allow-list only: `api.modrinth.com`, `cdn.modrinth.com`, `meta.fabricmc.net`, `maven.neoforged.net`, `files.minecraftforge.net`, `maven.minecraftforge.net`, plus existing Paper/Mojang hosts.
- Size caps: loader installer **100 MB**, single mod file **250 MB**, `.mrpack` **1 GB**.
- All Modrinth requests send `User-Agent: chunkdeck/1.1.0 (chunkdeck.dev)`.
- `installedJar` string forms: `paper <mc> <build>`, `vanilla <mc>`, `fabric <mc> <loaderVer>`, `neoforge <mc> <neoVer>`, `forge <mc> <forgeVer>`.
- Only new config key: `modpackName` (display-only).
- Protected paths a modpack may never write: `server.jar`, `eula.txt`, `server.properties`, `whitelist.json`, `ops.json`, `banned-*.json`, anything under `world*/`, `mods-backup-*/`, `.mrpack-tmp-*/`, `backups/`.
- Errors are `{error}` JSON with correct HTTP status; client uses `App.tryApi` toasts.
- Keep files under ~500 lines — split client browse code into `discover.js`.
- Version bump to **1.1.0** and sw.js `CACHE` bump to `chunkdeck-v4` happen ONLY in the final task.
- Commits: one per task, message prefix `feat:`/`fix:` style as below. Never push this repo.
- Verification instances must not touch the real server: use `CHUNKDECK_CONFIG=.test-config.json` + `serverDir: ".test-server"` (both already gitignored).

---

### Task 1: Loader version catalogs (`server/utils/loaders.js`)

**Files:**
- Create: `server/utils/loaders.js`

**Interfaces:**
- Consumes: `serverDir`, `getConfig` from `server/config.js`.
- Produces (used by Tasks 2–5, 9):
  - `MODDED_TYPES: ['fabric','neoforge','forge']`
  - `fabricGameVersions() -> Promise<string[]>` (stable MC versions, newest first)
  - `fabricLatestLoader() -> Promise<string>`
  - `neoforgeVersionMap() -> Promise<Record<mc,string>>` (per-MC newest, stable preferred)
  - `forgeVersionMap() -> Promise<Record<mc,string>>` (recommended, else latest)
  - `latestLoaderFor(type, mc) -> Promise<string>` (throws with friendly message if the loader has no build for that MC)
  - `mcListFor(type) -> Promise<string[]>` (MC versions newest-first for pickers)
  - `cmpDotted(a, b) -> number`, `requiredJava(mc) -> 21|17|16|8|null`

- [ ] **Step 1: Write the file**

```js
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

// NeoForge '21.4.63' belongs to MC 1.21.4; '21.0.30' to MC 1.21
function neoToMc(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\./);
  if (!m) return null;
  return m[2] === '0' ? `1.${m[1]}` : `1.${m[1]}.${m[2]}`;
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
```

End of file exports (Task 2 appends more):

```js
module.exports = {
  MODDED_TYPES, cmpDotted, requiredJava,
  fabricGameVersions, fabricLatestLoader, fabricInstallerVersion,
  neoforgeVersionMap, forgeVersionMap, latestLoaderFor, mcListFor,
  FABRIC_META, NEOFORGE_DL, FORGE_DL, UA
};
```

- [ ] **Step 2: Verify against live APIs**

```bash
node -e "const l=require('./server/utils/loaders');(async()=>{
  console.log('fabric mc:', (await l.fabricGameVersions()).slice(0,3));
  console.log('fabric loader:', await l.fabricLatestLoader());
  const neo=await l.neoforgeVersionMap(); console.log('neo 1.21.4:', neo['1.21.4']);
  const forge=await l.forgeVersionMap(); console.log('forge 1.20.1:', forge['1.20.1']);
  console.log('neo list:', (await l.mcListFor('neoforge')).slice(0,4));
  console.log('java 1.21.4:', l.requiredJava('1.21.4'), '1.12.2:', l.requiredJava('1.12.2'));
})().catch(e=>{console.error(e);process.exit(1)})"
```

Expected: fabric MC list starts with the newest stable MC; a NeoForge version like `21.4.x` for 1.21.4; a Forge version for 1.20.1; java 21 / 8. Also verify `cmpDotted`: `node -e "const{cmpDotted}=require('./server/utils/loaders');console.log(cmpDotted('54.1.0','54.0.9')>0, cmpDotted('0.16.9','0.16.10')<0)"` → `true true`.

- [ ] **Step 3: Commit**

```bash
git add server/utils/loaders.js && git commit -m "feat: loader version catalogs for fabric/neoforge/forge"
```

---

### Task 2: Loader server installs (`loaders.js` part 2 + `jars.js` dispatch)

**Files:**
- Modify: `server/utils/loaders.js` (append install/discovery functions + exports)
- Modify: `server/utils/jars.js` (dispatch `downloadJar`/`checkJarUpdate` for modded types)

**Interfaces:**
- Produces:
  - `installLoaderServer(type, mc, log, pinnedLoader?) -> Promise<{loaderVersion, jarFile, size}>` — downloads/installs into `serverDir()`, does NOT touch config (config writes stay in `jars.js`)
  - `findArgfile(dir, type) -> string|null` (forward-slash relative path, newest install wins)
  - `findLegacyForgeJar(dir) -> string|null`
  - `downloadJar(type, version, log, opts?)` in jars.js now accepts the 3 new types; `opts.pinnedLoader` pins an exact loader version (modpacks); on success saves `installedJar: "<type> <mc> <loaderVer>"`, `jarFile`, and clears `modpackName` unless `opts.keepModpackName`
  - `checkJarUpdate(installed)` handles the new types: `build`/`latestBuild` carry loader version strings, `updateAvailable = cmpDotted(latest, current) > 0`

- [ ] **Step 1: Append to `loaders.js`**

```js
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
  await finished(Readable.fromWeb(r.body).pipe(fs.createWriteStream(dest)));
  const size = fs.statSync(dest).size;
  if (cap && size > cap) { fs.unlinkSync(dest); throw new Error(`${what} exceeded the size cap`); }
  return size;
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
```

Add to `module.exports`: `installLoaderServer, findArgfile, findLegacyForgeJar`.

- [ ] **Step 2: Dispatch in `server/utils/jars.js`**

At top: `const loaders = require('./loaders');`

In `checkJarUpdate(installed)`, insert BEFORE the paper branch:

```js
if (loaders.MODDED_TYPES.includes(type) && version) {
  const latest = await loaders.latestLoaderFor(type, version);
  const cur = buildStr || null;
  const updateAvailable = cur == null || loaders.cmpDotted(latest, cur) > 0;
  return { type, version, build: cur, latestVersion: version, latestBuild: latest, updateAvailable };
}
```

(Note: `buildStr` currently passes `/^\d+$/` before becoming `build`; keep the raw third token for modded types — change the destructure line to keep `buildStr` accessible, e.g. `const [type, version, buildStr] = installed.split(' ');` already does.)

In `downloadJar(type, version, log)`, change signature to `(type, version, log = () => {}, opts = {})` and insert at the top:

```js
if (loaders.MODDED_TYPES.includes(type)) {
  const r = await loaders.installLoaderServer(type, version, log, opts.pinnedLoader || null);
  const patch = { jarFile: r.jarFile, installedJar: `${type} ${version} ${r.loaderVersion}` };
  if (!opts.keepModpackName) patch.modpackName = '';
  saveConfig(patch);
  return r.size;
}
```

Also in the existing paper/vanilla success path, add `modpackName: ''` to the `saveConfig` call (switching to paper leaves no stale pack label).

- [ ] **Step 3: Verify with an isolated test instance**

```bash
printf '{"servers":[{"name":"t","serverDir":".test-server"}],"activeServer":0}' > .test-config.json
CHUNKDECK_CONFIG=.test-config.json node -e "require('./server/utils/jars').downloadJar('fabric','1.21.4',console.log).then(s=>console.log('fabric ok',s)).catch(e=>{console.error(e);process.exit(1)})"
CHUNKDECK_CONFIG=.test-config.json node -e "require('./server/utils/jars').downloadJar('neoforge','1.21.4',console.log).then(s=>console.log('neoforge ok',s)).catch(e=>{console.error(e);process.exit(1)})"
```

Expected: fabric leaves `.test-server/server.jar` (~a few hundred KB launcher); neoforge run prints installer output and `findArgfile` path exists: `node -e "console.log(require('./server/utils/loaders').findArgfile(require('path').resolve('.test-server'),'neoforge'))"` → `libraries/net/neoforged/neoforge/<v>/win_args.txt`. Check `.test-config.json` now holds `"installedJar": "neoforge 1.21.4 <v>"` and `"modpackName": ""`. Then `node -e "require('./server/utils/jars').checkJarUpdate('neoforge 1.21.4 0.0.1').then(console.log)"` → `updateAvailable: true`.

- [ ] **Step 4: Commit**

```bash
git add server/utils/loaders.js server/utils/jars.js && git commit -m "feat: install fabric/neoforge/forge servers via official sources"
```

---

### Task 3: Launch abstraction + config key (`minecraft.js`, `config.js`, `routes/server.js`)

**Files:**
- Modify: `server/minecraft.js:79-89` (launch args), `server/config.js:13-23` (modpackName default), `server/routes/server.js:130-137` and `150` (start guard + update log phrasing), `server/routes/settings.js` (publicConfig whitelist)

**Interfaces:**
- Consumes: `loaders.findArgfile`, `loaders.findLegacyForgeJar` (Task 2), `mrpack.isRunning` (Task 9 — guard added here with a lazy `require` so this task ships first; see Step 3).
- Produces: `mc.start(config)` launches forge/neoforge via `@argfile`; everything else unchanged.

- [ ] **Step 1: `config.js`** — in `SERVER_DEFAULTS` add `modpackName: ''` (with comment `// modpack title shown next to installedJar, set by the mrpack installer`) and add `'modpackName'` to the `PER_SERVER` array.

- [ ] **Step 2: `minecraft.js` launch args** — replace lines 79–89 (`const dir` … `args.push('-jar', config.jarFile, 'nogui');`) with:

```js
const dir = require('./config').serverDir();
const type = (config.installedJar || '').split(' ')[0];
let launchArgs;
if (type === 'forge' || type === 'neoforge') {
  const loaders = require('./utils/loaders');
  const argfile = loaders.findArgfile(dir, type);
  const legacy = argfile ? null : loaders.findLegacyForgeJar(dir);
  if (argfile) launchArgs = [`@${argfile}`, 'nogui'];
  else if (legacy) launchArgs = ['-jar', legacy, 'nogui'];
  else {
    const err = new Error(`${type} launch files not found — reinstall ${type} from Settings → Server software.`);
    err.status = 400;
    throw err;
  }
} else {
  const jar = path.join(dir, config.jarFile);
  if (!fs.existsSync(jar)) {
    const err = new Error(`Server jar not found: ${config.jarFile}. Put it in the server folder (Files page) or fix the jar name in Settings.`);
    err.status = 400;
    throw err;
  }
  launchArgs = ['-jar', config.jarFile, 'nogui'];
}

const args = [`-Xms${config.minRam}`, `-Xmx${config.maxRam}`];
if (config.jvmArgs) args.push(...config.jvmArgs.split(' ').filter(Boolean));
args.push(...launchArgs);
```

Right after the existing `this.pushLog(`[dashboard] Launching: …`)` line, add the spec §1.6 "logged at start" Java note (requirement-based, no Java detection):

```js
const mcVer = (config.installedJar || '').split(' ')[1];
const needJava = mcVer ? require('./utils/loaders').requiredJava(mcVer) : null;
if (needJava >= 17) this.pushLog(`[dashboard] Note: Minecraft ${mcVer} needs Java ${needJava}+ — if the boot fails with a class-version error, update Java (Settings → Java path).`);
```

- [ ] **Step 3: `routes/server.js`** — in `router.post('/start')` (line 130), after the offline check add:

```js
const mrpack = require('../utils/mrpack');
if (mrpack.isRunning && mrpack.isRunning()) return res.status(409).json({ error: 'A modpack install is in progress — wait for it to finish' });
```

Until Task 9 exists, create a stub `server/utils/mrpack.js` in THIS task so the require resolves:

```js
// Modpack install job — full implementation lands with the modpack feature.
module.exports = { isRunning: () => false, status: () => ({ running: false }), install: () => { throw new Error('not implemented'); } };
```

Also in `startWithUpdate()` line 150 change `if (info.type === 'paper')` to `if (info.latestBuild != null)` so modded build-bump logs phrase correctly (paper keeps working, modded types now hit the same branch).

- [ ] **Step 4: `routes/settings.js`** — find the `publicConfig()` field list (grep `publicConfig`) and add `modpackName` next to `installedJar` so the client can display it.

- [ ] **Step 5: Verify argfile resolution logic with a fake tree**

```bash
mkdir -p .test-server/libraries/net/neoforged/neoforge/21.4.99
printf 'x' > .test-server/libraries/net/neoforged/neoforge/21.4.99/win_args.txt
node -e "const p=require('path').resolve('.test-server');console.log(require('./server/utils/loaders').findArgfile(p,'neoforge'))"
```

Expected: `libraries/net/neoforged/neoforge/21.4.99/win_args.txt` (forward slashes). Then real-launch check using Task 2's `.test-server` NeoForge install: `CHUNKDECK_CONFIG=.test-config.json node server/index.js` in background → POST start via UI is overkill here; instead verify `node -e` construction: `CHUNKDECK_CONFIG=.test-config.json node -e "const mc=require('./server/minecraft');try{mc.start(require('./server/config').getConfig());setTimeout(()=>{mc.stop().then(()=>process.exit(0))},20000)}catch(e){console.error(e.message);process.exit(1)}"` — expect `[dashboard] Launching: java … @libraries/... nogui` in output and a clean Java boot (EULA error from Mojang is fine — the launch path worked if Java runs and writes eula.txt).

- [ ] **Step 6: Commit**

```bash
git add server/minecraft.js server/config.js server/routes/server.js server/routes/settings.js server/utils/mrpack.js && git commit -m "feat: argfile launch path for forge/neoforge + modpack config key"
```

---

### Task 4: Jar routes + Settings picker + Setup wizard for the new types

**Files:**
- Modify: `server/routes/jars.js:9-56`, `client/js/settings.js:91,697,740` area, `client/js/setup.js:57-67` area

**Interfaces:**
- Consumes: `loaders.mcListFor`, `loaders.requiredJava`, extended `downloadJar` (Task 2).
- Produces: `GET /api/jars/versions` → `{ paper: string[], vanilla: string[], fabric: string[], neoforge: string[], forge: string[] }` (arrays of MC versions, newest first; a failed source returns `[]` instead of failing the whole response). `POST /api/jars/download` accepts all five types.

- [ ] **Step 1: `routes/jars.js`** — replace the `/versions` handler body with a `Promise.allSettled` fan-out:

```js
router.get('/versions', async (req, res) => {
  const val = (r, fallback = []) => r.status === 'fulfilled' ? r.value : fallback;
  const [paperR, mojangR, fabricR, neoR, forgeR] = await Promise.allSettled([
    paperVersions(),
    fetch(MOJANG_MANIFEST).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    loaders.mcListFor('fabric'),
    loaders.mcListFor('neoforge'),
    loaders.mcListFor('forge')
  ]);
  if (paperR.status === 'rejected' && mojangR.status === 'rejected') {
    return res.status(502).json({ error: 'Could not reach version APIs' });
  }
  res.json({
    paper: val(paperR).slice(0, 60),
    vanilla: mojangR.status === 'fulfilled' ? mojangR.value.versions.filter(v => v.type === 'release').slice(0, 30).map(v => v.id) : [],
    fabric: val(fabricR).slice(0, 40),
    neoforge: val(neoR).slice(0, 40),
    forge: val(forgeR).slice(0, 60)
  });
});
```

Add `const loaders = require('../utils/loaders');` at top. In `POST /download` change the type check to `if (!['paper', 'vanilla', 'fabric', 'neoforge', 'forge'].includes(type))` with error text `'Unknown server type'`.

- [ ] **Step 2: `client/js/settings.js`** — jar picker additions:
  1. Line 91 select becomes: `<select id="jar-type" style="width:130px"><option value="paper">Paper</option><option value="vanilla">Vanilla</option><option value="fabric">Fabric (mods)</option><option value="neoforge">NeoForge (mods)</option><option value="forge">Forge (mods)</option></select>`
  2. In `initJarDownloader()` update `cap` to: `const cap = (t) => ({ paper: 'Paper', vanilla: 'Vanilla', fabric: 'Fabric', neoforge: 'NeoForge', forge: 'Forge' })[t] || t;`
  3. Add a Java-requirement hint. After `const fill = () => {...}` add:

```js
const JAVA_FOR = (mc) => {
  let m = String(mc).match(/^1\.(\d+)(?:\.(\d+))?/);
  if (!m) return /^\d{2}\./.test(String(mc)) ? 21 : null;
  const minor = +m[1], patch = +(m[2] || 0);
  if (minor >= 21 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
};
const javaHint = () => {
  const need = JAVA_FOR(verSel.value || '');
  const el = document.getElementById('jar-java-hint');
  if (el) el.innerHTML = need ? `Needs Java <b>${need}${need >= 17 ? '+' : ''}</b> — set the right Java path in Settings if yours is older.` : '';
};
verSel.onchange = javaHint;
```

  and call `javaHint()` inside `typeSel.onchange` after `fill()` plus once after the initial `fill()`. Add `<div id="jar-java-hint" class="muted" style="font-size:11px;margin-top:4px"></div>` right after the `jar-state` div (line 101).
  4. `showState()` "via pack": after the `Currently installed` branch, include the pack name when set — change that line to:

```js
stateBox.innerHTML = `<span class="muted">Currently installed: <b>${cap(instType)} ${App.esc(instVer || '')}</b>${this.modpackName ? ` — via ${App.esc(this.modpackName)}` : ''}.</span>`;
```

  and where `this.installedJar` is set from config (line ~237) also set `this.modpackName = cfg.modpackName || '';`. After a manual jar download (line ~740) add `this.modpackName = '';`.
  5. The mods-folder hint: in `initJarDownloader` nothing else; the Content-page hint is Task 6.

- [ ] **Step 3: `client/js/setup.js`** — replace the two `wiz-choice` buttons block (lines 57–67) with five:

```html
<div class="wiz-choices">
  <button type="button" class="wiz-choice active" data-type="paper">
    <span class="wiz-check">${App.icon('play', 13)}</span>
    <b>Recommended</b>
    <span class="wiz-choice-sub">Latest Paper — fast and supports plugins. Best for almost everyone.</span>
  </button>
  <button type="button" class="wiz-choice" data-type="vanilla">
    <b>Vanilla</b>
    <span class="wiz-choice-sub">The pure Mojang server, no plugins.</span>
  </button>
  <button type="button" class="wiz-choice" data-type="fabric">
    <b>Fabric</b>
    <span class="wiz-choice-sub">Runs mods — the go-to for performance and quality-of-life mods.</span>
  </button>
  <button type="button" class="wiz-choice" data-type="neoforge">
    <b>NeoForge</b>
    <span class="wiz-choice-sub">Modern modded Minecraft — most big modpacks use this.</span>
  </button>
  <button type="button" class="wiz-choice" data-type="forge">
    <b>Forge</b>
    <span class="wiz-choice-sub">Classic modded — for older packs and mods.</span>
  </button>
</div>
```

`fillVersions`/`chosenVersion` already read `this.versions[type]` — arrays work unchanged. The wizard download step label already interpolates `${type} ${version}` — no change.

- [ ] **Step 4: Verify in the UI**

Run the dashboard (`npm start`), log in. Settings → Server software: five types listed; picking Fabric fills MC versions and shows "Needs Java 21+" for 1.21.x; Download with Fabric 1.21.4 succeeds (server stopped) and the state line + `installedJar` update. Setup wizard: use a fresh isolated instance so the wizard appears — `printf '{"servers":[{"name":"t","serverDir":".test-server-wiz"}],"activeServer":0,"dashboardPort":8081}' > .test-config.json` then `CHUNKDECK_CONFIG=.test-config.json npm start` and open `http://localhost:8081`. All five cards must render without overflowing the setup card, including at mobile width (the wizard had exactly this overflow bug, fixed in 323e126 — re-check it with five choices).

- [ ] **Step 5: Commit**

```bash
git add server/routes/jars.js client/js/settings.js client/js/setup.js && git commit -m "feat: fabric/neoforge/forge in jar picker and setup wizard"
```

---

### Task 5: Modrinth API extensions (search/sort/filters, project, versions, categories, UA)

**Files:**
- Modify: `server/routes/modrinth.js`

**Interfaces:**
- Produces (consumed by discover.js Tasks 7–8):
  - `GET /api/modrinth/search?q&type&loader&gameVersion&sort&category&offset` → `{ hits: [{slug,title,description,icon,downloads}], total }`
  - `GET /api/modrinth/project/:slug` → `{slug,title,description,body,icon,downloads,followers,categories,gallery:[{url,title}],projectType,gameVersions,loaders,sourceUrl}`
  - `GET /api/modrinth/project/:slug/versions?loader&gameVersion` → `[{id,versionNumber,versionType,gameVersions,loaders,datePublished,size}]` (≤50)
  - `GET /api/modrinth/categories?type` → `string[]`
  - `POST /api/modrinth/install` additionally accepts `gameVersion` (filters slug-resolution)

- [ ] **Step 1: UA helper + constants** — at top of the file add:

```js
const UA_HEADERS = { 'User-Agent': `chunkdeck/${require('../../package.json').version} (chunkdeck.dev)` };
const mrFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...UA_HEADERS, ...(opts.headers || {}) } });
const SORTS = ['relevance', 'downloads', 'updated', 'newest'];
const PROJECT_TYPES = ['plugin', 'mod', 'modpack'];
const GAME_VERSION_RE = /^[\w.\-]{1,32}$/;
const CATEGORY_RE = /^[a-z0-9\-_]{1,32}$/i;
```

Replace every existing `fetch(` in this file with `mrFetch(`.

- [ ] **Step 2: Extend `/search`** — replace the handler with:

```js
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
```

**Compatibility note:** the response shape changes from a bare array to `{hits,total}` — the old client is replaced in Tasks 6–7 of this same release; nothing else consumes it.

- [ ] **Step 3: New endpoints** — add after `/search`:

```js
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
        .filter(g => { try { return new URL(g.url).hostname.endsWith('modrinth.com'); } catch (e) { return false; } })
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
```

Add module-level `let categoryCache = { at: 0, data: null };`.

- [ ] **Step 4: `POST /install` gameVersion filter** — in the slug-resolution branch, build the version query with an optional game filter:

```js
const gv = GAME_VERSION_RE.test(req.body.gameVersion || '') ? req.body.gameVersion : null;
const q = `loaders=${encodeURIComponent(JSON.stringify([loader]))}` + (gv ? `&game_versions=${encodeURIComponent(JSON.stringify([gv]))}` : '');
const r = await mrFetch(`${API}/project/${slug}/version?${q}`);
```

and the 404 message becomes `` `No ${loader}${gv ? ' / MC ' + gv : ''}-compatible version found` ``.

- [ ] **Step 5: Verify** — start the dashboard, log in, then from the browser devtools console (authenticated session):

```js
await (await fetch('/api/modrinth/search?type=mod&loader=fabric&gameVersion=1.21.4&sort=downloads&q=sodium')).json()
await (await fetch('/api/modrinth/categories?type=mod')).json()
await (await fetch('/api/modrinth/project/sodium')).json()
await (await fetch('/api/modrinth/project/sodium/versions?loader=fabric&gameVersion=1.21.4')).json()
```

Expected: sodium first hit with a `total`; categories array (e.g. `optimization`); project body non-empty with gallery; versions array with `versionNumber`/`id`. Also confirm the existing Plugins page still functions before its rewrite (its `/search` call now gets `{hits,total}` — the old UI will show "No results"; that's acceptable mid-branch since Tasks 6–7 land in the same release, but do NOT commit half-broken UI to main without the rest: this task and 6–8 merge as one push of commits at release time. Keep working on the same branch).

- [ ] **Step 6: Commit**

```bash
git add server/routes/modrinth.js && git commit -m "feat: modrinth browse API - sort/filters/pagination, project details, versions, categories"
```

---

### Task 6: Content page shell (nav rename, plugins.js restructure, CSS scaffold)

**Files:**
- Modify: `client/index.html:27,62-63`, `client/js/plugins.js`, `client/css/main.css` (append)

**Interfaces:**
- Consumes: `GET /settings/config` (existing) for `installedJar`/`modpackName`.
- Produces: page shell calling `App.discover.mount(rootEl, ctx, hooks)` where `ctx = { type, mc, modded, loader, modpackName }` and `hooks = { onInstalled(dir) }`; Installed zone keeps ids `pg-dir`, `pg-upload`, `pg-input`, `pg-list` and methods `load()`, `checkUpdates(box)`. `App.pages.plugins.serverCtx(cfg)` is the ctx builder. Page id stays `plugins` (`#plugins` bookmarks keep working).

- [ ] **Step 1: `index.html`** — line 27 nav label: `<a href="#plugins" data-page="plugins"><span class="icon"></span> Content</a>`. After the `plugins.js` script tag add `<script src="js/discover.js"></script>` (before `schedules.js`).

- [ ] **Step 2: `plugins.js` render rewrite** — replace `render(el)` top half (keep upload wiring, load, checkUpdates):

```js
async render(el) {
  el.innerHTML = `
    <div class="page-head">
      <h1>Content</h1>
      <div class="btn-row">
        <select id="pg-dir" style="width:130px">
          <option value="plugins">plugins/</option>
          <option value="mods">mods/</option>
        </select>
        <button id="pg-upload" class="btn-primary btn-sm">${App.icon('upload', 14)} Upload .jar</button>
        <input type="file" id="pg-input" accept=".jar" multiple style="display:none">
      </div>
    </div>
    <p class="muted" id="pg-hint" style="margin-bottom:16px"></p>
    <div id="disc-root"></div>
    <div class="card" id="pg-list"><div class="empty">Loading…</div></div>`;

  const cfg = await App.tryApi('/settings/config');
  this.ctx = this.serverCtx(cfg);
  const hint = document.getElementById('pg-hint');
  hint.textContent = this.ctx.modded
    ? `Your server is ${this.ctx.type} ${this.ctx.mc || ''}${this.ctx.modpackName ? ` (via ${this.ctx.modpackName})` : ''} — install mods below. Plugins won't load on a modded server. Restart after changes.`
    : `Your server is ${this.ctx.type || 'not installed yet'} — plugins need Paper/Spigot; mods need a Fabric/NeoForge/Forge server (Settings → Server software). Restart after changes.`;
  this.dir = this.ctx.modded ? 'mods' : 'plugins';

  const dirSel = document.getElementById('pg-dir');
  dirSel.value = this.dir;
  dirSel.onchange = () => { this.dir = dirSel.value; this.load(); };
  /* …existing pg-upload/pg-input wiring stays exactly as before… */

  App.discover.mount(document.getElementById('disc-root'), this.ctx, {
    onInstalled: (dir) => { this.dir = dir; dirSel.value = dir; this.load(); }
  });
  await this.load();
},

serverCtx(cfg) {
  const [type, mc] = ((cfg && cfg.installedJar) || '').split(' ');
  const modded = ['fabric', 'neoforge', 'forge'].includes(type);
  return { type: type || null, mc: mc || null, modded, loader: modded ? type : 'paper', modpackName: (cfg && cfg.modpackName) || '' };
},
```

Delete the old `doSearch`/`mr-*` block entirely (moves to discover.js). In `checkUpdates`, change `const loader = this.dir === 'mods' ? 'fabric' : 'paper';` to `const loader = this.dir === 'mods' ? (this.ctx && this.ctx.modded ? this.ctx.type : 'fabric') : 'paper';`.

- [ ] **Step 3: CSS scaffold** — append to `main.css`:

```css
/* ── Content hub / Discover ── */
.disc-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.disc-tab { padding: 7px 14px; border-radius: 8px; background: none; border: 1px solid var(--border); cursor: pointer; color: var(--text); font-size: 13px; }
.disc-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.disc-controls { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.disc-controls input { flex: 1; min-width: 140px; }
.disc-controls select { width: auto; max-width: 160px; }
.disc-more { display: block; margin: 10px auto 2px; }
.disc-total { font-size: 11px; }
.disc-modal-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 10px; }
.disc-modal-head img { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; }
.disc-body { font-size: 13px; line-height: 1.55; max-height: 320px; overflow-y: auto; margin: 10px 0; }
.disc-body img { max-width: 100%; border-radius: 6px; }
.disc-body pre { overflow-x: auto; background: var(--bg2, rgba(128,128,128,.1)); padding: 8px; border-radius: 6px; }
.disc-body h1, .disc-body h2, .disc-body h3 { font-size: 15px; margin: 10px 0 4px; }
.disc-gallery { display: flex; gap: 8px; overflow-x: auto; margin: 8px 0; }
.disc-gallery img { height: 74px; border-radius: 6px; cursor: pointer; }
.disc-verrow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
.disc-verrow select { flex: 1; min-width: 180px; }
.badge { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10px; border: 1px solid var(--border); }
.badge.release { color: var(--ok, #3fb950); } .badge.beta { color: orange; } .badge.alpha { color: #f66; }
```

(If `var(--border)`/`var(--text)` names differ in main.css, match whatever the existing `.btn-sm`/`.card` rules use — check the top of the file.)

- [ ] **Step 4: Temporary stub so the page loads before Task 7** — create `client/js/discover.js`:

```js
// Discover zone for the Content page — browse Modrinth (plugins/mods/modpacks).
App.discover = {
  mount(root) { root.innerHTML = '<div class="card"><div class="empty">Browse is coming in the next commit.</div></div>'; }
};
```

- [ ] **Step 5: Verify** — reload dashboard: nav says Content; page shows hint line matching your installed server, stub card, installed jars table still lists/uploads/deletes; update-check column still fills.

- [ ] **Step 6: Commit**

```bash
git add client/index.html client/js/plugins.js client/js/discover.js client/css/main.css && git commit -m "feat: content page shell - nav rename, server-aware hints, discover mount point"
```

---

### Task 7: Discover browse zone (tabs, search, filters, results, quick install)

**Files:**
- Modify: `client/js/discover.js` (replace stub with the browse implementation; details modal is Task 8)

**Interfaces:**
- Consumes: Task 5 endpoints; `ctx`/`hooks` from Task 6.
- Produces: `App.discover.mount(root, ctx, hooks)` full implementation; `App.discover.openDetails(slug)` placeholder that Task 8 fills (quick-installs still work without it); internal state object `App.discover.state`.

- [ ] **Step 1: Implement browse** — replace `discover.js` content:

```js
// Discover zone for the Content page — browse Modrinth (plugins/mods/modpacks).
App.discover = {
  ctx: null, hooks: null, root: null,
  state: { tab: 'plugins', q: '', sort: 'relevance', category: '', gameVersion: '', loader: 'paper', offset: 0, total: 0, hits: [], busy: false },
  LOADERS: { plugins: ['paper', 'spigot', 'bukkit'], mods: ['fabric', 'neoforge', 'forge'], modpacks: ['fabric', 'neoforge', 'forge'] },
  TYPE: { plugins: 'plugin', mods: 'mod', modpacks: 'modpack' },

  mount(root, ctx, hooks) {
    this.root = root; this.ctx = ctx || {}; this.hooks = hooks || {};
    const s = this.state;
    s.tab = this.ctx.modded ? 'mods' : 'plugins';
    s.loader = this.ctx.modded ? this.ctx.type : 'paper';
    s.gameVersion = this.ctx.mc || '';
    s.q = ''; s.sort = 'downloads'; s.category = ''; s.offset = 0; s.hits = []; s.total = 0;
    this.renderShell();
    this.loadCategories();
    this.search(true);
  },

  renderShell() {
    const s = this.state;
    this.root.innerHTML = `
      <div class="card">
        <div class="disc-tabs">
          ${['plugins', 'mods', 'modpacks'].map(t =>
            `<button class="disc-tab${s.tab === t ? ' active' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
        </div>
        <div class="disc-controls">
          <input id="disc-q" placeholder="Search Modrinth…" value="${App.esc(s.q)}">
          <select id="disc-loader"></select>
          <select id="disc-sort">
            <option value="relevance">Relevance</option>
            <option value="downloads" selected>Downloads</option>
            <option value="updated">Recently updated</option>
            <option value="newest">Newest</option>
          </select>
          <select id="disc-cat"><option value="">All categories</option></select>
          <select id="disc-gv"><option value="">Any MC version</option></select>
          <button id="disc-go" class="btn-primary btn-sm">${App.icon('search', 14)} Search</button>
        </div>
        <div id="disc-results"></div>
      </div>`;

    this.fillLoaderSelect();
    this.fillGameVersions();
    this.root.querySelectorAll('.disc-tab').forEach(b => {
      b.onclick = () => {
        this.state.tab = b.dataset.tab;
        this.state.category = '';
        this.state.loader = this.state.tab === 'plugins'
          ? 'paper'
          : (this.ctx.modded ? this.ctx.type : 'fabric');
        this.renderShell();
        this.loadCategories();
        this.search(true);
      };
    });
    document.getElementById('disc-go').onclick = () => this.search(true);
    document.getElementById('disc-q').onkeydown = (e) => { if (e.key === 'Enter') this.search(true); };
    ['disc-loader', 'disc-sort', 'disc-cat', 'disc-gv'].forEach(id => {
      document.getElementById(id).onchange = () => {
        const s2 = this.state;
        s2.loader = document.getElementById('disc-loader').value;
        s2.sort = document.getElementById('disc-sort').value;
        s2.category = document.getElementById('disc-cat').value;
        s2.gameVersion = document.getElementById('disc-gv').value;
        this.search(true);
      };
    });
    document.getElementById('disc-sort').value = s.sort;
  },

  fillLoaderSelect() {
    const sel = document.getElementById('disc-loader');
    sel.innerHTML = this.LOADERS[this.state.tab].map(l => `<option value="${l}"${l === this.state.loader ? ' selected' : ''}>${l}</option>`).join('');
  },

  // MC version filter: server's own version + the project versions Modrinth knows.
  // Keep it simple: offer the server's version + "any"; more granular filtering can
  // use the details modal's version list.
  fillGameVersions() {
    const sel = document.getElementById('disc-gv');
    const mine = this.ctx.mc;
    sel.innerHTML = `<option value="">Any MC version</option>` +
      (mine ? `<option value="${App.esc(mine)}"${this.state.gameVersion === mine ? ' selected' : ''}>${App.esc(mine)} (your server)</option>` : '');
  },

  async loadCategories() {
    const cats = await App.tryApi(`/modrinth/categories?type=${this.TYPE[this.state.tab]}`);
    const sel = document.getElementById('disc-cat');
    if (!cats || !sel) return;
    sel.innerHTML = `<option value="">All categories</option>` +
      cats.map(c => `<option value="${App.esc(c)}"${c === this.state.category ? ' selected' : ''}>${App.esc(c)}</option>`).join('');
  },

  async search(reset) {
    const s = this.state;
    if (s.busy) return;
    s.busy = true;
    if (reset) { s.offset = 0; s.hits = []; }
    s.q = (document.getElementById('disc-q') || { value: s.q }).value.trim();
    const box = document.getElementById('disc-results');
    if (reset) box.innerHTML = `<div class="empty">Searching…</div>`;
    const params = new URLSearchParams({
      q: s.q, type: this.TYPE[s.tab], loader: s.loader, sort: s.sort, offset: String(s.offset)
    });
    if (s.gameVersion) params.set('gameVersion', s.gameVersion);
    if (s.category) params.set('category', s.category);
    const r = await App.tryApi(`/modrinth/search?${params}`);
    s.busy = false;
    if (!r || !box.isConnected) return;
    s.total = r.total;
    s.hits = s.hits.concat(r.hits);
    this.renderResults();
  },

  renderResults() {
    const s = this.state;
    const box = document.getElementById('disc-results');
    if (!s.hits.length) { box.innerHTML = `<div class="empty">No results</div>`; return; }
    box.innerHTML = s.hits.map(h => `
      <div class="mr-row">
        <img src="${h.icon ? App.esc(h.icon) : 'icon.png'}" alt="" loading="lazy">
        <div class="mr-info">
          <div class="t">${App.esc(h.title)} <span class="muted" style="font-weight:400;font-size:11px">${(h.downloads / 1000).toFixed(0)}k downloads</span></div>
          <div class="d">${App.esc(h.description)}</div>
        </div>
        <button class="btn-sm" data-details="${App.esc(h.slug)}">Details</button>
        ${s.tab === 'modpacks' ? '' : `<button class="btn-sm" data-install="${App.esc(h.slug)}">Install</button>`}
      </div>`).join('') +
      (s.hits.length < s.total
        ? `<button class="btn-sm disc-more" id="disc-more">Load more (${s.hits.length} of ${s.total})</button>`
        : `<div class="muted disc-total" style="text-align:center;margin-top:8px">${s.hits.length} of ${s.total}</div>`);
    const more = document.getElementById('disc-more');
    if (more) more.onclick = () => { s.offset += 20; this.search(false); };
    box.querySelectorAll('[data-install]').forEach(b => { b.onclick = () => this.quickInstall(b); });
    box.querySelectorAll('[data-details]').forEach(b => { b.onclick = () => this.openDetails(b.dataset.details); });
  },

  async quickInstall(btn) {
    const s = this.state;
    btn.disabled = true;
    btn.textContent = 'Installing…';
    const body = { slug: btn.dataset.install, loader: s.loader };
    if (s.gameVersion) body.gameVersion = s.gameVersion;
    const r = await App.tryApi('/modrinth/install', { method: 'POST', body });
    btn.disabled = false;
    btn.textContent = r ? 'Installed ✓' : 'Install';
    if (r) {
      App.toast(`Installed ${r.file} (${r.version}) — restart the server to load it`);
      const dir = ['fabric', 'neoforge', 'forge'].includes(s.loader) ? 'mods' : 'plugins';
      if (this.hooks.onInstalled) this.hooks.onInstalled(dir);
    }
  },

  openDetails(slug) { App.toast('Details view lands in the next commit'); }
};
```

- [ ] **Step 2: Verify in UI** — Content page: tabs switch and reset loader sensibly; search "sodium" on Mods/fabric returns rows; sort switch re-queries; category filter narrows; MC-version filter shows "(your server)" when a server is installed; Load more appends 20 more; quick Install on a small mod (e.g. `lithium`) drops a jar into `mods/` and flips the Installed list below via `onInstalled`; Modpacks tab shows only Details buttons.

- [ ] **Step 3: Commit**

```bash
git add client/js/discover.js && git commit -m "feat: discover browse - tabs, filters, pagination, quick install"
```

---

### Task 8: Details modal — sanitizer, gallery, version picker

**Files:**
- Modify: `client/js/discover.js` (replace `openDetails` placeholder; add modal + sanitizer functions)

**Interfaces:**
- Consumes: `/modrinth/project/:slug`, `/modrinth/project/:slug/versions`, `/modrinth/install`.
- Produces: `openDetails(slug)` full implementation; `sanitizeBody(md) -> html string` (escape-first markdown subset + DOMParser whitelist rebuild); `installVersion(project, versionId, btn)`. Modpack install button calls `this.startPackInstall(project, version)` which Task 10 implements (until then it toasts "coming soon").

- [ ] **Step 1: Replace `openDetails` and append helpers** to `App.discover`:

```js
async openDetails(slug) {
  const [p, versions] = await Promise.all([
    App.tryApi(`/modrinth/project/${encodeURIComponent(slug)}`),
    App.tryApi(`/modrinth/project/${encodeURIComponent(slug)}/versions?` + new URLSearchParams({
      ...(this.state.tab !== 'modpacks' ? { loader: this.state.loader } : {}),
      ...(this.state.gameVersion ? { gameVersion: this.state.gameVersion } : {})
    }))
  ]);
  if (!p) return;
  const vlist = versions || [];
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:640px">
      <div class="disc-modal-head">
        <img src="${p.icon ? App.esc(p.icon) : 'icon.png'}" alt="">
        <div style="flex:1;min-width:0">
          <h2 style="margin:0">${App.esc(p.title)}</h2>
          <div class="muted" style="font-size:12px">${(p.downloads / 1000).toFixed(0)}k downloads · ${p.followers} followers
            ${p.sourceUrl ? ` · <a href="${App.esc(p.sourceUrl)}" target="_blank" rel="noopener">Source</a>` : ''}</div>
          <div style="margin-top:4px">${(p.categories || []).slice(0, 6).map(c => `<span class="badge">${App.esc(c)}</span>`).join(' ')}</div>
        </div>
        <button class="btn-icon" id="disc-close" title="Close">✕</button>
      </div>
      ${p.gallery.length ? `<div class="disc-gallery">${p.gallery.map(g =>
        `<img src="${App.esc(g.url)}" title="${App.esc(g.title)}" loading="lazy" data-full="${App.esc(g.url)}">`).join('')}</div>` : ''}
      <div class="disc-body">${this.sanitizeBody(p.body || p.description || '')}</div>
      <div class="disc-verrow">
        <select id="disc-ver">${vlist.length ? vlist.map(v => `
          <option value="${App.esc(v.id)}">${App.esc(v.versionNumber)} — MC ${App.esc((v.gameVersions || []).slice(-1)[0] || '?')} · ${App.esc((v.loaders || []).join('/'))} · ${App.esc(v.versionType)}</option>`).join('')
          : '<option value="">No compatible versions</option>'}</select>
        <button class="btn-primary btn-sm" id="disc-install" ${vlist.length ? '' : 'disabled'}>
          ${p.projectType === 'modpack' ? 'Install modpack…' : 'Install'}</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#disc-close').onclick = () => ov.remove();
  ov.querySelectorAll('.disc-gallery img').forEach(img => { img.onclick = () => window.open(img.dataset.full, '_blank', 'noopener'); });
  ov.querySelector('#disc-install').onclick = () => {
    const versionId = ov.querySelector('#disc-ver').value;
    const v = vlist.find(x => x.id === versionId);
    if (!versionId || !v) return;
    if (p.projectType === 'modpack') this.startPackInstall(p, v, ov);
    else this.installVersion(p, v, ov.querySelector('#disc-install'));
  };
},

async installVersion(p, v, btn) {
  btn.disabled = true;
  btn.textContent = 'Installing…';
  const loader = (v.loaders || []).includes(this.state.loader) ? this.state.loader : (v.loaders || [])[0];
  const r = await App.tryApi('/modrinth/install', { method: 'POST', body: { loader, versionId: v.id } });
  btn.disabled = false;
  btn.textContent = r ? 'Installed ✓' : 'Install';
  if (r) {
    App.toast(`Installed ${r.file} (${r.version}) — restart the server to load it`);
    const dir = ['fabric', 'neoforge', 'forge'].includes(loader) ? 'mods' : 'plugins';
    if (this.hooks.onInstalled) this.hooks.onInstalled(dir);
  }
},

startPackInstall() { App.toast('Modpack install lands in an upcoming commit'); },

// Escape-first markdown subset, then DOMParser whitelist rebuild for raw-HTML bodies.
sanitizeBody(src) {
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(src);
  const html = looksHtml ? src : this.miniMarkdown(src);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ALLOW = new Set(['P', 'BR', 'A', 'IMG', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'CODE', 'PRE', 'BLOCKQUOTE', 'HR', 'DETAILS', 'SUMMARY', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'CENTER', 'DIV', 'SPAN']);
  const okImg = (u) => { try { const h = new URL(u, location.href).hostname; return h.endsWith('modrinth.com') || h.endsWith('githubusercontent.com'); } catch (e) { return false; } };
  const okHref = (u) => { try { return new URL(u, location.href).protocol === 'https:'; } catch (e) { return false; } };
  const walk = (node, out) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { out.appendChild(document.createTextNode(child.textContent)); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (!ALLOW.has(child.tagName)) { walk(child, out); continue; } // unwrap unknown tags, keep their text
      const el = document.createElement(child.tagName.toLowerCase());
      if (child.tagName === 'A' && okHref(child.getAttribute('href') || '')) {
        el.setAttribute('href', child.getAttribute('href'));
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
      }
      if (child.tagName === 'IMG') {
        const src2 = child.getAttribute('src') || '';
        if (!okImg(src2)) continue; // drop the image entirely
        el.setAttribute('src', src2);
        el.setAttribute('loading', 'lazy');
        if (child.getAttribute('alt')) el.setAttribute('alt', child.getAttribute('alt'));
      }
      walk(child, el);
      out.appendChild(el);
    }
  };
  const out = document.createElement('div');
  walk(doc.body, out);
  return out.innerHTML;
},

// Minimal markdown for md-only bodies: headings, bold/italic, inline code, fenced code,
// links, images, unordered lists, paragraphs. Input is escaped FIRST so nothing injects.
miniMarkdown(src) {
  const esc = App.esc(src);
  const lines = esc.split(/\r?\n/);
  let out = [], inCode = false, inList = false;
  const inline = (t) => t
    .replace(/!\[([^\]]*)\]\((https:[^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\((https:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  for (const line of lines) {
    if (/^```/.test(line)) { out.push(inCode ? '</pre>' : '<pre>'); inCode = !inCode; continue; }
    if (inCode) { out.push(line); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(line.trim() ? `<p>${inline(line)}</p>` : '');
  }
  if (inList) out.push('</ul>');
  if (inCode) out.push('</pre>');
  return out.join('\n');
}
```

- [ ] **Step 2: Verify in UI + XSS spot-checks** — open Details for `sodium` (HTML-heavy body renders: images from Modrinth CDN show, no broken script), `fabric-api` (md body), a modpack (button says "Install modpack…"). In devtools console verify the sanitizer directly:

```js
App.discover.sanitizeBody('<img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:alert(3)">x</a>hello')
```

Expected: no `onerror`, no `<script>`, the link rendered without href (or dropped attrs), text `hello` intact. Version picker installs the SELECTED version (pick an older lithium version, confirm the downloaded filename matches it).

- [ ] **Step 3: Commit**

```bash
git add client/js/discover.js && git commit -m "feat: project details modal with sanitized descriptions, gallery, version picker"
```

---

### Task 9: Modpack install backend (`server/utils/mrpack.js` + routes)

**Files:**
- Modify: `server/utils/mrpack.js` (replace Task 3 stub), `server/routes/modrinth.js` (2 endpoints)

**Interfaces:**
- Consumes: `downloadJar(type, mc, log, {pinnedLoader, keepModpackName})` (Task 2), `createBackup()` from `server/utils/backup.js`, `extract-zip`, `mc.pushLog`/`mc.status`.
- Produces:
  - `mrpack.install({versionId, backupWorld}) -> {started:true}` (throws `{status:409}` when busy/online, `{status:400}` on bad input)
  - `mrpack.status() -> {running, step, detail, done, error, summary}` — `step ∈ download|loader|mods|overrides`, `summary = {installed, skipped:[{file,reason}], loader, loaderVersion, mc, name}`
  - `mrpack.isRunning() -> boolean`
  - Routes: `POST /api/modrinth/modpack/install`, `GET /api/modrinth/modpack/status`

- [ ] **Step 1: Implement `server/utils/mrpack.js`**

```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const extract = require('extract-zip');
const { serverDir, saveConfig } = require('../config');
const { createBackup } = require('./backup');

const API = 'https://api.modrinth.com/v2';
const UA = { headers: { 'User-Agent': 'chunkdeck/1.1.0 (chunkdeck.dev)' } };
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
    if (!host.endsWith('modrinth.com')) throw new Error(`Refusing pack download from untrusted host: ${host}`);

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
```

- [ ] **Step 2: Routes** — in `server/routes/modrinth.js` add:

```js
const mrpack = require('../utils/mrpack');

router.post('/modpack/install', async (req, res) => {
  try { res.json(await mrpack.install({ versionId: req.body.versionId, backupWorld: req.body.backupWorld !== false })); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/modpack/status', (req, res) => res.json(mrpack.status()));
```

- [ ] **Step 3: Verify E2E on the test instance** — pick a small Fabric modpack version id from the Discover UI or Modrinth site (e.g. search "Adrenaline" or "Simply Optimized", copy a version id from `/api/modrinth/project/<slug>/versions`). Then:

```bash
CHUNKDECK_CONFIG=.test-config.json node -e "const m=require('./server/utils/mrpack');m.install({versionId:'<ID>',backupWorld:false}).then(()=>{const t=setInterval(()=>{const s=m.status();console.log(s.step,s.detail,s.error||'');if(!s.running){clearInterval(t);console.log(JSON.stringify(s.summary,null,2));process.exit(s.error?1:0)}},2000)}).catch(e=>{console.error(e);process.exit(1)})"
```

Expected: steps download→loader→mods→overrides; `.test-server/mods/` populated; summary lists installed count; `.test-config.json` has the pack's `installedJar` + `modpackName`; no protected file touched (check `server.properties` unchanged if present); rerun while running → 409. Quilt pack (e.g. a Quilt-only pack) → clean error message.

- [ ] **Step 4: Commit**

```bash
git add server/utils/mrpack.js server/routes/modrinth.js && git commit -m "feat: mrpack modpack install job - backups, pinned loader, verified downloads, overrides"
```

---

### Task 10: Modpack UI flow (confirm → progress → summary)

**Files:**
- Modify: `client/js/discover.js` (replace `startPackInstall` placeholder)

**Interfaces:**
- Consumes: `POST /modrinth/modpack/install`, `GET /modrinth/modpack/status` (Task 9); `ov` modal element from `openDetails` (Task 8).
- Produces: `startPackInstall(project, version, ov)` — confirmation, then progress panel polling every 2 s, final summary with skipped list.

- [ ] **Step 1: Implement**

```js
startPackInstall(p, v, ov) {
  const body = ov.querySelector('.disc-body');
  body.innerHTML = `
    <div class="notice"><span class="notice-text"><b>Installing "${App.esc(p.title)}" replaces your server setup:</b><br>
      · Server software becomes the pack's loader + Minecraft version<br>
      · Your current <code>mods/</code> is set aside as <code>mods-backup-…/</code><br>
      · The pack's config files overwrite matching ones (world, server.properties, whitelist and ops are never touched)<br>
      · The server must stay stopped during the install</span></div>
    <label style="display:flex;align-items:center;gap:8px;margin:10px 0">
      <input type="checkbox" id="disc-pack-backup" checked> Back up my world first (recommended)
    </label>`;
  const row = ov.querySelector('.disc-verrow');
  row.innerHTML = `<button class="btn-primary btn-sm" id="disc-pack-go">Install ${App.esc(v.versionNumber)}</button>
    <button class="btn-sm" id="disc-pack-cancel">Cancel</button>`;
  row.querySelector('#disc-pack-cancel').onclick = () => ov.remove();
  row.querySelector('#disc-pack-go').onclick = async () => {
    const backupWorld = ov.querySelector('#disc-pack-backup').checked;
    const r = await App.tryApi('/modrinth/modpack/install', { method: 'POST', body: { versionId: v.id, backupWorld } });
    if (!r) return;
    row.innerHTML = '';
    body.innerHTML = `<div class="empty" id="disc-pack-prog">Starting…</div>
      <p class="muted" style="font-size:12px">Progress also streams to the Console page.</p>`;
    const prog = body.querySelector('#disc-pack-prog');
    const timer = setInterval(async () => {
      const s = await App.tryApi('/modrinth/modpack/status');
      if (!s || !ov.isConnected) { if (!ov.isConnected) clearInterval(timer); return; }
      if (s.running) {
        const stepName = { download: 'Downloading pack', loader: 'Installing server', mods: 'Downloading mods', overrides: 'Applying configs' }[s.step] || s.step;
        prog.textContent = `${stepName}… ${s.detail || ''}`;
        return;
      }
      clearInterval(timer);
      if (s.error) {
        prog.innerHTML = `<span style="color:#f66">Install failed: ${App.esc(s.error)}</span><br>
          <span class="muted" style="font-size:12px">Your world backup and mods-backup folder are untouched — restore mods via the Files page if needed.</span>`;
        return;
      }
      const sum = s.summary || {};
      prog.innerHTML = `✅ <b>${App.esc(sum.name || p.title)}</b> installed — ${App.esc(sum.loader || '')} ${App.esc(sum.mc || '')}.<br>
        ${sum.installed} files installed${(sum.skipped || []).length ? `, ${sum.skipped.length} skipped:` : '.'}<br>
        ${(sum.skipped || []).slice(0, 8).map(x => `<span class="muted" style="font-size:11px">· ${App.esc(x.file)} (${App.esc(x.reason)})</span>`).join('<br>')}
        <br><b>Start the server to play.</b>`;
      App.toast('Modpack installed — start the server');
      if (this.hooks.onInstalled) this.hooks.onInstalled('mods');
    }, 2000);
  };
},
```

- [ ] **Step 2: Verify in UI** — with the server stopped: Modpacks tab → open a small Fabric pack → Details → pick version → Install modpack → confirm panel lists consequences with backup checked → progress cycles through the four steps → summary shows counts and skipped files → Installed zone below now lists the pack's mods; Settings shows "via <pack>"; starting the server during the job returns the 409 toast; server starts fine after.

- [ ] **Step 3: Commit**

```bash
git add client/js/discover.js && git commit -m "feat: modpack install flow - confirm, live progress, summary"
```

---

### Task 11: Schedule presets backend (`schedule-presets.js` + routes)

**Files:**
- Create: `server/utils/schedule-presets.js`
- Modify: `server/routes/schedules.js` (presets endpoints, registered above existing routes)

**Interfaces:**
- Consumes: `scheduler.list/add/replaceAll/validationError` (existing exports of `server/scheduler.js`), `DATA_DIR` from config.
- Produces:
  - `presets.list() -> [{id,name,description,builtIn,tasks}]`
  - `presets.saveCurrent(name) -> preset` (throws `{status:400}` on bad name/empty schedules/limits)
  - `presets.apply(id, mode) -> schedules[]` (`mode: 'add'|'replace'`, validates every task first, all-or-nothing)
  - `presets.remove(id)` (custom only)
  - Routes: `GET/POST /api/schedules/presets`, `POST /api/schedules/presets/:id/apply`, `DELETE /api/schedules/presets/:id`

- [ ] **Step 1: Create `server/utils/schedule-presets.js`**

```js
const fs = require('fs');
const path = require('path');
const scheduler = require('../scheduler');

const FILE = path.join(require('../config').DATA_DIR, 'schedule-presets.json');
const MAX_CUSTOM = 30, MAX_TASKS = 20, MAX_NAME = 60;

const T = (t) => ({ warnMinutes: 0, warnMessage: '', onlyWhenEmpty: false, enabled: true, days: [], ...t });
const BUILTINS = [
  { id: 'builtin-daily-maintenance', name: 'Daily maintenance', description: 'Backup at 03:30, restart at 04:00 with a 5-minute warning', builtIn: true, tasks: [
    T({ type: 'daily', action: 'backup', times: ['03:30'] }),
    T({ type: 'daily', action: 'restart', times: ['04:00'], warnMinutes: 5 })
  ] },
  { id: 'builtin-frequent-backups', name: 'Frequent backups', description: 'World backup every 6 hours', builtIn: true, tasks: [
    T({ type: 'interval', action: 'backup', intervalValue: 6, intervalUnit: 'hours' })
  ] },
  { id: 'builtin-public-server', name: 'Public server', description: 'Daily restart, 4-hourly backups, daily announcement', builtIn: true, tasks: [
    T({ type: 'daily', action: 'restart', times: ['05:00'], warnMinutes: 10 }),
    T({ type: 'interval', action: 'backup', intervalValue: 4, intervalUnit: 'hours' }),
    T({ type: 'daily', action: 'announce', times: ['18:00'], command: 'Enjoying the server? Edit this announcement in Schedules!' })
  ] },
  { id: 'builtin-low-maintenance', name: 'Low-maintenance', description: 'Weekly Sunday restart, daily backup only when empty', builtIn: true, tasks: [
    T({ type: 'daily', action: 'restart', times: ['05:00'], days: [0], warnMinutes: 10 }),
    T({ type: 'daily', action: 'backup', times: ['04:00'], onlyWhenEmpty: true })
  ] }
];

function loadCustom() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(j.presets) ? j.presets : [];
  } catch (e) { return []; } // missing or corrupt file -> empty custom list, never crash
}

function persist(presets) {
  fs.writeFileSync(FILE, JSON.stringify({ presets }, null, 2));
}

function err(status, message) { return Object.assign(new Error(message), { status }); }

function list() { return [...BUILTINS, ...loadCustom()]; }

function saveCurrent(name) {
  name = String(name || '').trim();
  if (!name || name.length > MAX_NAME) throw err(400, `Preset name must be 1-${MAX_NAME} characters`);
  if (list().some(p => p.name.toLowerCase() === name.toLowerCase())) throw err(400, 'A preset with that name already exists');
  const custom = loadCustom();
  if (custom.length >= MAX_CUSTOM) throw err(400, `At most ${MAX_CUSTOM} custom presets`);
  const tasks = scheduler.list().map(({ id, lastRun, nextRun, createdAt, ...t }) => t);
  if (!tasks.length) throw err(400, 'No schedules to save — add some first');
  if (tasks.length > MAX_TASKS) throw err(400, `At most ${MAX_TASKS} tasks per preset`);
  const preset = { id: `p${Date.now()}`, name, description: '', builtIn: false, tasks, createdAt: Date.now() };
  custom.push(preset);
  persist(custom);
  return preset;
}

function apply(id, mode) {
  const p = list().find(x => x.id === id);
  if (!p) throw err(404, 'Preset not found');
  p.tasks.forEach((t, i) => {
    const e = scheduler.validationError(t);
    if (e) throw err(400, `Task ${i + 1} (${t.action}): ${e}`);
  });
  if (mode === 'replace') return scheduler.replaceAll(p.tasks.map(t => ({ ...t })));
  for (const t of p.tasks) scheduler.add({ ...t });
  return scheduler.list();
}

function remove(id) {
  const custom = loadCustom();
  const p = custom.find(x => x.id === id);
  if (!p) {
    if (BUILTINS.some(b => b.id === id)) throw err(400, 'Built-in presets cannot be deleted');
    throw err(404, 'Preset not found');
  }
  persist(custom.filter(x => x.id !== id));
}

module.exports = { list, saveCurrent, apply, remove };
```

- [ ] **Step 2: Routes** — in `server/routes/schedules.js`, after `const router = express.Router();` add:

```js
const presets = require('../utils/schedule-presets');

router.get('/presets', (req, res) => res.json(presets.list()));
router.post('/presets', (req, res) => {
  try { res.json(presets.saveCurrent(req.body.name)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
router.post('/presets/:id/apply', (req, res) => {
  const mode = req.body.mode === 'replace' ? 'replace' : 'add';
  try { res.json(presets.apply(req.params.id, mode)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
router.delete('/presets/:id', (req, res) => {
  try { presets.remove(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
```

(These sit above the existing `/:id` routes; ids are numeric so there is no capture conflict, but keeping them first makes intent obvious.)

- [ ] **Step 3: Verify via node**

```bash
CHUNKDECK_CONFIG=.test-config.json node -e "const p=require('./server/utils/schedule-presets');const s=require('./server/scheduler');
console.log('builtins:', p.list().map(x=>x.id));
console.log('apply add:', p.apply('builtin-daily-maintenance','add').length);
console.log('apply replace:', p.apply('builtin-frequent-backups','replace').length);
const saved=p.saveCurrent('My set'); console.log('saved:', saved.id, saved.tasks.length);
try{p.saveCurrent('My set')}catch(e){console.log('dupe rejected:', e.message)}
try{p.remove('builtin-daily-maintenance')}catch(e){console.log('builtin protected:', e.message)}
p.remove(saved.id); console.log('removed ok');
process.exit(0)"
```

Expected: 4 builtin ids; add → 2 schedules; replace → 1; save/dupe/builtin-protect/remove all behave. Also corrupt-file check: `printf 'not json' > <DATA_DIR>/schedule-presets.json` → `p.list()` still returns the 4 builtins.

- [ ] **Step 4: Commit**

```bash
git add server/utils/schedule-presets.js server/routes/schedules.js && git commit -m "feat: schedule preset bundles - builtins, save-current, apply add/replace"
```

---

### Task 12: Schedule presets UI

**Files:**
- Modify: `client/js/schedules.js` (presets card above the form)

**Interfaces:**
- Consumes: Task 11 endpoints; existing `this.describe(s)`, `this.load()`.
- Produces: presets card with per-preset Add/Replace/Delete and a "Save current as preset" button.

- [ ] **Step 1: Markup** — in `render(el)`, insert BEFORE the `<div class="card">` that holds the form:

```html
<div class="card" id="sc-presets-card">
  <h2>Presets</h2>
  <p class="muted" style="margin-bottom:10px;font-size:12px">One-click schedule bundles. <b>Add</b> appends to your current schedules; <b>Replace</b> swaps them out. Save your own with the button below.</p>
  <div id="sc-presets">Loading…</div>
  <div class="btn-row" style="margin-top:10px">
    <button id="sc-preset-save" class="btn-sm">${App.icon('plus', 12)} Save current as preset</button>
  </div>
</div>
```

- [ ] **Step 2: Logic** — add methods to `App.pages.schedules` and call `this.loadPresets()` at the end of `render` (right before `await this.load();`):

```js
async loadPresets() {
  const box = document.getElementById('sc-presets');
  const list = await App.tryApi('/schedules/presets');
  if (!box || !list) return;
  box.innerHTML = list.map(p => `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--border,rgba(128,128,128,.2))">
      <div style="flex:1;min-width:0">
        <b>${App.esc(p.name)}</b> ${p.builtIn ? '' : '<span class="badge">custom</span>'}
        <div class="muted" style="font-size:12px">${App.esc(p.description || '')}</div>
        <div class="muted" style="font-size:11px;margin-top:2px">${p.tasks.map(t => this.describe(t)).join('<br>')}</div>
      </div>
      <button class="btn-sm" data-preset-add="${App.esc(p.id)}">Add</button>
      <button class="btn-sm" data-preset-replace="${App.esc(p.id)}">Replace</button>
      ${p.builtIn ? '' : `<button class="btn-icon btn-danger" title="Delete preset" data-preset-del="${App.esc(p.id)}">${App.icon('trash', 13)}</button>`}
    </div>`).join('');
  box.querySelectorAll('[data-preset-add]').forEach(b => {
    b.onclick = () => this.applyPreset(b.dataset.presetAdd, 'add');
  });
  box.querySelectorAll('[data-preset-replace]').forEach(b => {
    b.onclick = () => {
      if (confirm('Replace ALL current schedules with this preset?')) this.applyPreset(b.dataset.presetReplace, 'replace');
    };
  });
  box.querySelectorAll('[data-preset-del]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Delete this preset?')) return;
      if (await App.tryApi(`/schedules/presets/${b.dataset.presetDel}`, { method: 'DELETE' }, 'Preset deleted')) this.loadPresets();
    };
  });
  const save = document.getElementById('sc-preset-save');
  if (save) save.onclick = async () => {
    const name = prompt('Name for this preset (saves your current schedule list):');
    if (name == null) return;
    if (await App.tryApi('/schedules/presets', { method: 'POST', body: { name } }, 'Preset saved')) this.loadPresets();
  };
},

async applyPreset(id, mode) {
  const r = await App.tryApi(`/schedules/presets/${id}/apply`, { method: 'POST', body: { mode } },
    mode === 'replace' ? 'Schedules replaced' : 'Preset added');
  if (r) this.load();
},
```

Note: `describe(t)` handles preset tasks fine (they have the same fields minus `id`), but its restart/backup labels expect `s.action` — already present.

- [ ] **Step 3: Verify in UI** — Schedules page: 4 built-ins listed with task mini-descriptions; Add on "Daily maintenance" appends 2 schedules with correct next-run times; Replace (confirm) swaps the list; Save current as preset with a name → appears with `custom` badge; its Delete works; deleting a built-in isn't offered; duplicate name → error toast; empty schedule list + Save → "No schedules to save" toast.

- [ ] **Step 4: Commit**

```bash
git add client/js/schedules.js && git commit -m "feat: schedule presets UI - builtin bundles, save/apply/delete"
```

---

### Task 13: Release polish — version, cache bump, README, full manual test pass

**Files:**
- Modify: `package.json:3` (`"version": "1.1.0"`), `client/sw.js:4` (`const CACHE = 'chunkdeck-v4';`), `README.md` (feature list, if it enumerates features)

**Interfaces:** none — release chores + the spec §9 checklist.

- [ ] **Step 1: Bumps** — set version `1.1.0` in `package.json`; set `CACHE = 'chunkdeck-v4'` in `client/sw.js`. Grep for any hardcoded `chunkdeck/1.1.0` UA strings using `require('../../package.json').version` instead where trivial (modrinth route already does; `loaders.js`/`mrpack.js` UA strings may stay literal but prefer `require('../../package.json').version` interpolation for consistency).

- [ ] **Step 2: README** — if `README.md` lists features, add: modded servers (Fabric/NeoForge/Forge), Modrinth content hub with modpack installs, schedule presets. Keep style of existing bullets.

- [ ] **Step 3: Full manual test checklist (spec §9)** — run each; fix anything that fails before committing:

1. Fresh wizard install of each type (paper, vanilla, fabric, neoforge, forge on a modern MC) via `CHUNKDECK_CONFIG=.test-config.json npm start` → each boots to Done, console works, stop works.
2. Forge legacy: install forge for MC 1.12.2 → jar-launch fallback boots (needs Java 8 — if unavailable locally, verify the actionable error message instead and note it).
3. Content hub: tabs/sort/category/MC filter/pagination; details modal renders Sodium (HTML body) and Fabric API (md body); gallery opens; version picker installs the chosen version into the right folder.
4. Existing update flow: SHA1 update check still shows Update buttons for stale plugin jars and updates them.
5. Modpack E2E: one Fabric + one NeoForge pack; backups made; hash-verified downloads; overrides applied; protected files untouched; pack boots; Quilt pack rejected; server start during job → 409.
6. Presets: everything from Task 12 verification plus corrupt `schedule-presets.json` boot check.
7. Schedules regression: pre-existing schedules unchanged and firing (spot-check one interval schedule due within minutes).
8. Clean checkout smoke: `git stash -u && npm start` boots; unstash after.
9. sw.js: hard-reload → new assets served, no stale "Plugins" nav label.

- [ ] **Step 4: Commit**

```bash
git add package.json client/sw.js README.md && git commit -m "Release 1.1.0: modded servers, content hub, modpacks, schedule presets"
```

---

## Self-Review Notes (kept for the record)

- **Spec coverage:** §1 → Tasks 1–4; §2 → Tasks 6–8; §3 → Task 5; §4 → Tasks 9–10; §5 → Tasks 11–12; §6–7 woven through (host allow-lists in 1/2/5/9, caps in 2/9, sanitizer in 8, protected paths in 9); §9–10 → Task 13.
- **Search response shape change** (`{hits,total}`) intentionally lands before the client rewrite; Tasks 5–7 belong to the same release branch — do not ship a build between Task 5 and Task 7.
- **Type consistency:** `installLoaderServer` returns `{loaderVersion, jarFile, size}` (Tasks 2/9 consumers match); `mrpack.status()` shape matches Task 10's poller; preset object shape matches Task 12's renderer; `serverCtx` ctx fields match discover.js reads.
- **Known deviation:** spec §5.4 wants "Save current as preset" *disabled* when no schedules exist; the plan keeps the button enabled and relies on the server's clear 400 ("No schedules to save — add some first") surfaced as a toast. Functionally equivalent, one less client/server state sync.
- **No worktree assumed:** work happens on `main` locally (repo is never pushed); if a worktree is preferred, create it via superpowers:using-git-worktrees before Task 1.
