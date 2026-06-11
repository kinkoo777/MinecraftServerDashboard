const express = require('express');
const fs = require('fs');
const path = require('path');
const mc = require('../minecraft');
const { serverDir } = require('../config');
const { levelName } = require('../utils/backup');
const nbt = require('../utils/nbt');

const router = express.Router();

function readJson(name) {
  const file = path.join(serverDir(), name);
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
}

router.get('/', (req, res) => {
  res.json({
    online: [...mc.players],
    whitelist: readJson('whitelist.json').map(p => p.name),
    ops: readJson('ops.json').map(p => p.name),
    banned: readJson('banned-players.json').map(p => ({ name: p.name, reason: p.reason }))
  });
});

const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'];

router.get('/detail/:name', (req, res) => {
  const name = req.params.name;
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return res.status(400).json({ error: 'Invalid player name' });

  const lower = name.toLowerCase();
  const cacheHit = readJson('usercache.json').find(p => p.name.toLowerCase() === lower);
  const detail = {
    name: cacheHit ? cacheHit.name : name,
    uuid: cacheHit ? cacheHit.uuid : null,
    online: [...mc.players].some(p => p.toLowerCase() === lower),
    op: readJson('ops.json').some(p => p.name.toLowerCase() === lower),
    whitelisted: readJson('whitelist.json').some(p => p.name.toLowerCase() === lower),
    banned: readJson('banned-players.json').some(p => p.name.toLowerCase() === lower),
    data: null
  };

  if (detail.uuid) {
    const file = path.join(serverDir(), levelName(), 'playerdata', `${detail.uuid}.dat`);
    if (fs.existsSync(file)) {
      try {
        const d = nbt.parse(fs.readFileSync(file));
        detail.lastSaved = fs.statSync(file).mtimeMs;
        detail.data = {
          health: d.Health != null ? Math.round(d.Health * 10) / 10 : null,
          food: d.foodLevel ?? null,
          xpLevel: d.XpLevel ?? null,
          gamemode: GAMEMODES[d.playerGameType] ?? String(d.playerGameType ?? '?'),
          pos: Array.isArray(d.Pos) ? d.Pos.map(n => Math.round(n)) : null,
          dimension: (d.Dimension || '').toString().replace('minecraft:', ''),
          // 1.20.5+ uses lowercase "count" (int); older versions "Count" (byte)
          inventory: (d.Inventory || []).map(it => ({
            slot: it.Slot, id: it.id, count: it.Count ?? it.count ?? 1
          }))
        };
      } catch (e) {
        detail.dataError = `Could not read player data: ${e.message}`;
      }
    }
  }
  res.json(detail);
});

// Player actions are routed through console commands so the running server stays in sync.
const ACTIONS = {
  kick: (n) => `kick ${n}`,
  ban: (n) => `ban ${n}`,
  pardon: (n) => `pardon ${n}`,
  op: (n) => `op ${n}`,
  deop: (n) => `deop ${n}`,
  'whitelist-add': (n) => `whitelist add ${n}`,
  'whitelist-remove': (n) => `whitelist remove ${n}`
};

router.post('/action', (req, res) => {
  const { action, name } = req.body;
  if (!ACTIONS[action]) return res.status(400).json({ error: 'Unknown action' });
  if (!name || !/^[A-Za-z0-9_]{1,16}$/.test(name)) {
    return res.status(400).json({ error: 'Invalid player name' });
  }
  mc.sendCommand(ACTIONS[action](name));
  res.json({ ok: true });
});

module.exports = router;
