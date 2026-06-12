const express = require('express');
const path = require('path');
const { readProperties, writeProperties } = require('../utils/properties');
const config = require('../config');
const { getConfig, saveConfig, serverDir } = config;
const scheduler = require('../scheduler');
const mc = require('../minecraft');

const router = express.Router();

/* ---- Multi-server profiles ---- */
router.get('/servers', (req, res) => res.json(config.listServers()));

router.post('/servers', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  res.json(config.addServer({ name }));
});

router.post('/servers/active', (req, res) => {
  if (mc.status !== 'offline') return res.status(409).json({ error: 'Stop the running server before switching' });
  try { res.json({ ok: true, config: publicConfig(config.setActiveServer(Number(req.body.id))) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.delete('/servers/:id', (req, res) => {
  const id = Number(req.params.id);
  if (mc.status !== 'offline' && id === getConfig().activeServer) {
    return res.status(409).json({ error: 'Stop the running server first' });
  }
  try { res.json(config.removeServer(id)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

const propsFile = () => path.join(serverDir(), 'server.properties');

const { notify, URL_RE } = require('../utils/discord');
const ntfy = require('../utils/ntfy');

const CONFIG_KEYS = ['jarFile', 'javaPath', 'minRam', 'maxRam', 'jvmArgs', 'autoRestart', 'backupKeep', 'discordWebhook', 'ntfyTopic'];

function configPatch(body) {
  const patch = {};
  for (const key of ['jarFile', 'javaPath', 'minRam', 'maxRam', 'jvmArgs', 'discordWebhook', 'ntfyTopic']) {
    if (typeof body[key] === 'string') patch[key] = body[key].trim();
  }
  if (patch.ntfyTopic && !ntfy.TOPIC_RE.test(patch.ntfyTopic)) return { error: 'ntfy topic: letters, numbers, - and _ only (max 64)' };
  if (typeof body.autoRestart === 'boolean') patch.autoRestart = body.autoRestart;
  if (body.backupKeep != null) {
    const n = Number(body.backupKeep);
    if (!Number.isInteger(n) || n < 0 || n > 1000) return { error: 'Backups to keep must be 0-1000 (0 = unlimited)' };
    patch.backupKeep = n;
  }
  if (patch.minRam && !/^\d+[MG]$/i.test(patch.minRam)) return { error: 'Min RAM must look like 1G or 512M' };
  if (patch.maxRam && !/^\d+[MG]$/i.test(patch.maxRam)) return { error: 'Max RAM must look like 2G or 2048M' };
  if (patch.discordWebhook && !URL_RE.test(patch.discordWebhook)) return { error: 'Discord webhook URL looks invalid (must start with https://discord.com/api/webhooks/)' };
  return { patch };
}

// never expose password hash/salt to the client
function publicConfig(cfg) {
  const { passwordHash, passwordSalt, ...rest } = cfg || getConfig();
  return rest;
}

router.get('/export', (req, res) => {
  const cfg = publicConfig();
  res.setHeader('Content-Disposition', 'attachment; filename="mc-dashboard-config.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    config: Object.fromEntries(CONFIG_KEYS.map(k => [k, cfg[k]])),
    properties: readProperties(propsFile()),
    schedules: scheduler.list().map(({ nextRun, lastRun, _hold, ...s }) => s)
  });
});

router.post('/import', (req, res) => {
  const b = req.body || {};
  const result = { config: false, properties: false, schedules: 0, schedulesSkipped: 0, warnings: [] };

  if (b.config && typeof b.config === 'object') {
    const { patch, error } = configPatch(b.config);
    if (error) {
      // don't abort the whole import — skip config, still apply properties & schedules
      result.warnings.push(`Launch settings skipped: ${error}`);
    } else {
      saveConfig(patch);
      result.config = true;
    }
  }
  if (b.properties && typeof b.properties === 'object') {
    const props = {};
    for (const [k, v] of Object.entries(b.properties)) props[String(k)] = String(v);
    writeProperties(propsFile(), props);
    result.properties = true;
  }
  if (Array.isArray(b.schedules)) {
    const cleaned = b.schedules.map(s => ({
      type: s.type === 'interval' ? 'interval' : 'daily',
      time: s.time != null ? String(s.time) : undefined,
      action: s.action,
      command: String(s.command || '').trim(),
      intervalValue: s.intervalValue != null ? Number(s.intervalValue) : undefined,
      intervalUnit: s.intervalUnit,
      warnMinutes: Number(s.warnMinutes || 0),
      enabled: s.enabled !== false,
      onlyWhenEmpty: s.onlyWhenEmpty === true
    }));
    const valid = cleaned.filter(s => !scheduler.validationError(s));
    result.schedulesSkipped = cleaned.length - valid.length;
    result.schedules = valid.length;
    scheduler.replaceAll(valid);
  }
  res.json(result);
});

router.get('/properties', (req, res) => {
  res.json(readProperties(propsFile()));
});

router.put('/properties', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Expected an object of properties' });
  }
  writeProperties(propsFile(), req.body);
  res.json({ ok: true });
});

router.get('/config', (req, res) => {
  res.json(publicConfig());
});

router.put('/config', (req, res) => {
  const { patch, error } = configPatch(req.body);
  if (error) return res.status(400).json({ error });
  saveConfig(patch);
  res.json(publicConfig());
});

router.post('/discord-test', async (req, res) => {
  if (!getConfig().discordWebhook) return res.status(400).json({ error: 'Set and save a webhook URL first' });
  const ok = await notify('👋 Test message from MC Dashboard');
  if (!ok) return res.status(502).json({ error: 'Discord rejected the message — check the URL' });
  res.json({ ok: true });
});

router.post('/ntfy-test', async (req, res) => {
  if (!getConfig().ntfyTopic) return res.status(400).json({ error: 'Set and save an ntfy topic first' });
  const ok = await ntfy.notify('👋 Test message from MC Dashboard', 'MC Dashboard');
  if (!ok) return res.status(502).json({ error: 'ntfy push failed — check the topic name' });
  res.json({ ok: true });
});

// server.properties presets — applied on top of the existing file
const PRESETS = {
  survival: { gamemode: 'survival', difficulty: 'normal', pvp: 'true', hardcore: 'false', 'spawn-monsters': 'true' },
  creative: { gamemode: 'creative', difficulty: 'peaceful', pvp: 'false', 'spawn-monsters': 'false', 'allow-flight': 'true' },
  hardcore: { gamemode: 'survival', difficulty: 'hard', hardcore: 'true', pvp: 'true', 'spawn-monsters': 'true' },
  peaceful: { gamemode: 'survival', difficulty: 'peaceful', pvp: 'false', 'spawn-monsters': 'false' },
  anarchy: { gamemode: 'survival', difficulty: 'hard', pvp: 'true', 'spawn-protection': '0', 'enable-command-block': 'true' }
};

router.get('/presets', (req, res) => {
  res.json(Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, Object.keys(v)])));
});

router.post('/presets/:name', (req, res) => {
  const preset = PRESETS[req.params.name];
  if (!preset) return res.status(404).json({ error: 'Unknown preset' });
  writeProperties(propsFile(), preset);
  res.json({ ok: true, applied: preset });
});

module.exports = router;
