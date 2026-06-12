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

module.exports = { worldDir, regionDir, playerDataFile, statsFile, statsDir };
