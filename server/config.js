const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// MCDASH_CONFIG lets a second instance (e.g. for testing) run fully isolated
const CONFIG_FILE = process.env.MCDASH_CONFIG || path.join(ROOT, 'config.json');

// serverDir is stored relative to the project root so the same config.json
// works when the project is copied between machines/OSes.
const DEFAULTS = {
  serverDir: 'mc-server',
  jarFile: 'server.jar',
  javaPath: 'java',
  minRam: '1G',
  maxRam: '2G',
  jvmArgs: '',
  dashboardPort: 8080,
  autoRestart: true,
  backupKeep: 10,
  discordWebhook: ''
};

let cache = null;

function getConfig() {
  if (cache) return cache;
  let saved = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { /* corrupt file, use defaults */ }
  }
  cache = { ...DEFAULTS, ...saved };
  // Migrate configs that saved serverDir as an absolute path: if it points
  // inside this project, make it relative; if it doesn't exist at all
  // (e.g. a Windows path on Linux), fall back to the default.
  if (path.isAbsolute(cache.serverDir)) {
    const rel = path.relative(ROOT, cache.serverDir);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      cache.serverDir = rel.split(path.sep).join('/');
      saveConfig({});
    } else if (!fs.existsSync(cache.serverDir)) {
      cache.serverDir = DEFAULTS.serverDir;
      saveConfig({});
    }
  }
  return cache;
}

function saveConfig(patch) {
  cache = { ...getConfig(), ...patch };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cache, null, 2));
  return cache;
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

module.exports = { getConfig, saveConfig, serverDir, safePath };
