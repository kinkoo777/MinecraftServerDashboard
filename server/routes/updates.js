const express = require('express');
const { checkForUpdate, applyUpdate } = require('../utils/updater');

const router = express.Router();

// GET /api/updates/check — return current vs latest release info
router.get('/check', async (req, res) => {
  try {
    const info = await checkForUpdate();
    // strip internal _release field before sending to client
    const { _release, ...result } = info;
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /api/updates/apply — download and apply the latest release in-place
router.post('/apply', async (req, res) => {
  const logs = [];
  try {
    const result = await applyUpdate(msg => {
      console.log('[update]', msg);
      logs.push(msg);
    });
    res.json({ ...result, logs });
  } catch (e) {
    if (e.message === 'Already up to date') {
      return res.status(400).json({ error: e.message });
    }
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
