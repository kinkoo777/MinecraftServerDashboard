const { getConfig } = require('../config');

const TOPIC_RE = /^[A-Za-z0-9_\-]{1,64}$/;
const ICON_URL_RE = /^https:\/\/[^\s]{4,300}$/;
// the dashboard's own icon, hosted where any phone can fetch it
const DEFAULT_ICON = 'https://raw.githubusercontent.com/kinkoo777/MinecraftServerDashboard/main/client/icon.png';

// Picture shown next to the notification (the ntfy Android app shows it; iPhones don't).
// The phone downloads it itself, so it has to be a public https address:
//   1. the address set in Settings, 2. this server's own server-icon.png when the
//   remote-access link is running (the only time the dashboard is reachable from
//   outside), 3. the dashboard's icon.
function iconUrl() {
  const custom = getConfig().ntfyIcon;
  if (custom && ICON_URL_RE.test(custom)) return custom;
  try {
    const cf = require('../cloudflare');
    const { serverDir } = require('../config');
    if (cf.url && require('fs').existsSync(require('path').join(serverDir(), 'server-icon.png'))) return `${cf.url}/server-icon.png`;
  } catch (e) { /* fall through to the default */ }
  return DEFAULT_ICON;
}

// Push to ntfy.sh (free, no account). The "topic" is the channel name the
// user subscribes to in the ntfy app. Returns true if accepted.
async function notify(message, title, opts = {}) {
  const topic = getConfig().ntfyTopic;
  if (!topic || !TOPIC_RE.test(topic)) return false;
  try {
    const headers = {};
    // header values must be plain ASCII — drop emoji and the like from the title
    const plain = String(title || '').replace(/[^\x20-\x7e]/g, '').trim();
    if (plain) headers.Title = plain;
    if (opts.urgent) { headers.Priority = 'high'; headers.Tags = 'warning'; }
    headers.Icon = iconUrl();
    const res = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers,
      body: String(message ?? '').replace(/\*\*/g, '') // strip markdown bold; coerce non-string input
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

module.exports = { notify, iconUrl, TOPIC_RE, ICON_URL_RE };
