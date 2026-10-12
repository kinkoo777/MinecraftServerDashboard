const discord = require('./discord');
const ntfy = require('./ntfy');
const { getConfig } = require('../config');

// What the user can switch on and off in Settings → Notifications
const EVENTS = {
  status: 'Server started / stopped',
  crash: 'Crashes',
  players: 'Players joining and leaving',
  backup: 'Backups',
  report: 'Daily report',
  assistant: 'Assistant findings (crash and lag checks)'
};

function enabled(event) {
  const ev = getConfig().notifyEvents || {};
  return ev[event] !== false; // on unless switched off
}

// Fan out a notification to every configured channel (Discord + ntfy), unless the
// user switched that kind of event off. `opts.urgent` makes the phone push stand out.
function notifyAll(event, message, title, opts = {}) {
  if (!enabled(event)) return;
  discord.notify(message);
  ntfy.notify(message, title || 'ChunkDeck', opts);
}

module.exports = { notifyAll, EVENTS };
