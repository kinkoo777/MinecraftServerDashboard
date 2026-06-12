const zlib = require('zlib');

/* Minimal NBT reader — enough to read playerdata .dat files (big-endian, gzip). */

function readTag(r, type) {
  const { buf } = r;
  switch (type) {
    case 1: return buf.readInt8(r.pos++);
    case 2: { const v = buf.readInt16BE(r.pos); r.pos += 2; return v; }
    case 3: { const v = buf.readInt32BE(r.pos); r.pos += 4; return v; }
    case 4: { const v = buf.readBigInt64BE(r.pos); r.pos += 8; return r.bigint ? v : Number(v); }
    case 5: { const v = buf.readFloatBE(r.pos); r.pos += 4; return v; }
    case 6: { const v = buf.readDoubleBE(r.pos); r.pos += 8; return v; }
    case 7: { // byte array
      const len = buf.readInt32BE(r.pos); r.pos += 4;
      const v = Array.from(buf.subarray(r.pos, r.pos + len)); r.pos += len;
      return v;
    }
    case 8: { // string
      const len = buf.readUInt16BE(r.pos); r.pos += 2;
      const v = buf.toString('utf8', r.pos, r.pos + len); r.pos += len;
      return v;
    }
    case 9: { // list
      const itemType = buf.readInt8(r.pos++);
      const len = buf.readInt32BE(r.pos); r.pos += 4;
      const v = [];
      for (let i = 0; i < len; i++) v.push(readTag(r, itemType));
      return v;
    }
    case 10: { // compound
      const obj = {};
      for (;;) {
        const t = buf.readInt8(r.pos++);
        if (t === 0) return obj;
        const nameLen = buf.readUInt16BE(r.pos); r.pos += 2;
        const name = buf.toString('utf8', r.pos, r.pos + nameLen); r.pos += nameLen;
        obj[name] = readTag(r, t);
      }
    }
    case 11: { // int array
      const len = buf.readInt32BE(r.pos); r.pos += 4;
      const v = [];
      for (let i = 0; i < len; i++) { v.push(buf.readInt32BE(r.pos)); r.pos += 4; }
      return v;
    }
    case 12: { // long array
      const len = buf.readInt32BE(r.pos); r.pos += 4;
      const v = [];
      for (let i = 0; i < len; i++) { const b = buf.readBigInt64BE(r.pos); v.push(r.bigint ? b : Number(b)); r.pos += 8; }
      return v;
    }
    default:
      throw new Error(`Unknown NBT tag type ${type}`);
  }
}

function parse(buf, opts = {}) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const r = { buf, pos: 0, bigint: !!opts.bigint };
  const rootType = buf.readInt8(r.pos++);
  const nameLen = buf.readUInt16BE(r.pos); r.pos += 2 + nameLen; // skip root name
  return readTag(r, rootType);
}

module.exports = { parse };
