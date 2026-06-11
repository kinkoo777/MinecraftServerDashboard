const fs = require('fs');
const path = require('path');
const mc = require('./minecraft');
const { getConfig } = require('./config');
const { createBackup } = require('./utils/backup');

const FILE = path.join(__dirname, '..', 'schedules.json');

let schedules = [];
if (fs.existsSync(FILE)) {
  try { schedules = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { /* start fresh */ }
}
let nextId = schedules.reduce((m, s) => Math.max(m, s.id), 0) + 1;
let lastFiredMinute = null;

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(schedules, null, 2));
}

async function fire(s) {
  mc.emit('log', `[dashboard] Running scheduled task: ${s.action}${s.command ? ' ' + s.command : ''}`);
  try {
    if (s.action === 'restart') {
      if (mc.status !== 'offline') await mc.stop();
      mc.start(getConfig());
    } else if (s.action === 'backup') {
      await createBackup();
    } else if (s.action === 'command' && mc.status === 'online') {
      mc.sendCommand(s.command);
    }
  } catch (e) {
    mc.emit('log', `[dashboard] Scheduled task failed: ${e.message}`);
  }
}

function tick() {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm === lastFiredMinute) return;
  const due = schedules.filter(s => s.enabled && s.time === hhmm);
  if (due.length === 0) return;
  lastFiredMinute = hhmm;
  due.forEach(fire);
}

setInterval(tick, 15000);

module.exports = {
  list: () => schedules,
  add(data) {
    const s = { id: nextId++, enabled: true, ...data };
    schedules.push(s);
    persist();
    return s;
  },
  update(id, patch) {
    const s = schedules.find(x => x.id === Number(id));
    if (!s) return null;
    for (const k of ['time', 'action', 'command', 'enabled']) {
      if (k in patch) s[k] = patch[k];
    }
    persist();
    return s;
  },
  remove(id) {
    schedules = schedules.filter(x => x.id !== Number(id));
    persist();
  }
};
