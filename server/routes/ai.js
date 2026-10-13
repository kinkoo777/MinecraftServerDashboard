const express = require('express');
const ai = require('../ai');

const router = express.Router();
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });

router.get('/config', (req, res) => res.json(ai.publicSettings()));

router.put('/config', (req, res) => {
  try { res.json(ai.saveSettings(req.body || {})); } catch (e) { fail(res, e); }
});

// Models the chosen provider offers. Takes the form's unsaved values so the list
// can be loaded before saving.
router.post('/models', async (req, res) => {
  const { provider, baseUrl, apiKey } = req.body || {};
  try { res.json(await ai.listModels({ provider, baseUrl, apiKey })); } catch (e) { fail(res, e); }
});

// Sign in with OpenRouter instead of pasting a key
router.post('/oauth/start', (req, res) => {
  try { res.json(ai.oauthStart((req.body || {}).origin)); } catch (e) { fail(res, e); }
});
router.post('/oauth/finish', async (req, res) => {
  try { res.json(await ai.oauthFinish((req.body || {}).code, (req.body || {}).state)); } catch (e) { fail(res, e); }
});


// Chat answers are streamed: one JSON object per line as things happen
// (id, delta, text, tool, pending, model, then done or error).
function stream(res, run) {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  res.on('error', () => {}); // the browser going away must not stop the work
  const emit = (ev) => { if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(ev) + '\n'); };
  run(emit)
    .then(() => emit({ type: 'done' }), (e) => emit({ type: 'error', error: e.message }))
    .finally(() => res.end());
}

router.post('/chat', (req, res) => {
  const b = req.body || {};
  const text = String(b.message || '').trim();
  if (!text) return res.status(400).json({ error: 'Type a message first' });
  if (text.length > 8000) return res.status(400).json({ error: 'Message too long (max 8000 characters)' });
  stream(res, (emit) => ai.chat(b.id, text, b.page, emit));
});

router.post('/confirm', (req, res) => {
  const b = req.body || {};
  stream(res, (emit) => ai.confirm(b.id, b.allow === true, b.always === true, emit));
});

router.get('/chats', (req, res) => res.json(ai.listChats()));
router.get('/chats/:id', (req, res) => { try { res.json(ai.getChat(req.params.id)); } catch (e) { fail(res, e); } });
router.delete('/chats/:id', (req, res) => { ai.deleteChat(req.params.id); res.json({ ok: true }); });

module.exports = router;
