const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

const DONE_RE = /\]: Done \([\d.,]+s\)!/;
const JOIN_RE = /\]: ([A-Za-z0-9_]+)(?: \[[^\]]*\])? joined the game/;
const LEAVE_RE = /\]: ([A-Za-z0-9_]+) left the game/;

class MinecraftServer extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.status = 'offline'; // offline | starting | online | stopping
    this.players = new Set();
    this.logBuffer = [];
    this.startedAt = null;
    this.stopTimer = null;
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
    if (this.status === 'starting' && DONE_RE.test(line)) this.setStatus('online');
    let m;
    if ((m = JOIN_RE.exec(line))) {
      this.players.add(m[1]);
      this.emit('players', [...this.players]);
    } else if ((m = LEAVE_RE.exec(line))) {
      this.players.delete(m[1]);
      this.emit('players', [...this.players]);
    }
  }

  start(config) {
    if (this.proc) throw new Error('Server is already running');
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
      this.proc = null;
      this.players.clear();
      this.startedAt = null;
      this.emit('players', []);
      this.pushLog(`[dashboard] Server process exited (code ${code ?? 'unknown'})`);
      this.setStatus('offline');
    });
  }

  stop() {
    if (!this.proc) return Promise.resolve();
    return new Promise((resolve) => {
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

  sendCommand(cmd) {
    if (!this.proc) throw new Error('Server is not running');
    this.pushLog(`> ${cmd}`);
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
