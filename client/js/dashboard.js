App.pages.dashboard = {
  chartTab: 'players',
  overview: { history: [], recent: [] },
  refreshTimer: null,

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Dashboard</h1>
        <span class="badge"><span id="db-dot" class="dot offline"></span><span id="db-status">Offline</span></span>
      </div>
      <div id="db-notices"></div>
      <div id="db-health"></div>
      <div class="card">
        <div class="btn-row">
          <button id="db-start" class="btn-primary">${App.icon('play', 14)} Start</button>
          <button id="db-stop" class="btn-danger">${App.icon('stop', 14)} Stop</button>
          <button id="db-restart">${App.icon('restart', 14)} Restart</button>
        </div>
      </div>
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
      </div>
      <div class="grid grid-4">
        <div class="card stat-card"><div class="label">Players online</div><div class="value" id="db-players">0</div></div>
        <div class="card stat-card"><div class="label">RAM</div><div class="value" id="db-ram">—</div></div>
        <div class="card stat-card"><div class="label">CPU</div><div class="value" id="db-cpu">—</div></div>
        <div class="card stat-card"><div class="label">Uptime</div><div class="value" id="db-uptime">—</div></div>
      </div>
      <div class="grid grid-2" style="align-items:stretch">
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
        </div>
        <div class="card">
          <h2>Recent players</h2>
          <div id="db-recent" class="recent-list"><div class="empty">Loading…</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title-row">
          <h2>Console</h2>
          <a href="#console" class="muted text-link">Open full console</a>
        </div>
        <div id="db-console" class="console console-mini"></div>
      </div>`;

    // Stopping/restarting while players are connected kicks them without warning —
    // confirm first so that doesn't happen by accident.
    const confirmIfPlayers = (verb) => {
      const n = App.players.length;
      if (!n) return true;
      return confirm(`${n} player${n === 1 ? ' is' : 's are'} currently online. ${verb} will disconnect ${n === 1 ? 'them' : 'everyone'}. Continue?`);
    };

    document.getElementById('db-start').onclick = () => App.tryApi('/server/start', { method: 'POST' }, 'Starting server…');
    document.getElementById('db-stop').onclick = () => {
      if (!confirmIfPlayers('Stopping the server')) return;
      App.tryApi('/server/stop', { method: 'POST' }, 'Stopping server…');
    };
    document.getElementById('db-restart').onclick = () => {
      if (!confirmIfPlayers('Restarting the server')) return;
      App.tryApi('/server/restart', { method: 'POST' }, 'Restarting server…');
    };

    document.querySelectorAll('#db-connect [data-copy]').forEach(b =>
      b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); App.toast('Copied ' + b.dataset.copy); });
    document.getElementById('db-conntest').onclick = () => this.testConnection();
    this.loadConnect();
    // max RAM as bytes, so the health banner can warn when the server nears its ceiling
    App.tryApi('/settings/config').then(cfg => { if (cfg) this.maxRamBytes = this.ramToBytes(cfg.maxRam); });

    document.querySelectorAll('#db-chart-tabs button').forEach(b => {
      b.onclick = () => { this.chartTab = b.dataset.ct; this.renderChart(); };
    });

    // re-render the chart on resize; remove the listener in onLeave so it doesn't
    // pile up (and fire on other pages) each time we visit the dashboard
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._onResize = () => { if (App.currentName === 'dashboard') this.renderChart(); };
    window.addEventListener('resize', this._onResize);

    this.onStatus(App.status);
    this.onPlayers(App.players);
    this.onStats(App.stats);
    this.renderLog();
    this.checkSetup();
    this.loadOverview();

    clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      if (App.currentName !== 'dashboard') { clearInterval(this.refreshTimer); return; }
      this.loadOverview();
    }, 30000);
  },

  async loadOverview() {
    const data = await App.tryApi('/server/overview');
    if (!data || App.currentName !== 'dashboard') return;
    this.overview = data;
    this.renderChart();
    this.renderRecent();
  },

  // Fill in the LAN address friends on the same Wi-Fi use.
  async loadConnect() {
    const c = await App.tryApi('/server/connect');
    if (!c || !c.lanIp || App.currentName !== 'dashboard') return;
    const addr = c.port && c.port !== 25565 ? `${c.lanIp}:${c.port}` : c.lanIp;
    const row = document.getElementById('db-lan');
    if (!row) return;
    document.getElementById('db-lan-addr').textContent = addr;
    document.getElementById('db-lan-copy').onclick = () => { navigator.clipboard?.writeText(addr); App.toast('Copied ' + addr); };
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

  renderChart() {
    const canvas = document.getElementById('db-chart');
    if (!canvas) return;
    document.querySelectorAll('#db-chart-tabs button').forEach(b =>
      b.classList.toggle('active', b.dataset.ct === this.chartTab));

    const caps = {
      players: 'Number of players connected over time.',
      cpu: 'CPU used by the server process. Brief spikes during world generation or chunk loading are normal.',
      mem: 'RAM used by the server process. It usually climbs then plateaus near your Max RAM setting.',
      tps: 'TPS = ticks per second, the server’s heartbeat (20 ticks = 1 second of game time). 20 is perfect; a flat line at 20 means no lag. If it drops below ~18 and stays there, the server is struggling to keep up — that’s lag. Needs a server that answers /tick query (MC 1.20.3+).'
    };
    const cap = document.getElementById('db-chart-cap');
    if (cap) cap.textContent = caps[this.chartTab] || '';

    const css = getComputedStyle(document.body);
    const accent = css.getPropertyValue('--accent').trim();
    const border = css.getPropertyValue('--border').trim();
    const muted = css.getPropertyValue('--muted').trim();

    const w = canvas.parentElement.clientWidth - 36;
    const h = 160;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px system-ui, sans-serif';

    let pts = this.overview.history;
    if (this.chartTab === 'tps') pts = pts.filter(p => p.tps != null);
    if (pts.length < 2) {
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      ctx.fillText(this.chartTab === 'tps'
        ? 'No TPS data yet — appears about a minute after the server is online.'
        : 'Collecting data — the chart fills in as the dashboard runs…', w / 2, h / 2);
      return;
    }

    const val = { players: p => p.players, cpu: p => p.cpu, mem: p => p.mem / 1048576, tps: p => p.tps }[this.chartTab];
    const fmt = {
      players: v => String(Math.round(v)),
      cpu: v => Math.round(v) + '%',
      mem: v => v >= 1024 ? (v / 1024).toFixed(1) + ' GB' : Math.round(v) + ' MB',
      tps: v => v.toFixed(0)
    }[this.chartTab];

    const padL = 8, padR = 44, padT = 10, padB = 18;
    const cw = w - padL - padR, ch = h - padT - padB;
    const rawMax = Math.max(...pts.map(val));
    const max = { players: Math.max(4, Math.ceil(rawMax)), cpu: Math.max(25, Math.ceil(rawMax / 25) * 25), mem: Math.max(256, Math.ceil(rawMax / 256) * 256), tps: 20 }[this.chartTab];
    const x = i => padL + (i / (pts.length - 1)) * cw;
    const y = v => padT + ch - (v / max) * ch;

    // horizontal grid lines + right-side labels
    ctx.textAlign = 'left';
    for (let g = 0; g <= 3; g++) {
      const gy = padT + (g / 3) * ch;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + cw, gy);
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.fillText(fmt(max * (1 - g / 3)), padL + cw + 6, gy + 3);
    }

    // time labels
    ctx.fillStyle = muted;
    const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    ctx.textAlign = 'left';
    ctx.fillText(t(pts[0].t), padL, h - 4);
    ctx.textAlign = 'right';
    ctx.fillText(t(pts[pts.length - 1].t), padL + cw, h - 4);

    // area fill
    const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
    grad.addColorStop(0, accent + '4d');
    grad.addColorStop(1, accent + '00');
    ctx.beginPath();
    ctx.moveTo(x(0), y(val(pts[0])));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(x(i), y(val(pts[i])));
    ctx.lineTo(x(pts.length - 1), padT + ch);
    ctx.lineTo(x(0), padT + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(x(0), y(val(pts[0])));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(x(i), y(val(pts[i])));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // last-value dot
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(x(pts.length - 1), y(val(last)), 3, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  },

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
    const dot = document.getElementById('db-dot');
    if (!dot) return;
    dot.className = `dot ${status}`;
    document.getElementById('db-status').textContent = App.statusText(status);
    document.getElementById('db-start').disabled = status !== 'offline';
    document.getElementById('db-stop').disabled = status === 'offline' || status === 'stopping';
    document.getElementById('db-restart').disabled = status !== 'online';
    if (status === 'offline') this.checkSetup();
  },

  onPlayers(players) {
    const el = document.getElementById('db-players');
    if (el) el.textContent = players.length;
  },

  onStats(stats) {
    const ram = document.getElementById('db-ram');
    if (!ram) return;
    ram.textContent = stats.online ? App.fmtBytes(stats.memory) : '—';
    document.getElementById('db-cpu').textContent = stats.online ? `${stats.cpu.toFixed(0)}%` : '—';
    document.getElementById('db-uptime').textContent = stats.online ? App.fmtUptime(stats.uptime) : '—';
    this.renderHealth(stats);
  }
};
