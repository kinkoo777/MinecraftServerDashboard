const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const nbt = require('./nbt');

/* Reads Minecraft Anvil region (.mca) files into a per-column height grid and
   renders an elevation (hill-shaded relief) map. Heightmap longs are read as
   BigInt so the bit-unpacking is exact. Supports 1.18+ (top-level chunk keys)
   and older 'Level'-wrapped chunks. */

// Decompress one chunk's NBT from a region buffer at the given header index.
function readChunk(buf, index) {
  const loc = buf.readUInt32BE(index * 4);
  const offset = loc >>> 8;
  if (offset === 0) return null; // chunk not generated
  const start = offset * 4096;
  if (start + 5 > buf.length) return null;
  const length = buf.readUInt32BE(start);
  const compression = buf[start + 4];
  const data = buf.subarray(start + 5, start + 4 + length);
  let raw;
  try {
    if (compression === 1) raw = zlib.gunzipSync(data);
    else if (compression === 2) raw = zlib.inflateSync(data);
    else if (compression === 3) raw = data;
    else return null;
  } catch (e) { return null; }
  try { return nbt.parse(raw, { bigint: true }); } catch (e) { return null; }
}

// Heightmap bits-per-entry derived from the long-array length (256 entries).
function bitsForHeightmap(len) {
  const perLong = Math.ceil(256 / len);
  return Math.floor(64 / perLong);
}

// Unpack a 16x16 heightmap (1.16+ non-spanning packing) into a 256-length array.
function unpackHeightmap(longs) {
  if (!Array.isArray(longs) || !longs.length) return null;
  const bits = bitsForHeightmap(longs.length);
  if (bits < 1 || bits > 32) return null;
  const perLong = Math.floor(64 / bits);
  const mask = (1n << BigInt(bits)) - 1n;
  const out = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const li = Math.floor(i / perLong);
    let v = longs[li];
    if (typeof v !== 'bigint') v = BigInt(v | 0);
    if (v < 0n) v += 1n << 64n; // treat as unsigned
    const off = BigInt((i % perLong) * bits);
    out[i] = Number((v >> off) & mask);
  }
  return out;
}

function chunkHeightmaps(chunk) {
  // 1.18+: top-level "Heightmaps"; older: "Level"."Heightmaps"
  return (chunk.Heightmaps) || (chunk.Level && chunk.Level.Heightmaps) || null;
}

// Render a region file into { width:512, height:512, heights: Int16Array } (-1 = ungenerated)
function readRegionHeights(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 8192) return null;
  const heights = new Int16Array(512 * 512).fill(-1);
  let any = false;

  for (let cz = 0; cz < 32; cz++) {
    for (let cx = 0; cx < 32; cx++) {
      const chunk = readChunk(buf, cx + cz * 32);
      if (!chunk) continue;
      const hm = chunkHeightmaps(chunk);
      if (!hm) continue;
      const longs = hm.WORLD_SURFACE || hm.MOTION_BLOCKING || hm.OCEAN_FLOOR;
      const grid = unpackHeightmap(longs);
      if (!grid) continue;
      any = true;
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const px = cx * 16 + x;
          const pz = cz * 16 + z;
          heights[pz * 512 + px] = grid[z * 16 + x];
        }
      }
    }
  }
  return any ? { width: 512, height: 512, heights } : null;
}

// Elevation gradient (low water -> green -> brown -> snow), in RGB.
function elevationColor(y) {
  const stops = [
    [40, [38, 70, 120]],   // deep
    [62, [58, 110, 170]],  // shallow water
    [64, [200, 190, 140]], // beach
    [80, [80, 150, 70]],   // lowland green
    [110, [110, 160, 80]], // hills
    [140, [130, 110, 80]], // mountains
    [180, [150, 140, 130]],// high rock
    [230, [240, 240, 245]] // snow
  ];
  if (y <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (y <= stops[i][0]) {
      const [y0, c0] = stops[i - 1], [y1, c1] = stops[i];
      const t = (y - y0) / (y1 - y0);
      return [0, 1, 2].map(k => Math.round(c0[k] + (c1[k] - c0[k]) * t));
    }
  }
  return stops[stops.length - 1][1];
}

// Build an RGBA buffer from a heights grid, with simple hill-shading.
function heightsToRGBA(grid) {
  const { width, height, heights } = grid;
  const rgba = Buffer.alloc(width * height * 4);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      const h = heights[i];
      const o = i * 4;
      if (h < 0) { rgba[o + 3] = 0; continue; } // transparent for ungenerated
      let [r, g, b] = elevationColor(h);
      // hill-shade: slope from the NW neighbours
      const hl = x > 0 ? heights[i - 1] : h;
      const hu = z > 0 ? heights[i - width] : h;
      const slope = ((h - hl) + (h - hu));
      const shade = Math.max(-40, Math.min(40, slope * 8));
      r = Math.max(0, Math.min(255, r + shade));
      g = Math.max(0, Math.min(255, g + shade));
      b = Math.max(0, Math.min(255, b + shade));
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
    }
  }
  return rgba;
}

// List region files in a world's /region folder.
function listRegions(regionDir) {
  if (!fs.existsSync(regionDir)) return [];
  const out = [];
  for (const f of fs.readdirSync(regionDir)) {
    const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(f);
    if (m) out.push({ rx: Number(m[1]), rz: Number(m[2]), file: f });
  }
  return out;
}

module.exports = { readRegionHeights, heightsToRGBA, listRegions, unpackHeightmap, bitsForHeightmap };
