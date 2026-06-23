const fs = require('fs');
const path = require('path');
const mc = require('./minecraft');
const { getConfig } = require('./config');
const { createBackup } = require('./utils/backup');

const FILE = path.join(require('./config').DATA_DIR, 'schedules.json');
const UNIT_MS = { minutes: 60000, hours: 3600000, days: 86400000 };
const ACTION_LABEL = { restart: 'Server restart', backup: 'World backup', command: 'Scheduled command', announce: 'Announcement' };
const ACTION_COLOR = { restart: 'red', backup: 'aqua', command: 'light_purple' };

// Colored in-chat warning via tellraw, plus an action-bar pop for visibility.
// A custom s.warnMessage (if set) replaces the auto text; {time} -> "5 minutes", {min} -> "5".
function sendWarning(s) {
  const label = ACTION_LABEL[s.action] || 'Scheduled task';
  const color = ACTION_COLOR[s.action] || 'yellow';
  const mins = s.warnMinutes;
  const unit = mins === 1 ? 'minute' : 'minutes';
  const timeStr = `${mins} ${unit}`;
  const custom = (s.warnMessage || '').trim();

  let chat, bar, logText;
  if (custom) {
    const msg = custom.replace(/\{time\}/gi, timeStr).replace(/\{mins?\}/gi, String(mins));
    chat = JSON.stringify(['',
      { text: '⚠ ', color: 'gold', bold: true },
      { text: '[Server] ', color: 'gray' },
      { text: msg, color, bold: true }
    ]);
    bar = JSON.stringify({ text: `⚠ ${msg}`, color, bold: true });
    logText = msg;
  } else {
    chat = JSON.stringify(['',
      { text: '⚠ ', color: 'gold', bold: true },
      { text: '[Server] ', color: 'gray' },
      { text: label, color, bold: true },
      { text: ' in ', color: 'gray' },
      { text: timeStr, color: 'yellow', bold: true },
      { text: '!', color: 'gray' }
    ]);
    bar = JSON.stringify({ text: `⚠ ${label} in ${timeStr}`, color, bold: true });
    logText = `${label} in ${timeStr}`;
  }
  try {
    mc.sendCommand(`tellraw @a ${chat}`, { quiet: true });
    mc.sendCommand(`title @a actionbar ${bar}`, { quiet: true });
    mc.pushLog(`[dashboard] Warned players: ${logText}`);
  } catch (e) { /* ignore */ }
}

// Backward compat: existing entries may have only {time} and no {times} or {type}.
function normalize(s) {
  const out = { type: 'daily', warnMinutes: 0, warnMessage: '', lastRun: 0, createdAt: Date.now(), enabled: true, ...s };
  // daily migration: promote singular time -> times array
  if (out.type === 'daily' && !out.times && out.time) out.times = [out.time];
  if (out.type === 'daily' && !out.times) out.times = ['00:00'];
  return out;
}

// ── Cron evaluator (no deps) ──────────────────────────────────────────────────

// Parse a single cron field into a sorted array of allowed values.
// Returns null on error.
function parseCronField(raw, min, max) {
  if (!raw) return null;
  const values = new Set();
  for (const part of raw.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      if (!step) return null;
      let lo = min, hi = max;
      if (stepMatch[1] !== '*') {
        const dash = stepMatch[1].split('-');
        lo = parseInt(dash[0], 10);
        hi = dash[1] != null ? parseInt(dash[1], 10) : lo;
      }
      if (lo < min || hi > max || lo > hi) return null;
      for (let i = lo; i <= max; i += step) values.add(i);
      continue;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const lo = parseInt(rangeMatch[1], 10), hi = parseInt(rangeMatch[2], 10);
      if (lo < min || hi > max || lo > hi) return null;
      for (let i = lo; i <= hi; i++) values.add(i);
      continue;
    }
    const num = parseInt(part, 10);
    if (isNaN(num) || num < min || num > max) return null;
    values.add(num);
  }
  return [...values].sort((a, b) => a - b);
}

// Parse a 5-field cron string. Returns parsed fields or null if invalid.
function parseCron(expr) {
  if (typeof expr !== 'string') return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute    = parseCronField(parts[0], 0, 59);
  const hour      = parseCronField(parts[1], 0, 23);
  const dom       = parseCronField(parts[2], 1, 31);
  const month     = parseCronField(parts[3], 1, 12);
  const rawDow    = parseCronField(parts[4], 0, 7); // accept 7 as Sunday
  if (!minute || !hour || !dom || !month || !rawDow) return null;
  // normalise 7 -> 0 for dow
  const dow = [...new Set(rawDow.map(d => d === 7 ? 0 : d))].sort((a, b) => a - b);
  const domRestricted = !parts[2].includes('*');
  const dowRestricted = !parts[4].includes('*');
  return { minute, hour, dom, month, dow, domRestricted, dowRestricted };
}

// Test whether a Date matches parsed cron fields.
function matchesCron(parsed, d) {
  if (!parsed.month.includes(d.getMonth() + 1)) return false;
  const domOk = parsed.dom.includes(d.getDate());
  const dowOk = parsed.dow.includes(d.getDay());
  // Vixie semantics: if BOTH restricted -> either match is sufficient
  if (parsed.domRestricted && parsed.dowRestricted) {
    if (!domOk && !dowOk) return false;
  } else {
    if (!domOk || !dowOk) return false;
  }
  if (!parsed.hour.includes(d.getHours())) return false;
  if (!parsed.minute.includes(d.getMinutes())) return false;
  return true;
}

// ── nextRunOf ─────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const MIN_MS = 60000;

function nextRunOf(s, now = Date.now()) {
  if (s.type === 'interval') {
    const ms = (s.intervalValue || 1) * (UNIT_MS[s.intervalUnit] || UNIT_MS.days);
    const base = s.lastRun || s.createdAt || now;
    return Math.max(base + ms, now);
  }

  if (s.type === 'once') {
    if (!s.date || !s.time) return null;
    const [y, mo, d] = s.date.split('-').map(Number);
    const [h, mi] = s.time.split(':').map(Number);
    const target = new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
    if (target <= now) {
      // if it already ran -> no future run
      return s.lastRun ? null : now;
    }
    return target;
  }

  if (s.type === 'cron') {
    const parsed = parseCron(s.cron);
    if (!parsed) return null;
    // start scanning from the next minute
    const start = Math.ceil((now + MIN_MS) / MIN_MS) * MIN_MS;
    const limit = start + 370 * DAY_MS;
    let cur = start;
    while (cur <= limit) {
      const d = new Date(cur);
      d.setSeconds(0, 0);
      if (matchesCron(parsed, d)) return d.getTime();
      cur += MIN_MS;
    }
    return null;
  }

  // daily (default)
  const times = s.times || ['00:00'];
  const days  = Array.isArray(s.days) && s.days.length > 0 ? new Set(s.days) : null; // null = all days

  let best = null;
  // scan forward up to 370 days to find the earliest valid slot
  for (let offset = 0; offset <= 370; offset++) {
    const base = new Date(now);
    base.setDate(base.getDate() + offset);
    const dow = base.getDay();
    if (days && !days.has(dow)) continue;

    for (const t of times) {
      const [h, mi] = t.split(':').map(Number);
      const candidate = new Date(base);
      candidate.setHours(h, mi, 0, 0);
      const ts = candidate.getTime();
      // skip if already ran this occurrence, or passed >60s before now
      if (ts <= (s.lastRun || 0)) continue;
      if (ts < now - 60000) continue;
      if (best === null || ts < best) best = ts;
    }
    if (best !== null) break; // found earliest day with a valid slot
  }
  return best;
}

// ── run ───────────────────────────────────────────────────────────────────────

async function run(s, now) {
  s.lastRun = now;
  if (s.type === 'once') {
    s.enabled = false;
  }
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
      require('./utils/notify').notifyAll(`💾 Scheduled world backup complete: \`${r.file}\``, 'Backup complete');
    } else if (s.action === 'command') {
      if (mc.status === 'online') mc.sendCommand(s.command);
      else mc.pushLog('[dashboard] Skipped scheduled command: server is offline');
    } else if (s.action === 'announce') {
      if (mc.status === 'online') {
        const json = JSON.stringify(['', { text: '[Server] ', color: 'aqua', bold: true }, { text: s.command, color: 'white' }]);
        mc.sendCommand(`tellraw @a ${json}`, { quiet: true });
        mc.pushLog(`[dashboard] Announced: ${s.command}`);
      }
    }
  } catch (e) {
    mc.pushLog(`[dashboard] Scheduled task failed: ${e.message}`);
  }
}

// ── tick ──────────────────────────────────────────────────────────────────────

let schedules = [];
if (fs.existsSync(FILE)) {
  try { schedules = JSON.parse(fs.readFileSync(FILE, 'utf8')).map(normalize); } catch (e) { /* start fresh */ }
}
let nextId = schedules.reduce((m, s) => Math.max(m, s.id), 0) + 1;
const warned = new Map(); // id -> the nextRun timestamp already announced

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(schedules.map(({ _hold, ...s }) => s), null, 2));
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
    if (next === null) continue;
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

// ── validationError ───────────────────────────────────────────────────────────

function validationError(s) {
  if (!['restart', 'backup', 'command', 'announce'].includes(s.action)) return 'Unknown action';
  if ((s.action === 'command' || s.action === 'announce') && !(s.command || '').trim()) {
    return s.action === 'announce' ? 'Announcement text is required' : 'Command is required';
  }

  const type = s.type || 'daily';

  if (type === 'interval') {
    if (!Number.isInteger(s.intervalValue) || s.intervalValue < 1 || s.intervalValue > 365) return 'Repeat interval must be a whole number between 1 and 365';
    if (!['minutes', 'hours', 'days'].includes(s.intervalUnit)) return 'Invalid interval unit';
  } else if (type === 'daily') {
    if (!Array.isArray(s.times) || s.times.length === 0) return 'At least one time is required';
    for (const t of s.times) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return `Invalid time format: ${t}`;
    }
    if (s.days != null) {
      if (!Array.isArray(s.days)) return 'days must be an array';
      for (const d of s.days) {
        if (!Number.isInteger(d) || d < 0 || d > 6) return 'Each day must be an integer 0-6';
      }
    }
  } else if (type === 'once') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || '')) return 'date must be YYYY-MM-DD';
    // validate it is a real calendar date
    const [y, mo, d] = (s.date || '').split('-').map(Number);
    const check = new Date(y, mo - 1, d);
    if (check.getFullYear() !== y || check.getMonth() + 1 !== mo || check.getDate() !== d) return 'date is not a valid calendar date';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time || '')) return 'time must be HH:MM';
  } else if (type === 'cron') {
    if (!s.cron || !parseCron(s.cron)) return 'cron must be a valid 5-field cron expression';
  } else {
    return 'Unknown schedule type';
  }

  const w = s.warnMinutes ?? 0;
  if (!Number.isInteger(w) || w < 0 || w > 60) return 'Warning must be 0-60 minutes';
  if (s.warnMessage != null && (typeof s.warnMessage !== 'string' || s.warnMessage.length > 200)) {
    return 'Warning message must be 200 characters or fewer';
  }
  return null;
}

// ── exports ───────────────────────────────────────────────────────────────────

module.exports = {
  validationError,
  parseCron, // exposed for route-level validation
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
    const allowed = ['type', 'action', 'command', 'enabled', 'intervalValue', 'intervalUnit',
                     'warnMinutes', 'warnMessage', 'onlyWhenEmpty', 'times', 'days', 'date', 'cron',
                     'time' /* kept for once + back-compat patches */];
    for (const k of allowed) {
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
