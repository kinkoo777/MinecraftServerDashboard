const fs = require('fs');
const path = require('path');
const scheduler = require('../scheduler');

const FILE = path.join(require('../config').DATA_DIR, 'schedule-presets.json');
const MAX_CUSTOM = 30, MAX_TASKS = 20, MAX_NAME = 60;

const T = (t) => ({ warnMinutes: 0, warnMessage: '', onlyWhenEmpty: false, enabled: true, days: [], ...t });
const BUILTINS = [
  { id: 'builtin-daily-maintenance', name: 'Daily maintenance', description: 'Backup at 03:30, restart at 04:00 with a 5-minute warning', builtIn: true, tasks: [
    T({ type: 'daily', action: 'backup', times: ['03:30'] }),
    T({ type: 'daily', action: 'restart', times: ['04:00'], warnMinutes: 5 })
  ] },
  { id: 'builtin-frequent-backups', name: 'Frequent backups', description: 'World backup every 6 hours', builtIn: true, tasks: [
    T({ type: 'interval', action: 'backup', intervalValue: 6, intervalUnit: 'hours' })
  ] },
  { id: 'builtin-public-server', name: 'Public server', description: 'Daily restart, 4-hourly backups, daily announcement', builtIn: true, tasks: [
    T({ type: 'daily', action: 'restart', times: ['05:00'], warnMinutes: 10 }),
    T({ type: 'interval', action: 'backup', intervalValue: 4, intervalUnit: 'hours' }),
    T({ type: 'daily', action: 'announce', times: ['18:00'], command: 'Enjoying the server? Edit this announcement in Schedules!' })
  ] },
  { id: 'builtin-low-maintenance', name: 'Low-maintenance', description: 'Weekly Sunday restart, daily backup only when empty', builtIn: true, tasks: [
    T({ type: 'daily', action: 'restart', times: ['05:00'], days: [0], warnMinutes: 10 }),
    T({ type: 'daily', action: 'backup', times: ['04:00'], onlyWhenEmpty: true })
  ] }
];

function loadCustom() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(j.presets) ? j.presets : [];
  } catch (e) { return []; } // missing or corrupt file -> empty custom list, never crash
}

function persist(presets) {
  fs.writeFileSync(FILE, JSON.stringify({ presets }, null, 2));
}

function err(status, message) { return Object.assign(new Error(message), { status }); }

function list() { return [...BUILTINS, ...loadCustom()]; }

function saveCurrent(name) {
  name = String(name || '').trim();
  if (!name || name.length > MAX_NAME) throw err(400, `Preset name must be 1-${MAX_NAME} characters`);
  if (list().some(p => p.name.toLowerCase() === name.toLowerCase())) throw err(400, 'A preset with that name already exists');
  const custom = loadCustom();
  if (custom.length >= MAX_CUSTOM) throw err(400, `At most ${MAX_CUSTOM} custom presets`);
  const tasks = scheduler.list().map(({ id, lastRun, nextRun, createdAt, ...t }) => t);
  if (!tasks.length) throw err(400, 'No schedules to save — add some first');
  if (tasks.length > MAX_TASKS) throw err(400, `At most ${MAX_TASKS} tasks per preset`);
  const preset = { id: `p${Date.now()}`, name, description: '', builtIn: false, tasks, createdAt: Date.now() };
  custom.push(preset);
  persist(custom);
  return preset;
}

function apply(id, mode) {
  const p = list().find(x => x.id === id);
  if (!p) throw err(404, 'Preset not found');
  p.tasks.forEach((t, i) => {
    const e = scheduler.validationError(t);
    if (e) throw err(400, `Task ${i + 1} (${t.action}): ${e}`);
  });
  if (mode === 'replace') return scheduler.replaceAll(p.tasks.map(t => ({ ...t })));
  for (const t of p.tasks) scheduler.add({ ...t });
  return scheduler.list();
}

function remove(id) {
  const custom = loadCustom();
  const p = custom.find(x => x.id === id);
  if (!p) {
    if (BUILTINS.some(b => b.id === id)) throw err(400, 'Built-in presets cannot be deleted');
    throw err(404, 'Preset not found');
  }
  persist(custom.filter(x => x.id !== id));
}

module.exports = { list, saveCurrent, apply, remove };
