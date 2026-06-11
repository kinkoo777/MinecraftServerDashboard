const crypto = require('crypto');
const { getConfig, saveConfig } = require('./config');

const SESSION_MS = 7 * 86400000; // 7 days, sliding
const sessions = new Map(); // token -> { expires }
const fails = new Map();    // ip -> { count, until }

function hashPassword(pw, salt) {
  return crypto.scryptSync(pw, salt, 64).toString('hex');
}

function isSetup() {
  return !!getConfig().passwordHash;
}

function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  saveConfig({ passwordSalt: salt, passwordHash: hashPassword(pw, salt) });
}

function verifyPassword(pw) {
  const { passwordHash, passwordSalt } = getConfig();
  if (!passwordHash) return false;
  const a = Buffer.from(hashPassword(pw, passwordSalt));
  const b = Buffer.from(passwordHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expires: Date.now() + SESSION_MS });
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function tokenFrom(req) {
  const m = /(?:^|;\s*)mcdash=([a-f0-9]{64})/.exec(req.headers.cookie || '');
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
  s.expires = Date.now() + SESSION_MS;
  return true;
}

function limited(ip) {
  const f = fails.get(ip);
  return !!f && f.count >= 10 && Date.now() < f.until;
}

function recordFail(ip) {
  const f = fails.get(ip) || { count: 0, until: 0 };
  f.count++;
  f.until = Date.now() + 15 * 60000;
  fails.set(ip, f);
}

function clearFails(ip) {
  fails.delete(ip);
}

module.exports = {
  isSetup, setPassword, verifyPassword,
  createSession, destroySession, tokenFrom, authed,
  limited, recordFail, clearFails
};
