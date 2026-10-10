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

// cloudflared outlives the dashboard so the link survives a dashboard restart: its
// output goes to a log file (a pipe would break when we exit) and STATE remembers
// the running tunnel so the next dashboard start can pick it up again.
const STATE = path.join(DIR, 'tunnel.json');
const LOG = path.join(DIR, 'tunnel.log');

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Guard against a recycled pid: is this process really cloudflared?
function isCloudflared(pid) {
  try {
    const out = process.platform === 'win32'
      ? execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
      : execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
    return /cloudflared/i.test(out);
  } catch (e) { return false; }
}

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
    this.pid = null;
    this.status = 'offline'; // offline | starting | running
    this.log = [];
    this.url = null;
    this.watcher = null;
    this.logPos = 0;
    this._adopt();
  }

  port() { return Number(process.env.PORT || getConfig().dashboardPort || 8080); }

  // A tunnel left running by a previous dashboard session: take it over, same link.
  _adopt() {
    let st;
    try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return; }
    if (!st || !st.pid || !st.url || st.port !== this.port() || !alive(st.pid) || !isCloudflared(st.pid)) {
      // dead, or pointing at another port — don't leave a stray tunnel behind
      if (st && st.pid && alive(st.pid) && isCloudflared(st.pid)) this._killTree(st.pid);
      fs.rmSync(STATE, { force: true });
      return;
    }
    this.pid = st.pid;
    this.url = st.url;
    this.status = 'running';
    try { this.logPos = fs.statSync(LOG).size; } catch (e) { this.logPos = 0; }
    this.pushLog(`[dashboard] Remote access is still on from before — same link: ${st.url}`);
    this._watch();
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
    if (this.pid) return;
    this.url = null;
    this._setStatus('starting');
    try {
      if (!this.installed()) await this.install();
    } catch (e) {
      this.pushLog(`[dashboard] Install failed: ${e.message}`);
      this._setStatus('offline');
      return;
    }
    const port = this.port();
    this.pushLog(`[dashboard] Opening tunnel to http://localhost:${port}…`);
    // detached + unref: cloudflared keeps running after the dashboard exits (and on
    // POSIX gets its own process group, so stop() can signal the whole tree).
    const out = fs.openSync(LOG, 'w');
    this.logPos = 0;
    const proc = spawn(binPath(), ['tunnel', '--url', `http://localhost:${port}`], {
      detached: true, stdio: ['ignore', out, out], windowsHide: true
    });
    fs.closeSync(out);
    proc.on('error', (e) => {
      this.pushLog(`[dashboard] Failed to run cloudflared: ${e.message}`);
      this._ended();
    });
    if (!proc.pid) return;
    proc.unref();
    this.pid = proc.pid;
    this._watch();
  }

  // Follow the log file for new output (and the link), and notice when cloudflared dies.
  _watch() {
    clearInterval(this.watcher);
    let partial = '';
    this.watcher = setInterval(() => {
      try {
        const size = fs.statSync(LOG).size;
        if (size > this.logPos) {
          const buf = Buffer.alloc(size - this.logPos);
          const fd = fs.openSync(LOG, 'r');
          fs.readSync(fd, buf, 0, buf.length, this.logPos);
          fs.closeSync(fd);
          this.logPos = size;
          const lines = (partial + buf.toString()).split(/\r?\n/);
          partial = lines.pop();
          for (const raw of lines) this._line(raw.trim());
        }
      } catch (e) { /* log not there yet */ }
      if (this.pid && !alive(this.pid)) {
        this.pushLog('[dashboard] cloudflared stopped');
        this._ended();
      }
    }, 500);
    this.watcher.unref(); // never keeps the dashboard process alive on shutdown
  }

  _line(line) {
    if (!line) return;
    this.pushLog(line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, ''));
    // cloudflared prints the trycloudflare.com URL exactly once
    const m = URL_RE.exec(line);
    if (m && !this.url) {
      this.url = m[0];
      try { fs.writeFileSync(STATE, JSON.stringify({ pid: this.pid, url: this.url, port: this.port() })); } catch (e) { /* link just won't survive a restart */ }
      this._setStatus('running'); // emits 'update' internally
    }
  }

  _ended() {
    clearInterval(this.watcher);
    this.watcher = null;
    this.pid = null;
    this.url = null;
    fs.rmSync(STATE, { force: true });
    this._setStatus('offline');
  }

  // Turn remote access off for real. Closing the dashboard does NOT call this.
  stop() {
    if (this.pid) this._killTree(this.pid);
    this._ended();
  }

  // Kill cloudflared and any children. A plain kill can leave an orphaned
  // process holding the tunnel open — especially on Windows.
  _killTree(pid) {
    if (process.platform === 'win32') {
      // taskkill /T kills the whole process tree; /F forces it.
      try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }); } catch (_) { /* gone */ }
    } else {
      // It was spawned detached, so the negative pid signals the whole process group.
      try { process.kill(-pid, 'SIGTERM'); }
      catch (_) { try { process.kill(pid, 'SIGTERM'); } catch (__) { /* gone */ } }
    }
  }
}

module.exports = new Cloudflare();
