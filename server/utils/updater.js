const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const extract = require('extract-zip');

const REPO = 'kinkoo777/MinecraftServerDashboard';
const GH_HEADERS = {
  'User-Agent': 'MinecraftServerDashboard-Updater',
  'Accept': 'application/vnd.github+json'
};

// top-level names to never overwrite or delete (static baseline — the active
// and all configured server dirs are added dynamically at apply time, see
// buildPreserveSet, because serverDir is user-configurable in multi-server setups).
const PRESERVE = new Set([
  'node_modules', 'mc-server', 'backups', 'update-backups', 'config.json',
  'schedules.json', 'console-logs', 'reports.json', 'sessions.json',
  'playit', 'cloudflare', '.git', '.claude-flow', '.swarm', '.remember',
  'ruvector.db', '.test-config.json', '.test-server'
]);
const PRESERVE_EXT = ['.log', '.msi', '.exe'];

// Build the live preserve set: the static baseline plus every configured server
// directory (active and inactive). serverDir is user-configurable per profile, so
// hardcoding 'mc-server' alone would let an update overwrite/delete a user's world
// living under a custom dir name. We add only the TOP-LEVEL segment of each dir,
// since shouldPreserve is consulted on top-level entry names (depth === 0).
function buildPreserveSet() {
  const preserve = new Set(PRESERVE);
  try {
    const config = require('../config');
    const servers = (typeof config.listServers === 'function') ? config.listServers() : [];
    for (const srv of servers) {
      if (srv && srv.serverDir) {
        // take the first path segment (top-level dir inside PROJECT_ROOT)
        const top = String(srv.serverDir).split(/[\\/]/).filter(Boolean)[0];
        if (top) preserve.add(top);
      }
    }
  } catch (_) {
    // if config can't be read, fall back to the static baseline — never overwrite less
  }
  return preserve;
}

function shouldPreserve(name, preserveSet) {
  const set = preserveSet || PRESERVE;
  if (set.has(name)) return true;
  const ext = path.extname(name).toLowerCase();
  return PRESERVE_EXT.includes(ext);
}

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// zip-slip guard: assert a resolved dest path stays inside PROJECT_ROOT. A malicious
// or malformed zip entry could contain '../' segments that, once joined, escape the
// project and clobber arbitrary files. Reject anything that resolves outside.
function isInsideProjectRoot(destPath) {
  const resolved = path.resolve(destPath);
  return resolved === PROJECT_ROOT || resolved.startsWith(PROJECT_ROOT + path.sep);
}

let _cachedVersion = null;
function getCurrentVersion() {
  if (_cachedVersion) return _cachedVersion;
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  _cachedVersion = pkg.version;
  return _cachedVersion;
}

// Strip leading 'v', compare dot-separated numeric cores. Pre-release (dash suffix) < no suffix.
// Returns -1 if a < b, 0 if equal, 1 if a > b.
// LIMITATIONS: only the numeric core is ordered — any non-numeric segment becomes NaN,
// and NaN<NaN / NaN>NaN are both false, so such segments compare as equal. Pre-release
// identifiers are not ordered relative to each other (1.0.0-rc1 vs 1.0.0-rc2 compare
// equal); only the *presence* of a suffix is considered (suffixed < unsuffixed).
function compareSemver(a, b) {
  const stripCore = (s) => {
    const noV = s.replace(/^v/, '');
    const hasSuffix = noV.includes('-');
    const core = noV.split('-')[0];
    return { parts: core.split('.').map(Number), hasSuffix };
  };

  const av = stripCore(a);
  const bv = stripCore(b);
  const len = Math.max(av.parts.length, bv.parts.length);

  for (let i = 0; i < len; i++) {
    const ap = av.parts[i] || 0;
    const bp = bv.parts[i] || 0;
    if (ap < bp) return -1;
    if (ap > bp) return 1;
  }

  // numeric cores equal — no suffix > has suffix
  if (!av.hasSuffix && bv.hasSuffix) return 1;
  if (av.hasSuffix && !bv.hasSuffix) return -1;
  return 0;
}

async function checkForUpdate() {
  const current = getCurrentVersion();
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: GH_HEADERS });

  if (res.status === 404) {
    return { current, latest: null, updateAvailable: false, noReleases: true, releaseUrl: null, notes: '', publishedAt: null };
  }
  if (!res.ok) {
    throw new Error(`GitHub API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const tag = data.tag_name;
  if (!tag) throw new Error('Release has no tag');
  const latest = tag.replace(/^v/, '');
  const updateAvailable = compareSemver(latest, current) === 1;

  return {
    current,
    latest,
    updateAvailable,
    noReleases: false,
    releaseUrl: data.html_url,
    notes: (data.body || '').slice(0, 4000),
    publishedAt: data.published_at,
    _release: data  // internal — used by applyUpdate; stripped before returning to client
  };
}

// Run npm install in PROJECT_ROOT; resolve with { success, error }
function runNpmInstall() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(cmd, ['install'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve({ success: true, error: null });
      else resolve({ success: false, error: stderr.trim() || `npm exited with code ${code}` });
    });
    child.on('error', (err) => resolve({ success: false, error: err.message }));
  });
}

// Recursively copy srcDir -> destDir, skipping top-level preserve entries.
// preserveSet is the live preserve set (see buildPreserveSet). Returns list of
// copied files (relative to srcDir).
function copyDir(srcDir, destDir, skipTopLevel, preserveSet) {
  const copied = [];

  function walk(src, dest, depth) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (depth === 0 && shouldPreserve(entry.name, preserveSet)) continue;
      if (skipTopLevel && depth === 0 && skipTopLevel.has(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // zip-slip / path-escape guard: never write outside PROJECT_ROOT
      if (!isInsideProjectRoot(destPath)) continue;

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        walk(srcPath, destPath, depth + 1);
      } else {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        copied.push(path.relative(srcDir, srcPath));
      }
    }
  }

  walk(srcDir, destDir, 0);
  return copied;
}

// Restore overwritten files from a backup dir produced by applyUpdate's
// backupExisting. backupDir mirrors PROJECT_ROOT's layout, so copy each backed-up
// file back to its original location (guarded to stay inside PROJECT_ROOT).
function restoreFromBackup(backupDir) {
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const src = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(src);
      } else {
        const dest = path.join(PROJECT_ROOT, path.relative(backupDir, src));
        if (!isInsideProjectRoot(dest)) continue;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }
  }
  if (fs.existsSync(backupDir)) walk(backupDir);
}

// update-backups/ accumulates a timestamped dir per successful update and grows
// unbounded. Keep only the most recent `keep` and delete the rest.
function pruneBackups(keep = 5) {
  const dir = path.join(PROJECT_ROOT, 'update-backups');
  let names;
  try {
    names = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch (_) {
    return; // dir may not exist
  }
  // timestamp names sort lexicographically in chronological order (ISO-derived)
  names.sort();
  const stale = names.slice(0, Math.max(0, names.length - keep));
  for (const name of stale) {
    try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); } catch (_) {}
  }
}

async function applyUpdate(log = () => {}) {
  log('Checking for update…');
  const info = await checkForUpdate();
  if (info.noReleases || !info.updateAvailable) {
    throw new Error('Already up to date');
  }

  const release = info._release;
  const current = info.current;
  const latest = info.latest;

  // resolve download URL
  const zipAsset = (release.assets || []).find(a => a.name && a.name.endsWith('.zip'));
  const downloadUrl = zipAsset ? zipAsset.browser_download_url : release.zipball_url;

  // TRUST ASSUMPTION: the zipball is fetched over HTTPS from GitHub but is
  // UNAUTHENTICATED — there is no signature or checksum verification of the
  // payload. We trust GitHub's TLS + the REPO constant to mean the bytes are
  // the genuine release. The only integrity check is the >10KB size sanity
  // check below; a compromised GitHub account or MITM that defeats TLS could
  // ship arbitrary code. The zip-slip guard limits where extracted files land,
  // but cannot vouch for their contents.
  log(`Downloading update from ${downloadUrl}…`);
  const dlRes = await fetch(downloadUrl, { headers: GH_HEADERS });
  if (!dlRes.ok) throw new Error(`Download failed (HTTP ${dlRes.status})`);

  const tmpZip = path.join(os.tmpdir(), `chunkdeck-update-${Date.now()}.zip`);
  const tmpExtract = path.join(os.tmpdir(), `chunkdeck-extract-${Date.now()}`);
  fs.mkdirSync(tmpExtract, { recursive: true });

  try {
    // write zip to disk
    const buf = Buffer.from(await dlRes.arrayBuffer());
    if (buf.length < 10 * 1024) {
      throw new Error('Downloaded update looks too small — aborted');
    }
    fs.writeFileSync(tmpZip, buf);
    log(`Downloaded ${(buf.length / 1024).toFixed(1)} KB. Extracting…`);

    await extract(tmpZip, { dir: tmpExtract });

    // detect single top-level folder (zipball convention)
    const topEntries = fs.readdirSync(tmpExtract, { withFileTypes: true });
    let sourceRoot;
    if (topEntries.length === 1 && topEntries[0].isDirectory()) {
      sourceRoot = path.join(tmpExtract, topEntries[0].name);
    } else {
      sourceRoot = tmpExtract;
    }

    // read OLD package.json before overwriting, for deps comparison
    const oldPkgPath = path.join(PROJECT_ROOT, 'package.json');
    const oldPkg = JSON.parse(fs.readFileSync(oldPkgPath, 'utf8'));

    // read NEW package.json from extracted source
    const newPkgPath = path.join(sourceRoot, 'package.json');
    let newPkg = null;
    if (fs.existsSync(newPkgPath)) {
      newPkg = JSON.parse(fs.readFileSync(newPkgPath, 'utf8'));
    }

    // build the live preserve set (static baseline + all configured server dirs)
    const preserveSet = buildPreserveSet();

    // back up files that will be overwritten
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(PROJECT_ROOT, 'update-backups', timestamp);
    log('Backing up existing files that will be overwritten…');

    // walk source to determine which dest files exist and need backup
    function backupExisting(srcDir, depth) {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        if (depth === 0 && shouldPreserve(entry.name, preserveSet)) continue;
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(PROJECT_ROOT, path.relative(sourceRoot, srcPath));
        // zip-slip / path-escape guard: skip any entry resolving outside PROJECT_ROOT
        if (!isInsideProjectRoot(destPath)) continue;
        if (entry.isDirectory()) {
          backupExisting(srcPath, depth + 1);
        } else if (fs.existsSync(destPath)) {
          const backupPath = path.join(backupDir, path.relative(PROJECT_ROOT, destPath));
          fs.mkdirSync(path.dirname(backupPath), { recursive: true });
          fs.copyFileSync(destPath, backupPath);
        }
      }
    }
    backupExisting(sourceRoot, 0);

    log('Copying updated files…');
    // Copy phase is the point of no return: on Windows we may be overwriting our
    // own running .js files and a failure can leave the install half-updated. If
    // anything throws mid-copy, restore every file we backed up above before
    // rethrowing, so the install is returned to its pre-update state.
    let copied;
    try {
      copied = copyDir(sourceRoot, PROJECT_ROOT, null, preserveSet);
    } catch (copyErr) {
      log(`Copy failed (${copyErr.message}) — rolling back from backup…`);
      try {
        restoreFromBackup(backupDir);
        log('Rollback complete — install restored to previous state.');
      } catch (restoreErr) {
        log(`Rollback FAILED: ${restoreErr.message}. Backup preserved at ${path.relative(PROJECT_ROOT, backupDir)}.`);
      }
      throw copyErr;
    }
    log(`Copied ${copied.length} files.`);

    // compare dependencies
    const oldDeps = JSON.stringify(oldPkg.dependencies || {});
    const newDeps = JSON.stringify((newPkg && newPkg.dependencies) || {});
    const depsChanged = oldDeps !== newDeps;

    let npmInstalled = false;
    if (depsChanged) {
      log('Dependencies changed — running npm install…');
      try {
        const result = await runNpmInstall();
        npmInstalled = result.success;
        if (!result.success) {
          log(`npm install failed (non-fatal): ${result.error}`);
        } else {
          log('npm install completed successfully.');
        }
      } catch (e) {
        log(`npm install error (non-fatal): ${e.message}`);
      }
    }

    // update succeeded — prune old backups so update-backups/ doesn't grow forever
    // (keep this one plus the previous few). Best-effort; failure is non-fatal.
    try { pruneBackups(5); } catch (_) {}

    const backupDirRelative = path.relative(PROJECT_ROOT, backupDir);

    return {
      ok: true,
      from: current,
      to: latest,
      backupDir: backupDirRelative,
      depsChanged,
      npmInstalled,
      message: 'Update applied — restart the dashboard to finish.'
    };
  } finally {
    // best-effort cleanup
    try { fs.unlinkSync(tmpZip); } catch (_) {}
    try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { getCurrentVersion, compareSemver, checkForUpdate, applyUpdate };
