const express = require('express');
const auth = require('../auth');

const router = express.Router();

// add Secure when the request arrived over HTTPS (directly or via reverse proxy)
const COOKIE = (token, req, remember) => {
  const https = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const maxAge = remember ? '; Max-Age=604800' : ''; // omit → a session cookie (cleared when the browser closes)
  return `chunkdeck=${token}; HttpOnly; Path=/; SameSite=Strict${maxAge}${https ? '; Secure' : ''}`;
};

// only let the logged-in owner manage 2FA
function requireAuth(req, res, next) {
  if (auth.authed(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

router.get('/status', (req, res) => {
  res.json({
    setup: auth.isSetup(), authed: auth.authed(req), totp: auth.isTotpEnabled(),
    totpRecoveryCodes: auth.isTotpEnabled() ? auth.recoveryCodesRemaining() : 0
  });
});

router.post('/setup', (req, res) => {
  if (auth.isSetup()) return res.status(409).json({ error: 'Password is already set' });
  const pw = String(req.body.password || '');
  if (pw.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  auth.setPassword(pw);
  res.setHeader('Set-Cookie', COOKIE(auth.createSession(req.body.remember !== false), req, req.body.remember !== false));
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || '?';
  if (auth.limited(ip)) return res.status(429).json({ error: 'Too many failed attempts — try again in 15 minutes' });

  if (!auth.verifyPassword(String(req.body.password || ''))) {
    auth.recordFail(ip);
    return res.status(401).json({ error: 'Wrong password' });
  }

  // Password is correct. If 2FA is on, a valid code is also required.
  if (auth.isTotpEnabled()) {
    const code = String(req.body.code || '');
    if (!code) return res.status(401).json({ need2fa: true });
    if (!auth.verifyTotp(code)) {
      auth.recordFail(ip);
      return res.status(401).json({ need2fa: true, error: 'Wrong code — check your authenticator app' });
    }
  }

  auth.clearFails(ip);
  const remember = req.body.remember !== false;
  res.setHeader('Set-Cookie', COOKIE(auth.createSession(remember), req, remember));
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  const token = auth.tokenFrom(req);
  if (token) auth.destroySession(token);
  res.setHeader('Set-Cookie', [
    'chunkdeck=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict',
    'mcdash=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict'
  ]);
  res.json({ ok: true });
});

/* ---- Two-factor (TOTP) management (logged-in owner only) ---- */

// Begin enrollment: returns the secret, an otpauth URI and (if available) a QR data-URL.
router.post('/2fa/setup', requireAuth, async (req, res) => {
  if (auth.isTotpEnabled()) return res.status(409).json({ error: '2FA is already enabled' });
  const secret = auth.startTotpEnroll();
  const url = auth.otpauthUrl();
  let qr = null;
  try { qr = await require('qrcode').toDataURL(url, { margin: 1, width: 220 }); }
  catch (e) { /* qrcode not installed — the UI falls back to the manual key */ }
  res.json({ secret, otpauth: url, qr });
});

// Confirm enrollment with a code from the app. Returns one-time recovery codes —
// the only way to disable 2FA later without the authenticator device.
router.post('/2fa/enable', requireAuth, (req, res) => {
  if (auth.isTotpEnabled()) return res.status(409).json({ error: '2FA is already enabled' });
  const codes = auth.confirmTotpEnroll(String(req.body.code || ''));
  if (!codes) {
    return res.status(400).json({ error: 'That code didn’t match — make sure your phone’s clock is correct and try the current code.' });
  }
  res.json({ ok: true, recoveryCodes: codes });
});

// Generate a fresh batch of recovery codes (invalidates any older ones). Used
// right after enabling 2FA, or any time after — e.g. an install that enabled
// 2FA before recovery codes existed, or codes that have been used/lost.
router.post('/2fa/recovery-codes', requireAuth, (req, res) => {
  if (!auth.isTotpEnabled()) return res.status(409).json({ error: '2FA is not enabled' });
  if (!auth.verifyPassword(String(req.body.password || ''))) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.json({ ok: true, recoveryCodes: auth.regenerateRecoveryCodes() });
});

// Change password — requires the current password first.
router.post('/change-password', requireAuth, (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');
  if (!auth.verifyPassword(current)) return res.status(401).json({ error: 'Current password is wrong' });
  if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  auth.setPassword(next);
  res.json({ ok: true });
});

// Turn 2FA off — requires the password again, so a hijacked session can't do it.
router.post('/2fa/disable', requireAuth, (req, res) => {
  if (!auth.verifyPassword(String(req.body.password || ''))) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  auth.disableTotp();
  res.json({ ok: true });
});

// Emergency recovery: disable 2FA with the password AND one of the one-time
// recovery codes issued at enrollment, no active session needed. Requiring both
// means a leaked/guessed password alone can't be used to strip 2FA — the whole
// point of a second factor is to stay protective when the first one is compromised.
router.post('/2fa/recover', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || '?';
  if (auth.limited(ip)) return res.status(429).json({ error: 'Too many failed attempts — try again in 15 minutes' });
  if (!auth.isTotpEnabled()) return res.status(409).json({ error: '2FA is not enabled' });
  if (!auth.verifyPassword(String(req.body.password || ''))) {
    auth.recordFail(ip);
    return res.status(401).json({ error: 'Wrong password' });
  }
  if (!auth.verifyAndConsumeRecoveryCode(String(req.body.recoveryCode || ''))) {
    auth.recordFail(ip);
    return res.status(401).json({ error: 'Invalid or already-used recovery code' });
  }
  auth.disableTotp();
  res.json({ ok: true });
});

module.exports = router;
