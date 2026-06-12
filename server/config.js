const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// MCDASH_CONFIG lets a second instance (e.g. for testing) run fully isolated
const CONFIG_FILE = process.env.MCDASH_CONFIG || path.join(ROOT, 'config.json');
// reports.json / schedules.json live next to the config file, so an isolated
// test instance keeps its own state instead of writing the real files
const DATA_DIR = path.dirname(CONFIG_FILE);

// Fields that belong to an individual server profile (vs. global dashboard settings)
const PER_SERVER = ['name', 'serverDir', 'jarFile', 'javaPath', 'minRam', 'maxRam', 'jvmArgs', 'installedJar'];
const SERVER_DEFAULTS = {
  name: 'Main server',
  serverDir: 'mc-server',
  jarFile: 'server.jar',
  javaPath: 'java',
  minRam: '1G',
  maxRam: '2G',
  jvmArgs: '',
  installedJar: '' // e.g. "paper 1.21.4" — set by the jar downloader, used by the update checker
};
const GLOBAL_DEFAULTS = {
  dashboardPort: 8080,
  autoRestart: true,
  backupKeep: 10,
  discordWebhook: '',
  ntfyTopic: ''
};

let store = null; // raw on-disk shape: { servers:[...], activeServer, ...globals, passwordHash, passwordSalt }

function normalizeServerDir(srv) {
  srv.serverDir = srv.serverDir || SERVER_DEFAULTS.serverDir;
  if (path.isAbsolute(srv.serverDir)) {
    const rel = path.relative(ROOT, srv.serverDir);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      srv.serverDir = rel.split(path.sep).join('/');
    }
  }
}

function load() {
  if (store) return store;
  let saved = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { /* corrupt, use defaults */ }
  }
  // Migrate v1 (flat single server) -> v2 (servers array)
  if (!Array.isArray(saved.servers)) {
    const srv = { ...SERVER_DEFAULTS };
    for (const k of PER_SERVER) if (saved[k] != null) srv[k] = saved[k];
    saved.servers = [srv];
    saved.activeServer = 0;
    for (const k of PER_SERVER) delete saved[k];
  }
  if (!saved.servers.length) saved.servers = [{ ...SERVER_DEFAULTS }];
  if (typeof saved.activeServer !== 'number' || saved.activeServer < 0 || saved.activeServer >= saved.servers.length) {
    saved.activeServer = 0;
  }
  saved.servers.forEach((s, i) => { saved.servers[i] = { ...SERVER_DEFAULTS, ...s }; normalizeServerDir(saved.servers[i]); });
  store = saved;
  return store;
}

function persist() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(store, null, 2));
}

// Merged, read-only view used everywhere: globals + the active server's fields
function getConfig() {
  const s = load();
  const { servers, activeServer, ...globals } = s;
  const srv = servers[activeServer] || servers[0];
  return { ...GLOBAL_DEFAULTS, ...globals, ...SERVER_DEFAULTS, ...srv, servers, activeServer };
}

// Per-server keys in the patch go to the active server; everything else is global
function saveConfig(patch) {
  const s = load();
  const srv = s.servers[s.activeServer];
  for (const [k, v] of Object.entries(patch)) {
    if (PER_SERVER.includes(k)) srv[k] = v;
    else s[k] = v;
  }
  persist();
  return getConfig();
}

function serverDir() {
  const dir = path.resolve(ROOT, getConfig().serverDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Resolve a user-supplied relative path safely inside the server directory.
function safePath(rel) {
  const base = serverDir();
  const p = path.resolve(base, rel || '.');
  if (p !== base && !p.startsWith(base + path.sep)) {
    const err = new Error('Path escapes server directory');
    err.status = 400;
    throw err;
  }
  return p;
}

/* ---- Multi-server management ---- */

function listServers() {
  const s = load();
  return s.servers.map((srv, i) => ({
    id: i, name: srv.name, serverDir: srv.serverDir, jarFile: srv.jarFile, active: i === s.activeServer
  }));
}

function addServer(data) {
  const s = load();
  const srv = { ...SERVER_DEFAULTS };
  for (const k of PER_SERVER) if (typeof data[k] === 'string' && data[k].trim()) srv[k] = data[k].trim();
  // give a fresh profile its own folder by default so worlds don't collide
  if (!data.serverDir) srv.serverDir = `mc-server-${s.servers.length + 1}`;
  normalizeServerDir(srv);
  s.servers.push(srv);
  persist();
  return listServers();
}

function setActiveServer(i) {
  const s = load();
  if (i < 0 || i >= s.servers.length) throw Object.assign(new Error('No such server'), { status: 400 });
  s.activeServer = i;
  persist();
  return getConfig();
}

function removeServer(i) {
  const s = load();
  if (s.servers.length <= 1) throw Object.assign(new Error('Cannot remove the only server'), { status: 400 });
  if (i < 0 || i >= s.servers.length) throw Object.assign(new Error('No such server'), { status: 400 });
  s.servers.splice(i, 1);
  if (s.activeServer >= s.servers.length) s.activeServer = s.servers.length - 1;
  persist();
  return listServers();
}

module.exports = {
  getConfig, saveConfig, serverDir, safePath,
  listServers, addServer, setActiveServer, removeServer,
  PER_SERVER, DATA_DIR
};
