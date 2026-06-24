const express = require('express');
const playit = require('../playit');
const api = require('../playit-api');

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

// Paste in a secret from an existing agent (skips the claim flow).
// Validates the secret against the playit API before saving.
router.post('/use-secret', async (req, res) => {
  const secret = String(req.body.secret || '').trim();
  if (!secret) return res.status(400).json({ error: 'Secret key is required' });
  // playit agent secrets are hex-encoded keys. Validate charset/length before
  // sending anything to playit, and never echo the secret back in an error.
  if (!/^[0-9a-fA-F]{32,256}$/.test(secret)) {
    return res.status(400).json({ error: "That doesn't look like a valid agent secret key — it should be a long hex string." });
  }
  try {
    await api.agentsRundata(secret);
  } catch (e) {
    return res.status(400).json({ error: 'Could not verify this secret with playit.gg — check the key and try again.' });
  }
  playit.saveSecret(secret);
  res.json({ ok: true });
});

module.exports = router;
