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
      <div class="tabs" id="stabs">
        <button class="active" data-tab="server">Server</button>
        <button data-tab="properties">Properties</button>
        <button data-tab="security">Security</button>
        <button data-tab="backup">Backup</button>
      </div>
      <div class="stab-panel active" data-panel="server">
        <div class="card">
          <h2>Server profiles</h2>
          <p class="muted" style="margin-bottom:12px">Run several independent servers (e.g. survival and creative) from one dashboard. Switch only while stopped.</p>
          <div id="srv-list"><div class="empty">Loading…</div></div>
          <div class="btn-row" style="margin-top:12px">
            <input id="srv-new-name" placeholder="New profile name…" style="width:200px">
            <button id="srv-add" class="btn-sm">${App.icon('plus', 14)} Add profile</button>
          </div>
        </div>
        <div class="card">
          <h2>Server jar</h2>
          <div id="jar-update"></div>
          <p class="muted" style="margin-bottom:12px">Download a server jar from Paper or Mojang. Server must be stopped.</p>
          <div class="btn-row" style="align-items:flex-end">
            <div class="field" style="margin:0"><label>Type</label>
              <select id="jar-type" style="width:130px"><option value="paper">Paper</option><option value="vanilla">Vanilla</option></select></div>
            <div class="field" style="margin:0"><label>Version</label>
              <select id="jar-version" style="width:150px"><option value="">Loading…</option></select></div>
            <button id="jar-dl" class="btn-primary">${App.icon('download', 14)} Download</button>
          </div>
          <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
            <span class="muted" style="font-size:12px">Version not listed?</span>
            <input id="jar-custom" placeholder="e.g. 26.1.2" style="width:120px;font-size:13px">
            <span class="muted" style="font-size:12px">(overrides the dropdown)</span>
          </div>
          <div class="hint muted" id="jar-note" style="margin-top:8px"></div>
        </div>
        <div class="card">
          <h2>Launch settings</h2>
          <div class="form-grid" id="cfg-grid">
            <div class="field"><label>Server jar file</label><input id="cfg-jarFile"></div>
            <div class="field"><label>Java path</label><input id="cfg-javaPath"><div class="hint">"java" if it's on PATH</div></div>
            <div class="field"><label>Min RAM</label><input id="cfg-minRam" placeholder="1G"><div class="hint">e.g. 1G or 512M</div></div>
            <div class="field"><label>Max RAM</label><input id="cfg-maxRam" placeholder="4G"><div class="hint">e.g. 2G or 4G</div></div>
            <div class="field"><label>Backups to keep</label><input type="number" id="cfg-backupKeep" min="0" max="1000"><div class="hint">oldest deleted first; 0 = unlimited</div></div>
            <div class="field"><label>Auto-restart on crash</label>
              <label style="display:flex;align-items:center;gap:10px;padding:8px 0">
                <span class="switch"><input type="checkbox" id="cfg-autoRestart"><span class="track" onclick="document.getElementById('cfg-autoRestart').click()"></span></span>
                <span class="muted" style="font-size:12px">up to 3 tries</span>
              </label>
            </div>
            <div class="field" style="grid-column:1/-1"><label>Extra JVM arguments</label><input id="cfg-jvmArgs" placeholder="-XX:+UseG1GC …"></div>
            <div class="field" style="grid-column:1/-1">
              <label>Discord webhook <span class="muted" style="font-weight:400">— start/stop/crash, joins, backups</span></label>
              <div style="display:flex;gap:8px">
                <input id="cfg-discordWebhook" placeholder="https://discord.com/api/webhooks/… (empty = off)">
                <button id="cfg-discord-test" class="btn-sm" style="flex-shrink:0">Test</button>
              </div>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>ntfy.sh topic <span class="muted" style="font-weight:400">— free phone push notifications</span></label>
              <div style="display:flex;gap:8px">
                <input id="cfg-ntfyTopic" placeholder="my-mc-server-a1b2 (empty = off)">
                <button id="cfg-ntfy-test" class="btn-sm" style="flex-shrink:0">Test</button>
              </div>
            </div>
          </div>
          <button id="cfg-save" class="btn-primary">Save launch settings</button>
        </div>
      </div>
      <div class="stab-panel" data-panel="properties">
        <div class="card">
          <h2>MOTD <span class="muted" style="font-weight:400;font-size:12px">— shown in the server list</span></h2>
          <div id="motd-toolbar" class="motd-toolbar"></div>
          <input id="motd-input" type="text" maxlength="120" placeholder="A Minecraft Server" style="font-family:var(--mono);margin-top:6px;width:100%">
          <div class="motd-preview-box" style="margin-top:10px">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <img src="/icon.svg" style="width:40px;height:40px;border-radius:4px;flex-shrink:0;image-rendering:pixelated" onerror="this.style.display='none'" alt="">
              <div style="flex:1;min-width:0">
                <div style="color:#fff;font-size:13px;margin-bottom:3px">Minecraft Server</div>
                <div id="motd-rendered" style="font-size:12px;line-height:1.5;min-height:1.5em"></div>
              </div>
              <div style="color:#55ff55;font-size:11px;flex-shrink:0">1ms ✔</div>
            </div>
          </div>
          <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
            <button id="motd-save" class="btn-primary btn-sm">Save MOTD</button>
            <span id="motd-msg" class="muted" style="font-size:12px"></span>
          </div>
        </div>
        <div class="card">
          <div class="card-title-row">
            <h2>server.properties</h2>
            <div class="btn-row" style="margin:0">
              <span class="muted" style="font-size:12px">Quick preset:</span>
              <select id="props-preset" style="width:160px"><option value="">Choose…</option></select>
              <button id="props-preset-apply" class="btn-sm">Apply</button>
            </div>
          </div>
          <div id="props-box"><div class="empty">Loading…</div></div>
          <div class="btn-row" style="margin-top:14px">
            <button id="props-save" class="btn-primary">Save properties</button>
            <span class="muted" style="align-self:center" id="props-note"></span>
          </div>
        </div>
      </div>
      <div class="stab-panel" data-panel="security">
        <div class="card" id="tfa-card">
          <h2>Two-factor authentication (2FA)</h2>
          <p class="muted" style="margin-bottom:12px">Adds a 6-digit code from your phone on top of your password. Strongly recommended before exposing the dashboard to the internet.</p>
          <div id="tfa-body"><div class="empty">Loading…</div></div>
        </div>
        <div class="card">
          <h2>Remote access — Cloudflare Tunnel</h2>
          <p class="muted" style="margin-bottom:12px">Opens a secure public HTTPS URL so you can reach this dashboard from anywhere — no account or port forwarding needed. Enable 2FA above first.</p>
          <div id="cf-action"><div class="empty">Loading…</div></div>
          <div id="cf-url-row" style="display:none;margin-top:10px"></div>
          <div id="cf-log" class="console console-mini" style="margin-top:12px;display:none"></div>
        </div>
        <div class="card">
          <h2>Change password</h2>
          <div style="display:flex;flex-direction:column;gap:10px;max-width:400px;margin-bottom:12px">
            <div class="field" style="margin:0"><label>Current password</label><input type="password" id="pw-current" autocomplete="current-password"></div>
            <div class="field" style="margin:0"><label>New password</label><input type="password" id="pw-new" autocomplete="new-password"></div>
            <div class="field" style="margin:0"><label>Confirm new password</label><input type="password" id="pw-new2" autocomplete="new-password"></div>
          </div>
          <button id="pw-save" class="btn-primary">Change password</button>
          <span id="pw-msg" class="muted" style="margin-left:12px;font-size:13px"></span>
        </div>
      </div>
      <div class="stab-panel" data-panel="backup">
        <div class="card">
          <h2>Backup & restore configuration</h2>
          <p class="muted" style="margin-bottom:12px">Exports launch settings, server.properties and schedules as one JSON file. Import it on another machine to restore everything.</p>
          <div class="btn-row">
            <a class="btn" href="/api/settings/export">${App.icon('download', 14)} Export config</a>
            <button id="cfg-import-btn">${App.icon('upload', 14)} Import config…</button>
            <input type="file" id="cfg-import-file" accept=".json,application/json" style="display:none">
          </div>
        </div>
      </div>`;

    el.querySelectorAll('#stabs button').forEach(btn => {
      btn.onclick = () => {
        el.querySelectorAll('#stabs button').forEach(b => b.classList.remove('active'));
        el.querySelectorAll('.stab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        el.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.add('active');
      };
    });

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
    this.init2fa();
    this.initCloudflare();
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

    document.getElementById('pw-save').onclick = async () => {
      const current = document.getElementById('pw-current').value;
      const next = document.getElementById('pw-new').value;
      const next2 = document.getElementById('pw-new2').value;
      const msg = document.getElementById('pw-msg');
      msg.textContent = '';
      if (!current || !next) return App.toast('Fill in all password fields', true);
      if (next !== next2) return App.toast('New passwords do not match', true);
      if (next.length < 6) return App.toast('New password must be at least 6 characters', true);
      const r = await App.tryApi('/auth/change-password', { method: 'POST', body: { current, next } }, null);
      if (r) {
        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
        document.getElementById('pw-new2').value = '';
        msg.textContent = '✓ Password changed';
        setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
        App.toast('Password changed');
      }
    };

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
        if (r.warnings && r.warnings.length) r.warnings.forEach(w => App.toast(w, true));
        this.render(document.getElementById('content'));
      }
    };

    this.props = await App.tryApi('/settings/properties');
    this.renderProps();
    this.initMotdEditor();

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

  async init2fa() {
    const status = await App.tryApi('/auth/status');
    if (!status) return;
    this.renderTfa(status.totp);
  },

  renderTfa(enabled) {
    const box = document.getElementById('tfa-body');
    if (!box) return;
    if (enabled) {
      box.innerHTML = `
        <p class="chip chip-green" style="display:inline-block;margin-bottom:12px">✓ Two-factor is ON</p>
        <p class="muted" style="margin-bottom:10px">To turn it off, confirm your password:</p>
        <div class="btn-row">
          <input type="password" id="tfa-pw" placeholder="Your dashboard password" autocomplete="current-password">
          <button id="tfa-disable" class="btn-danger btn-sm">Turn off 2FA</button>
        </div>`;
      document.getElementById('tfa-disable').onclick = async () => {
        const password = document.getElementById('tfa-pw').value;
        if (!password) return App.toast('Enter your password', true);
        if (await App.tryApi('/auth/2fa/disable', { method: 'POST', body: { password } }, 'Two-factor turned off')) {
          this.renderTfa(false);
        }
      };
    } else {
      box.innerHTML = `<button id="tfa-enable" class="btn-primary">Enable two-factor</button>`;
      document.getElementById('tfa-enable').onclick = () => this.startTfaEnroll();
    }
  },

  async startTfaEnroll() {
    const data = await App.tryApi('/auth/2fa/setup', { method: 'POST' });
    if (!data) return;
    const box = document.getElementById('tfa-body');
    box.innerHTML = `
      <ol class="tfa-steps" style="padding-left:18px;margin:0 0 12px">
        <li style="margin-bottom:10px">Install an authenticator app (Google Authenticator, Authy, Microsoft Authenticator…).</li>
        <li style="margin-bottom:10px">Add an account — scan this QR code${data.qr ? '' : ' (or enter the key below)'}:
          ${data.qr ? `<div style="margin:10px 0"><img class="tfa-qr" src="${data.qr}" alt="2FA QR code"></div>` : ''}
          <div class="muted" style="margin:6px 0">Can’t scan? Enter this key by hand:<br><span class="tfa-key">${App.esc(data.secret)}</span></div>
        </li>
        <li>Enter the 6-digit code it shows to finish:</li>
      </ol>
      <div class="btn-row">
        <input id="tfa-code" inputmode="numeric" maxlength="6" placeholder="6-digit code" style="width:140px">
        <button id="tfa-confirm" class="btn-primary btn-sm">Confirm & enable</button>
        <button id="tfa-cancel" class="btn-sm">Cancel</button>
      </div>`;
    document.getElementById('tfa-confirm').onclick = async () => {
      const code = document.getElementById('tfa-code').value.trim();
      if (!/^\d{6}$/.test(code)) return App.toast('Enter the 6-digit code', true);
      if (await App.tryApi('/auth/2fa/enable', { method: 'POST', body: { code } }, 'Two-factor is now ON 🎉')) {
        this.renderTfa(true);
      }
    };
    document.getElementById('tfa-cancel').onclick = () => this.renderTfa(false);
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
      const custom = document.getElementById('jar-custom').value.trim();
      const version = custom || verSel.value;
      if (!version) return App.toast('Select or enter a version', true);
      btn.disabled = true;
      btn.textContent = 'Downloading…';
      note.textContent = 'This can take a minute depending on your connection.';
      const r = await App.tryApi('/jars/download', {
        method: 'POST',
        body: { type: typeSel.value, version }
      }, null);
      btn.disabled = false;
      btn.innerHTML = `${App.icon('download', 14)} Download`;
      if (r) {
        note.textContent = `Done — ${typeSel.value} ${version} saved as server.jar (${App.fmtBytes(r.size)}).`;
        App.toast('Server jar installed');
        document.getElementById('cfg-jarFile').value = r.jarFile;
        document.getElementById('jar-custom').value = '';
      } else if (typeSel.value === 'paper') {
        note.innerHTML = `Paper doesn't have a build for ${App.esc(version)} yet. <a href="#" id="jar-switch-vanilla">Download Vanilla ${App.esc(version)} instead →</a>`;
        const link = document.getElementById('jar-switch-vanilla');
        if (link) link.onclick = (e) => {
          e.preventDefault();
          typeSel.value = 'vanilla';
          fill();
          document.getElementById('jar-custom').value = version;
          note.textContent = `Ready — click Download to get Vanilla ${version}.`;
        };
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
  },

  initMotdEditor() {
    const toolbar = document.getElementById('motd-toolbar');
    const input = document.getElementById('motd-input');
    if (!toolbar || !input) return;
    const COLORS = [['0','#000'],['1','#00A'],['2','#0A0'],['3','#0AA'],['4','#A00'],['5','#A0A'],['6','#FA0'],['7','#AAA'],['8','#555'],['9','#55F'],['a','#5F5'],['b','#5FF'],['c','#F55'],['d','#F5F'],['e','#FF5'],['f','#FFF']];
    const FMTS = [['l','B'],['o','I'],['m','S'],['n','U'],['r','R']];
    const insert = (code) => {
      const s = input.selectionStart, e = input.selectionEnd, v = input.value;
      input.value = v.slice(0, s) + '§' + code + v.slice(e);
      input.selectionStart = input.selectionEnd = s + 2;
      input.focus(); this.renderMotd(input.value);
    };
    toolbar.innerHTML =
      COLORS.map(([c, h]) => `<button class="motd-clr" title="§${c}" style="background:${h}" data-code="${c}"></button>`).join('') +
      FMTS.map(([c, l]) => `<button class="motd-fmt btn-sm" data-code="${c}">${l}</button>`).join('');
    toolbar.querySelectorAll('[data-code]').forEach(b => b.onclick = () => insert(b.dataset.code));
    input.oninput = () => this.renderMotd(input.value);
    if (this.props && this.props.motd != null) { input.value = this.props.motd; this.renderMotd(this.props.motd); }
    document.getElementById('motd-save').onclick = async () => {
      const msg = document.getElementById('motd-msg');
      if (await App.tryApi('/settings/properties', { method: 'PUT', body: { motd: input.value } }, null)) {
        msg.textContent = '✓ Saved'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000);
      }
    };
  },

  renderMotd(raw) {
    const box = document.getElementById('motd-rendered');
    if (!box) return;
    const C = {'0':'#000','1':'#00A','2':'#0A0','3':'#0AA','4':'#A00','5':'#A0A','6':'#FA0','7':'#AAA','8':'#555','9':'#55F','a':'#5F5','b':'#5FF','c':'#F55','d':'#F5F','e':'#FF5','f':'#FFF'};
    let color = '#AAA', bold = false, italic = false, strike = false, under = false, html = '';
    for (const part of raw.replace(/\\n/g, '\n').split(/(§.)/)) {
      if (/^§.$/.test(part)) {
        const c = part[1].toLowerCase();
        if (C[c]) { color = C[c]; bold = italic = strike = under = false; }
        else if (c === 'l') bold = true;
        else if (c === 'o') italic = true;
        else if (c === 'm') strike = true;
        else if (c === 'n') under = true;
        else if (c === 'r') { color = '#AAA'; bold = italic = strike = under = false; }
      } else if (part) {
        const td = (strike ? 'line-through' : '') + (under ? ' underline' : '');
        html += part === '\n' ? '<br>' : `<span style="color:${color}${bold?';font-weight:bold':''}${italic?';font-style:italic':''}${td?';text-decoration:'+td.trim():''}">${App.esc(part)}</span>`;
      }
    }
    box.innerHTML = html || `<span class="muted">No MOTD set</span>`;
  },

  async initCloudflare() {
    const s = await App.tryApi('/cloudflare/status');
    if (s) this.renderCfStatus(s);
  },

  renderCfStatus(s) {
    const action = document.getElementById('cf-action');
    const urlRow = document.getElementById('cf-url-row');
    const logBox = document.getElementById('cf-log');
    if (!action) return;
    if (s.status === 'running') {
      action.innerHTML = `<button id="cf-stop" class="btn-danger">Turn off</button>`;
      document.getElementById('cf-stop').onclick = () => App.tryApi('/cloudflare/stop', { method: 'POST' });
      if (s.url && urlRow) {
        urlRow.style.display = '';
        urlRow.innerHTML = `<p class="muted" style="margin-bottom:6px">Share this URL to access your dashboard remotely:</p>
          <div class="tn-addr"><code>${App.esc(s.url)}</code><button class="btn-sm" id="cf-copy">Copy</button></div>`;
        document.getElementById('cf-copy').onclick = () =>
          navigator.clipboard.writeText(s.url).then(() => App.toast('URL copied'));
      }
    } else if (s.status === 'starting') {
      action.innerHTML = `<p class="muted"><span class="tn-spin"></span> Starting tunnel…</p>
        <button id="cf-stop" class="btn-danger" style="margin-top:8px">Cancel</button>`;
      document.getElementById('cf-stop').onclick = () => App.tryApi('/cloudflare/stop', { method: 'POST' });
      if (urlRow) urlRow.style.display = 'none';
    } else {
      action.innerHTML = `<button id="cf-start" class="btn-primary">${App.icon('globe', 14)} Enable remote access</button>
        <p class="hint muted" style="margin-top:8px">First start downloads cloudflared (~30 MB). The URL changes each restart.</p>`;
      document.getElementById('cf-start').onclick = () => App.tryApi('/cloudflare/start', { method: 'POST' });
      if (urlRow) urlRow.style.display = 'none';
    }
    if (logBox && s.log) {
      logBox.style.display = s.log.length ? '' : 'none';
      logBox.innerHTML = s.log.map(l => App.logLineHtml(l)).join('');
      logBox.scrollTop = logBox.scrollHeight;
    }
  },

  onCfLog(line) {
    const box = document.getElementById('cf-log');
    if (!box) return;
    box.style.display = '';
    box.insertAdjacentHTML('beforeend', App.logLineHtml(line));
    box.scrollTop = box.scrollHeight;
  },

  onCfUpdate(u) { this.renderCfStatus(u); }
};
