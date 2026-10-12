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
    // These actions edit JSON files directly and work whether the server is running or not
    const OFFLINE_OK = new Set(['whitelist-add', 'whitelist-remove', 'op', 'deop', 'ban', 'pardon']);
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
    ].map(([action, label, danger]) => {
      const needsOnline = offline && !OFFLINE_OK.has(action);
      return `<button class="btn-sm${danger ? ' btn-danger' : ''}" data-act="${action}" ${needsOnline ? 'disabled title="Server must be online to run this"' : ''}>${label}</button>`;
    }).join(' ');

    // Collapsible section; which ones are open is remembered between players.
    const sec = (id, title, body, openByDefault) => body ? `
      <details class="pm-sec" data-sec="${id}" ${this.secOpen(id, openByDefault) ? 'open' : ''}>
        <summary>${title}</summary>
        <div class="pm-sec-body">${body}</div>
      </details>` : '';

    let vitalsHtml = '';
    let where = '';
    let invHtml = '';
    let invCount = 0;
    if (d.data) {
      const s = d.data;
      vitalsHtml = `<div class="pm-vitals">
        <div class="pstat"><span class="label">Health</span>${App.esc(s.health ?? '—')} / 20</div>
        <div class="pstat"><span class="label">Food</span>${App.esc(s.food ?? '—')} / 20</div>
        <div class="pstat"><span class="label">XP level</span>${App.esc(s.xpLevel ?? '—')}</div>
        <div class="pstat"><span class="label">Gamemode</span>${App.esc(s.gamemode)}</div>
      </div>`;
      where = [
        s.pos ? `${App.esc(s.pos.join(', '))} in ${App.esc(s.dimension || 'overworld')}` : '',
        d.lastSaved ? `saved ${App.fmtAgo(d.lastSaved)}` : ''
      ].filter(Boolean).join(' · ');
      invCount = s.inventory.length;
      invHtml = this.inventoryHtml(s.inventory);
    } else {
      const msg = d.dataError ? App.esc(d.dataError)
        : !d.uuid ? 'This player has never joined this server, so there are no stats or inventory to show yet.'
        : 'No saved player data found yet — it appears shortly after the player joins the world.';
      vitalsHtml = `<p class="muted pm-nodata">${msg}</p>`;
    }

    let statsExtra = '';
    if (d.stats) {
      const rows = [
        ['Playtime', `${d.stats.playTimeHours} h`], ['Deaths', d.stats.deaths],
        ['Mob kills', d.stats.mobKills], ['Player kills', d.stats.playerKills],
        ['Distance', `${d.stats.distanceKm} km`], ['Jumps', d.stats.jumps]
      ];
      statsExtra = `<div class="pm-stats">
          ${rows.map(([l, v]) => `<div class="pstat"><span class="label">${l}</span>${App.esc(v)}</div>`).join('')}
        </div>`;
    }

    const canManage = d.online && !offline;
    let manageHtml = '';
    if (canManage) {
      const gmOpts = ['survival', 'creative', 'adventure', 'spectator'].map(g =>
        `<option value="${g}" ${d.data && d.data.gamemode === g ? 'selected' : ''}>${g}</option>`).join('');
      const tpTargets = App.players.filter(p => p.toLowerCase() !== d.name.toLowerCase());
      const pos = d.data && d.data.pos ? d.data.pos : ['', '', ''];
      manageHtml = `
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
          <input id="pm-x" type="number" placeholder="x" value="${App.esc(pos[0])}">
          <input id="pm-y" type="number" placeholder="y" value="${App.esc(pos[1])}">
          <input id="pm-z" type="number" placeholder="z" value="${App.esc(pos[2])}">
          <button class="btn-sm" id="pm-tp-go">Teleport</button>
        </div>
        ${tpTargets.length ? `
        <div class="manage-row">
          <span class="manage-label">TP to player</span>
          <select id="pm-tp-target">${tpTargets.map(p => `<option>${App.esc(p)}</option>`).join('')}</select>
          <button class="btn-sm" id="pm-tpp-go">Teleport</button>
        </div>` : ''}
        <div class="manage-row give-row">
          <span class="manage-label">Give item</span>
          <span class="give-chosen slot" id="pm-item-icon"></span>
          <input id="pm-item" placeholder="Search items… e.g. diamond" autocomplete="off">
          <input id="pm-count" type="number" value="1" min="1" max="6400" style="max-width:80px">
          <button class="btn-sm" id="pm-give-go">Give</button>
        </div>
        <div class="give-results" id="pm-item-results"></div>`;
    }

    const notesHtml = `
      <textarea id="pm-note" rows="2" placeholder="Private notes about this player…" style="resize:vertical">${App.esc(d.note || '')}</textarea>
      <div class="btn-row" style="margin-top:8px"><button class="btn-sm" id="pm-note-save">Save note</button></div>`;

    box.innerHTML = `
      <div class="modal-overlay" id="pm-overlay">
        <div class="modal pm">
          <div class="player-head">
            <img src="https://mc-heads.net/avatar/${App.esc(d.name)}/48" alt="">
            <div style="min-width:0">
              <h1 style="margin:0">${App.esc(d.name)}</h1>
              <div class="pm-chips">${chips}</div>
              ${where ? `<div class="muted pm-where">${where}</div>` : ''}
            </div>
            <button id="pm-close" style="margin-left:auto" class="btn-icon" title="Close">${App.icon('x', 14)}</button>
          </div>
          ${vitalsHtml}
          ${canManage ? `
          <div class="pm-msg">
            <input id="pm-msg" maxlength="100" placeholder="Message on ${App.esc(d.name)}'s screen…" autocomplete="off">
            <button id="pm-msg-send" class="btn-primary btn-sm">${App.icon('send', 14)} Send</button>
          </div>` : ''}
          <div class="btn-row pm-actions">${actions}</div>
          ${sec('manage', 'Manage', manageHtml, false)}
          ${sec('inventory', `Inventory <span class="muted">${invCount} item${invCount === 1 ? '' : 's'}</span>`, invHtml, false)}
          ${sec('stats', 'Statistics', statsExtra, false)}
          ${sec('notes', `Admin notes${d.note ? ' <span class="muted">1 note</span>' : ''}`, notesHtml, false)}
        </div>
      </div>`;

    const overlay = document.getElementById('pm-overlay');
    // item icons are only fetched once the inventory is actually opened
    box.querySelectorAll('.pm-sec').forEach(el => {
      const opened = () => {
        if (el.dataset.sec === 'inventory' && el.open && !el.dataset.icons) { el.dataset.icons = '1'; this.loadItemIcons(el); }
      };
      el.addEventListener('toggle', () => { this.setSecOpen(el.dataset.sec, el.open); opened(); });
      opened();
    });
    // single close path so the Escape listener is always removed, however the
    // modal is dismissed (overlay click, close button, or Escape)
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { box.innerHTML = ''; document.removeEventListener('keydown', esc); };
    this._closeModal = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    document.getElementById('pm-close').onclick = close;
    document.addEventListener('keydown', esc);

    box.querySelectorAll('[data-act]').forEach(btn => {
      btn.onclick = async () => {
        if (await App.tryApi('/players/action', {
          method: 'POST', body: { action: btn.dataset.act, name: d.name }
        }, 'Done')) {
          // give the server a moment to update its json files, then refresh —
          // but only if we're still on the players page with the modal open
          setTimeout(() => {
            if (App.currentName !== 'players' || !document.getElementById('pm-overlay')) return;
            this.load();
            this.openModal(d.name);
          }, 600);
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
    const msgInput = document.getElementById('pm-msg');
    const sendMsg = async () => {
      const message = msgInput.value.trim();
      if (!message) return msgInput.focus();
      if (await App.tryApi('/server/announce', { method: 'POST', body: { message, to: d.name, ...App.msg.style() } }, `Shown to ${d.name}`)) msgInput.value = '';
    };
    on('pm-msg-send', sendMsg);
    if (msgInput) msgInput.onkeydown = (e) => { if (e.key === 'Enter') sendMsg(); };
    on('pm-gm-go', () =>
      act('gamemode', { mode: document.getElementById('pm-gm').value }, 'Gamemode changed'));
    on('pm-tp-go', () => act('tp-coords', {
      x: document.getElementById('pm-x').value,
      y: document.getElementById('pm-y').value,
      z: document.getElementById('pm-z').value
    }, 'Teleported'));
    on('pm-tpp-go', () =>
      act('tp-player', { target: document.getElementById('pm-tp-target').value }, 'Teleported'));
    this.wireGivePicker();
    on('pm-give-go', () => {
      const item = this.givePick();
      if (!item) return document.getElementById('pm-item').focus();
      act('give', { item, count: document.getElementById('pm-count').value }, 'Item given');
    });
  },

  secOpen(id, fallback) {
    try { const v = JSON.parse(localStorage.getItem('pm-open') || '{}')[id]; return v == null ? fallback : !!v; } catch (e) { return fallback; }
  },
  setSecOpen(id, open) {
    try {
      const all = JSON.parse(localStorage.getItem('pm-open') || '{}');
      all[id] = open;
      localStorage.setItem('pm-open', JSON.stringify(all));
    } catch (e) { /* not remembered, no harm */ }
  },

  // Wiki inventory-icon names that don't follow "Title_Case of the item id"
  WIKI_ICON: {
    tnt: 'TNT', jack_o_lantern: "Jack_o'Lantern", redstone: 'Redstone', iron_block: 'Block_of_Iron',
    gold_block: 'Block_of_Gold', diamond_block: 'Block_of_Diamond', emerald_block: 'Block_of_Emerald',
    lapis_block: 'Block_of_Lapis_Lazuli', coal_block: 'Block_of_Coal', redstone_block: 'Block_of_Redstone',
    netherite_block: 'Block_of_Netherite', copper_block: 'Block_of_Copper', quartz_block: 'Block_of_Quartz',
    amethyst_block: 'Block_of_Amethyst', raw_iron_block: 'Block_of_Raw_Iron', raw_gold_block: 'Block_of_Raw_Gold',
    raw_copper_block: 'Block_of_Raw_Copper', bamboo_block: 'Block_of_Bamboo', writable_book: 'Book_and_Quill',
    cooked_beef: 'Steak', beef: 'Raw_Beef', porkchop: 'Raw_Porkchop', chicken: 'Raw_Chicken', mutton: 'Raw_Mutton',
    rabbit: 'Raw_Rabbit', cod: 'Raw_Cod', salmon: 'Raw_Salmon', slime_ball: 'Slimeball', filled_map: 'Map',
    experience_bottle: "Bottle_o'_Enchanting", enchanted_golden_apple: 'Golden_Apple', nether_star: 'Nether_Star'
  },

  // Where to look for an item's picture, best first: the wiki's inventory icons
  // (they include blocks drawn in 3D, beds, chests, heads, spawn eggs…), then the
  // game's own flat textures, then the item name as text.
  itemIconUrls(id) {
    const small = new Set(['of', 'and', 'on', 'a', 'the', 'with', 'in', 'o']);
    const guess = this.WIKI_ICON[id] || id.split('_').map((w, i) => (i && small.has(w)) ? w : (w[0] || '').toUpperCase() + w.slice(1)).join('_');
    // the wiki names its icons after the item's real name, so use that when it's known
    const named = this.itemNames[id] ? this.itemNames[id].replace(/ /g, '_') : null;
    const wiki = [...new Set([this.WIKI_ICON[id], named, guess].filter(Boolean))];
    const base = 'https://assets.mcasset.cloud/latest/assets/minecraft/textures';
    return [
      ...wiki.map(w => `https://minecraft.wiki/images/Invicon_${encodeURIComponent(w)}.png`),
      `${base}/item/${id}.png`, `${base}/block/${id}.png`,
      `${base}/item/${id}_00.png`, `${base}/item/${id}_base.png`, `${base}/block/${id}_side.png`, `${base}/block/${id}_front.png`, `${base}/block/${id}_top.png`
    ];
  },

  // Put an item's picture into `el`, trying each source until one loads.
  attachIcon(el, id) {
    const urls = this.itemIconUrls(id);
    const img = new Image();
    img.className = 'slot-icon';
    img.loading = 'lazy';
    let i = 0;
    img.onerror = () => { if (++i < urls.length) img.src = urls[i]; else img.remove(); };
    img.onload = () => { const f = el.querySelector('.slot-fallback'); if (f) f.style.display = 'none'; };
    img.src = urls[0];
    el.insertBefore(img, el.firstChild);
  },

  async loadItemIcons(root) {
    await this.items(); // proper names give better picture matches and tooltips
    root.querySelectorAll('.slot.filled[data-item]').forEach(el => {
      const name = this.itemNames[el.dataset.item];
      if (name) el.title = el.title.replace(el.dataset.item, name);
      this.attachIcon(el, el.dataset.item);
    });
  },

  // Every item id with its English name ([{ id, name }]), fetched once.
  itemNames: {},
  items() {
    if (!this._items) {
      this._items = App.api('/players/items')
        .then(list => { for (const it of list) this.itemNames[it.id] = it.name; return list; })
        .catch(() => { this._items = null; return []; });
    }
    return this._items;
  },

  // "Give item": search by name, pick from a grid of pictures. Typing a full id
  // (e.g. a modded "create:wrench") still works.
  GIVE_COMMON: ['diamond', 'netherite_ingot', 'iron_ingot', 'golden_apple', 'cooked_beef', 'ender_pearl', 'elytra', 'totem_of_undying',
    'diamond_pickaxe', 'diamond_sword', 'bow', 'arrow', 'torch', 'oak_log', 'cobblestone', 'tnt', 'experience_bottle', 'shulker_box'],

  async wireGivePicker() {
    const input = document.getElementById('pm-item');
    const results = document.getElementById('pm-item-results');
    const chosen = document.getElementById('pm-item-icon');
    if (!input || !results) return;
    this._give = null;
    const pick = (it) => {
      this._give = it;
      input.value = it.name;
      chosen.innerHTML = '';
      chosen.classList.add('filled');
      this.attachIcon(chosen, it.id);
      results.innerHTML = '';
    };
    const show = async () => {
      const list = await this.items();
      if (!input.isConnected) return;
      const q = input.value.trim().toLowerCase();
      const idq = q.replace(/^minecraft:/, '').replace(/ /g, '_');
      let hits;
      if (!q) hits = this.GIVE_COMMON.map(id => list.find(it => it.id === id)).filter(Boolean);
      else {
        const starts = [], has = [];
        for (const it of list) {
          const n = it.name.toLowerCase();
          if (n.startsWith(q) || it.id.startsWith(idq)) starts.push(it);
          else if (n.includes(q) || it.id.includes(idq)) has.push(it);
        }
        starts.sort((a, b) => a.name.length - b.name.length); // closest match first
        hits = starts.concat(has).slice(0, 27);
      }
      results.innerHTML = hits.length
        ? hits.map(it => `<button type="button" class="give-item" data-id="${App.esc(it.id)}" title="${App.esc(it.name)} — minecraft:${App.esc(it.id)}">
            <span class="slot filled"><span class="slot-fallback"></span></span><span class="give-name">${App.esc(it.name)}</span></button>`).join('')
        : `<div class="muted give-none">${list.length ? 'No item with that name. A full id like <code>create:wrench</code> works too.' : 'Could not load the item list — type an id like <code>minecraft:diamond</code>.'}</div>`;
      results.querySelectorAll('.give-item').forEach(b => {
        this.attachIcon(b.querySelector('.slot'), b.dataset.id);
        b.onclick = () => pick(hits.find(it => it.id === b.dataset.id));
      });
    };
    input.onfocus = show;
    input.oninput = () => { this._give = null; chosen.innerHTML = ''; chosen.classList.remove('filled'); show(); };
  },

  // The item id to give: the picked one, an exact name/id match, or what was typed if it looks like an id.
  givePick() {
    const raw = document.getElementById('pm-item').value.trim();
    if (this._give && raw === this._give.name) return `minecraft:${this._give.id}`;
    const q = raw.toLowerCase();
    const idq = q.replace(/^minecraft:/, '').replace(/ /g, '_');
    const hit = Object.entries(this.itemNames).find(([id, name]) => id === idq || name.toLowerCase() === q);
    if (hit) return `minecraft:${hit[0]}`;
    return /^[a-z0-9_:.]+$/.test(q) ? q : '';
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

  onLeave() {
    // close any open modal so its Escape listener doesn't outlive the page
    if (this._closeModal) { this._closeModal(); this._closeModal = null; }
  },

  onPlayers() { if (this.tab === 'online') this.load(); },
  onStatus() { this.renderList(); }
};
