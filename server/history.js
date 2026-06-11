/* Rolling stats history for the dashboard activity chart: one sample per 15s, last 2h kept. */
const SAMPLE_MS = 15000;
const MAX_POINTS = 480;

const history = [];
let lastSample = 0;

function record(stats, playerCount) {
  const now = Date.now();
  if (now - lastSample < SAMPLE_MS) return;
  lastSample = now;
  history.push({
    t: now,
    players: playerCount,
    cpu: Math.round(stats.cpu * 10) / 10,
    mem: stats.memory,
    online: stats.online,
    tps: stats.tps ?? null
  });
  if (history.length > MAX_POINTS) history.shift();
}

module.exports = { record, list: () => history };
