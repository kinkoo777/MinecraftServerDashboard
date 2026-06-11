const express = require('express');
const scheduler = require('../scheduler');

const router = express.Router();

function pick(body) {
  const s = {};
  s.type = body.type === 'interval' ? 'interval' : 'daily';
  if (body.time != null) s.time = String(body.time);
  if (body.action != null) s.action = body.action;
  if (body.command != null) s.command = String(body.command).trim();
  if (body.intervalValue != null) s.intervalValue = Number(body.intervalValue);
  if (body.intervalUnit != null) s.intervalUnit = body.intervalUnit;
  if (body.warnMinutes != null) s.warnMinutes = Number(body.warnMinutes);
  if (typeof body.enabled === 'boolean') s.enabled = body.enabled;
  if (typeof body.onlyWhenEmpty === 'boolean') s.onlyWhenEmpty = body.onlyWhenEmpty;
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
  const patch = {};
  for (const k of ['type', 'time', 'action', 'command', 'intervalValue', 'intervalUnit', 'warnMinutes', 'enabled', 'onlyWhenEmpty']) {
    if (k in req.body) patch[k] = pick(req.body)[k];
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
