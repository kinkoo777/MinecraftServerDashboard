/* Property metadata: category, type, options, description. Unknown keys land in "Other". */
const PROP_META = {
  'motd':                       { cat: 'General', desc: 'Message shown in the server list' },
  'max-players':                { cat: 'General', type: 'number', desc: 'Maximum simultaneous players' },
  'white-list':                 { cat: 'General', type: 'bool', desc: 'Only whitelisted players can join' },
  'enforce-whitelist':          { cat: 'General', type: 'bool', desc: 'Kick non-whitelisted players when whitelist is reloaded' },
  'online-mode':                { cat: 'General', type: 'bool', desc: 'Verify players against Mojang servers (disable for offline/cracked)' },
  'pvp':                        { cat: 'Gameplay', type: 'bool', desc: 'Allow players to fight each other' },
  'gamemode':                   { cat: 'Gameplay', type: 'enum', options: ['survival', 'creative', 'adventure', 'spectator'], desc: 'Default game mode' },
  'force-gamemode':             { cat: 'Gameplay', type: 'bool', desc: 'Force default game mode on join' },
  'difficulty':                 { cat: 'Gameplay', type: 'enum', options: ['peaceful', 'easy', 'normal', 'hard'], desc: 'World difficulty' },
  'hardcore':                   { cat: 'Gameplay', type: 'bool', desc: 'Hardcore mode — death is permanent' },
  'allow-flight':               { cat: 'Gameplay', type: 'bool', desc: 'Allow survival flight (needed by some mods)' },
  'spawn-monsters':             { cat: 'Gameplay', type: 'bool', desc: 'Hostile mobs spawn' },
  'spawn-animals':              { cat: 'Gameplay', type: 'bool', desc: 'Animals spawn' },
  'spawn-npcs':                 { cat: 'Gameplay', type: 'bool', desc: 'Villagers spawn' },
  'enable-command-block':       { cat: 'Gameplay', type: 'bool', desc: 'Command blocks work' },
  'player-idle-timeout':        { cat: 'Gameplay', type: 'number', desc: 'Kick idle players after N minutes (0 = never)' },
  'spawn-protection':           { cat: 'Gameplay', type: 'number', desc: 'Radius around spawn only ops can edit' },
  'level-name':                 { cat: 'World', desc: 'World folder name' },
  'level-seed':                 { cat: 'World', desc: 'World generation seed (blank = random)' },
  'level-type':                 { cat: 'World', type: 'enum', options: ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'], desc: 'World generator type' },
  'generate-structures':        { cat: 'World', type: 'bool', desc: 'Generate villages, temples, etc.' },
  'allow-nether':               { cat: 'World', type: 'bool', desc: 'Nether dimension enabled' },
  'max-world-size':             { cat: 'World', type: 'number', desc: 'World border radius limit' },
  'server-port':                { cat: 'Network', type: 'number', desc: 'Port the server listens on' },
  'server-ip':                  { cat: 'Network', desc: 'Bind to a specific IP (blank = all)' },
  'enable-query':               { cat: 'Network', type: 'bool', desc: 'GameSpy4 query protocol' },
  'enable-rcon':                { cat: 'Network', type: 'bool', desc: 'Remote console protocol' },
  'rcon.port':                  { cat: 'Network', type: 'number', desc: 'RCON port' },
  'rcon.password':              { cat: 'Network', desc: 'RCON password' },
  'prevent-proxy-connections':  { cat: 'Network', type: 'bool', desc: 'Block players connecting through proxies/VPNs' },
  'rate-limit':                 { cat: 'Network', type: 'number', desc: 'Max packets per second per player (0 = off)' },
  'hide-online-players':        { cat: 'Network', type: 'bool', desc: 'Hide the player list from server pings' },
  'enforce-secure-profile':     { cat: 'Network', type: 'bool', desc: 'Require Mojang-signed chat (disable for offline mode)' },
  'view-distance':              { cat: 'Performance', type: 'number', desc: 'Chunk render distance sent to clients' },
  'simulation-distance':        { cat: 'Performance', type: 'number', desc: 'Chunk distance where entities tick' },
  'network-compression-threshold': { cat: 'Performance', type: 'number', desc: 'Compress packets above this size (-1 = off)' },
  'max-tick-time':              { cat: 'Performance', type: 'number', desc: 'Watchdog: ms before server is considered crashed' },
  'sync-chunk-writes':          { cat: 'Performance', type: 'bool', desc: 'Safer but slower chunk saving' },
  'entity-broadcast-range-percentage': { cat: 'Performance', type: 'number', desc: 'How far entities are visible (%)' },
  'pause-when-empty-seconds':   { cat: 'Performance', type: 'number', desc: 'Pause the server when empty for N seconds' }
};

const PROP_CATS = ['General', 'Gameplay', 'World', 'Network', 'Performance', 'Other'];

App.pages.settings = {
  props: null,

  async render(el) {
    el.innerHTML = `
      <div class="page-head"><h1>Settings</h1></div>
      <div class="card">
        <h2>Server profiles</h2>
        <p class="muted" style="margin-bottom:12px">Run several independent servers (e.g. survival and creative) from one dashboard. Each profile has its own folder, jar and settings. Switch only while the server is stopped.</p>
        <div id="srv-list"><div class="empty">Loading…</div></div>
        <div class="btn-row" style="margin-top:12px">
          <input id="srv-new-name" placeholder="New profile name…" style="width:200px">
          <button id="srv-add" class="btn-sm">${App.icon('plus', 14)} Add profile</button>
        </div>
      </div>
      <div class="card">
        <h2>Server jar</h2>
        <div id="jar-update"></div>
        <p class="muted" style="margin-bottom:12px">Download a ready-to-run server jar straight from Paper or Mojang. The server must be stopped.</p>
        <div class="btn-row" style="align-items:flex-end">
          <div class="field" style="margin:0"><label>Type</label>
            <select id="jar-type" style="width:130px"><option value="paper">Paper</option><option value="vanilla">Vanilla</option></select></div>
          <div class="field" style="margin:0"><label>Version</label>
            <select id="jar-version" style="width:150px"><option value="">Loading…</option></select></div>
          <button id="jar-dl" class="btn-primary">${App.icon('download', 14)} Download</button>
        </div>
        <div class="hint muted" id="jar-note" style="margin-top:8px"></div>
      </div>
      <div class="card">
        <h2>Launch settings</h2>
        <div class="form-grid" id="cfg-grid">
          <div class="field"><label>Server jar file</label><input id="cfg-jarFile"></div>
          <div class="field"><label>Java path</label><input id="cfg-javaPath"><div class="hint">"java" if it's on PATH</div></div>
          <div class="field"><label>Min RAM</label><input id="cfg-minRam"><div class="hint">e.g. 1G or 512M</div></div>
          <div class="field"><label>Max RAM</label><input id="cfg-maxRam"><div class="hint">e.g. 4G</div></div>
          <div class="field"><label>Backups to keep</label><input type="number" id="cfg-backupKeep" min="0" max="1000"><div class="hint">oldest are deleted; 0 = unlimited</div></div>
          <div class="field"><label>Auto-restart on crash</label>
            <label style="display:flex;align-items:center;gap:10px;padding:8px 0">
              <span class="switch"><input type="checkbox" id="cfg-autoRestart"><span class="track" onclick="document.getElementById('cfg-autoRestart').click()"></span></span>
              <span class="muted" style="font-size:12px">up to 3 tries</span>
            </label>
          </div>
          <div class="field" style="grid-column:1/-1"><label>Extra JVM arguments</label><input id="cfg-jvmArgs" placeholder="-XX:+UseG1GC …"></div>
          <div class="field" style="grid-column:1/-1"><label>Discord webhook — notifies on start/stop/crash, joins and backups</label>
            <div style="display:flex;gap:8px">
              <input id="cfg-discordWebhook" placeholder="https://discord.com/api/webhooks/… (empty = off)">
              <button id="cfg-discord-test" class="btn-sm" style="flex-shrink:0">Test</button>
            </div>
          </div>
          <div class="field" style="grid-column:1/-1"><label>ntfy.sh topic — free phone push notifications (install the ntfy app, subscribe to this topic)</label>
            <div style="display:flex;gap:8px">
              <input id="cfg-ntfyTopic" placeholder="my-mc-server-a1b2 (empty = off)">
              <button id="cfg-ntfy-test" class="btn-sm" style="flex-shrink:0">Test</button>
            </div>
          </div>
        </div>
        <button id="cfg-save" class="btn-primary">Save launch settings</button>
      </div>
      <div class="card">
        <h2>Backup & restore configuration</h2>
        <p class="muted" style="margin-bottom:12px">Exports launch settings, server.properties and all schedules as one JSON file — import it on another machine (or after a reinstall) to restore everything.</p>
        <div class="btn-row">
          <a class="btn" href="/api/settings/export">${App.icon('download', 14)} Export config</a>
          <button id="cfg-import-btn">${App.icon('upload', 14)} Import config…</button>
          <input type="file" id="cfg-import-file" accept=".json,application/json" style="display:none">
        </div>
      </div>
      <div class="card">
        <h2>server.properties</h2>
        <div class="btn-row" style="margin-bottom:14px;align-items:center">
          <span class="muted" style="font-size:12px">Quick preset:</span>
          <select id="props-preset" style="width:170px"><option value="">Choose…</option></select>
          <button id="props-preset-apply" class="btn-sm">Apply preset</button>
        </div>
        <div id="props-box"><div class="empty">Loading…</div></div>
        <div class="btn-row" style="margin-top:14px">
          <button id="props-save" class="btn-primary">Save properties</button>
          <span class="muted" style="align-self:center" id="props-note"></span>
        </div>
      </div>`;

    const cfg = await App.tryApi('/settings/config');
    if (cfg) {
      for (const k of ['jarFile', 'javaPath', 'minRam', 'maxRam', 'jvmArgs', 'discordWebhook', 'ntfyTopic']) {
        document.getElementById(`cfg-${k}`).value = cfg[k] || '';
      }
      document.getElementById('cfg-backupKeep').value = cfg.backupKeep ?? 10;
      document.getElementById('cfg-autoRestart').checked = cfg.autoRestart !== false;
    }
    this.loadServers();
    this.loadPresets();
    this.checkUpdate();
    document.getElementById('cfg-save').onclick = async () => {
      const body = {};
      for (const k of ['jarFile', 'javaPath', 'minRam', 'maxRam', 'jvmArgs', 'discordWebhook', 'ntfyTopic']) {
        body[k] = document.getElementById(`cfg-${k}`).value;
      }
      body.backupKeep = Number(document.getElementById('cfg-backupKeep').value);
      body.autoRestart = document.getElementById('cfg-autoRestart').checked;
      await App.tryApi('/settings/config', { method: 'PUT', body }, 'Launch settings saved');
    };
    document.getElementById('cfg-discord-test').onclick = () =>
      App.tryApi('/settings/discord-test', { method: 'POST' }, 'Test message sent — check Discord');
    document.getElementById('cfg-ntfy-test').onclick = () =>
      App.tryApi('/settings/ntfy-test', { method: 'POST' }, 'Test push sent — check the ntfy app');

    document.getElementById('srv-add').onclick = async () => {
      const name = document.getElementById('srv-new-name').value.trim();
      if (!name) return App.toast('Enter a profile name', true);
      if (await App.tryApi('/settings/servers', { method: 'POST', body: { name } }, 'Profile added')) {
        document.getElementById('srv-new-name').value = '';
        this.loadServers();
      }
    };

    document.getElementById('props-preset-apply').onclick = async () => {
      const name = document.getElementById('props-preset').value;
      if (!name) return;
      if (!confirm(`Apply the "${name}" preset to server.properties? This overwrites the related keys.`)) return;
      if (await App.tryApi(`/settings/presets/${name}`, { method: 'POST' }, 'Preset applied')) {
        this.props = await App.tryApi('/settings/properties');
        this.renderProps();
      }
    };

    this.initJarDownloader();

    document.getElementById('cfg-import-btn').onclick = () => document.getElementById('cfg-import-file').click();
    document.getElementById('cfg-import-file').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let body;
      try { body = JSON.parse(await file.text()); } catch (err) {
        return App.toast('Not a valid JSON file', true);
      }
      const r = await App.tryApi('/settings/import', { method: 'POST', body });
      if (r) {
        const parts = [];
        if (r.config) parts.push('launch settings');
        if (r.properties) parts.push('server.properties');
        if (r.schedules) parts.push(`${r.schedules} schedule(s)`);
        App.toast(parts.length ? `Imported: ${parts.join(', ')}${r.schedulesSkipped ? ` (${r.schedulesSkipped} invalid skipped)` : ''}` : 'File contained nothing to import');
        this.render(document.getElementById('content'));
      }
    };

    this.props = await App.tryApi('/settings/properties');
    this.renderProps();

    document.getElementById('props-save').onclick = () => this.saveProps();
  },

  async loadServers() {
    const box = document.getElementById('srv-list');
    if (!box) return;
    const servers = await App.tryApi('/settings/servers');
    if (!servers) return;
    const offline = App.status === 'offline';
    box.innerHTML = servers.map(s => `
      <div class="srv-row ${s.active ? 'active' : ''}">
        ${App.icon('server', 16)}
        <div class="srv-info"><div class="srv-name">${App.esc(s.name)}${s.active ? ' <span class="chip chip-green">active</span>' : ''}</div>
          <div class="muted" style="font-size:11px">${App.esc(s.serverDir)} · ${App.esc(s.jarFile)}</div></div>
        <div class="btn-row">
          ${s.active ? '' : `<button class="btn-sm" data-switch="${s.id}" ${offline ? '' : 'disabled title="Stop the server first"'}>Switch to</button>`}
          ${servers.length > 1 ? `<button class="btn-icon btn-danger" data-del="${s.id}" title="Delete profile">${App.icon('trash', 14)}</button>` : ''}
        </div>
      </div>`).join('');
    box.querySelectorAll('[data-switch]').forEach(b => {
      b.onclick = async () => {
        if (await App.tryApi('/settings/servers/active', { method: 'POST', body: { id: Number(b.dataset.switch) } }, 'Switched server — reloading')) {
          setTimeout(() => location.reload(), 600);
        }
      };
    });
    box.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Delete this profile? The server files on disk are NOT deleted, only the profile entry.')) return;
        if (await App.tryApi(`/settings/servers/${b.dataset.del}`, { method: 'DELETE' }, 'Profile deleted')) this.loadServers();
      };
    });
  },

  async loadPresets() {
    const sel = document.getElementById('props-preset');
    const presets = await App.tryApi('/settings/presets');
    if (!presets || !sel) return;
    const labels = { survival: 'Survival', creative: 'Creative', hardcore: 'Hardcore', peaceful: 'Peaceful build', anarchy: 'Anarchy' };
    sel.innerHTML = '<option value="">Choose…</option>' +
      Object.keys(presets).map(k => `<option value="${k}">${labels[k] || k}</option>`).join('');
  },

  async checkUpdate() {
    const box = document.getElementById('jar-update');
    if (!box) return;
    let info;
    try { info = await App.api('/jars/check'); } catch (e) { return; }
    if (!info || !info.installed) return;
    if (info.updateAvailable) {
      box.innerHTML = `<div class="notice" style="margin-bottom:12px"><span class="notice-text">Update available: ${App.esc(info.type)} <b>${App.esc(info.latest)}</b> (you have ${App.esc(info.version)}). Pick it below and download — the server must be stopped.</span></div>`;
    } else {
      box.innerHTML = `<p class="muted" style="margin-bottom:12px">✓ ${App.esc(info.installed)} is up to date.</p>`;
    }
  },

  async initJarDownloader() {
    const typeSel = document.getElementById('jar-type');
    const verSel = document.getElementById('jar-version');
    const note = document.getElementById('jar-note');
    const btn = document.getElementById('jar-dl');

    const versions = await App.tryApi('/jars/versions');
    if (!versions) {
      if (verSel) verSel.innerHTML = '<option value="">unavailable</option>';
      return;
    }
    const fill = () => {
      if (!verSel) return;
      verSel.innerHTML = versions[typeSel.value].map(v => `<option>${App.esc(v)}</option>`).join('');
    };
    typeSel.onchange = fill;
    fill();

    btn.onclick = async () => {
      if (!verSel.value) return;
      btn.disabled = true;
      btn.textContent = 'Downloading…';
      note.textContent = 'This can take a minute depending on your connection.';
      const r = await App.tryApi('/jars/download', {
        method: 'POST',
        body: { type: typeSel.value, version: verSel.value }
      }, null);
      btn.disabled = false;
      btn.innerHTML = `${App.icon('download', 14)} Download`;
      if (r) {
        note.textContent = `Done — ${typeSel.value} ${verSel.value} saved as server.jar (${App.fmtBytes(r.size)}).`;
        App.toast('Server jar installed');
        document.getElementById('cfg-jarFile').value = r.jarFile;
      } else {
        note.textContent = '';
      }
    };
  },

  renderProps() {
    const box = document.getElementById('props-box');
    if (!this.props || Object.keys(this.props).length === 0) {
      box.innerHTML = `<div class="empty">No server.properties yet — it appears after the first server start.</div>`;
      return;
    }

    const groups = {};
    for (const cat of PROP_CATS) groups[cat] = [];
    for (const [key, value] of Object.entries(this.props)) {
      const meta = PROP_META[key] || {};
      groups[meta.cat || 'Other'].push({ key, value, meta });
    }

    box.innerHTML = PROP_CATS.filter(c => groups[c].length).map(cat => `
      <div class="settings-group">
        <h2>${cat}</h2>
        ${groups[cat].map(({ key, value, meta }) => `
          <div class="prop-row">
            <div class="prop-info">
              <div class="prop-key">${App.esc(key)}</div>
              ${meta.desc ? `<div class="prop-desc">${meta.desc}</div>` : ''}
            </div>
            <div class="prop-control">${this.control(key, value, meta)}</div>
          </div>`).join('')}
      </div>`).join('');
  },

  control(key, value, meta) {
    const id = `prop-${key.replace(/\./g, '_')}`;
    const e = App.esc(value);
    if (meta.type === 'bool' || value === 'true' || value === 'false') {
      return `<span class="switch"><input type="checkbox" id="${id}" data-prop="${App.esc(key)}" data-type="bool" ${value === 'true' ? 'checked' : ''}><span class="track" onclick="document.getElementById('${id}').click()"></span></span>`;
    }
    if (meta.type === 'enum') {
      const opts = meta.options.map(o =>
        `<option value="${o}" ${o === value ? 'selected' : ''}>${o.replace('minecraft:', '')}</option>`).join('');
      return `<select id="${id}" data-prop="${App.esc(key)}">${opts}</select>`;
    }
    if (meta.type === 'number' || /^-?\d+$/.test(value)) {
      return `<input type="number" id="${id}" data-prop="${App.esc(key)}" value="${e}">`;
    }
    return `<input id="${id}" data-prop="${App.esc(key)}" value="${e}">`;
  },

  async saveProps() {
    const body = {};
    document.querySelectorAll('[data-prop]').forEach(el => {
      body[el.dataset.prop] = el.dataset.type === 'bool' ? String(el.checked) : el.value;
    });
    if (await App.tryApi('/settings/properties', { method: 'PUT', body }, 'Properties saved')) {
      document.getElementById('props-note').textContent =
        App.status === 'online' ? 'Restart the server to apply changes.' : '';
    }
  }
};
