const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const pidusage = require('pidusage');
const mc = require('../minecraft');
const { getConfig, serverDir } = require('../config');
const { levelName } = require('../utils/backup');
const { readProperties } = require('../utils/properties');
const history = require('../history');
const { getLatestVersion, downloadJar } = require('../utils/jars');
const { compareSemver } = require('../utils/updater');

const router = express.Router();

// The machine's address on the local network, so friends on the same Wi-Fi can
// join without any router setup. Prefer a private-range IPv4 (192.168.x / 10.x / 172.16–31.x).
function lanIp() {
  let fallback = null;
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ni.address)) return ni.address;
      fallback = fallback || ni.address;
    }
  }
  return fallback;
}

function serverPort() {
  const p = parseInt(readProperties(path.join(serverDir(), 'server.properties'))['server-port'], 10);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : 25565;
}

// Recently seen players: playerdata file mtimes mapped to names via usercache.json
function recentPlayers() {
  let byUuid = {};
  const uc = path.join(serverDir(), 'usercache.json');
  if (fs.existsSync(uc)) {
    try { byUuid = Object.fromEntries(JSON.parse(fs.readFileSync(uc, 'utf8')).map(p => [p.uuid, p.name])); } catch (e) { /* ignore */ }
  }
  const dir = path.join(serverDir(), levelName(), 'playerdata');
  let entries = [];
  if (fs.existsSync(dir)) {
    entries = fs.readdirSync(dir)
      .filter(f => f.endsWith('.dat'))
      .map(f => {
        const name = byUuid[f.slice(0, -4)];
        return name ? { name, lastSeen: fs.statSync(path.join(dir, f)).mtimeMs } : null;
      })
      .filter(Boolean);
  }
  const online = new Set([...mc.players].map(n => n.toLowerCase()));
  for (const p of mc.players) {
    if (!entries.some(e => e.name.toLowerCase() === p.toLowerCase())) {
      entries.push({ name: p, lastSeen: Date.now() });
    }
  }
  for (const e of entries) e.online = online.has(e.name.toLowerCase());
  entries.sort((a, b) => (b.online - a.online) || (b.lastSeen - a.lastSeen));
  return entries.slice(0, 8);
}

router.get('/overview', (req, res) => {
  res.json({ history: history.list(), recent: recentPlayers() });
});

function eulaState() {
  const file = path.join(serverDir(), 'eula.txt');
  if (!fs.existsSync(file)) return 'missing';
  return /^\s*eula\s*=\s*true\s*$/m.test(fs.readFileSync(file, 'utf8')) ? 'accepted' : 'declined';
}

router.get('/status', (req, res) => {
  const cfg = getConfig();
  res.json({
    status: mc.status,
    players: [...mc.players],
    uptime: mc.uptime,
    jarExists: fs.existsSync(path.join(serverDir(), cfg.jarFile)),
    jarFile: cfg.jarFile,
    eula: eulaState(),
    crashGaveUp: mc.crashGaveUp
  });
});

// Addresses to give players. localhost works on this PC; lanIp works for anyone on the same Wi-Fi.
router.get('/connect', (req, res) => {
  res.json({ lanIp: lanIp(), port: serverPort() });
});

// Suggest a safe RAM allocation based on the machine, so a beginner never picks
// a value that won't boot. Aim for ~half of RAM, leave ~2 GB for the OS, min 1 GB.
router.get('/sysinfo', (req, res) => {
  const totalMB = Math.floor(os.totalmem() / 1048576);
  let maxMB = Math.min(Math.floor(totalMB / 2), totalMB - 2048);
  maxMB = Math.max(1024, Math.floor(maxMB / 512) * 512);
  const fmt = (mb) => (mb % 1024 === 0 ? `${mb / 1024}G` : `${mb}M`);
  res.json({
    totalRamMB: totalMB,
    suggestedMinRam: fmt(Math.min(1024, maxMB)),
    suggestedMaxRam: fmt(maxMB)
  });
});

// Self-test: is anything actually listening on the Minecraft port? Answers the
// constant "did it work?" question with a real TCP check against 127.0.0.1.
router.get('/connectivity', (req, res) => {
  const port = serverPort();
  const sock = new net.Socket();
  let done = false;
  const finish = (ok) => { if (done) return; done = true; sock.destroy(); res.json({ ok, port }); };
  sock.setTimeout(2000);
  sock.once('connect', () => finish(true));
  sock.once('timeout', () => finish(false));
  sock.once('error', () => finish(false));
  sock.connect(port, '127.0.0.1');
});

router.get('/stats', async (req, res) => {
  if (!mc.pid) return res.json({ cpu: 0, memory: 0, uptime: 0, online: false });
  try {
    const s = await pidusage(mc.pid);
    res.json({ cpu: s.cpu, memory: s.memory, uptime: mc.uptime, online: true });
  } catch (e) {
    res.json({ cpu: 0, memory: 0, uptime: mc.uptime, online: true });
  }
});

router.post('/start', (req, res) => {
  if (mc.status !== 'offline') return res.status(409).json({ error: 'Server is not offline' });
  res.json({ ok: true });
  startWithUpdate().catch(e => {
    mc.pushLog(`[dashboard] ${e.message}`);
    if (mc.status === 'starting' && !mc.proc) mc.setStatus('offline');
  });
});

async function startWithUpdate() {
  const installed = getConfig().installedJar; // e.g. "vanilla 1.21.4" or ""
  if (installed) {
    const [type, version] = installed.split(' ');
    mc.setStatus('starting'); // disable Start button on the client right away
    mc.pushLog('[dashboard] Checking for updates…');
    try {
      const latest = await getLatestVersion(type);
      if (latest && version && compareSemver(latest, version) === 1) {
        mc.pushLog(`[dashboard] Update available: ${type} ${latest} — downloading`);
        await downloadJar(type, latest, msg => mc.pushLog(msg));
      } else {
        mc.pushLog(`[dashboard] ${installed} is up to date`);
      }
    } catch (e) {
      mc.pushLog(`[dashboard] Update check failed: ${e.message} — starting with current jar`);
    }
  }
  mc.start(getConfig()); // re-reads config so updated jarFile / installedJar is picked up
}

router.post('/stop', async (req, res, next) => {
  if (mc.status === 'offline') return res.json({ ok: true });
  try {
    await mc.stop();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/restart', async (req, res, next) => {
  try {
    await mc.stop();
    mc.start(getConfig());
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/command', (req, res) => {
  if (mc.status !== 'online') return res.status(409).json({ error: 'Server is not online' });
  const { command } = req.body;
  if (!command || typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({ error: 'No command given' });
  }
  // strip control chars/newlines so a single request can't inject multiple console lines
  const clean = command.trim().replace(/[\x00-\x1f\x7f]/g, '');
  if (!clean) return res.status(400).json({ error: 'No command given' });
  if (clean.length > 256) return res.status(400).json({ error: 'Command too long (max 256 characters)' });
  mc.sendCommand(clean);
  res.json({ ok: true });
});

const LOG_DIR = path.join(__dirname, '..', '..', 'console-logs');

router.get('/console-logs', (req, res) => {
  if (!fs.existsSync(LOG_DIR)) return res.json([]);
  const files = fs.readdirSync(LOG_DIR)
    .filter(f => f.endsWith('.log'))
    .map(f => {
      const st = fs.statSync(path.join(LOG_DIR, f));
      return { name: f, size: st.size, created: st.mtimeMs };
    })
    .sort((a, b) => b.created - a.created);
  res.json(files);
});

router.get('/console-logs/:name', (req, res) => {
  const name = req.params.name;
  // names are generated by the dashboard itself: console-<timestamp>-<reason>.log
  if (!/^console-[\w\-]{1,80}\.log$/.test(name)) return res.status(400).json({ error: 'Invalid log name' });
  const file = path.resolve(LOG_DIR, name);
  if (!file.startsWith(path.resolve(LOG_DIR) + path.sep) || !fs.existsSync(file)) {
    return res.status(404).json({ error: 'Log not found' });
  }
  res.download(file);
});

router.post('/eula', (req, res, next) => {
  try {
    fs.writeFileSync(path.join(serverDir(), 'eula.txt'), 'eula=true\n');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
