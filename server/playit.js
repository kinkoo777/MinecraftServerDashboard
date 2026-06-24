const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const EventEmitter = require('events');
const api = require('./playit-api');

/* Manages the playit.gg agent (free tunneling) so players can host without
   port-forwarding.

   The dashboard drives the *whole* setup itself through playit's REST API, so a
   user only clicks one link and approves — no manual sign-in / agent / tunnel
   creation on the website:
     1. generate a claim code and show https://playit.gg/claim/<code>
     2. poll until the user approves in the browser
     3. exchange the code for a permanent agent secret (saved to disk)
     4. run the agent binary with that secret to carry traffic
     5. auto-create a Minecraft tunnel and read back the public address
   Once claimed, the saved secret means future "Enable" clicks skip straight to
   step 4 — no link needed again. */

const DIR = path.join(__dirname, '..', 'playit');
const GH_API = 'https://api.github.com/repos/playit-cloud/playit-agent/releases/latest';
const SECRET_FILE = path.join(DIR, 'agent-secret.key');
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;   // how long to wait for the user to approve
const ADDR_TIMEOUT_MS = 10 * 60 * 1000;   // how long to wait for a public address

const delay = (ms) => new Promise(r => setTimeout(r, ms));

function binPath() {
  return path.join(DIR, process.platform === 'win32' ? 'playit.exe' : 'playit');
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

function pickAsset(assets) {
  const p = process.platform, a = process.arch;
  const matches = (raw) => {
    const n = raw.toLowerCase();
    if (n.endsWith('.deb') || n.endsWith('.rpm') || n.endsWith('.sha256') || n.endsWith('.asc')) return false;
    const base = path.basename(n);
    // Exclude the separate daemon build (playitd…) — we run the wrapper binary.
    if (base.startsWith('playitd')) return false;
    if (!base.startsWith('playit')) return false;
    if (p === 'win32') return /(windows|win)/.test(n) && /(x86_64|x64|amd64)/.test(n) && n.endsWith('.exe');
    if (p === 'darwin') return n.includes('darwin') || n.includes('macos');
    if (p === 'linux') {
      if (!n.includes('linux')) return false;
      return a === 'arm64' ? /(aarch64|arm64)/.test(n) : /(amd64|x86_64)/.test(n);
    }
    return false;
  };
  // The 'cli' variants are management tools, not the daemon agent — exclude them
  const cands = assets.filter(x => matches(x.name) && !/cli/i.test(x.name));
  return cands.find(x => /signed/i.test(x.name)) || cands[0];
}

class Playit extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.status = 'offline'; // offline | claiming | starting | running
    this.log = [];
    this.claimUrl = null;    // set while waiting for the user to approve
    this.address = null;     // the public address friends connect to
    this.pendingLink = null; // fallback: link to finish a tunnel manually if auto-create fails
    this.busy = false;       // a setup/claim is in flight
    this.cancelRequested = false; // set by stop() to break out of the claim/resolve loops
    this.runId = 0;          // bumped on each setup() so a stale resolve loop can detect a restart
  }

  installed() { return fs.existsSync(binPath()); }

  // true once the agent has been claimed at least once (secret saved)
  claimed() { return fs.existsSync(SECRET_FILE); }

  pushLog(line) {
    this.log.push(line);
    if (this.log.length > 400) this.log.shift();
    this.emit('log', line);
  }

  _setStatus(s) {
    if (this.status !== s) { this.status = s; this.emit('update'); }
  }

  loadSecret() {
    try { return fs.readFileSync(SECRET_FILE, 'utf8').trim() || null; } catch (e) { return null; }
  }

  saveSecret(secret) {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    // mode in writeFileSync only applies when the file is created — tighten an
    // already-existing (possibly world-readable) secret file as well.
    try { fs.chmodSync(SECRET_FILE, 0o600); } catch (_) { /* best effort (e.g. Windows) */ }
  }

  async _downloadBin(asset, dest) {
    const dl = await fetch(asset.browser_download_url);
    if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status})`);
    const tmp = dest + '.download';
    await finished(Readable.fromWeb(dl.body).pipe(fs.createWriteStream(tmp)));
    fs.renameSync(tmp, dest);
    if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  }

  async install() {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    this.pushLog('[dashboard] Downloading playit agent…');
  const res = await fetch(GH_API, { headers: { 'User-Agent': 'chunkdeck' } });
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('GitHub is rate-limiting downloads (HTTP 403) — wait a few minutes and try again, or install the agent manually.');
      }
      throw new Error(`Could not fetch the playit release info (HTTP ${res.status}).`);
    }
    const rel = await res.json();
    const assets = rel.assets || [];
    const clientAsset = pickAsset(assets);
    if (!clientAsset) throw new Error('No playit build is available for this operating system.');
    await this._downloadBin(clientAsset, binPath());
    this.pushLog(`[dashboard] Installed ${clientAsset.name}`);
  }

  // ---- the one entry point the UI calls ----
  async setup() {
    if (this.busy || this.proc) {
      this.pushLog('[dashboard] Already starting/running — ignoring the extra start request.');
      return;
    }
    this.busy = true;
    this.cancelRequested = false;
    const runId = ++this.runId; // this start's generation; a later start invalidates our loops
    this.claimUrl = null;
    this.address = null;
    this.pendingLink = null;
    try {
      const haveSecret = this.claimed();
      this._setStatus(haveSecret ? 'starting' : 'claiming');

      if (!this.installed()) await this.install();

      let secret = this.loadSecret();
      if (!secret) {
        secret = await this._claim();
        if (!secret) { this.busy = false; this._setStatus('offline'); return; }
        this.saveSecret(secret);
        this.pushLog('[dashboard] Setup complete — saved. Next time this is one click.');
      }

      this.claimUrl = null;
      this._setStatus('starting');
      this._spawnAgent(secret);
      // resolve the public address (and create a tunnel if there isn't one) in the background
      this._resolveAddress(secret, runId).catch(e => this.pushLog(`[dashboard] ${e.message}`));
    } catch (e) {
      this.pushLog(`[dashboard] Setup failed: ${e.message}`);
      this._setStatus('offline');
    } finally {
      this.busy = false;
    }
  }

  // Generate a claim code, wait for the user to approve in the browser, exchange for a secret.
  async _claim() {
    const code = api.genClaimCode();
    this.claimUrl = api.claimUrl(code);
    this._setStatus('claiming');
    this.pushLog('[dashboard] Open the link, sign in (or continue as guest) and approve to connect.');

    const deadline = Date.now() + CLAIM_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.cancelRequested) { this.pushLog('[dashboard] Setup cancelled.'); return null; }
      let state;
      try { state = await api.claimSetup(code); }
      catch (e) { this.pushLog(`[dashboard] ${e.message}`); await delay(2500); continue; }
      if (state === 'UserAccepted') break;
      if (state === 'UserRejected') { this.pushLog('[dashboard] Setup was declined in the browser.'); return null; }
      await delay(2500);
    }
    if (this.cancelRequested) { this.pushLog('[dashboard] Setup cancelled.'); return null; }
    if (Date.now() >= deadline) { this.pushLog('[dashboard] Timed out waiting for approval — try again.'); return null; }

    // The code is accepted; exchange it for the permanent secret (retry briefly).
    for (let i = 0; i < 6; i++) {
      try {
        const r = await api.claimExchange(code);
        if (r && r.secret_key) return r.secret_key;
      } catch (e) { /* NotAccepted can linger a moment after approval */ }
      await delay(1500);
    }
    this.pushLog('[dashboard] Could not finish setup with playit — try again.');
    return null;
  }

  _spawnAgent(secret) {
    const args = ['--secret', secret];
    // The playit wrapper binary launches its own daemon child (playitd) which
    // creates a Unix socket for IPC. The default socket path is in /run/ which
    // requires root on Linux — point it at our own writable dir.
    if (process.platform !== 'win32') {
      args.push('--socket-path', path.join(DIR, 'agent.sock'));
    }
    // detached on POSIX puts the agent in its own process group so stop() can
    // signal the whole tree (wrapper + playitd child) via process.kill(-pid).
    const opts = { cwd: DIR };
    if (process.platform !== 'win32') opts.detached = true;
    this.proc = spawn(binPath(), args, opts);
    const onData = (d) => {
      for (const raw of d.toString().split(/\r?\n/)) {
        const line = stripAnsi(raw).trim();
        if (line) this.pushLog(line);
      }
      if (this.status === 'starting') this._setStatus('running');
    };
    this.proc.stdout.on('data', onData);
    this.proc.stderr.on('data', onData);
    this.proc.on('error', (e) => {
      this.pushLog(`[dashboard] Failed to run agent: ${e.message}`);
      this.proc = null;
      this._setStatus('offline');
    });
    const spawnedAt = Date.now();
    this.proc.on('exit', (code) => {
      this.pushLog(`[dashboard] playit agent stopped (code ${code ?? '?'})`);
      this.proc = null;
      this.claimUrl = null;
      this._setStatus('offline');
      // Code 2 within 2 s = binary rejected the --secret arg (wrong binary type).
      // Delete it so the next start downloads the correct daemon build.
      if (code === 2 && Date.now() - spawnedAt < 2000) {
        this.pushLog('[dashboard] Incompatible binary detected — removing it (will re-download on next start).');
        try { fs.unlinkSync(binPath()); } catch (_) { /* already gone */ }
      }
    });
  }

  // Poll the account for this agent's tunnels; auto-create a Minecraft tunnel if none exists.
  async _resolveAddress(secret, runId) {
    const deadline = Date.now() + ADDR_TIMEOUT_MS;
    let triedCreate = false;
    // Keep polling regardless of daemon status — the user may assign a tunnel on the
    // playit.gg website after the daemon starts, and we want to pick that up.
    // Exit if a newer setup() has started (runId no longer matches) so two concurrent
    // loops can't run after a stop()/start() — setup() resets cancelRequested=false.
    while (Date.now() < deadline && !this.cancelRequested && runId === this.runId) {
      let rd;
      try { rd = await api.agentsRundata(secret); }
      catch (e) { await delay(3000); continue; }

      // Support multiple response shapes across API versions.
      const rawTunnels = rd.tunnels || rd.assigned_tunnels || rd.active_tunnels || [];
      const tunnels = rawTunnels.map(t => t.tunnel || t); // some versions nest under .tunnel
      const addr = (t) =>
        t.display_address || t.address || t.connect_address ||
        t.server_addr || t.alloc_address || '';
      const ttype = (t) =>
        (t.tunnel_type || t.type || t.proto || '').toLowerCase();

      const mc = tunnels.find(t => ttype(t).includes('minecraft')) || tunnels[0];
      if (mc && addr(mc)) {
        this.address = addr(mc);
        this.pendingLink = null;
        this.pushLog(`[dashboard] Your server address is ready: ${this.address}`);
        this.emit('update');
        return;
      }
      if (mc) {
        // Tunnel exists but address not assigned yet — keep waiting.
        this.pushLog(`[dashboard] Tunnel found (${ttype(mc) || '?'}), waiting for address…`);
      }

      // No tunnel at all — try to auto-create one (best effort, once).
      const pending = rd.pending || rd.pending_tunnels || [];
      if (!triedCreate && rd.agent_id && !tunnels.length && !pending.length) {
        triedCreate = true;
        try {
          await api.createMinecraftTunnel(secret, rd.agent_id);
          this.pushLog('[dashboard] Created a Minecraft tunnel for you.');
        } catch (e) {
          this.pushLog('[dashboard] Auto-tunnel creation failed — open the link to add one manually.');
          this.pendingLink = 'https://playit.gg/account/tunnels';
          this.emit('update');
        }
      }
      await delay(3000);
    }
    if (runId === this.runId && !this.address && !this.pendingLink) {
      this.pendingLink = 'https://playit.gg/account/tunnels';
      this.pushLog('[dashboard] Connected, but no tunnel address yet — open the link to add one.');
      this.emit('update');
    }
  }

  stop() {
    this.cancelRequested = true; // break out of any in-flight claim/resolve loop
    if (this.proc) { this._killTree(this.proc); }
    else if (this.status === 'claiming') { this.claimUrl = null; this._setStatus('offline'); }
  }

  // Kill the agent *and* its daemon grandchild. A plain proc.kill() only signals
  // the wrapper, leaving playitd running and the tunnel up — especially on Windows.
  _killTree(proc) {
    const pid = proc.pid;
    if (!pid) { try { proc.kill(); } catch (_) { /* already gone */ } return; }
    if (process.platform === 'win32') {
      // taskkill /T kills the whole process tree; /F forces it.
      try { spawn('taskkill', ['/pid', String(pid), '/T', '/F']); } catch (_) { /* already gone */ }
    } else {
      // We spawned detached, so the agent leads its own process group; the
      // negative pid signals every process in that group (wrapper + playitd).
      try { process.kill(-pid, 'SIGTERM'); }
      catch (_) { try { proc.kill(); } catch (__) { /* already gone */ } }
    }
  }

  // Forget the saved secret so the next setup claims a fresh agent.
  reset() {
    this.stop();
    try { fs.unlinkSync(SECRET_FILE); } catch (e) { /* nothing to remove */ }
    this.address = null;
    this.claimUrl = null;
    this.pendingLink = null;
    this._setStatus('offline');
  }
}

module.exports = new Playit();
