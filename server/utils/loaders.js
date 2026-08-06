const FABRIC_META = 'https://meta.fabricmc.net/v2';
const NEOFORGE_API = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';
const NEOFORGE_DL = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FORGE_DL = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const UA = { headers: { 'User-Agent': 'chunkdeck/1.1.0 (chunkdeck.dev)' } };

const MODDED_TYPES = ['fabric', 'neoforge', 'forge'];

async function getJson(url, what) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${what} request failed (HTTP ${r.status})`);
  return r.json();
}

// numeric-aware compare for '54.1.0' / '21.4.63-beta' style strings
function cmpDotted(a, b) {
  const pa = String(a).split(/[.-]/), pb = String(b).split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = parseInt(pa[i], 10), y = parseInt(pb[i], 10);
    if (!isNaN(x) && !isNaN(y)) { if (x !== y) return x - y; continue; }
    if ((pa[i] || '') !== (pb[i] || '')) return (pa[i] || '') < (pb[i] || '') ? -1 : 1;
  }
  return 0;
}

async function fabricGameVersions() {
  const games = await getJson(`${FABRIC_META}/versions/game`, 'Fabric game version list');
  return games.filter(g => g.stable).map(g => g.version); // meta returns newest first
}

async function fabricLatestLoader() {
  const list = await getJson(`${FABRIC_META}/versions/loader`, 'Fabric loader list');
  const stable = list.find(l => l.stable) || list[0];
  if (!stable) throw new Error('No Fabric loader versions found');
  return stable.version;
}

async function fabricInstallerVersion() {
  const list = await getJson(`${FABRIC_META}/versions/installer`, 'Fabric installer list');
  const stable = list.find(i => i.stable) || list[0];
  if (!stable) throw new Error('No Fabric installer versions found');
  return stable.version;
}

// NeoForge '21.4.63' belongs to MC 1.21.4; '21.0.30' to MC 1.21
function neoToMc(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\./);
  if (!m) return null;
  return m[2] === '0' ? `1.${m[1]}` : `1.${m[1]}.${m[2]}`;
}

async function neoforgeVersionMap() {
  const data = await getJson(NEOFORGE_API, 'NeoForge version list');
  const best = {}; // mc -> { stable, any }
  for (const v of data.versions || []) {
    const mc = neoToMc(v);
    if (!mc) continue;
    const slot = best[mc] || (best[mc] = { stable: null, any: null });
    if (!slot.any || cmpDotted(v, slot.any) > 0) slot.any = v;
    if (!/beta|rc/i.test(v) && (!slot.stable || cmpDotted(v, slot.stable) > 0)) slot.stable = v;
  }
  const map = {};
  for (const [mc, s] of Object.entries(best)) map[mc] = s.stable || s.any;
  return map;
}

// promos: { "1.21.4-recommended": "54.1.0", "1.21.4-latest": "54.1.3", ... }
async function forgeVersionMap() {
  const data = await getJson(FORGE_PROMOS, 'Forge promotions');
  const map = {};
  for (const [key, fv] of Object.entries(data.promos || {})) {
    const m = key.match(/^(.+)-(recommended|latest)$/);
    if (!m) continue;
    if (m[2] === 'recommended') map[m[1]] = fv; // recommended always wins
    else if (!map[m[1]]) map[m[1]] = fv;        // latest only as fallback
  }
  return map;
}

async function latestLoaderFor(type, mc) {
  if (type === 'fabric') return fabricLatestLoader();
  const map = type === 'neoforge' ? await neoforgeVersionMap() : await forgeVersionMap();
  const v = map[mc];
  if (!v) throw new Error(`${type === 'neoforge' ? 'NeoForge' : 'Forge'} has no build for Minecraft ${mc}`);
  return v;
}

// MC versions newest-first, for version pickers
async function mcListFor(type) {
  if (type === 'fabric') return fabricGameVersions();
  const map = type === 'neoforge' ? await neoforgeVersionMap() : await forgeVersionMap();
  return Object.keys(map).sort((a, b) => cmpDotted(b, a));
}

// Minimum Java major for an MC version. Post-2025 date-style versions (e.g. "26.2") need 21.
function requiredJava(mc) {
  let m = String(mc).match(/^1\.(\d+)(?:\.(\d+))?/);
  if (!m) return /^\d{2}\./.test(String(mc)) ? 21 : null;
  const minor = +m[1], patch = +(m[2] || 0);
  if (minor >= 21 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

module.exports = {
  MODDED_TYPES, cmpDotted, requiredJava,
  fabricGameVersions, fabricLatestLoader, fabricInstallerVersion,
  neoforgeVersionMap, forgeVersionMap, latestLoaderFor, mcListFor,
  FABRIC_META, NEOFORGE_DL, FORGE_DL, UA
};
