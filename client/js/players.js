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
      statsHtml = `<p class="muted" style="margin-bottom:8px">${d.dataError ? App.esc(d.dataError) : 'No saved player data yet — stats and inventory appear after the player has joined this world.'}</p>`;
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
          ${invHtml}
        </div>
      </div>`;

    const overlay = document.getElementById('pm-overlay');
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
  },

  inventoryHtml(items) {
    const bySlot = {};
    for (const it of items) bySlot[it.slot] = it;

    const slot = (n) => {
      const it = bySlot[n];
      if (!it) return `<div class="slot"></div>`;
      const id = (it.id || '').replace('minecraft:', '');
      const label = id.replace(/_/g, ' ');
      return `<div class="slot filled" title="${App.esc(id)} ×${it.count}">${App.esc(label)}${it.count > 1 ? `<span class="cnt">${it.count}</span>` : ''}</div>`;
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
