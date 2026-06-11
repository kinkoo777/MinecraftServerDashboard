const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const mc = require('./minecraft');
const { getConfig, serverDir } = require('./config');
require('./scheduler');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'client')));

app.use('/api/server', require('./routes/server'));
app.use('/api/players', require('./routes/players'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/world', require('./routes/world'));
app.use('/api/files', require('./routes/files'));
app.use('/api/schedules', require('./routes/schedules'));

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

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'init',
    data: { status: mc.status, players: [...mc.players], log: mc.logBuffer }
  }));
});

// Sample stats every 2s: always record history, broadcast only when clients are connected
const pidusage = require('pidusage');
const history = require('./history');
setInterval(async () => {
  let stats = { cpu: 0, memory: 0, uptime: 0, online: false };
  if (mc.pid) {
    try {
      const s = await pidusage(mc.pid);
      stats = { cpu: s.cpu, memory: s.memory, uptime: mc.uptime, online: true };
    } catch (e) { stats = { cpu: 0, memory: 0, uptime: mc.uptime, online: true }; }
  }
  history.record(stats, mc.players.size);
  if (wss.clients.size > 0) broadcast('stats', stats);
}, 2000);

const PORT = process.env.PORT || getConfig().dashboardPort || 8080;
serverDir(); // ensure mc-server folder exists
server.listen(PORT, () => {
  console.log(`Minecraft Server Dashboard running at http://localhost:${PORT}`);
});

// Stop the MC server cleanly when the dashboard is closed
process.on('SIGINT', async () => {
  if (mc.status !== 'offline') await mc.stop();
  process.exit(0);
});
