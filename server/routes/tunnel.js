const express = require('express');
const playit = require('../playit');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    installed: playit.installed(),
    claimed: playit.claimed(),
    status: playit.status,
    claimUrl: playit.claimUrl,
    address: playit.address,
    pendingLink: playit.pendingLink,
    log: playit.log
  });
});

// Kick off the automated setup. It can wait minutes for the user to approve in
// the browser, so we never await it here — the page follows progress over the
// WebSocket (tunnel-update / tunnel-log) and /status.
router.post('/start', (req, res) => {
  playit.setup().catch(() => { /* errors are surfaced via the agent log */ });
  res.json({ ok: true });
});

router.post('/stop', (req, res) => {
  playit.stop();
  res.json({ ok: true });
});

// Forget the saved agent so the next setup claims a fresh one (e.g. wrong account).
router.post('/reset', (req, res) => {
  playit.reset();
  res.json({ ok: true });
});

module.exports = router;
