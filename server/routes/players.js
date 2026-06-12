const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mc = require('../minecraft');
const { serverDir } = require('../config');
const { levelName } = require('../utils/backup');
const { readProperties } = require('../utils/properties');
const { playerDataFile, statsFile, statsDir } = require('../utils/worldpaths');
const nbt = require('../utils/nbt');

const router = express.Router();

/* ---- UUID resolution (for editing whitelist/ops/bans while the server is offline) ---- */

function dashUuid(hex) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// offline-mode servers derive UUIDs from md5("OfflinePlayer:" + name), UUID v3
function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  return dashUuid(md5.toString('hex'));
}

async function lookupUuid(name) {
  const cached = readJson('usercache.json').find(p => p.name.toLowerCase() === name.toLowerCase());
  if (cached) return { uuid: cached.uuid, name: cached.name };
  const onlineMode = readProperties(path.join(serverDir(), 'server.properties'))['online-mode'] !== 'false';
  if (!onlineMode) return { uuid: offlineUuid(name), name };
  try {
    const r = await fetch('https://api.mojang.com/users/profiles/minecraft/' + encodeURIComponent(name));
    if (r.ok) {
      const j = await r.json();
      return { uuid: dashUuid(j.id), name: j.name };
    }
  } catch (e) { /* network down */ }
  return null;
}

/* ---- Admin notes per player (keyed by lowercased name, stored per server) ---- */
function notesFile() { return path.join(serverDir(), 'dashboard-notes.json'); }
function readNotes() {
  const f = notesFile();
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return {}; }
}

router.put('/note', (req, res) => {
  const { name, note } = req.body;
  if (!name || !NAME_RE.test(name)) return res.status(400).json({ error: 'Invalid player name' });
  const notes = readNotes();
  const key = name.toLowerCase();
  if ((note || '').trim()) notes[key] = String(note).slice(0, 500);
  else delete notes[key];
  fs.writeFileSync(notesFile(), JSON.stringify(notes, null, 2));
  res.json({ ok: true });
});

/* ---- Playtime leaderboard from the world's stats/*.json files ---- */
router.get('/leaderboard', (req, res) => {
  const dir = statsDir();
  if (!dir) return res.json([]);
  const byUuid = {};
  const uc = path.join(serverDir(), 'usercache.json');
  if (fs.existsSync(uc)) {
    try { JSON.parse(fs.readFileSync(uc, 'utf8')).forEach(p => { byUuid[p.uuid] = p.name; }); } catch (e) { /* ignore */ }
  }
  const rows = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const uuid = f.slice(0, -5);
    try {
      const c = (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).stats || {})['minecraft:custom'] || {};
      const ticks = c['minecraft:play_time'] ?? c['minecraft:play_one_minute'] ?? 0;
      rows.push({
        name: byUuid[uuid] || uuid.slice(0, 8),
        playTimeHours: Math.round(ticks / 72000 * 10) / 10,
        deaths: c['minecraft:deaths'] || 0,
        mobKills: c['minecraft:mob_kills'] || 0,
        distanceKm: Math.round(((c['minecraft:walk_one_cm'] || 0) + (c['minecraft:sprint_one_cm'] || 0)) / 100000 * 10) / 10
      });
    } catch (e) { /* skip unreadable */ }
  }
  rows.sort((a, b) => b.playTimeHours - a.playTimeHours);
  res.json(rows.slice(0, 25));
});

function editJson(file, fn) {
  const p = path.join(serverDir(), file);
  let arr = [];
  if (fs.existsSync(p)) {
    try { arr = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { /* rewrite */ }
  }
  fs.writeFileSync(p, JSON.stringify(fn(arr), null, 2));
}

async function applyOffline(action, name) {
  const player = await lookupUuid(name);
  if (!player) throw Object.assign(new Error('Could not resolve the player\'s UUID — unknown name?'), { status: 404 });
  const { uuid } = player;
  const notSame = (e) => e.uuid !== uuid;
  switch (action) {
    case 'whitelist-add':
      editJson('whitelist.json', a => a.some(e => e.uuid === uuid) ? a : [...a, { uuid, name: player.name }]);
      break;
    case 'whitelist-remove':
      editJson('whitelist.json', a => a.filter(notSame));
      break;
    case 'op':
      editJson('ops.json', a => a.some(e => e.uuid === uuid) ? a : [...a, { uuid, name: player.name, level: 4, bypassesPlayerLimit: false }]);
      break;
    case 'deop':
      editJson('ops.json', a => a.filter(notSame));
      break;
    case 'ban':
      editJson('banned-players.json', a => a.some(e => e.uuid === uuid) ? a : [...a, {
        uuid, name: player.name,
        created: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' +0000',
        source: 'dashboard', expires: 'forever', reason: 'Banned by an operator'
      }]);
      break;
    case 'pardon':
      editJson('banned-players.json', a => a.filter(notSame));
      break;
    default:
      throw Object.assign(new Error('This action needs the server to be online'), { status: 409 });
  }
}

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
let lastForcedSave = 0;

router.get('/detail/:name', async (req, res) => {
  const name = req.params.name;
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return res.status(400).json({ error: 'Invalid player name' });

  // playerdata on disk only updates on world saves; force one so online players show fresh data
  const isOnline = [...mc.players].some(p => p.toLowerCase() === name.toLowerCase());
  if (isOnline && mc.status === 'online' && Date.now() - lastForcedSave > 30000) {
    lastForcedSave = Date.now();
    try { mc.sendCommand('save-all'); } catch (e) { /* ignore */ }
    await new Promise(r => setTimeout(r, 800));
  }

  const lower = name.toLowerCase();
  const cacheHit = readJson('usercache.json').find(p => p.name.toLowerCase() === lower);
  const detail = {
    name: cacheHit ? cacheHit.name : name,
    uuid: cacheHit ? cacheHit.uuid : null,
    online: [...mc.players].some(p => p.toLowerCase() === lower),
    op: readJson('ops.json').some(p => p.name.toLowerCase() === lower),
    whitelisted: readJson('whitelist.json').some(p => p.name.toLowerCase() === lower),
    banned: readJson('banned-players.json').some(p => p.name.toLowerCase() === lower),
    note: readNotes()[lower] || '',
    data: null
  };

  if (detail.uuid) {
    const file = playerDataFile(detail.uuid);
    if (file) {
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
    const sFile = statsFile(detail.uuid);
    if (sFile) {
      try {
        const c = (JSON.parse(fs.readFileSync(sFile, 'utf8')).stats || {})['minecraft:custom'] || {};
        const km = (n) => Math.round((n || 0) / 100000 * 10) / 10;
        detail.stats = {
          playTimeHours: Math.round((c['minecraft:play_time'] ?? c['minecraft:play_one_minute'] ?? 0) / 72000 * 10) / 10,
          deaths: c['minecraft:deaths'] || 0,
          mobKills: c['minecraft:mob_kills'] || 0,
          playerKills: c['minecraft:player_kills'] || 0,
          distanceKm: km((c['minecraft:walk_one_cm'] || 0) + (c['minecraft:sprint_one_cm'] || 0)),
          jumps: c['minecraft:jump'] || 0
        };
      } catch (e) { /* stats stay absent */ }
    }
  }
  res.json(detail);
});

// Player actions are routed through console commands so the running server stays in sync.
const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

function buildCommands(action, n, a) {
  switch (action) {
    case 'kick': return [`kick ${n}`];
    case 'ban': return [`ban ${n}`];
    case 'pardon': return [`pardon ${n}`];
    case 'op': return [`op ${n}`];
    case 'deop': return [`deop ${n}`];
    case 'whitelist-add': return [`whitelist add ${n}`];
    case 'whitelist-remove': return [`whitelist remove ${n}`];
    case 'heal': return [
      `effect give ${n} minecraft:instant_health 1 100 true`,
      `effect give ${n} minecraft:saturation 1 100 true`
    ];
    case 'feed': return [`effect give ${n} minecraft:saturation 1 100 true`];
    case 'clear-effects': return [`effect clear ${n}`];
    case 'kill': return [`kill ${n}`];
    case 'gamemode':
      if (!GAMEMODES.includes(a.mode)) return { error: 'Invalid gamemode' };
      return [`gamemode ${a.mode} ${n}`];
    case 'tp-coords': {
      const nums = [a.x, a.y, a.z].map(Number);
      if (nums.some(v => !Number.isFinite(v) || Math.abs(v) > 30000000)) return { error: 'Invalid coordinates' };
      return [`tp ${n} ${nums[0]} ${nums[1]} ${nums[2]}`];
    }
    case 'tp-player':
      if (!NAME_RE.test(a.target || '')) return { error: 'Invalid target player' };
      return [`tp ${n} ${a.target}`];
    case 'give': {
      if (!/^[a-z0-9_:.]{1,80}$/i.test(a.item || '')) return { error: 'Invalid item id' };
      const count = Number(a.count || 1);
      if (!Number.isInteger(count) || count < 1 || count > 6400) return { error: 'Count must be 1-6400' };
      return [`give ${n} ${a.item} ${count}`];
    }
    default: return { error: 'Unknown action' };
  }
}

router.post('/action', async (req, res, next) => {
  try {
    const { action, name, args = {} } = req.body;
    if (!name || !NAME_RE.test(name)) {
      return res.status(400).json({ error: 'Invalid player name' });
    }
    const cmds = buildCommands(action, name, args);
    if (!Array.isArray(cmds)) return res.status(400).json({ error: cmds.error });
    if (mc.status === 'online') {
      cmds.forEach(c => mc.sendCommand(c));
    } else {
      await applyOffline(action, name); // list edits work offline; the rest throws 409
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
