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
    const rel = await (await fetch(GH_API, { headers: { 'User-Agent': 'mc-dashboard' } })).json();
    const asset = pickAsset(rel.assets || []);
    if (!asset) throw new Error('No cloudflared build available for this OS');
    this.pushLog(`[dashboard] Downloading ${asset.name}…`);
    const dl = await fetch(asset.browser_download_url);
    if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status})`);
    const dest = binPath();
    const tmp = dest + '.download';
    await finished(Readable.fromWeb(dl.body).pipe(fs.createWriteStream(tmp)));
    if (asset.name.endsWith('.tgz')) {
      execFileSync('tar', ['xzf', tmp, '-C', DIR]);
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
    this.proc = spawn(binPath(), ['tunnel', '--url', `http://localhost:${port}`]);
    const onData = (chunk) => {
      for (const raw of chunk.toString().split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const clean = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '');
        this.pushLog(clean);
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
    if (this.proc) { try { this.proc.kill(); } catch (e) { /* gone */ } }
    else { this._setStatus('offline'); }
  }
}

module.exports = new Cloudflare();
