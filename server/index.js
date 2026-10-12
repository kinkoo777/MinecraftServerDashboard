const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const mc = require('./minecraft');
const auth = require('./auth');
const reports = require('./reports');
const { getConfig, serverDir } = require('./config');
const { notifyAll: notify } = require('./utils/notify');
require('./scheduler');

const app = express();
// Trust one reverse proxy hop (e.g. Caddy/nginx/Cloudflare Tunnel) so req.secure,
// req.ip and the Secure cookie flag reflect the real client over HTTPS.
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
// This Minecraft server's icon (or the dashboard's when it has none). Deliberately
// open without login: phones fetch it as the picture for push notifications.
app.get('/server-icon.png', (req, res) => {
  const own = path.join(serverDir(), 'server-icon.png');
  res.sendFile(require('fs').existsSync(own) ? own : path.join(__dirname, '..', 'client', 'icon.png'));
});
app.use(express.static(path.join(__dirname, '..', 'client')));

// Auth: /api/auth is open (it is the login door); everything else under /api needs a session
app.use('/api/auth', require('./routes/auth'));
app.use('/api', (req, res, next) => {
  if (auth.authed(req) || require('./ai').isInternal(req)) return next(); // the assistant's own tool calls
  res.status(401).json({ error: 'Unauthorized', setup: auth.isSetup() });
});

app.use('/api/server', require('./routes/server'));
app.use('/api/players', require('./routes/players'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/world', require('./routes/world'));
app.use('/api/files', require('./routes/files'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/jars', require('./routes/jars'));
app.use('/api/updates', require('./routes/updates'));
app.use('/api/modrinth', require('./routes/modrinth'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/tunnel', require('./routes/tunnel'));
app.use('/api/cloudflare', require('./routes/cloudflare'));
app.use('/api/ai', require('./routes/ai'));

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

// playit tunnel agent -> push log lines and status to the Play-online page
const playit = require('./playit');
playit.on('log', (line) => broadcast('tunnel-log', line));
playit.on('update', () => broadcast('tunnel-update', {
  status: playit.status, claimUrl: playit.claimUrl, address: playit.address,
  pendingLink: playit.pendingLink, claimed: playit.claimed(), installed: playit.installed()
}));

// cloudflare quick tunnel -> push events to the Settings page
const cf = require('./cloudflare');
cf.on('log', (line) => broadcast('cf-log', line));
cf.on('update', () => broadcast('cf-update', { status: cf.status, url: cf.url, installed: cf.installed() }));

// Notifications (Discord + phone push)
mc.on('status', (status) => {
  if (status === 'online') notify('status', '✅ **Server is online**', 'Server online');
  else if (status === 'offline') notify('status', '⬛ Server stopped', 'Server stopped');
});
// `code` is the exit code, or the signal name when the process was killed from outside
const how = (code) => (typeof code === 'number' ? `exit code ${code}` : `killed by ${code}`);
mc.on('crashed', (code, why) => notify('crash', `💥 **Server crashed** (${how(code)}) — ${why ? `likely cause: ${why.title}` : 'check the saved console log'}`, 'Server crashed', { urgent: true }));
mc.on('gaveup', () => notify('crash', '🛑 **Auto-restart gave up** after 3 quick crashes — the server is staying off until you start it. Check the saved console logs.', 'Server keeps crashing', { urgent: true }));
mc.on('join', (name) => notify('players', `▶ **${name}** joined the game`, 'Player joined'));
mc.on('leave', (name) => notify('players', `◀ **${name}** left the game`, 'Player left'));

// Assistant watch: when switched on, it looks into a crash by itself and reports what it found
const assistant = require('./ai');
const explain = (kind, what, title) => assistant.watch(kind, what)
  .then((text) => { if (text) notify('assistant', `🤖 **Assistant:** ${text}`, title); })
  .catch(() => {});
mc.on('crashed', (code, why) => explain('crash', `The Minecraft server just crashed (${how(code)}).${why ? ` The dashboard's guess: ${why.title}.` : ''}`, 'Assistant: crash check'));

// Daily report aggregation
mc.on('crashed', () => reports.event('crash'));
mc.on('join', () => reports.event('join'));
reports.onRollover((r) => notify('report',
  `📊 **Daily report — ${r.date}**\n` +
  `Peak players: **${r.peakPlayers}** · Unique: **${r.uniquePlayers.length}** · Uptime: **${Math.floor(r.uptimeMinutes / 60)}h ${r.uptimeMinutes % 60}m**\n` +
  `Avg TPS: **${r.avgTps ?? 'n/a'}** · Peak RAM: **${r.peakMemMB} MB** · Crashes: **${r.crashes}** · Backups: **${r.backups}**`,
  `Daily report ${r.date}`
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
let lagSince = 0;
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
  // lasting lag (under 12 TPS for 3 minutes) is worth a look too
  if (stats.tps != null && stats.tps < 12) {
    lagSince = lagSince || Date.now();
    if (Date.now() - lagSince > 180000) {
      lagSince = Date.now();
      explain('lag', `The Minecraft server has been lagging for several minutes (${stats.tps} of 20 ticks per second, ${mc.players.size} players online).`, 'Assistant: lag check');
    }
  } else if (stats.tps != null) lagSince = 0;
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

// Online-player reconcile: the join/leave log lines are the live signal, this catches
// anything they miss (modded servers that reword or hide those messages)
mc.on('status', (s) => { if (s === 'online') setTimeout(() => mc.pollPlayers(), 5000); });
setInterval(() => mc.pollPlayers(), 30000);

const PORT = process.env.PORT || getConfig().dashboardPort || 8080;
serverDir(); // ensure mc-server folder exists
server.listen(PORT, () => {
  let version = 'unknown';
  try { version = require('./utils/updater').getCurrentVersion(); } catch (_) {}
  console.log(`ChunkDeck v${version} running at http://localhost:${PORT}`);
  // First run: fetch Java in the background when there is none (or it's too old for
  // the installed server), so the first Start doesn't have to wait for the download.
  const { requiredJava } = require('./utils/loaders');
  const mcVer = (getConfig().installedJar || '').split(' ')[1];
  require('./utils/java').ensure(mcVer ? requiredJava(mcVer) : null, (line) => {
    console.log(line.replace('[dashboard] ', ''));
    mc.pushLog(line);
  }).catch((e) => {
    const line = `[dashboard] Could not install Java automatically: ${e.message}`;
    console.log(line.replace('[dashboard] ', ''));
    mc.pushLog(line);
  });
});

// Stop the MC server cleanly when the dashboard is closed.
// Handle both SIGINT (Ctrl-C) and SIGTERM (systemd/docker stop).
async function shutdown() {
  playit.stop();
  // the Cloudflare tunnel is left running on purpose, so the remote link stays the
  // same across dashboard restarts (Settings → Turn off ends it)
  if (mc.status !== 'offline') await mc.stop(); // server exit already saves the console log
  else mc.saveConsoleLog('shutdown');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
