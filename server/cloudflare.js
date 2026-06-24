const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const EventEmitter = require('events');
const { getConfig } = require('./config');

const DIR = path.join(__dirname, '..', 'cloudflare');
const GH_API = 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest';
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function binPath() {
  return path.join(DIR, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
}

function pickAsset(assets) {
  const p = process.platform, a = process.arch;
  if (p === 'win32') return assets.find(x => x.name === 'cloudflared-windows-amd64.exe');
  if (p === 'darwin') {
    const suf = a === 'arm64' ? 'arm64' : 'amd64';
    return assets.find(x => x.name === `cloudflared-darwin-${suf}.tgz`)
      || assets.find(x => x.name === `cloudflared-darwin-${suf}`);
  }
  const suf = a === 'arm64' ? 'arm64' : 'amd64';
  return assets.find(x => x.name === `cloudflared-linux-${suf}`);
}

class Cloudflare extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.status = 'offline'; // offline | starting | running
    this.log = [];
    this.url = null;
  }

  installed() { return fs.existsSync(binPath()); }

  pushLog(line) {
    this.log.push(line);
    if (this.log.length > 200) this.log.shift();
    this.emit('log', line);
  }

  _setStatus(s) {
    if (this.status !== s) { this.status = s; this.emit('update'); }
  }

  async install() {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    this.pushLog('[dashboard] Fetching cloudflared release info…');
  const relRes = await fetch(GH_API, { headers: { 'User-Agent': 'chunkdeck' } });
    if (!relRes.ok) {
      if (relRes.status === 403) {
        throw new Error('GitHub is rate-limiting downloads (HTTP 403) — wait a few minutes and try again, or install cloudflared manually.');
      }
      throw new Error(`Could not fetch the cloudflared release info (HTTP ${relRes.status}).`);
    }
    const rel = await relRes.json();
    const asset = pickAsset(rel.assets || []);
    if (!asset) throw new Error('No cloudflared build available for this OS');
    this.pushLog(`[dashboard] Downloading ${asset.name}…`);
    const dl = await fetch(asset.browser_download_url);
    if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status})`);
    const dest = binPath();
    const tmp = dest + '.download';
    await finished(Readable.fromWeb(dl.body).pipe(fs.createWriteStream(tmp)));
    if (asset.name.endsWith('.tgz')) {
      try {
        execFileSync('tar', ['xzf', tmp, '-C', DIR]);
      } catch (e) {
        if (e.code === 'ENOENT') {
          throw new Error('Could not extract cloudflared: the "tar" command was not found. Install tar (or download cloudflared manually).');
        }
        throw e;
      }
      fs.unlinkSync(tmp);
    } else {
      fs.renameSync(tmp, dest);
    }
    if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
    this.pushLog('[dashboard] cloudflared installed');
  }

  async start() {
    if (this.proc) return;
    this.url = null;
    this._setStatus('starting');
    try {
      if (!this.installed()) await this.install();
    } catch (e) {
      this.pushLog(`[dashboard] Install failed: ${e.message}`);
      this._setStatus('offline');
      return;
    }
    const port = process.env.PORT || getConfig().dashboardPort || 8080;
    this.pushLog(`[dashboard] Opening tunnel to http://localhost:${port}…`);
    // detached on POSIX gives cloudflared its own process group so stop() can
    // signal the whole tree via process.kill(-pid), not just the parent.
    const opts = {};
    if (process.platform !== 'win32') opts.detached = true;
    this.proc = spawn(binPath(), ['tunnel', '--url', `http://localhost:${port}`], opts);
    const onData = (chunk) => {
      for (const raw of chunk.toString().split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const clean = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '');
        this.pushLog(clean);
        // cloudflared prints the trycloudflare.com URL exactly once, on stderr —
        // URL_RE picks it out of the log lines (we read stdout+stderr together).
        const m = URL_RE.exec(line);
        if (m && !this.url) {
          this.url = m[0];
          this._setStatus('running'); // emits 'update' internally
        }
      }
    };
    this.proc.stdout.on('data', onData);
    this.proc.stderr.on('data', onData);
    this.proc.on('error', (e) => {
      this.pushLog(`[dashboard] Failed to run cloudflared: ${e.message}`);
      this.proc = null; this.url = null;
      this._setStatus('offline');
    });
    this.proc.on('exit', (code) => {
      this.pushLog(`[dashboard] cloudflared stopped (code ${code ?? '?'})`);
      this.proc = null; this.url = null;
      this._setStatus('offline');
    });
  }

  stop() {
    if (this.proc) { this._killTree(this.proc); }
    else { this._setStatus('offline'); }
  }

  // Kill cloudflared and any children. A plain proc.kill() can leave an orphaned
  // process holding the tunnel open — especially on Windows.
  _killTree(proc) {
    const pid = proc.pid;
    if (!pid) { try { proc.kill(); } catch (_) { /* gone */ } return; }
    if (process.platform === 'win32') {
      // taskkill /T kills the whole process tree; /F forces it.
      try { spawn('taskkill', ['/pid', String(pid), '/T', '/F']); } catch (_) { /* gone */ }
    } else {
      // We spawned detached, so the negative pid signals the whole process group.
      try { process.kill(-pid, 'SIGTERM'); }
      catch (_) { try { proc.kill(); } catch (__) { /* gone */ } }
    }
  }
}

module.exports = new Cloudflare();
