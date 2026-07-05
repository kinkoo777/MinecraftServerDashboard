const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const totp = require('./totp');
const { getConfig, saveConfig, DATA_DIR } = require('./config');

const SESSION_MS = 7 * 86400000; // 7 days ("stay signed in"), sliding
const SHORT_MS = 86400000;       // 1 day when "stay signed in" is off
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const LOCK_MS = 15 * 60000;      // lockout window after too many failures
const IP_LIMIT = 10;             // failures from one IP before that IP is locked
const GLOBAL_LIMIT = 20;         // total failures (any IP) before login is locked — defends when a tunnel hides the real client IP
const sessions = new Map(); // token -> { expires }
const fails = new Map();    // ip -> { count, until }
let globalFails = { count: 0, until: 0 };

// scrypt work factor. Stored alongside the hash so it can be raised later and
// upgraded transparently on the next successful login. Older hashes saved before
// this change have no params recorded → treated as LEGACY so they still verify.
const TARGET_PARAMS = { N: 65536, r: 8, p: 1 }; // ~4x the old cost; fine on a Raspberry Pi for an occasional login
const LEGACY_PARAMS = { N: 16384, r: 8, p: 1 }; // Node scrypt defaults, what the old code used
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

function hashPassword(pw, salt, params = TARGET_PARAMS) {
  return crypto.scryptSync(pw, salt, 64, { ...params, maxmem: SCRYPT_MAXMEM }).toString('hex');
}

function storedParams() {
  const p = getConfig().passwordParams;
  return p && p.N ? p : LEGACY_PARAMS;
}

function isSetup() {
  return !!getConfig().passwordHash;
}

function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  saveConfig({ passwordSalt: salt, passwordHash: hashPassword(pw, salt, TARGET_PARAMS), passwordParams: TARGET_PARAMS });
}

function verifyPassword(pw) {
  const { passwordHash, passwordSalt } = getConfig();
  if (!passwordHash) return false;
  const params = storedParams();
  const a = Buffer.from(hashPassword(pw, passwordSalt, params));
  const b = Buffer.from(passwordHash);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  // transparently re-hash with the stronger cost on a correct login
  if (ok && params.N < TARGET_PARAMS.N) {
    try { saveConfig({ passwordHash: hashPassword(pw, passwordSalt, TARGET_PARAMS), passwordParams: TARGET_PARAMS }); }
    catch (e) { console.error('Password hash upgrade failed (best-effort):', e.message); }
  }
  return ok;
}

function lifetime(remember) { return remember ? SESSION_MS : SHORT_MS; }

// Persist sessions to disk so a dashboard restart doesn't log everyone out.
function loadSessions() {
  try {
    const saved = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const now = Date.now();
    for (const [t, s] of Object.entries(saved)) {
      if (s && s.expires > now && /^[a-f0-9]{64}$/.test(t)) sessions.set(t, s);
    }
  } catch (e) { /* no/invalid session store — start fresh */ }
}

function saveSessions() {
  // Atomic write so a crash mid-write can't corrupt the session store.
  // Note: sessions.json holds RAW session tokens; it is protected only by its
  // 0600 file permissions, so guard the data dir accordingly.
  try {
    const tmp = SESSIONS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
    fs.renameSync(tmp, SESSIONS_FILE);
  } catch (e) { /* best-effort */ }
}

function createSession(remember = true) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expires: Date.now() + lifetime(remember), remember: !!remember });
  saveSessions();
  return token;
}

function destroySession(token) {
  if (sessions.delete(token)) saveSessions();
}

function tokenFrom(req) {
  const m = /(?:^|;\s*)(?:chunkdeck|mcdash)=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}

function authed(req) {
  const token = tokenFrom(req);
  const s = token && sessions.get(token);
  if (!s) return false;
  if (Date.now() > s.expires) {
    sessions.delete(token);
    return false;
  }
  s.expires = Date.now() + lifetime(s.remember); // slide (kept in memory; persisted on create/destroy/sweep)
  return true;
}

function locked(rec, limit, now) {
  return rec.count >= limit && now < rec.until;
}

function limited(ip) {
  const now = Date.now();
  return locked(globalFails, GLOBAL_LIMIT, now) || locked(fails.get(ip) || { count: 0, until: 0 }, IP_LIMIT, now);
}

// Bump a failure counter. Resets once its window has passed, and sets the lock
// only when first crossing the threshold — so hammering a locked door doesn't
// keep extending the lock (which could permanently lock out a real user).
function bumpFail(rec, limit, now) {
  if (rec.until && now >= rec.until) { rec.count = 0; rec.until = 0; }
  rec.count++;
  if (rec.count >= limit && now >= rec.until) rec.until = now + LOCK_MS;
  return rec;
}

function recordFail(ip) {
  const now = Date.now();
  fails.set(ip, bumpFail(fails.get(ip) || { count: 0, until: 0 }, IP_LIMIT, now));
  globalFails = bumpFail(globalFails, GLOBAL_LIMIT, now);
}

function clearFails(ip) {
  fails.delete(ip);
  // A single successful login must NOT wipe the global brute-force counter to
  // zero — that would let an attacker reset it by interleaving valid logins.
  // Decay it by one IP_LIMIT's worth and clear the lock so legitimate use eases
  // pressure without erasing evidence of a distributed attack.
  globalFails.count = Math.max(0, globalFails.count - IP_LIMIT);
  globalFails.until = 0;
}

/* ---- Two-factor (TOTP) ---- */
// pendingTotpSecret is persisted in config.json as `totpPending` so a server
// restart between "scan QR" and "enter code" doesn't silently break enrollment.

function isTotpEnabled() { return !!getConfig().totpSecret; }

function startTotpEnroll() {
  const secret = totp.generateSecret();
  saveConfig({ totpPending: secret });
  return secret;
}

// One-time recovery codes, shown once in plaintext and stored only as hashes.
// They're high-entropy and machine-generated (not user-chosen), so a fast hash
// is fine — there's nothing for an offline dictionary attack to exploit.
const RECOVERY_CODE_COUNT = 8;

function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
}

function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = totp.base32Encode(crypto.randomBytes(5)).slice(0, 8); // 8 chars from the base32 alphabet
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

function recoveryCodesRemaining() {
  return (getConfig().totpRecoveryCodes || []).length;
}

// Regenerate the recovery code set (used at enrollment, and whenever the owner
// wants a fresh batch — e.g. an existing install upgrading to this feature).
// Invalidates any previously issued codes.
function regenerateRecoveryCodes() {
  const codes = generateRecoveryCodes();
  saveConfig({ totpRecoveryCodes: codes.map(hashRecoveryCode) });
  return codes;
}

function confirmTotpEnroll(code) {
  const pending = getConfig().totpPending || '';
  if (!pending || !totp.verify(code, pending)) return null;
  const codes = generateRecoveryCodes();
  saveConfig({ totpSecret: pending, totpPending: '', totpRecoveryCodes: codes.map(hashRecoveryCode) });
  return codes;
}

function disableTotp() {
  saveConfig({ totpSecret: '', totpPending: '', totpRecoveryCodes: [] });
}

function verifyTotp(code) {
  const s = getConfig().totpSecret;
  return !!s && totp.verify(code, s);
}

// One-time use: a matching code is removed from the store so it can't be replayed.
function verifyAndConsumeRecoveryCode(code) {
  const hashes = getConfig().totpRecoveryCodes || [];
  if (!hashes.length) return false;
  const target = Buffer.from(hashRecoveryCode(code));
  const idx = hashes.findIndex(h => {
    const b = Buffer.from(h);
    return b.length === target.length && crypto.timingSafeEqual(b, target);
  });
  if (idx === -1) return false;
  const remaining = hashes.slice();
  remaining.splice(idx, 1);
  saveConfig({ totpRecoveryCodes: remaining });
  return true;
}

function otpauthUrl() {
  const pending = getConfig().totpPending || '';
  return pending ? totp.otpauthUrl(pending) : null;
}

// keep the in-memory maps from growing forever
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [t, s] of sessions) if (now > s.expires) { sessions.delete(t); changed = true; }
  for (const [ip, f] of fails) if (now > f.until) fails.delete(ip);
  if (changed) saveSessions();
}, 3600000).unref();

loadSessions();

module.exports = {
  isSetup, setPassword, verifyPassword,
  createSession, destroySession, tokenFrom, authed,
  limited, recordFail, clearFails,
  isTotpEnabled, startTotpEnroll, confirmTotpEnroll, disableTotp, verifyTotp, otpauthUrl,
  recoveryCodesRemaining, regenerateRecoveryCodes, verifyAndConsumeRecoveryCode
};
