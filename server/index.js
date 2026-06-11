const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const mc = require('./minecraft');
const auth = require('./auth');
const reports = require('./reports');
const { getConfig, serverDir } = require('./config');
const { notify } = require('./utils/discord');
require('./scheduler');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(path.join(__dirname, '..', 'client')));

// Auth: /api/auth is open (it is the login door); everything else under /api needs a session
app.use('/api/auth', require('./routes/auth'));
app.use('/api', (req, res, next) => {
  if (auth.authed(req)) return next();
  res.status(401).json({ error: 'Unauthorized', setup: auth.isSetup() });
});

app.use('/api/server', require('./routes/server'));
app.use('/api/players', require('./routes/players'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/world', require('./routes/world'));
app.use('/api/files', require('./routes/files'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/jars', require('./routes/jars'));
app.use('/api/modrinth', require('./routes/modrinth'));
app.use('/api/reports', require('./routes/reports'));

// Uniform JSON errors for thrown route errors
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

mc.on('log', (line) => broadcast('log', line));
mc.on('status', (status) => broadcast('status', status));
mc.on('players', (players) => broadcast('players', players));

// Discord notifications
mc.on('status', (status) => {
  if (status === 'online') notify('✅ **Server is online**');
  else if (status === 'offline') notify('⬛ Server stopped');
});
mc.on('crashed', (code) => notify(`💥 **Server crashed** (exit code ${code}) — check the saved console log`));
mc.on('join', (name) => notify(`▶ **${name}** joined the game`));
mc.on('leave', (name) => notify(`◀ **${name}** left the game`));

// Daily report aggregation
mc.on('crashed', () => reports.event('crash'));
mc.on('join', () => reports.event('join'));
reports.onRollover((r) => notify(
  `📊 **Daily report — ${r.date}**\n` +
  `Peak players: **${r.peakPlayers}** · Unique: **${r.uniquePlayers.length}** · Uptime: **${Math.floor(r.uptimeMinutes / 60)}h ${r.uptimeMinutes % 60}m**\n` +
  `Avg TPS: **${r.avgTps ?? 'n/a'}** · Peak RAM: **${r.peakMemMB} MB** · Crashes: **${r.crashes}** · Backups: **${r.backups}**`
));

wss.on('connection', (ws, req) => {
  if (!auth.authed(req)) {
    ws.close(4001, 'unauthorized');
    return;
  }
  ws.send(JSON.stringify({
    type: 'init',
    data: { status: mc.status, players: [...mc.players], log: mc.logBuffer }
  }));
});

// Sample stats every 2s: always record history, broadcast only when clients are connected
const pidusage = require('pidusage');
const history = require('./history');
setInterval(async () => {
  let stats = { cpu: 0, memory: 0, uptime: 0, online: false, tps: null };
  if (mc.pid) {
    try {
      const s = await pidusage(mc.pid);
      stats = { cpu: s.cpu, memory: s.memory, uptime: mc.uptime, online: true };
    } catch (e) { stats = { cpu: 0, memory: 0, uptime: mc.uptime, online: true }; }
    // TPS is fresh if a tick-query answer arrived in the last 3 minutes
    stats.tps = (mc.lastTpsAt && Date.now() - mc.lastTpsAt < 180000) ? mc.lastTps : null;
  }
  history.record(stats, mc.players.size);
  reports.record(stats, [...mc.players]);
  if (wss.clients.size > 0) broadcast('stats', stats);
}, 2000);

// TPS poller: ask the server once a minute; give up if it never answers (older MC versions)
let tpsMisses = 0;
mc.on('status', (s) => { if (s === 'online') { tpsMisses = 0; } });
setInterval(() => {
  if (mc.status !== 'online') return;
  if (tpsMisses >= 3 && !mc.lastTpsAt) return; // /tick query unsupported, stop asking
  try { mc.sendCommand('tick query', { quiet: true }); } catch (e) { return; }
  if (!mc.lastTpsAt) tpsMisses++;
}, 60000);

const PORT = process.env.PORT || getConfig().dashboardPort || 8080;
serverDir(); // ensure mc-server folder exists
server.listen(PORT, () => {
  console.log(`Minecraft Server Dashboard running at http://localhost:${PORT}`);
});

// Stop the MC server cleanly when the dashboard is closed
process.on('SIGINT', async () => {
  if (mc.status !== 'offline') await mc.stop(); // server exit already saves the console log
  else mc.saveConsoleLog('shutdown');
  process.exit(0);
});
