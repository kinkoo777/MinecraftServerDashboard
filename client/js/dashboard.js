App.pages.dashboard = {
  chartTab: 'players',
  overview: { history: [], recent: [] },
  refreshTimer: null,
  editMode: false,
  connectInfo: null,

  // The movable content sections, in default order. `stats` is the tile row;
  // `activity` and `recent` are independent full-width cards.
  SECTIONS: [
    { id: 'controls', title: 'Server controls' },
    { id: 'connect',  title: 'How to connect' },
    { id: 'stats',    title: 'Stats' },
    { id: 'activity', title: 'Activity chart' },
    { id: 'recent',   title: 'Recent players' },
    { id: 'console',  title: 'Console' }
  ],

  // HTML body for each section id (without the movable wrapper).
  sectionInner() {
    return {
      controls: `
        <div class="card">
          <div class="btn-row">
            <button id="db-start" class="btn-primary">${App.icon('play', 14)} Start</button>
            <button id="db-stop" class="btn-danger">${App.icon('stop', 14)} Stop</button>
            <button id="db-restart">${App.icon('restart', 14)} Restart</button>
          </div>
        </div>`,
      connect: `
        <div class="card" id="db-connect">
          <div class="card-title-row">
            <h2>How to connect</h2>
            <button id="db-conntest" class="btn-sm">Test connection</button>
          </div>
          <div class="connect-rows">
            <div class="connect-row">
              <div><b>This computer</b><span class="muted">Minecraft → Multiplayer → Add Server</span></div>
              <span class="connect-addr"><code>localhost</code><button class="btn-sm" data-copy="localhost">Copy</button></span>
            </div>
            <div class="connect-row" id="db-lan" style="display:none">
              <div><b>Friends on your Wi-Fi</b><span class="muted">Same home network — no setup needed</span></div>
              <span class="connect-addr"><code id="db-lan-addr"></code><button class="btn-sm" id="db-lan-copy">Copy</button></span>
            </div>
          </div>
          <div class="hint muted" id="db-conntest-result" style="margin-top:10px"></div>
        </div>`,
      stats: `
        <div class="grid grid-4">
          <div class="card stat-card"><div class="label">Players online</div><div class="value" id="db-players">0</div></div>
          <div class="card stat-card"><div class="label">RAM</div><div class="value" id="db-ram">—</div></div>
          <div class="card stat-card"><div class="label">CPU</div><div class="value" id="db-cpu">—</div></div>
          <div class="card stat-card"><div class="label">Uptime</div><div class="value" id="db-uptime">—</div></div>
        </div>`,
      activity: `
        <div class="card">
          <div class="chart-head">
            <h2 style="margin:0">Activity</h2>
            <div class="chart-tabs" id="db-chart-tabs">
              <button data-ct="players">Players</button>
              <button data-ct="cpu">CPU</button>
              <button data-ct="mem">RAM</button>
              <button data-ct="tps">TPS</button>
            </div>
          </div>
          <canvas id="db-chart" height="160"></canvas>
          <div id="db-chart-cap" class="chart-cap muted"></div>
        </div>`,
      recent: `
        <div class="card">
          <h2>Recent players</h2>
          <div id="db-recent" class="recent-list"><div class="empty">Loading…</div></div>
        </div>`,
      console: `
        <div class="card">
          <div class="card-title-row">
            <h2>Console</h2>
            <a href="#console" class="muted text-link">Open full console</a>
          </div>
          <div id="db-console" class="console console-mini"></div>
        </div>`
    };
  },

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Dashboard</h1>
        <div class="page-head-right">
          <span class="badge"><span id="db-dot" class="dot offline"></span><span id="db-status">Offline</span></span>
          <button id="db-customize" class="btn-sm">${App.icon('layout', 14)} Customize</button>
        </div>
      </div>
      <div id="db-notices"></div>
      <div id="db-health"></div>
      <div id="db-sections"></div>`;

    this.editMode = false;
    this.layout = App.dashLayout.load(this.SECTIONS.map(s => s.id));
    document.getElementById('db-customize').onclick = () => {
      this.editMode = !this.editMode;
      this.updateCustomizeBtn();
      this.renderSections();
    };
    this.updateCustomizeBtn();
    this.renderSections();

    // max RAM as bytes, so the health banner can warn when the server nears its ceiling
    App.tryApi('/settings/config').then(cfg => { if (cfg) this.maxRamBytes = this.ramToBytes(cfg.maxRam); });
    this.loadConnect();

    // re-render the chart on resize; remove the listener in onLeave so it doesn't
    // pile up (and fire on other pages) each time we visit the dashboard
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._onResize = () => { if (App.currentName === 'dashboard') this.renderChart(); };
    window.addEventListener('resize', this._onResize);

    this.checkSetup();
    this.loadOverview();

    clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      if (App.currentName !== 'dashboard') { clearInterval(this.refreshTimer); return; }
      this.loadOverview();
    }, 30000);
  },

  updateCustomizeBtn() {
    const btn = document.getElementById('db-customize');
    if (btn) btn.innerHTML = this.editMode
      ? `${App.icon('check', 14)} Done`
      : `${App.icon('layout', 14)} Customize`;
  },

  // (Re)build the movable section area from the current layout, then reattach all
  // handlers and repopulate live content. Called on every reorder/hide/edit toggle.
  renderSections() {
    const host = document.getElementById('db-sections');
    if (!host) return;
    const inner = this.sectionInner();
    const titles = Object.fromEntries(this.SECTIONS.map(s => [s.id, s.title]));

    let html = '';
    if (this.editMode) {
      html += `
        <div class="db-edit-bar">
          <span class="muted">Drag, use ↑ ↓, or the eye to hide. Saved automatically.</span>
          <span class="db-edit-actions">
            <button id="db-reset" class="btn-sm">Reset to default</button>
            <button id="db-done" class="btn-primary btn-sm">${App.icon('check', 14)} Done</button>
          </span>
        </div>`;
    }

    for (const id of this.layout.order) {
      const hidden = App.dashLayout.isHidden(this.layout, id);
      if (hidden && !this.editMode) continue;
      if (this.editMode) {
        html += `
          <section class="db-section editing${hidden ? ' is-hidden' : ''}" data-section="${id}" draggable="true">
            <div class="db-sec-tools">
              <span class="db-drag" title="Drag to reorder">${App.icon('move', 15)}</span>
              <span class="db-sec-title">${App.esc(titles[id] || id)}${hidden ? ' <span class="muted">(hidden)</span>' : ''}</span>
              <button class="db-up" title="Move up">${App.icon('chevup', 15)}</button>
              <button class="db-down" title="Move down">${App.icon('chevdown', 15)}</button>
              <button class="db-hide" title="${hidden ? 'Show' : 'Hide'}">${App.icon(hidden ? 'eyeoff' : 'eye', 15)}</button>
            </div>
            <div class="db-sec-body">${inner[id]}</div>
          </section>`;
      } else {
        html += `<section class="db-section" data-section="${id}">${inner[id]}</section>`;
      }
    }
    host.innerHTML = html;

    this.wireSections();
    if (this.editMode) this.wireEditControls(host);

    // repopulate dynamic content into whatever sections are now present
    this.onStatus(App.status);
    this.onPlayers(App.players);
    this.onStats(App.stats);
    this.renderChart();
    this.renderRecent();
    this.renderLog();
    this.fillConnect();
  },

  // Attach the normal (non-edit) handlers for whichever sections exist right now.
  // Every lookup is guarded so a hidden section can't throw.
  wireSections() {
    // Stopping/restarting while players are connected kicks them without warning —
    // confirm first so that doesn't happen by accident.
    const confirmIfPlayers = (verb) => {
      const n = App.players.length;
      if (!n) return true;
      return confirm(`${n} player${n === 1 ? ' is' : 's are'} currently online. ${verb} will disconnect ${n === 1 ? 'them' : 'everyone'}. Continue?`);
    };

    const start = document.getElementById('db-start');
    if (start) start.onclick = () => App.tryApi('/server/start', { method: 'POST' }, 'Starting server…');
    const stop = document.getElementById('db-stop');
    if (stop) stop.onclick = () => {
      if (!confirmIfPlayers('Stopping the server')) return;
      App.tryApi('/server/stop', { method: 'POST' }, 'Stopping server…');
    };
    const restart = document.getElementById('db-restart');
    if (restart) restart.onclick = () => {
      if (!confirmIfPlayers('Restarting the server')) return;
      App.tryApi('/server/restart', { method: 'POST' }, 'Restarting server…');
    };

    document.querySelectorAll('#db-connect [data-copy]').forEach(b =>
      b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); App.toast('Copied ' + b.dataset.copy); });
    const conntest = document.getElementById('db-conntest');
    if (conntest) conntest.onclick = () => this.testConnection();

    document.querySelectorAll('#db-chart-tabs button').forEach(b => {
      b.onclick = () => { this.chartTab = b.dataset.ct; this.renderChart(); };
    });
  },

  // Wire the edit-mode controls: Done, Reset, per-section up/down/hide, and drag.
  wireEditControls(host) {
    const persistAndRerender = () => { App.dashLayout.save(this.layout); this.renderSections(); };

    const done = document.getElementById('db-done');
    if (done) done.onclick = () => { this.editMode = false; this.updateCustomizeBtn(); this.renderSections(); };
    const reset = document.getElementById('db-reset');
    if (reset) reset.onclick = () => {
      if (!confirm('Reset the dashboard layout to its default order and show all sections?')) return;
      App.dashLayout.reset();
      this.layout = App.dashLayout.load(this.SECTIONS.map(s => s.id));
      this.renderSections();
    };

    host.querySelectorAll('.db-section.editing').forEach(sec => {
      const id = sec.dataset.section;
      sec.querySelector('.db-up').onclick = () => { if (App.dashLayout.move(this.layout, id, -1)) persistAndRerender(); };
      sec.querySelector('.db-down').onclick = () => { if (App.dashLayout.move(this.layout, id, 1)) persistAndRerender(); };
      sec.querySelector('.db-hide').onclick = () => { App.dashLayout.toggleHidden(this.layout, id); persistAndRerender(); };

      sec.addEventListener('dragstart', (e) => {
        this._dragId = id;
        sec.classList.add('dragging');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      sec.addEventListener('dragend', () => { sec.classList.remove('dragging'); this._dragId = null; });
      sec.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this._dragId && this._dragId !== id) sec.classList.add('drag-over');
      });
      sec.addEventListener('dragleave', () => sec.classList.remove('drag-over'));
      sec.addEventListener('drop', (e) => {
        e.preventDefault();
        sec.classList.remove('drag-over');
        if (this._dragId && this._dragId !== id && App.dashLayout.reorder(this.layout, this._dragId, id)) {
          persistAndRerender();
        }
      });
    });
  },

  async loadOverview() {
    const data = await App.tryApi('/server/overview');
    if (!data || App.currentName !== 'dashboard') return;
    this.overview = data;
    this.renderChart();
    this.renderRecent();
  },

  // Fetch the LAN address friends on the same Wi-Fi use, cache it, then fill it in.
  // Cached so re-renders (reorder/hide) don't refetch on every change.
  async loadConnect() {
    const c = await App.tryApi('/server/connect');
    if (!c || App.currentName !== 'dashboard') return;
    this.connectInfo = c;
    this.fillConnect();
  },

  // Populate the LAN row from cached connect info, if the connect section is shown.
  fillConnect() {
    const c = this.connectInfo;
    if (!c || !c.lanIp) return;
    const row = document.getElementById('db-lan');
    if (!row) return;
    const addr = c.port && c.port !== 25565 ? `${c.lanIp}:${c.port}` : c.lanIp;
    const addrEl = document.getElementById('db-lan-addr');
    if (addrEl) addrEl.textContent = addr;
    const copy = document.getElementById('db-lan-copy');
    if (copy) copy.onclick = () => { navigator.clipboard?.writeText(addr); App.toast('Copied ' + addr); };
    row.style.display = '';
  },

  async testConnection() {
    const btn = document.getElementById('db-conntest');
    const out = document.getElementById('db-conntest-result');
    if (!btn || !out) return;
    btn.disabled = true;
    out.textContent = 'Testing…';
    const r = await App.tryApi('/server/connectivity');
    btn.disabled = false;
    if (!r) { out.textContent = ''; return; }
    out.innerHTML = r.ok
      ? `<span style="color:var(--accent)">✓ Your server is up and accepting connections on port ${App.esc(r.port)}.</span>`
      : `<span style="color:var(--red)">✕ Nothing is answering on port ${App.esc(r.port)}. Press <b>Start</b> and wait for “Ready to join”, then test again.</span>`;
  },

  ramToBytes(s) {
    const m = /^(\d+)([MG])$/i.exec(s || '');
    if (!m) return 0;
    return parseInt(m[1], 10) * (m[2].toUpperCase() === 'G' ? 1073741824 : 1048576);
  },

  // Plain-language health warnings: near the RAM ceiling, or lagging (low TPS).
  renderHealth(stats) {
    const box = document.getElementById('db-health');
    if (!box) return;
    if (!stats || !stats.online) { box.innerHTML = ''; return; }
    const msgs = [];
    if (this.maxRamBytes && stats.memory / this.maxRamBytes > 0.9) {
      msgs.push('Your server is close to its memory limit. If it lags or crashes, reduce the number of players, lower <b>view-distance</b> in Settings, or give it more <b>Max RAM</b>.');
    }
    if (stats.tps != null && stats.tps < 18) {
      msgs.push(`The server is running slow — <b>${stats.tps.toFixed(0)} TPS</b> out of 20. That's lag. Lowering <b>view-distance</b>/<b>simulation-distance</b> or having fewer players usually fixes it.`);
    }
    box.innerHTML = msgs.map(m => `<div class="notice"><span class="notice-text">⚠ ${m}</span></div>`).join('');
  },

  // renderChart() is defined in dashboard-chart.js (extracted to keep this file focused).

  renderRecent() {
    const box = document.getElementById('db-recent');
    if (!box) return;
    const recent = this.overview.recent;
    if (!recent.length) {
      box.innerHTML = `<div class="empty">No players have joined yet</div>`;
      return;
    }
    box.innerHTML = recent.map(p => `
      <div class="recent-row" data-name="${App.esc(p.name)}">
        <img class="avatar" src="https://mc-heads.net/avatar/${App.esc(p.name)}/28" alt="">
        <span class="recent-name">${App.esc(p.name)}</span>
        ${p.online
          ? '<span class="chip chip-green">Online</span>'
          : `<span class="muted recent-time">${App.fmtAgo(p.lastSeen)}</span>`}
      </div>`).join('');
    box.querySelectorAll('.recent-row').forEach(r => {
      r.onclick = () => App.pages.players.openModal(r.dataset.name);
    });
  },

  async checkSetup() {
    const s = await App.tryApi('/server/status');
    if (!s) return;
    const box = document.getElementById('db-notices');
    if (!box) return;
    let html = '';
    if (!s.jarExists) {
      html += `<div class="notice notice-setup"><span class="notice-text">No server installed yet — let's get you set up in a couple of clicks.</span><button id="db-wizard" class="btn-primary btn-sm">⚡ Quick setup</button></div>`;
    }
    if (s.jarExists && s.eula !== 'accepted') {
      html += `<div class="notice"><span class="notice-text">The Minecraft EULA has not been accepted yet — the server won't start without it.</span><button id="db-eula" class="btn-primary btn-sm">Accept EULA</button></div>`;
    }
    if (s.crashGaveUp) {
      html += `<div class="notice notice-danger"><span class="notice-text">The server kept crashing right after starting, so auto-restart stopped trying. Open the saved Console logs to see what went wrong.</span><a href="#console" class="btn-sm">Open Console</a></div>`;
    }
    box.innerHTML = html;
    const wizBtn = document.getElementById('db-wizard');
    if (wizBtn) wizBtn.onclick = () => App.wizard.open();
    const eulaBtn = document.getElementById('db-eula');
    if (eulaBtn) eulaBtn.onclick = async () => {
      if (await App.tryApi('/server/eula', { method: 'POST' }, 'EULA accepted')) this.checkSetup();
    };
    // first run: open the wizard automatically when there's no server yet
    App.wizard.maybeAutoOpen(s);
  },

  renderLog() {
    const c = document.getElementById('db-console');
    if (!c) return;
    c.innerHTML = App.logBuffer.slice(-50).map(l => App.logLineHtml(l)).join('');
    c.scrollTop = c.scrollHeight;
  },

  onLeave() {
    clearInterval(this.refreshTimer);
    if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
  },

  onInit() { this.renderLog(); this.onStatus(App.status); },
  onLog() { this.renderLog(); },

  onStatus(status) {
    // db-dot / db-status live in the (always-present) page header; the Start/Stop/
    // Restart buttons live in the `controls` section, which the user may have hidden.
    const dot = document.getElementById('db-dot');
    if (dot) dot.className = `dot ${status}`;
    const stEl = document.getElementById('db-status');
    if (stEl) stEl.textContent = App.statusText(status);
    const start = document.getElementById('db-start');
    if (start) start.disabled = status !== 'offline';
    const stop = document.getElementById('db-stop');
    if (stop) stop.disabled = status === 'offline' || status === 'stopping';
    const restart = document.getElementById('db-restart');
    if (restart) restart.disabled = status !== 'online';
    if (status === 'offline') this.checkSetup();
  },

  onPlayers(players) {
    const el = document.getElementById('db-players');
    if (el) el.textContent = players.length;
  },

  onStats(stats) {
    const ram = document.getElementById('db-ram');
    if (ram) ram.textContent = stats.online ? App.fmtBytes(stats.memory) : '—';
    const cpu = document.getElementById('db-cpu');
    if (cpu) cpu.textContent = stats.online ? `${stats.cpu.toFixed(0)}%` : '—';
    const up = document.getElementById('db-uptime');
    if (up) up.textContent = stats.online ? App.fmtUptime(stats.uptime) : '—';
    this.renderHealth(stats);
  }
};
