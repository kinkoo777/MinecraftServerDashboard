const express = require('express');
const scheduler = require('../scheduler');

const router = express.Router();

function pick(body) {
  const s = {};
  const validTypes = ['daily', 'interval', 'once', 'cron'];
  s.type = validTypes.includes(body.type) ? body.type : 'daily';
  if (body.action != null) s.action = body.action;
  // eslint-disable-next-line no-control-regex
  if (body.command != null) s.command = String(body.command).replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
  if (body.intervalValue != null) s.intervalValue = Number(body.intervalValue);
  if (body.intervalUnit != null) s.intervalUnit = body.intervalUnit;
  if (body.warnMinutes != null) s.warnMinutes = Number(body.warnMinutes);
  if (body.warnMessage != null) s.warnMessage = String(body.warnMessage);
  if (typeof body.enabled === 'boolean') s.enabled = body.enabled;
  if (typeof body.onlyWhenEmpty === 'boolean') s.onlyWhenEmpty = body.onlyWhenEmpty;
  // daily fields
  // dedupe and cap at 50 to bound the nextRunOf inner loop
  if (body.times != null) s.times = Array.isArray(body.times) ? [...new Set(body.times.filter(t => typeof t === 'string'))].slice(0, 50) : [];
  if (body.days  != null) s.days  = Array.isArray(body.days)  ? body.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  // once fields
  if (body.time != null) s.time = String(body.time);
  if (body.date != null) s.date = String(body.date);
  // cron field
  if (body.cron != null) s.cron = String(body.cron);
  return s;
}

const { validationError } = scheduler;

router.get('/', (req, res) => res.json(scheduler.list()));

router.post('/', (req, res) => {
  const data = pick(req.body);
  const err = validationError(data);
  if (err) return res.status(400).json({ error: err });
  res.json(scheduler.add(data));
});

router.put('/:id', (req, res) => {
  const existing = scheduler.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });
  // partial updates allowed (e.g. just toggling enabled) - validate the merged result
  const allowed = ['type', 'action', 'command', 'intervalValue', 'intervalUnit',
                   'warnMinutes', 'warnMessage', 'enabled', 'onlyWhenEmpty',
                   'times', 'days', 'time', 'date', 'cron'];
  const pickedBody = pick(req.body);
  const patch = {};
  for (const k of allowed) {
    if (k in req.body) patch[k] = pickedBody[k];
  }
  const merged = { ...existing, ...patch };
  const err = validationError(merged);
  if (err) return res.status(400).json({ error: err });
  res.json(scheduler.update(req.params.id, patch));
});

router.delete('/:id', (req, res) => {
  scheduler.remove(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
