const fs = require('fs');
const path = require('path');
const mc = require('./minecraft');
const { getConfig } = require('./config');
const { createBackup } = require('./utils/backup');

const FILE = path.join(__dirname, '..', 'schedules.json');
const UNIT_MS = { minutes: 60000, hours: 3600000, days: 86400000 };
const ACTION_LABEL = { restart: 'Server restart', backup: 'World backup', command: 'Scheduled command' };
const ACTION_COLOR = { restart: 'red', backup: 'aqua', command: 'light_purple' };

// Colored in-chat warning via tellraw, plus an action-bar pop for visibility.
function sendWarning(s) {
  const label = ACTION_LABEL[s.action] || 'Scheduled task';
  const color = ACTION_COLOR[s.action] || 'yellow';
  const mins = s.warnMinutes;
  const unit = mins === 1 ? 'minute' : 'minutes';
  const chat = JSON.stringify(['',
    { text: '⚠ ', color: 'gold', bold: true },
    { text: '[Server] ', color: 'gray' },
    { text: label, color, bold: true },
    { text: ' in ', color: 'gray' },
    { text: `${mins} ${unit}`, color: 'yellow', bold: true },
    { text: '!', color: 'gray' }
  ]);
  const bar = JSON.stringify({ text: `⚠ ${label} in ${mins} ${unit}`, color, bold: true });
  try {
    mc.sendCommand(`tellraw @a ${chat}`, { quiet: true });
    mc.sendCommand(`title @a actionbar ${bar}`, { quiet: true });
    mc.pushLog(`[dashboard] Warned players: ${label} in ${mins} ${unit}`);
  } catch (e) { /* ignore */ }
}

// Older schedules.json entries only had {id, enabled, time, action, command}
function normalize(s) {
  return { type: 'daily', warnMinutes: 0, lastRun: 0, createdAt: Date.now(), enabled: true, ...s };
}

let schedules = [];
if (fs.existsSync(FILE)) {
  try { schedules = JSON.parse(fs.readFileSync(FILE, 'utf8')).map(normalize); } catch (e) { /* start fresh */ }
}
let nextId = schedules.reduce((m, s) => Math.max(m, s.id), 0) + 1;
const warned = new Map(); // id -> the nextRun timestamp already announced

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(schedules.map(({ _hold, ...s }) => s), null, 2));
}

function nextRunOf(s, now = Date.now()) {
  if (s.type === 'interval') {
    const ms = (s.intervalValue || 1) * (UNIT_MS[s.intervalUnit] || UNIT_MS.days);
    const base = s.lastRun || s.createdAt || now;
    return Math.max(base + ms, now); // overdue (e.g. dashboard was off) -> due now
  }
  const [h, m] = (s.time || '00:00').split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  let t = d.getTime();
  // already ran this occurrence, or it passed more than a minute before boot -> tomorrow
  if (t <= (s.lastRun || 0) || t < now - 60000) t += UNIT_MS.days;
  return t;
}

async function run(s, now) {
  s.lastRun = now;
  persist();
  if (s.onlyWhenEmpty && mc.players.size > 0) {
    mc.pushLog(`[dashboard] Skipped scheduled ${s.action}: ${mc.players.size} player(s) online`);
    return;
  }
  mc.pushLog(`[dashboard] Running scheduled task: ${s.action}${s.command ? ' ' + s.command : ''}`);
  try {
    if (s.action === 'restart') {
      if (mc.status !== 'offline') await mc.stop();
      mc.start(getConfig());
    } else if (s.action === 'backup') {
      const r = await createBackup();
      mc.pushLog(`[dashboard] Scheduled backup complete: ${r.file}`);
      require('./utils/discord').notify(`💾 Scheduled world backup complete: \`${r.file}\``);
    } else if (s.action === 'command') {
      if (mc.status === 'online') mc.sendCommand(s.command);
      else mc.pushLog('[dashboard] Skipped scheduled command: server is offline');
    }
  } catch (e) {
    mc.pushLog(`[dashboard] Scheduled task failed: ${e.message}`);
  }
}

function tick() {
  const now = Date.now();
  for (const s of schedules) {
    if (!s.enabled) continue;

    // a warning was sent for an already-due task: wait out the warning window
    if (s._hold) {
      if (now < s._hold) continue;
      delete s._hold;
      run(s, now);
      continue;
    }

    const next = nextRunOf(s, now);
    const warnMs = (s.warnMinutes || 0) * 60000;

    if (warnMs > 0 && next - now <= warnMs && warned.get(s.id) !== next) {
      warned.set(s.id, next);
      if (mc.status === 'online') {
        sendWarning(s);
        // task is due right now (e.g. overdue after downtime): still give players the full warning window
        if (next - now < 20000) {
          s._hold = now + warnMs;
          continue;
        }
      }
    }

    if (now >= next) run(s, now);
  }
}

setInterval(tick, 15000);

function validationError(s) {
  if (!['restart', 'backup', 'command'].includes(s.action)) return 'Unknown action';
  if (s.action === 'command' && !(s.command || '').trim()) return 'Command is required';
  if (s.type === 'interval') {
    if (!Number.isInteger(s.intervalValue) || s.intervalValue < 1 || s.intervalValue > 365) return 'Repeat interval must be a whole number between 1 and 365';
    if (!['minutes', 'hours', 'days'].includes(s.intervalUnit)) return 'Invalid interval unit';
  } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time || '')) {
    return 'Time must be HH:MM';
  }
  const w = s.warnMinutes ?? 0;
  if (!Number.isInteger(w) || w < 0 || w > 60) return 'Warning must be 0-60 minutes';
  return null;
}

module.exports = {
  validationError,
  replaceAll(list) {
    schedules = list.map(normalize).map((s, i) => ({ ...s, id: i + 1 }));
    nextId = schedules.length + 1;
    warned.clear();
    persist();
    return this.list();
  },
  list: () => schedules.map(({ _hold, ...s }) => ({ ...s, nextRun: s.enabled ? nextRunOf(s) : null })),
  get: (id) => schedules.find(x => x.id === Number(id)),
  add(data) {
    const s = normalize({ ...data, id: nextId++, createdAt: Date.now(), lastRun: 0 });
    schedules.push(s);
    persist();
    return this.list().find(x => x.id === s.id);
  },
  update(id, patch) {
    const s = schedules.find(x => x.id === Number(id));
    if (!s) return null;
    for (const k of ['time', 'action', 'command', 'enabled', 'type', 'intervalValue', 'intervalUnit', 'warnMinutes', 'onlyWhenEmpty']) {
      if (k in patch) s[k] = patch[k];
    }
    warned.delete(s.id);
    delete s._hold;
    persist();
    return this.list().find(x => x.id === s.id);
  },
  remove(id) {
    schedules = schedules.filter(x => x.id !== Number(id));
    warned.delete(Number(id));
    persist();
  }
};
