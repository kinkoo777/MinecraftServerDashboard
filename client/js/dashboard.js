/* How an on-screen message looks and where it appears. The chosen style is kept in
   this browser and also used by the message box in the player window. */
App.msg = {
  WHERE: { title: 'Big, middle of the screen', subtitle: 'Small, middle of the screen', actionbar: 'Above the hotbar', chat: 'In chat' },
  COLORS: { white: '#ffffff', yellow: '#ffff55', gold: '#ffaa00', red: '#ff5555', green: '#55ff55', aqua: '#55ffff', light_purple: '#ff55ff', gray: '#aaaaaa' },
  BUILTIN: [
    { name: 'Announcement', where: 'title', color: 'yellow', bold: true, seconds: 5 },
    { name: 'Alert', where: 'title', color: 'red', bold: true, seconds: 10 },
    { name: 'Notice', where: 'subtitle', color: 'white', bold: false, seconds: 5 },
    { name: 'Quiet hint', where: 'actionbar', color: 'green', bold: false, seconds: 5 },
    { name: 'Chat line', where: 'chat', color: 'aqua', bold: false, seconds: 5 }
  ],
  read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } },
  write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* not remembered */ } },
  style() { return { ...this.BUILTIN[0], ...this.read('msg-style', {}) }; },
  setStyle(s) { this.write('msg-style', s); },
  custom() { const c = this.read('msg-presets', []); return Array.isArray(c) ? c : []; },
  presets() { return [...this.BUILTIN, ...this.custom().map(p => ({ ...p, custom: true }))]; },
  same(a, b) { return a.where === b.where && a.color === b.color && !!a.bold === !!b.bold && +a.seconds === +b.seconds; }
};

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
    { id: 'announce', title: 'Message to players' },
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
      announce: `
        <div class="card">
          <h2>Message to players</h2>
          <div class="announce-row">
            <select id="db-announce-to" title="Who gets it"><option value="">Everyone</option></select>
            <select id="db-msg-style" title="How it looks"></select>
            <input id="db-announce" maxlength="100" placeholder="Type a message…" autocomplete="off">
            <button id="db-announce-send" class="btn-primary">${App.icon('send', 14)} Send</button>
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

    const annInput = document.getElementById('db-announce');
    const annSend = document.getElementById('db-announce-send');
    if (annInput && annSend) {
      const send = async () => {
        const message = annInput.value.trim();
        if (!message) return annInput.focus();
        const to = document.getElementById('db-announce-to').value;
        const r = await App.tryApi('/server/announce', { method: 'POST', body: { message, to, ...App.msg.style() } });
        if (!r) return;
        annInput.value = '';
        App.toast(to ? `Shown to ${to}` : r.players ? `Shown to ${r.players} player${r.players === 1 ? '' : 's'}` : 'Sent — but nobody is online to see it');
      };
      annSend.onclick = send;
      annInput.onkeydown = (e) => { if (e.key === 'Enter') send(); };
      this.wireMsgStyle();
    }

    document.querySelectorAll('#db-connect [data-copy]').forEach(b =>
      b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); App.toast('Copied ' + b.dataset.copy); });
    const conntest = document.getElementById('db-conntest');
    if (conntest) conntest.onclick = () => this.testConnection();

    document.querySelectorAll('#db-chart-tabs button').forEach(b => {
      b.onclick = () => { this.chartTab = b.dataset.ct; this.renderChart(); };
    });
  },

  wireMsgStyle() { this.paintMsg(); },

  // Draw a message into a preview "screen" the way the game would place it.
  paintPreview(pv, st, text) {
    pv.textContent = (st.where === 'chat' ? '[Server] ' : '') + (text || 'Your message');
    pv.className = `msg-pv msg-pv-${st.where}`;
    pv.style.color = App.msg.COLORS[st.color];
    pv.style.fontWeight = st.bold ? '700' : '400';
  },

  // The style dropdown: built-in and saved presets, plus "Customize…" which opens the
  // style window. A style that matches no preset shows as "Custom style".
  paintMsg() {
    const sel = document.getElementById('db-msg-style');
    if (!sel) return;
    const st = App.msg.style();
    const presets = App.msg.presets();
    const at = presets.findIndex(p => App.msg.same(p, st));
    sel.innerHTML = presets.map((p, i) => `<option value="${i}">${App.esc(p.name)}</option>`).join('') +
      (at < 0 ? '<option value="custom">Custom style</option>' : '') +
      '<option value="edit">Customize…</option>';
    sel.value = at < 0 ? 'custom' : String(at);
    sel.onchange = () => {
      if (sel.value === 'edit') { this.paintMsg(); return this.openMsgCustomize(); }
      if (sel.value !== 'custom') {
        const { where, color, bold, seconds } = presets[+sel.value];
        App.msg.setStyle({ where, color, bold, seconds });
      }
      this.paintMsg();
    };
  },

  // Window for building a message style: live preview on top, options below, and
  // the user's own saved presets.
  openMsgCustomize() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    const text = (document.getElementById('db-announce') || {}).value || '';
    ov.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="card-title-row"><h2 style="margin:0">Message style</h2><button class="btn-icon" id="mc-close" title="Close">${App.icon('x', 14)}</button></div>
        <div class="msg-screen msg-screen-big"><span class="msg-pv" id="mc-pv"></span><span class="msg-hotbar"></span></div>
        <div class="field"><label>Where it appears</label>
          <div class="mc-where" id="mc-where">${Object.entries(App.msg.WHERE).map(([k, v]) => `<button type="button" class="msg-preset" data-where="${k}">${v}</button>`).join('')}</div>
        </div>
        <div class="field"><label>Colour</label>
          <div class="msg-colors" id="mc-colors">${Object.entries(App.msg.COLORS).map(([k, v]) => `<button type="button" class="msg-color" data-color="${k}" title="${k.replace('_', ' ')}" style="background:${v}"></button>`).join('')}</div>
        </div>
        <div class="mc-row">
          <div class="field" style="flex:1"><label>Stays for</label>
            <select id="mc-secs"><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="20">20 seconds</option></select>
          </div>
          <label class="ntf-event mc-bold"><span class="switch"><input type="checkbox" id="mc-bold"><span class="track"></span></span><span>Bold</span></label>
        </div>
        <div class="field"><label>Your presets</label>
          <div class="msg-presets" id="mc-mine"></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input id="mc-name" maxlength="20" placeholder="Name this style to save it">
            <button class="btn-sm" id="mc-save" style="flex-shrink:0">Save preset</button>
          </div>
        </div>
        <div class="btn-row" style="margin-top:6px"><button class="btn-primary" id="mc-done">Done</button></div>
      </div>`;
    document.body.appendChild(ov);
    const $ = (id) => ov.querySelector('#' + id);
    const close = () => { ov.remove(); this.paintMsg(); };
    ov.onclick = (e) => { if (e.target === ov) close(); };
    $('mc-close').onclick = close;
    $('mc-done').onclick = close;

    const paint = () => {
      const st = App.msg.style();
      this.paintPreview($('mc-pv'), st, text.trim());
      ov.querySelectorAll('[data-where]').forEach(b => b.classList.toggle('active', b.dataset.where === st.where));
      ov.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('active', b.dataset.color === st.color));
      $('mc-secs').value = String([3, 5, 10, 20].includes(+st.seconds) ? st.seconds : 5);
      $('mc-secs').disabled = st.where === 'actionbar' || st.where === 'chat'; // the game decides those
      $('mc-bold').checked = !!st.bold;
      const mine = App.msg.custom();
      $('mc-mine').innerHTML = mine.length ? mine.map((p, i) => `
        <button type="button" class="msg-preset${App.msg.same(p, st) ? ' active' : ''}" data-mine="${i}">
          <span class="msg-dot" style="background:${App.msg.COLORS[p.color]}"></span>${App.esc(p.name)}<span class="msg-del" data-del="${i}" title="Delete preset">×</span>
        </button>`).join('') : '<span class="muted" style="font-size:12px">None yet — set up a style above and save it.</span>';
      ov.querySelectorAll('[data-mine]').forEach(b => {
        b.onclick = (e) => {
          const list = App.msg.custom();
          if (e.target.dataset.del != null) App.msg.write('msg-presets', list.filter((_, i) => i !== +e.target.dataset.del));
          else { const { where, color, bold, seconds } = list[+b.dataset.mine]; App.msg.setStyle({ where, color, bold, seconds }); }
          paint();
        };
      });
    };
    const set = (patch) => { App.msg.setStyle({ ...App.msg.style(), ...patch }); paint(); };
    ov.querySelectorAll('[data-where]').forEach(b => { b.onclick = () => set({ where: b.dataset.where }); });
    ov.querySelectorAll('[data-color]').forEach(b => { b.onclick = () => set({ color: b.dataset.color }); });
    $('mc-secs').onchange = (e) => set({ seconds: +e.target.value });
    $('mc-bold').onchange = (e) => set({ bold: e.target.checked });
    $('mc-save').onclick = () => {
      const name = $('mc-name').value.trim();
      if (!name) return $('mc-name').focus();
      const { where, color, bold, seconds } = App.msg.style();
      App.msg.write('msg-presets', [...App.msg.custom().filter(p => p.name !== name), { name, where, color, bold, seconds }].slice(-12));
      $('mc-name').value = '';
      App.toast(`Preset "${name}" saved`);
      paint();
    };
    paint();
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
    if (s.diagnosis) {
      const d = s.diagnosis;
      const act = d.fix ? `<button id="db-fix" class="btn-primary btn-sm">${App.esc(d.fix.label)}</button>`
        : d.link ? `<a href="${App.esc(d.link.href)}" class="btn btn-sm">${App.esc(d.link.label)}</a>` : '';
      html += `<div class="notice notice-danger"><span class="notice-text"><b>The server didn't start: ${App.esc(d.title)}</b><br>${App.esc(d.detail)}</span>${act}</div>`;
    } else if (s.crashGaveUp) {
      html += `<div class="notice notice-danger"><span class="notice-text">The server kept crashing right after starting, so auto-restart stopped trying. Open the saved Console logs to see what went wrong.</span><a href="#console" class="btn-sm">Open Console</a></div>`;
    }
    box.innerHTML = html;
    const wizBtn = document.getElementById('db-wizard');
    if (wizBtn) wizBtn.onclick = () => App.wizard.open();
    const eulaBtn = document.getElementById('db-eula');
    if (eulaBtn) eulaBtn.onclick = async () => {
      if (await App.tryApi('/server/eula', { method: 'POST' }, 'EULA accepted')) this.checkSetup();
    };
    const fixBtn = document.getElementById('db-fix');
    if (fixBtn && s.diagnosis.fix.action === 'install-mods') fixBtn.onclick = async () => {
      fixBtn.disabled = true;
      fixBtn.textContent = 'Installing…';
      const r = await App.tryApi('/modrinth/install-missing', { method: 'POST', body: { ids: s.diagnosis.fix.ids } });
      for (const f of (r && r.failed) || []) App.toast(f.error, true);
      if (r && r.installed.length) App.toast(`Installed ${r.installed.map(i => i.id).join(', ')}${r.failed.length ? '' : ' — press Start'}`);
      this.checkSetup();
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
    for (const id of ['db-announce', 'db-announce-to', 'db-msg-style', 'db-announce-send']) {
      const el = document.getElementById(id);
      if (el) el.disabled = status !== 'online';
    }
    if (status === 'offline') this.checkSetup();
  },

  onPlayers(players) {
    const el = document.getElementById('db-players');
    if (el) el.textContent = players.length;
    const to = document.getElementById('db-announce-to');
    if (to) {
      const keep = to.value;
      to.innerHTML = '<option value="">Everyone</option>' + players.map(p => `<option>${App.esc(p)}</option>`).join('');
      if (players.includes(keep)) to.value = keep;
    }
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
