const fs = require('fs');
const path = require('path');

/* Daily server activity reports. The 2s stats sampler feeds record(); a day
   rolls over at local midnight, gets finalized, and is kept (last 120 days)
   in reports.json. Survives restarts by persisting the in-progress day too. */

const FILE = path.join(__dirname, '..', 'reports.json');
const SAMPLE_MS = 2000; // must match the sampler interval in index.js
const MAX_DAYS = 120;

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function freshDay(date) {
  return {
    date,
    peakPlayers: 0, playerSum: 0, playerSamples: 0, onlineSamples: 0,
    cpuPeak: 0, cpuSum: 0, memPeak: 0, memSum: 0, statSamples: 0,
    tpsMin: null, tpsSum: 0, tpsSamples: 0,
    crashes: 0, backups: 0, joins: 0,
    unique: {},
    hourly: Array.from({ length: 24 }, () => ({ peak: 0, online: 0 }))
  };
}

let data = { days: [], current: null };
let dirty = false;
const listeners = [];

function trim() { if (data.days.length > MAX_DAYS) data.days.length = MAX_DAYS; }

function persist() {
  try { fs.writeFileSync(FILE, JSON.stringify(data)); dirty = false; } catch (e) { /* best effort */ }
}

function finalize(c) {
  return {
    date: c.date,
    peakPlayers: c.peakPlayers,
    avgPlayers: c.playerSamples ? Math.round(c.playerSum / c.playerSamples * 10) / 10 : 0,
    uniquePlayers: Object.keys(c.unique),
    joins: c.joins,
    uptimeMinutes: Math.round(c.onlineSamples * SAMPLE_MS / 60000),
    peakCpu: Math.round(c.cpuPeak),
    avgCpu: c.statSamples ? Math.round(c.cpuSum / c.statSamples) : 0,
    peakMemMB: Math.round(c.memPeak / 1048576),
    avgMemMB: c.statSamples ? Math.round(c.memSum / c.statSamples / 1048576) : 0,
    minTps: c.tpsMin != null ? Math.round(c.tpsMin * 10) / 10 : null,
    avgTps: c.tpsSamples ? Math.round(c.tpsSum / c.tpsSamples * 10) / 10 : null,
    crashes: c.crashes,
    backups: c.backups,
    hourlyPlayers: c.hourly.map(h => h.peak),
    hourlyOnline: c.hourly.map(h => (h.online > 0 ? 1 : 0))
  };
}

(function load() {
  if (fs.existsSync(FILE)) {
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { data = { days: [], current: null }; }
  }
  if (!Array.isArray(data.days)) data.days = [];
  const today = localDate();
  if (data.current && data.current.date !== today) {
    data.days.unshift(finalize(data.current));
    trim();
    data.current = null;
  }
  if (!data.current) data.current = freshDay(today);
})();

function ensureDay() {
  const today = localDate();
  if (data.current.date === today) return;
  const finished = finalize(data.current);
  data.days.unshift(finished);
  trim();
  data.current = freshDay(today);
  persist();
  listeners.forEach(fn => { try { fn(finished); } catch (e) { /* ignore */ } });
}

function record(stats, names) {
  ensureDay();
  const c = data.current;
  const count = names.length;
  c.playerSum += count;
  c.playerSamples++;
  if (count > c.peakPlayers) c.peakPlayers = count;

  const h = c.hourly[new Date().getHours()];
  if (count > h.peak) h.peak = count;

  if (stats.online) {
    c.onlineSamples++;
    h.online++;
    c.statSamples++;
    if (stats.cpu > c.cpuPeak) c.cpuPeak = stats.cpu;
    c.cpuSum += stats.cpu;
    if (stats.memory > c.memPeak) c.memPeak = stats.memory;
    c.memSum += stats.memory;
    if (stats.tps != null) {
      c.tpsSum += stats.tps;
      c.tpsSamples++;
      if (c.tpsMin == null || stats.tps < c.tpsMin) c.tpsMin = stats.tps;
    }
  }
  for (const n of names) c.unique[n] = true;
  dirty = true;
}

function event(type) {
  ensureDay();
  if (type === 'crash') data.current.crashes++;
  else if (type === 'backup') data.current.backups++;
  else if (type === 'join') data.current.joins++;
  dirty = true;
}

setInterval(() => { if (dirty) persist(); }, 30000).unref();

module.exports = {
  record,
  event,
  flush: persist,
  onRollover: (fn) => listeners.push(fn),
  list: () => ({ today: finalize(data.current), days: data.days }),
  get: (date) => (date === data.current.date ? finalize(data.current) : data.days.find(d => d.date === date))
};
