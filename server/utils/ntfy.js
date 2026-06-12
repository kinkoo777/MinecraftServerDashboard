const { getConfig } = require('../config');

const TOPIC_RE = /^[A-Za-z0-9_\-]{1,64}$/;

// Push to ntfy.sh (free, no account). The "topic" is the channel name the
// user subscribes to in the ntfy app. Returns true if accepted.
async function notify(message, title) {
  const topic = getConfig().ntfyTopic;
  if (!topic || !TOPIC_RE.test(topic)) return false;
  try {
    const headers = {};
    if (title) headers.Title = title;
    const res = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers,
      body: message.replace(/\*\*/g, '') // strip markdown bold for plain push
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

module.exports = { notify, TOPIC_RE };
