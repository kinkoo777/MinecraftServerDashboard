App.pages.players = {
  tab: 'online',
  data: { online: [], whitelist: [], ops: [], banned: [] },

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Players</h1>
        <div class="btn-row" style="align-items:center">
          <input id="pl-name" placeholder="Player name…" style="width:180px" autocomplete="off">
          <button id="pl-open" class="btn-primary btn-sm">View player</button>
        </div>
      </div>
      <div class="tabs" id="pl-tabs">
        <button data-tab="online">Online</button>
        <button data-tab="whitelist">Whitelist</button>
        <button data-tab="ops">Ops</button>
        <button data-tab="banned">Banned</button>
        <button data-tab="leaderboard">Leaderboard</button>
      </div>
      <div class="card" id="pl-list"></div>`;

    document.querySelectorAll('#pl-tabs button').forEach(b => {
      b.onclick = () => { this.tab = b.dataset.tab; this.renderList(); };
    });

    const nameInput = document.getElementById('pl-name');
    const open = () => {
      const name = nameInput.value.trim();
      if (!name) return App.toast('Enter a player name first', true);
      this.openModal(name);
    };
    document.getElementById('pl-open').onclick = open;
    nameInput.onkeydown = (e) => { if (e.key === 'Enter') open(); };

    await this.load();
  },

  async load() {
    const data = await App.tryApi('/players');
    if (data) { this.data = data; this.renderList(); }
  },

  renderList() {
    document.querySelectorAll('#pl-tabs button').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === this.tab));
    const box = document.getElementById('pl-list');
    if (!box) return;

    if (this.tab === 'leaderboard') return this.renderLeaderboard(box);

    const rows = {
      online: this.data.online.map(n => this.row(n)),
      whitelist: this.data.whitelist.map(n => this.row(n)),
      ops: this.data.ops.map(n => this.row(n)),
      banned: this.data.banned.map(b => this.row(b.name, b.reason))
    }[this.tab];

    if (!rows.length) {
      const labels = { online: 'No players online', whitelist: 'Whitelist is empty', ops: 'No operators', banned: 'No banned players' };
      box.innerHTML = `<div class="empty">${labels[this.tab]}</div>`;
      return;
    }
    box.innerHTML = `<table><tbody>${rows.join('')}</tbody></table>`;

    box.querySelectorAll('[data-open]').forEach(tr => {
      tr.onclick = () => this.openModal(tr.dataset.open);
    });
  },

  async renderLeaderboard(box) {
    box.innerHTML = `<div class="empty">Loading…</div>`;
    const rows = await App.tryApi('/players/leaderboard');
    if (!rows || this.tab !== 'leaderboard') return;
    if (!rows.length) {
      box.innerHTML = `<div class="empty">No player statistics yet — they appear once players have joined and the world has saved.</div>`;
      return;
    }
    box.innerHTML = `<table>
      <thead><tr><th>#</th><th>Player</th><th>Playtime</th><th>Deaths</th><th>Mob kills</th><th>Distance</th></tr></thead>
      <tbody>${rows.map((r, i) => `
        <tr data-open="${App.esc(r.name)}" style="cursor:pointer">
          <td class="muted">${i + 1}</td>
          <td><img class="avatar" src="https://mc-heads.net/avatar/${App.esc(r.name)}/24" alt="">${App.esc(r.name)}</td>
          <td>${r.playTimeHours} h</td>
          <td>${r.deaths}</td>
          <td>${r.mobKills}</td>
          <td class="muted">${r.distanceKm} km</td>
        </tr>`).join('')}</tbody>
    </table>`;
    box.querySelectorAll('[data-open]').forEach(tr => { tr.onclick = () => this.openModal(tr.dataset.open); });
  },

  row(name, extra) {
    const e = App.esc(name);
    return `<tr data-open="${e}" style="cursor:pointer" title="Click for details">
      <td><img class="avatar" src="https://mc-heads.net/avatar/${e}/24" alt="">${e}${extra ? ` <span class="muted">— ${App.esc(extra)}</span>` : ''}</td>
      <td style="text-align:right" class="muted">›</td>
    </tr>`;
  },

  async openModal(name) {
    const d = await App.tryApi(`/players/detail/${encodeURIComponent(name)}`);
    if (!d) return;
    const box = document.getElementById('player-modal-root');

    const offline = App.status !== 'online';
    const chips = [
      d.online ? '<span class="chip chip-green">Online</span>' : '<span class="chip">Offline</span>',
      d.op ? '<span class="chip chip-green">Op</span>' : '',
      d.whitelisted ? '<span class="chip chip-green">Whitelisted</span>' : '',
      d.banned ? '<span class="chip chip-red">Banned</span>' : ''
    ].filter(Boolean).join('');

    const actions = [
      d.whitelisted ? ['whitelist-remove', 'Remove from whitelist'] : ['whitelist-add', 'Add to whitelist'],
      d.op ? ['deop', 'Remove op'] : ['op', 'Make op'],
      d.banned ? ['pardon', 'Unban'] : ['ban', 'Ban', true],
      ...(d.online ? [['kick', 'Kick', true]] : [])
    ].map(([action, label, danger]) =>
      `<button class="btn-sm${danger ? ' btn-danger' : ''}" data-act="${action}" ${offline ? 'disabled title="Server must be online to run commands"' : ''}>${label}</button>`
    ).join(' ');

    let statsHtml = '';
    let invHtml = '';
    if (d.data) {
      const s = d.data;
      statsHtml = `<div class="grid grid-4" style="margin-bottom:16px">
        <div class="pstat"><span class="label">Health</span>${s.health ?? '—'} / 20</div>
        <div class="pstat"><span class="label">Food</span>${s.food ?? '—'} / 20</div>
        <div class="pstat"><span class="label">XP level</span>${s.xpLevel ?? '—'}</div>
        <div class="pstat"><span class="label">Gamemode</span>${App.esc(s.gamemode)}</div>
      </div>
      <p class="muted" style="margin-bottom:16px">
        ${s.pos ? `Position: ${s.pos.join(', ')} (${App.esc(s.dimension)})` : ''}
        ${d.lastSaved ? ` · data from last save, ${new Date(d.lastSaved).toLocaleString()}` : ''}
      </p>`;
      invHtml = `<h2>Inventory</h2>${this.inventoryHtml(s.inventory)}`;
    } else {
      const msg = d.dataError ? App.esc(d.dataError)
        : !d.uuid ? 'This player has never joined this server, so there are no stats or inventory to show yet.'
        : 'No saved player data found yet — it appears shortly after the player joins the world.';
      statsHtml = `<p class="muted" style="margin-bottom:8px">${msg}</p>`;
    }

    let statsExtra = '';
    if (d.stats) {
      const rows = [
        ['Playtime', `${d.stats.playTimeHours} h`], ['Deaths', d.stats.deaths],
        ['Mob kills', d.stats.mobKills], ['Player kills', d.stats.playerKills],
        ['Distance', `${d.stats.distanceKm} km`], ['Jumps', d.stats.jumps]
      ];
      statsExtra = `<h2 style="margin-top:6px">Statistics</h2>
        <div class="grid grid-4" style="margin-bottom:16px">
          ${rows.map(([l, v]) => `<div class="pstat"><span class="label">${l}</span>${v}</div>`).join('')}
        </div>`;
    }

    let manageHtml = '';
    if (d.online && !offline) {
      const gmOpts = ['survival', 'creative', 'adventure', 'spectator'].map(g =>
        `<option value="${g}" ${d.data && d.data.gamemode === g ? 'selected' : ''}>${g}</option>`).join('');
      const tpTargets = App.players.filter(p => p.toLowerCase() !== d.name.toLowerCase());
      const pos = d.data && d.data.pos ? d.data.pos : ['', '', ''];
      manageHtml = `
        <h2 style="margin-top:18px">Manage</h2>
        <div class="btn-row" style="margin-bottom:12px">
          <button class="btn-sm" data-quick="heal">Heal</button>
          <button class="btn-sm" data-quick="feed">Feed</button>
          <button class="btn-sm" data-quick="clear-effects">Clear effects</button>
          <button class="btn-sm btn-danger" data-quick="kill">Kill</button>
        </div>
        <div class="manage-row">
          <span class="manage-label">Gamemode</span>
          <select id="pm-gm">${gmOpts}</select>
          <button class="btn-sm" id="pm-gm-go">Apply</button>
        </div>
        <div class="manage-row">
          <span class="manage-label">Teleport to</span>
          <input id="pm-x" type="number" placeholder="x" value="${pos[0]}">
          <input id="pm-y" type="number" placeholder="y" value="${pos[1]}">
          <input id="pm-z" type="number" placeholder="z" value="${pos[2]}">
          <button class="btn-sm" id="pm-tp-go">Teleport</button>
        </div>
        ${tpTargets.length ? `
        <div class="manage-row">
          <span class="manage-label">TP to player</span>
          <select id="pm-tp-target">${tpTargets.map(p => `<option>${App.esc(p)}</option>`).join('')}</select>
          <button class="btn-sm" id="pm-tpp-go">Teleport</button>
        </div>` : ''}
        <div class="manage-row">
          <span class="manage-label">Give item</span>
          <input id="pm-item" placeholder="minecraft:diamond">
          <input id="pm-count" type="number" value="1" min="1" max="6400" style="max-width:80px">
          <button class="btn-sm" id="pm-give-go">Give</button>
        </div>`;
    } else if (d.online && offline) {
      manageHtml = '';
    }

    box.innerHTML = `
      <div class="modal-overlay" id="pm-overlay">
        <div class="modal">
          <div class="player-head">
            <img src="https://mc-heads.net/avatar/${App.esc(d.name)}/48" alt="">
            <div>
              <h1 style="margin:0">${App.esc(d.name)}</h1>
              <div style="margin-top:6px">${chips}</div>
            </div>
            <button id="pm-close" style="margin-left:auto" class="btn-icon" title="Close">${App.icon('x', 14)}</button>
          </div>
          <div class="btn-row" style="margin-bottom:18px">${actions}</div>
          ${statsHtml}
          ${statsExtra}
          ${invHtml}
          ${manageHtml}
          <h2 style="margin-top:18px">Admin notes</h2>
          <textarea id="pm-note" rows="2" placeholder="Private notes about this player…" style="resize:vertical">${App.esc(d.note || '')}</textarea>
          <div class="btn-row" style="margin-top:8px"><button class="btn-sm" id="pm-note-save">Save note</button></div>
        </div>
      </div>`;

    const overlay = document.getElementById('pm-overlay');
    this.loadItemIcons(box);
    overlay.onclick = (e) => { if (e.target === overlay) box.innerHTML = ''; };
    document.getElementById('pm-close').onclick = () => { box.innerHTML = ''; };
    const esc = (e) => { if (e.key === 'Escape') { box.innerHTML = ''; document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);

    box.querySelectorAll('[data-act]').forEach(btn => {
      btn.onclick = async () => {
        if (await App.tryApi('/players/action', {
          method: 'POST', body: { action: btn.dataset.act, name: d.name }
        }, 'Done')) {
          // give the server a moment to update its json files, then refresh
          setTimeout(() => { this.load(); this.openModal(d.name); }, 600);
        }
      };
    });

    const act = (action, args, msg) =>
      App.tryApi('/players/action', { method: 'POST', body: { action, name: d.name, args } }, msg);

    box.querySelectorAll('[data-quick]').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.quick === 'kill' && !confirm(`Kill ${d.name}?`)) return;
        act(btn.dataset.quick, {}, 'Done');
      };
    });
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('pm-note-save', () => App.tryApi('/players/note', {
      method: 'PUT', body: { name: d.name, note: document.getElementById('pm-note').value }
    }, 'Note saved'));
    on('pm-gm-go', () =>
      act('gamemode', { mode: document.getElementById('pm-gm').value }, 'Gamemode changed'));
    on('pm-tp-go', () => act('tp-coords', {
      x: document.getElementById('pm-x').value,
      y: document.getElementById('pm-y').value,
      z: document.getElementById('pm-z').value
    }, 'Teleported'));
    on('pm-tpp-go', () =>
      act('tp-player', { target: document.getElementById('pm-tp-target').value }, 'Teleported'));
    on('pm-give-go', () => act('give', {
      item: document.getElementById('pm-item').value.trim(),
      count: document.getElementById('pm-count').value
    }, 'Item given'));
  },

  // Item texture URLs (vanilla assets mirror); item/ then block/ then text fallback.
  itemIconUrls(id) {
    const v = '1.21.4';
    const base = `https://assets.mcasset.cloud/${v}/assets/minecraft/textures`;
    return [`${base}/item/${id}.png`, `${base}/block/${id}.png`];
  },

  loadItemIcons(root) {
    root.querySelectorAll('.slot.filled[data-item]').forEach(el => {
      const urls = this.itemIconUrls(el.dataset.item);
      const img = new Image();
      img.className = 'slot-icon';
      let i = 0;
      img.onerror = () => { if (++i < urls.length) img.src = urls[i]; else img.remove(); };
      img.onload = () => { const f = el.querySelector('.slot-fallback'); if (f) f.style.display = 'none'; };
      img.src = urls[0];
      el.insertBefore(img, el.firstChild);
    });
  },

  inventoryHtml(items) {
    const bySlot = {};
    for (const it of items) bySlot[it.slot] = it;

    const slot = (n) => {
      const it = bySlot[n];
      if (!it) return `<div class="slot"></div>`;
      const id = (it.id || '').replace('minecraft:', '');
      const label = id.replace(/_/g, ' ');
      return `<div class="slot filled" data-item="${App.esc(id)}" title="${App.esc(id)} ×${it.count}"><span class="slot-fallback">${App.esc(label)}</span>${it.count > 1 ? `<span class="cnt">${it.count}</span>` : ''}</div>`;
    };
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => slot(a + i)).join('');

    return `
      <div class="inv-section"><span class="label">Armor & offhand</span>
        <div class="inv-grid inv-grid-5">${slot(103)}${slot(102)}${slot(101)}${slot(100)}${slot(-106)}</div>
      </div>
      <div class="inv-section"><span class="label">Main inventory</span>
        <div class="inv-grid">${range(9, 35)}</div>
      </div>
      <div class="inv-section"><span class="label">Hotbar</span>
        <div class="inv-grid">${range(0, 8)}</div>
      </div>`;
  },

  onPlayers() { if (this.tab === 'online') this.load(); },
  onStatus() { this.renderList(); }
};
