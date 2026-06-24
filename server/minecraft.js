const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, '..', 'console-logs');
const MAX_SAVED_LOGS = 30;

const DONE_RE = /\]: Done \([\d.,]+s\)!/;
const JOIN_RE = /\]: ([A-Za-z0-9_]+)(?: \[[^\]]*\])? joined the game/;
const LEAVE_RE = /\]: ([A-Za-z0-9_]+) left the game/;
const TICK_RE = /Average time per tick: ([\d.]+)\s*ms/i;

class MinecraftServer extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.status = 'offline'; // offline | starting | online | stopping
    this.players = new Set();
    this.logBuffer = [];
    this.startedAt = null;
    this.stopTimer = null;
    this.restartTimer = null; // pending auto-restart setTimeout, cleared on start/stop
    this.stopping = false;    // true while a user/dashboard-requested stop is in progress
    this.crashCount = 0;
    this.crashGaveUp = false; // true when auto-restart bailed out after repeated quick crashes
    this.lastTps = null;
    this.lastTpsAt = 0;
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  pushLog(line) {
    this.logBuffer.push(line);
    if (this.logBuffer.length > 1000) this.logBuffer.splice(0, this.logBuffer.length - 1000);
    this.emit('log', line);
  }

  handleLine(line) {
    this.pushLog(line);
    if (this.status === 'starting' && DONE_RE.test(line)) {
      this.crashCount = 0; // a healthy boot wipes the crash-loop slate
      this.setStatus('online');
    }
    let m;
    if ((m = JOIN_RE.exec(line))) {
      this.players.add(m[1]);
      this.emit('players', [...this.players]);
      this.emit('join', m[1]);
    } else if ((m = LEAVE_RE.exec(line))) {
      this.players.delete(m[1]);
      this.emit('players', [...this.players]);
      this.emit('leave', m[1]);
    } else if ((m = TICK_RE.exec(line))) {
      const ms = parseFloat(m[1]);
      if (ms > 0) {
        // TPS = 1000/ms-per-tick, clamped to 20 (the server's max tick rate;
        // sub-50ms ticks would otherwise report a meaningless >20 TPS).
        this.lastTps = Math.min(20, Math.round((1000 / ms) * 10) / 10);
        this.lastTpsAt = Date.now();
      }
    }
  }

  start(config) {
    if (this.proc) throw new Error('Server is already running');
    // Cancel any pending auto-restart so it can't fire a duplicate start().
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const dir = require('./config').serverDir();
    const jar = path.join(dir, config.jarFile);
    if (!fs.existsSync(jar)) {
      const err = new Error(`Server jar not found: ${config.jarFile}. Put it in the server folder (Files page) or fix the jar name in Settings.`);
      err.status = 400;
      throw err;
    }

    const args = [`-Xms${config.minRam}`, `-Xmx${config.maxRam}`];
    if (config.jvmArgs) args.push(...config.jvmArgs.split(' ').filter(Boolean));
    args.push('-jar', config.jarFile, 'nogui');

    // fresh buffer per run so saved console logs and the live view don't mix sessions
    this.logBuffer = [];
    this.crashGaveUp = false; // we're trying again — clear any previous give-up
    this.setStatus('starting');
    this.startedAt = Date.now();
    this.pushLog(`[dashboard] Launching: ${config.javaPath} ${args.join(' ')}`);

    this.proc = spawn(config.javaPath, args, { cwd: dir });

    let buf = '';
    const onData = (data) => {
      buf += data.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) if (line.trim()) this.handleLine(line);
    };
    this.proc.stdout.on('data', onData);
    this.proc.stderr.on('data', onData);

    this.proc.on('error', (err) => {
      this.pushLog(`[dashboard] Failed to launch Java: ${err.message}. Is Java installed and on PATH?`);
      this.proc = null;
      this.startedAt = null;
      this.setStatus('offline');
    });

    this.proc.on('exit', (code) => {
      clearTimeout(this.stopTimer);
      // Flush any trailing partial line left in the buffer so the last log line isn't lost.
      if (buf.trim()) { this.handleLine(buf); buf = ''; }
      const wasIntentional = this.stopping;
      const ranForMs = this.startedAt ? Date.now() - this.startedAt : 0;
      this.stopping = false;
      this.proc = null;
      this.players.clear();
      this.startedAt = null;
      this.lastTps = null;
      this.lastTpsAt = 0;
      this.emit('players', []);
      const crashed = !wasIntentional && code !== 0 && code != null;
      this.pushLog(`[dashboard] Server process exited (code ${code ?? 'unknown'})`);
      const saved = this.saveConsoleLog(crashed ? 'crash' : 'stop');
      if (saved) this.pushLog(`[dashboard] Console log saved: ${saved}`);
      this.setStatus('offline');

      if (crashed) {
        this.emit('crashed', code);
        // Crash-loop guard: only quick, back-to-back crashes count. A run that
        // lasted >10min is treated as healthy, so its crash resets the slate
        // (crashCount) rather than counting toward the 3-strikes give-up below.
        if (ranForMs > 10 * 60000) this.crashCount = 0; // ran fine for a while: fresh slate
        const cfg = require('./config').getConfig();
        if (cfg.autoRestart && this.crashCount < 3) {
          this.crashCount++;
          this.pushLog(`[dashboard] Auto-restart in 5s (attempt ${this.crashCount}/3)`);
          // Store the handle so start()/stop() can cancel a pending restart.
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            if (this.status !== 'offline') return;
            try { this.start(require('./config').getConfig()); } catch (e) {
              this.pushLog(`[dashboard] Auto-restart failed: ${e.message}`);
            }
          }, 5000);
        } else if (cfg.autoRestart) {
          this.crashGaveUp = true;
          this.emit('gaveup');
          this.pushLog('[dashboard] Auto-restart gave up after 3 quick crashes — check the saved console logs');
        }
      }
    });
  }

  stop() {
    // Cancel any pending auto-restart so a stop can't be undone by a queued restart.
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (!this.proc) return Promise.resolve();
    return new Promise((resolve) => {
      this.stopping = true;
      this.setStatus('stopping');
      this.proc.once('exit', () => resolve());
      this.proc.stdin.write('stop\n');
      // Force kill if a graceful stop hangs
      this.stopTimer = setTimeout(() => {
        if (this.proc) {
          this.pushLog('[dashboard] Graceful stop timed out, killing process');
          this.proc.kill('SIGKILL');
        }
      }, 30000);
    });
  }

  // Dump the in-memory console buffer to console-logs/, pruning old files.
  saveConsoleLog(reason) {
    if (!this.logBuffer.length) return null;
    try {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = `console-${stamp}-${reason}.log`;
      // Atomic write so a crash mid-write can't leave a truncated log file.
      const dest = path.join(LOG_DIR, name);
      const tmp = dest + '.tmp';
      fs.writeFileSync(tmp, this.logBuffer.join('\n') + '\n');
      fs.renameSync(tmp, dest);
      const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log')).sort();
      while (files.length > MAX_SAVED_LOGS) fs.unlinkSync(path.join(LOG_DIR, files.shift()));
      return name;
    } catch (e) {
      return null;
    }
  }

  sendCommand(cmd, opts = {}) {
    if (!this.proc) throw new Error('Server is not running');
    if (!opts.quiet) this.pushLog(`> ${cmd}`);
    this.proc.stdin.write(cmd + '\n');
  }

  get pid() {
    return this.proc ? this.proc.pid : null;
  }

  get uptime() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }
}

module.exports = new MinecraftServer();
