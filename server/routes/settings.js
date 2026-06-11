const express = require('express');
const path = require('path');
const { readProperties, writeProperties } = require('../utils/properties');
const { getConfig, saveConfig, serverDir } = require('../config');
const scheduler = require('../scheduler');

const router = express.Router();

const propsFile = () => path.join(serverDir(), 'server.properties');

const { notify, URL_RE } = require('../utils/discord');

const CONFIG_KEYS = ['jarFile', 'javaPath', 'minRam', 'maxRam', 'jvmArgs', 'autoRestart', 'backupKeep', 'discordWebhook'];

function configPatch(body) {
  const patch = {};
  for (const key of ['jarFile', 'javaPath', 'minRam', 'maxRam', 'jvmArgs', 'discordWebhook']) {
    if (typeof body[key] === 'string') patch[key] = body[key].trim();
  }
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
function publicConfig() {
  const { passwordHash, passwordSalt, ...rest } = getConfig();
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
  const result = { config: false, properties: false, schedules: 0, schedulesSkipped: 0 };

  if (b.config && typeof b.config === 'object') {
    const { patch, error } = configPatch(b.config);
    if (error) return res.status(400).json({ error: `Launch settings: ${error}` });
    saveConfig(patch);
    result.config = true;
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

module.exports = router;
