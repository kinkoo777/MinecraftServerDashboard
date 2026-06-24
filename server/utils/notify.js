const discord = require('./discord');
const ntfy = require('./ntfy');

// Fan out a notification to every configured channel (Discord + ntfy).
function notifyAll(message, title) {
  discord.notify(message);
  ntfy.notify(message, title || 'ChunkDeck');
}

module.exports = { notifyAll };
