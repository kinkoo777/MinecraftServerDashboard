const express = require('express');
const playit = require('../playit');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    installed: playit.installed(),
    status: playit.status,
    claimUrl: playit.claimUrl,
    address: playit.address,
    log: playit.log
  });
});

router.post('/start', async (req, res, next) => {
  try {
    await playit.start();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/stop', (req, res) => {
  playit.stop();
  res.json({ ok: true });
});

module.exports = router;
