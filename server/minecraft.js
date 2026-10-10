const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, '..', 'console-logs');
const MAX_SAVED_LOGS = 30;

const DONE_RE = /\]: Done \([\d.,]+s\)!/;
// Player presence. Forge 26.x logs server messages as "]: System chat: Steve joined
// the game", so that prefix is optional everywhere. "joined/left the game" are chat
// broadcasts that mods may reword or hide, so the server's own connection log lines
// ("logged in with entity id", "lost connection") count as well, and a background
// `list` poll (see pollPlayers) corrects anything both miss.
// A leading . or * is the Floodgate/Geyser prefix for Bedrock players.
const NAME = '[.*]?[A-Za-z0-9_]{1,16}';
const MSG = '\\]: (?:System chat: )?';
const JOIN_RE = new RegExp(`${MSG}(${NAME})(?: \\[[^\\]]*\\])?(?: \\(formerly known as [^)]*\\))? joined the game`);
const LOGIN_RE = new RegExp(`\\]: (${NAME})\\[[^\\]]*\\] logged in with entity id`);
const LEAVE_RE = new RegExp(`${MSG}(${NAME}) (?:left the game|lost connection:)`);
const LIST_RE = new RegExp(`${MSG}There are (\\d+) of a max(?: of)? \\d+ players online:?\\s*(.*)$`);
const NAME_RE = new RegExp(`^${NAME}$`);
// Forge/NeoForge log this when the world can't be loaded, then leave the JVM running forever
const BOOT_FAIL_RE = /Failed to load datapacks, can't proceed with server load/;
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
    this.listAskedAt = 0;     // when the last background `list` was sent, 0 once answered
    this.listMisses = 0;      // unanswered polls in a row; polling stops after 3
    this.bootFailTimer = null;
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

  playerJoined(name) {
    if (this.players.has(name)) return;
    this.players.add(name);
    this.emit('players', [...this.players]);
    this.emit('join', name);
  }

  playerLeft(name) {
    if (!this.players.delete(name)) return;
    this.emit('players', [...this.players]);
    this.emit('leave', name);
  }

  // Ask the server who is online. The answer is consumed in handleLine and kept out
  // of the console. Stops asking if the server never answers in the vanilla format.
  pollPlayers() {
    if (this.status !== 'online' || !this.proc) return;
    if (this.listAskedAt && ++this.listMisses >= 3) return;
    this.listAskedAt = Date.now();
    this.sendCommand('list', { quiet: true });
  }

  // Make the player set match a `list` answer.
  syncPlayers(count, namesText) {
    const names = count === 0 ? [] : namesText.split(',').map(n => n.trim()).filter(Boolean);
    // decorated names (team prefixes, nickname mods): can't map them back, keep what the log lines gave us
    if (names.length !== count || names.some(n => !NAME_RE.test(n))) return;
    for (const n of [...this.players]) if (!names.includes(n)) this.playerLeft(n);
    for (const n of names) this.playerJoined(n);
  }

  handleLine(line) {
    // Some server builds/log4j configs (common on Linux/Pi consoles) wrap console
    // output in ANSI colour codes, which can land between the `]` and `:` the
    // join/leave/done/TPS regexes anchor on. Strip them before matching so player
    // presence is still detected. The raw line is kept for the console display.
    const text = line.replace(/\x1b\[[0-9;]*m/g, '');
    let m;
    if (this.listAskedAt && Date.now() - this.listAskedAt < 5000 && (m = LIST_RE.exec(text))) {
      this.listAskedAt = 0;
      this.listMisses = 0;
      this.syncPlayers(+m[1], m[2]);
      return;
    }
    this.pushLog(line);
    if (this.status === 'starting' && DONE_RE.test(text)) {
      this.crashCount = 0; // a healthy boot wipes the crash-loop slate
      this.setStatus('online');
    }
    if (this.status === 'starting' && !this.bootFailTimer && BOOT_FAIL_RE.test(text)) {
      // give the stack trace a moment to print, then end the run so the dashboard
      // doesn't sit on "starting" forever
      const proc = this.proc;
      this.bootFailTimer = setTimeout(() => {
        this.bootFailTimer = null;
        if (!proc || this.proc !== proc) return;
        this.pushLog('[dashboard] The server could not load the world and will never finish starting — stopping it. The error above says why.');
        proc.kill('SIGKILL');
      }, 3000);
    }
    if ((m = JOIN_RE.exec(text)) || (m = LOGIN_RE.exec(text))) {
      this.playerJoined(m[1]);
    } else if ((m = LEAVE_RE.exec(text))) {
      this.playerLeft(m[1]);
    } else if ((m = TICK_RE.exec(text))) {
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
    const mrpack = require('./utils/mrpack');
    if (mrpack.isRunning()) { const err = new Error('A modpack install is in progress — wait for it to finish'); err.status = 409; throw err; }
    // Cancel any pending auto-restart so it can't fire a duplicate start().
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const dir = require('./config').serverDir();
    const loaders = require('./utils/loaders');
    const [type, mcVer] = (config.installedJar || '').split(' ');
    const launch = loaders.resolveLaunch(dir, config);
    if (!launch) {
      const err = new Error(type === 'forge' || type === 'neoforge'
        ? `${type} launch files not found — reinstall ${type} from Settings → Server software.`
        : `Server jar not found: ${config.jarFile}. Put it in the server folder (Files page) or fix the jar name in Settings.`);
      err.status = 400;
      throw err;
    }

    // Refuse up front rather than crash-loop on a Java that can't run this version.
    const needJava = mcVer ? loaders.requiredJava(mcVer) : null;
    const java = require('./utils/java').pick(needJava);
    if (!java.bin) {
      const have = java.major ? `Java ${java.major} is installed` : 'no Java was found';
      const err = new Error(`${needJava ? `Minecraft ${mcVer} needs Java ${needJava}+` : 'Java is needed to run the server'}, but ${have}. Press Start to let the dashboard download it, or point Settings → Java path at a newer one.`);
      err.status = 400;
      throw err;
    }

    const args = [`-Xms${config.minRam}`, `-Xmx${config.maxRam}`];
    if (config.jvmArgs) args.push(...config.jvmArgs.split(' ').filter(Boolean));
    args.push(...launch.args);

    // fresh buffer per run so saved console logs and the live view don't mix sessions
    this.logBuffer = [];
    this.crashGaveUp = false; // we're trying again — clear any previous give-up
    this.setStatus('starting');
    this.startedAt = Date.now();
    this.listAskedAt = 0;
    this.listMisses = 0;
    if (type !== 'paper') {
      try {
        const copied = require('./utils/worldpaths').adoptPaperWorld();
        if (copied.length) this.pushLog(`[dashboard] This world was saved by Paper — copied ${copied.join(', ')} to data/minecraft so ${type || 'this server'} can load it`);
      } catch (e) {
        this.pushLog(`[dashboard] Could not prepare the Paper world for ${type || 'this server'}: ${e.message}`);
      }
    }
    if (java.managed) this.pushLog(`[dashboard] Using the dashboard's own Java ${java.major}`);
    this.pushLog(`[dashboard] Launching: ${java.bin} ${args.join(' ')}`);

    this.proc = spawn(java.bin, args, { cwd: dir });

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
      clearTimeout(this.bootFailTimer);
      this.bootFailTimer = null;
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
