const express = require('express');
const auth = require('../auth');

const router = express.Router();

const COOKIE = (token) => `mcdash=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict`;

router.get('/status', (req, res) => {
  res.json({ setup: auth.isSetup(), authed: auth.authed(req) });
});

router.post('/setup', (req, res) => {
  if (auth.isSetup()) return res.status(409).json({ error: 'Password is already set' });
  const pw = String(req.body.password || '');
  if (pw.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  auth.setPassword(pw);
  res.setHeader('Set-Cookie', COOKIE(auth.createSession()));
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const ip = req.socket.remoteAddress || '?';
  if (auth.limited(ip)) return res.status(429).json({ error: 'Too many failed attempts — try again in 15 minutes' });
  if (!auth.verifyPassword(String(req.body.password || ''))) {
    auth.recordFail(ip);
    return res.status(401).json({ error: 'Wrong password' });
  }
  auth.clearFails(ip);
  res.setHeader('Set-Cookie', COOKIE(auth.createSession()));
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  const token = auth.tokenFrom(req);
  if (token) auth.destroySession(token);
  res.setHeader('Set-Cookie', 'mcdash=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');
  res.json({ ok: true });
});

module.exports = router;
