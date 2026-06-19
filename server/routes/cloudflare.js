const express = require('express');
const cf = require('../cloudflare');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ installed: cf.installed(), status: cf.status, url: cf.url, log: cf.log });
});

router.post('/start', (req, res) => {
  cf.start().catch(() => {});
  res.json({ ok: true });
});

router.post('/stop', (req, res) => {
  cf.stop();
  res.json({ ok: true });
});

module.exports = router;
