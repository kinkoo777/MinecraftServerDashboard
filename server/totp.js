/* RFC 6238 TOTP (time-based one-time passwords) using only Node's crypto —
   no external dependency. Compatible with Google Authenticator, Authy, etc.
   SHA-1, 30-second step, 6 digits (the universal defaults). */

const crypto = require('crypto');

const STEP = 30;
const DIGITS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const c of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

// a fresh random secret, base32-encoded (20 bytes = 160 bits, the RFC-recommended size)
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

// HOTP for a specific counter (RFC 4226)
function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

// Verify a user-entered code, allowing ±`window` steps for clock drift.
function verify(token, secretB32, window = 2) {
  token = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  const secretBuf = base32Decode(secretB32);
  if (!secretBuf.length) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP);
  const tokenBuf = Buffer.from(token);
  for (let w = -window; w <= window; w++) {
    const candidate = Buffer.from(hotp(secretBuf, counter + w));
    if (candidate.length === tokenBuf.length && crypto.timingSafeEqual(candidate, tokenBuf)) return true;
  }
  return false;
}

// otpauth:// URI for QR codes / authenticator import
function otpauthUrl(secretB32, label = 'ChunkDeck', issuer = 'ChunkDeck') {
  // Prefix the label with the issuer ("issuer:label") per the otpauth spec so
  // authenticator apps group/name the account correctly.
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secretB32}`
    + `&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}

module.exports = { generateSecret, verify, otpauthUrl, hotp, base32Encode, base32Decode };
