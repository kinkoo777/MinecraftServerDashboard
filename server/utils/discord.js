const { getConfig } = require('../config');

const URL_RE = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//;

// Fire a Discord webhook message. Returns true if delivered, false otherwise.
async function notify(message) {
  const url = getConfig().discordWebhook;
  if (!url || !URL_RE.test(url)) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

module.exports = { notify, URL_RE };
