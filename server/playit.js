const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const EventEmitter = require('events');

/* Manages the playit.gg agent (free tunneling) as a child process so players
   can host without port-forwarding. We download the platform binary, run it,
   stream its output, and surface the claim URL + assigned address. */

const DIR = path.join(__dirname, '..', 'playit');
const GH_API = 'https://api.github.com/repos/playit-cloud/playit-agent/releases/latest';

function binPath() {
  return path.join(DIR, process.platform === 'win32' ? 'playit.exe' : 'playit');
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

// Choose the right release asset for this OS/arch.
function pickAsset(assets) {
  const p = process.platform, a = process.arch;
  const matches = (raw) => {
    const n = raw.toLowerCase();
    if (n.endsWith('.deb') || n.endsWith('.rpm') || n.endsWith('.sha256') || n.endsWith('.asc')) return false;
    if (p === 'win32') return n.includes('windows') && /(x86_64|x64|amd64)/.test(n) && n.endsWith('.exe');
    if (p === 'darwin') return n.includes('darwin') || n.includes('macos');
    if (p === 'linux') {
      if (!n.includes('linux')) return false;
      return a === 'arm64' ? /(aarch64|arm64)/.test(n) : /(amd64|x86_64)/.test(n);
    }
    return false;
  };
  const cands = assets.filter(x => matches(x.name));
  // prefer the headless CLI build (clean stdout), then a signed build, then anything
  return cands.find(x => x.name.toLowerCase().includes('cli'))
    || cands.find(x => x.name.toLowerCase().includes('signed'))
    || cands[0];
}

class Playit extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.status = 'offline'; // offline | starting | running
    this.log = [];
    this.claimUrl = null;
    this.address = null;
  }

  installed() { return fs.existsSync(binPath()); }

  pushLog(line) {
    this.log.push(line);
    if (this.log.length > 400) this.log.shift();
    const claim = /https:\/\/playit\.gg\/(?:claim|connect|setup|mc-host)\/\S+/i.exec(line)
      || /https:\/\/playit\.gg\/\S+/i.exec(line);
    if (claim && !this.claimUrl) { this.claimUrl = claim[0]; this.emit('update'); }
    const addr = /([a-z0-9-]+\.(?:[a-z0-9-]+\.)*playit\.gg(?::\d+)?)/i.exec(line);
    if (addr) { this.address = addr[1]; this.emit('update'); }
    this.emit('log', line);
  }

  async install() {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    this.pushLog('[dashboard] Downloading playit agent…');
    const rel = await (await fetch(GH_API, { headers: { 'User-Agent': 'mc-dashboard' } })).json();
    const asset = pickAsset(rel.assets || []);
    if (!asset) throw new Error('No playit build is available for this operating system.');
    const dl = await fetch(asset.browser_download_url);
    if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status})`);
    const tmp = binPath() + '.download';
    await finished(Readable.fromWeb(dl.body).pipe(fs.createWriteStream(tmp)));
    fs.renameSync(tmp, binPath());
    if (process.platform !== 'win32') fs.chmodSync(binPath(), 0o755);
    this.pushLog(`[dashboard] Installed ${asset.name}`);
  }

  async start() {
    if (this.proc) return;
    this.claimUrl = null;
    this.address = null;
    this.status = 'starting';
    this.emit('update');
    if (!this.installed()) await this.install();

    this.proc = spawn(binPath(), [], { cwd: DIR });
    const onData = (d) => {
      for (const raw of d.toString().split(/\r?\n/)) {
        const line = stripAnsi(raw).trim();
        if (line) this.pushLog(line);
      }
      if (this.status === 'starting') { this.status = 'running'; this.emit('update'); }
    };
    this.proc.stdout.on('data', onData);
    this.proc.stderr.on('data', onData);
    this.proc.on('error', (e) => {
      this.pushLog(`[dashboard] Failed to run agent: ${e.message}`);
      this.proc = null; this.status = 'offline'; this.emit('update');
    });
    this.proc.on('exit', (code) => {
      this.pushLog(`[dashboard] playit agent stopped (code ${code ?? '?'})`);
      this.proc = null; this.status = 'offline'; this.claimUrl = null; this.emit('update');
    });
  }

  stop() {
    if (this.proc) { try { this.proc.kill(); } catch (e) { /* already gone */ } }
  }
}

module.exports = new Playit();
