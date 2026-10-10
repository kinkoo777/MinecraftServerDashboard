const fs = require('fs');
const path = require('path');
const { serverDir } = require('../config');
const { levelName } = require('./backup');

/* Resolves world sub-paths across Minecraft layouts:
   - Classic (≤ ~1.21): world/region, world/DIM-1, world/playerdata, world/stats
   - New (26.x / DataVersion ~4790+): world/dimensions/minecraft/<dim>/region,
     world/players/data, world/players/stats
   Each resolver returns the first path that exists, so both layouts work. */

function worldDir() { return path.join(serverDir(), levelName()); }

function firstExisting(cands) {
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  return null;
}

function regionDir(dim = 'overworld') {
  const w = worldDir();
  const map = {
    overworld: [path.join(w, 'dimensions', 'minecraft', 'overworld', 'region'), path.join(w, 'region')],
    nether: [path.join(w, 'dimensions', 'minecraft', 'the_nether', 'region'), path.join(w, 'DIM-1', 'region')],
    end: [path.join(w, 'dimensions', 'minecraft', 'the_end', 'region'), path.join(w, 'DIM1', 'region')]
  };
  return firstExisting(map[dim] || []);
}

function playerDataFile(uuid) {
  const w = worldDir();
  return firstExisting([
    path.join(w, 'players', 'data', `${uuid}.dat`),
    path.join(w, 'playerdata', `${uuid}.dat`)
  ]);
}

function statsFile(uuid) {
  const w = worldDir();
  return firstExisting([
    path.join(w, 'players', 'stats', `${uuid}.json`),
    path.join(w, 'stats', `${uuid}.json`)
  ]);
}

function statsDir() {
  const w = worldDir();
  return firstExisting([path.join(w, 'players', 'stats'), path.join(w, 'stats')]);
}

/* Paper 26.x keeps world_gen_settings.dat, game_rules.dat, weather.dat and
   scheduled_events.dat per dimension, inside each dimension folder. Vanilla, Fabric,
   Forge and NeoForge read one set from world/data/minecraft and refuse to load the
   world without it ("Overworld settings missing"). Before a non-Paper server boots,
   copy the overworld's set into place. Never overwrites; returns what it copied. */
const PAPER_PER_DIMENSION = ['world_gen_settings.dat', 'game_rules.dat', 'weather.dat', 'scheduled_events.dat'];

function adoptPaperWorld() {
  const w = worldDir();
  const overworld = path.join(w, 'dimensions', 'minecraft', 'overworld');
  if (!fs.existsSync(overworld)) return [];
  const dest = path.join(w, 'data', 'minecraft');
  const copied = [];
  for (const name of PAPER_PER_DIMENSION) {
    const target = path.join(dest, name);
    if (fs.existsSync(target)) continue;
    const src = firstExisting([
      path.join(overworld, 'data', 'minecraft', name),
      path.join(overworld, 'data', name),
      path.join(overworld, name)
    ]);
    if (!src) continue;
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(src, target);
    copied.push(name);
  }
  return copied;
}

module.exports = { adoptPaperWorld, worldDir, regionDir, playerDataFile, statsFile, statsDir };
