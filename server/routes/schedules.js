const express = require('express');
const scheduler = require('../scheduler');

const router = express.Router();

router.get('/', (req, res) => res.json(scheduler.list()));

router.post('/', (req, res) => {
  const { time, action, command } = req.body;
  if (!/^\d{2}:\d{2}$/.test(time || '')) return res.status(400).json({ error: 'Time must be HH:MM' });
  if (!['restart', 'backup', 'command'].includes(action)) return res.status(400).json({ error: 'Unknown action' });
  if (action === 'command' && !(command || '').trim()) return res.status(400).json({ error: 'Command is required' });
  res.json(scheduler.add({ time, action, command: (command || '').trim() }));
});

router.put('/:id', (req, res) => {
  const updated = scheduler.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Schedule not found' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  scheduler.remove(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
