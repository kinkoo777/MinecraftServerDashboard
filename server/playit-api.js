/* Thin client for the playit.gg REST API (https://api.playit.gg).

   We use it to do the whole "Play Online" setup from inside the dashboard so a
   user only has to click one link and approve, instead of manually signing in,
   creating an agent and creating a tunnel on the website.

   Contract reverse-engineered from the official agent source (playit-agent):
     - every response is { status: "success"|"fail"|"error", data: ... }
     - agent-authenticated calls send  Authorization: Agent-Key <secret>
     - a claim code is 5 random bytes, hex-encoded (10 chars)
     - claim URL shown to the user is  https://playit.gg/claim/<code>
   PLAYIT_API_BASE overrides the base URL (used by the test suite). */

const crypto = require('crypto');

const API_BASE = process.env.PLAYIT_API_BASE || 'https://api.playit.gg';
const VERSION = 'mc-dashboard';

async function apiCall(path, body = {}, secret = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['Authorization'] = `Agent-Key ${secret}`;
  let res;
  try {
    res = await fetch(API_BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(`Could not reach playit.gg (${e.message}). Check your internet connection.`);
  }
  if (res.status === 429) throw new Error('playit.gg is rate-limiting us — wait a moment and try again.');
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch (e) { throw new Error(`playit.gg returned an unexpected response (HTTP ${res.status}).`); }

  if (json.status === 'success') return json.data;
  if (json.status === 'fail') {
    const err = new Error(`playit: ${typeof json.data === 'string' ? json.data : JSON.stringify(json.data)}`);
    err.fail = json.data; // machine-readable variant, e.g. "NotAccepted"
    throw err;
  }
  // { status: "error", data: { type, message } }
  const d = json.data || {};
  const msg = d.message != null ? d.message : d.type;
  throw new Error(`playit API error: ${typeof msg === 'string' ? msg : JSON.stringify(msg || 'unknown')}`);
}

// 5 random bytes, hex-encoded — same shape the official agent generates.
function genClaimCode() {
  return crypto.randomBytes(5).toString('hex');
}

function claimUrl(code) {
  return `https://playit.gg/claim/${code}`;
}

// Register/poll intent for a claim code. Returns one of:
//   "WaitingForUserVisit" | "WaitingForUser" | "UserAccepted" | "UserRejected"
function claimSetup(code, agentType = 'assignable') {
  return apiCall('/claim/setup', { code, agent_type: agentType, version: VERSION });
}

// Once accepted, swap the claim code for a permanent agent secret. Returns { secret_key }.
// Throws with err.fail = "NotAccepted" while the user hasn't approved yet.
function claimExchange(code) {
  return apiCall('/claim/exchange', { code });
}

// Agent-authenticated: the agent's id, its live tunnels (with display_address) and pending tunnels.
function agentsRundata(secret) {
  return apiCall('/v1/agents/rundata', {}, secret);
}

// Best-effort: create a Minecraft Java tunnel bound to this agent. Returns { id }.
// alloc:null asks playit to auto-assign a free shared address.
function createMinecraftTunnel(secret, agentId) {
  const body = {
    name: 'Minecraft (MC Dashboard)',
    tunnel_type: 'minecraft-java',
    origin: {
      agent_id: agentId || null,
      config: { fields: [] }
    },
    enabled: true,
    alloc: null
  };
  return apiCall('/v1/tunnels/create', body, secret);
}

module.exports = {
  API_BASE, apiCall, genClaimCode, claimUrl,
  claimSetup, claimExchange, agentsRundata, createMinecraftTunnel
};
