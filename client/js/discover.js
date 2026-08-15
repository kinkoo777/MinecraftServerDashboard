// Discover zone for the Content page — browse Modrinth (plugins/mods/modpacks).
App.discover = {
  ctx: null, hooks: null, root: null,
  state: { tab: 'plugins', q: '', sort: 'relevance', category: '', gameVersion: '', loader: 'paper', offset: 0, total: 0, hits: [], busy: false },
  LOADERS: { plugins: ['paper', 'spigot', 'bukkit'], mods: ['fabric', 'neoforge', 'forge'], modpacks: ['fabric', 'neoforge', 'forge'] },
  TYPE: { plugins: 'plugin', mods: 'mod', modpacks: 'modpack' },

  mount(root, ctx, hooks) {
    this.root = root; this.ctx = ctx || {}; this.hooks = hooks || {};
    const s = this.state;
    s.tab = this.ctx.modded ? 'mods' : 'plugins';
    s.loader = this.ctx.modded ? this.ctx.type : 'paper';
    s.gameVersion = this.ctx.mc || '';
    s.q = ''; s.sort = 'downloads'; s.category = ''; s.offset = 0; s.hits = []; s.total = 0;
    this.renderShell();
    this.loadCategories();
    this.search(true);
  },

  renderShell() {
    const s = this.state;
    this.root.innerHTML = `
      <div class="card">
        <div class="disc-tabs">
          ${['plugins', 'mods', 'modpacks'].map(t =>
            `<button class="disc-tab${s.tab === t ? ' active' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
        </div>
        <div class="disc-controls">
          <input id="disc-q" placeholder="Search Modrinth…" value="${App.esc(s.q)}">
          <select id="disc-loader"></select>
          <select id="disc-sort">
            <option value="relevance">Relevance</option>
            <option value="downloads" selected>Downloads</option>
            <option value="updated">Recently updated</option>
            <option value="newest">Newest</option>
          </select>
          <select id="disc-cat"><option value="">All categories</option></select>
          <select id="disc-gv"><option value="">Any MC version</option></select>
          <button id="disc-go" class="btn-primary btn-sm">${App.icon('search', 14)} Search</button>
        </div>
        <div id="disc-results"></div>
      </div>`;

    this.fillLoaderSelect();
    this.fillGameVersions();
    this.root.querySelectorAll('.disc-tab').forEach(b => {
      b.onclick = () => {
        this.state.tab = b.dataset.tab;
        this.state.category = '';
        this.state.loader = this.state.tab === 'plugins'
          ? 'paper'
          : (this.ctx.modded ? this.ctx.type : 'fabric');
        this.renderShell();
        this.loadCategories();
        this.state.busy = false;
        this.search(true);
      };
    });
    document.getElementById('disc-go').onclick = () => this.search(true);
    document.getElementById('disc-q').onkeydown = (e) => { if (e.key === 'Enter') this.search(true); };
    ['disc-loader', 'disc-sort', 'disc-cat', 'disc-gv'].forEach(id => {
      document.getElementById(id).onchange = () => {
        const s2 = this.state;
        s2.loader = document.getElementById('disc-loader').value;
        s2.sort = document.getElementById('disc-sort').value;
        s2.category = document.getElementById('disc-cat').value;
        s2.gameVersion = document.getElementById('disc-gv').value;
        this.search(true);
      };
    });
    document.getElementById('disc-sort').value = s.sort;
  },

  fillLoaderSelect() {
    const sel = document.getElementById('disc-loader');
    sel.innerHTML = this.LOADERS[this.state.tab].map(l => `<option value="${l}"${l === this.state.loader ? ' selected' : ''}>${l}</option>`).join('');
  },

  // MC version filter: server's own version + the project versions Modrinth knows.
  // Keep it simple: offer the server's version + "any"; more granular filtering can
  // use the details modal's version list.
  fillGameVersions() {
    const sel = document.getElementById('disc-gv');
    const mine = this.ctx.mc;
    sel.innerHTML = `<option value="">Any MC version</option>` +
      (mine ? `<option value="${App.esc(mine)}"${this.state.gameVersion === mine ? ' selected' : ''}>${App.esc(mine)} (your server)</option>` : '');
  },

  async loadCategories() {
    const cats = await App.tryApi(`/modrinth/categories?type=${this.TYPE[this.state.tab]}`);
    const sel = document.getElementById('disc-cat');
    if (!cats || !sel) return;
    sel.innerHTML = `<option value="">All categories</option>` +
      cats.map(c => `<option value="${App.esc(c)}"${c === this.state.category ? ' selected' : ''}>${App.esc(c)}</option>`).join('');
  },

  async search(reset) {
    const s = this.state;
    if (s.busy) return;
    s.busy = true;
    if (reset) { s.offset = 0; s.hits = []; }
    s.q = (document.getElementById('disc-q') || { value: s.q }).value.trim();
    const box = document.getElementById('disc-results');
    if (reset) box.innerHTML = `<div class="empty">Searching…</div>`;
    const params = new URLSearchParams({
      q: s.q, type: this.TYPE[s.tab], loader: s.loader, sort: s.sort, offset: String(s.offset)
    });
    if (s.gameVersion) params.set('gameVersion', s.gameVersion);
    if (s.category) params.set('category', s.category);
    const r = await App.tryApi(`/modrinth/search?${params}`);
    s.busy = false;
    if (!r || !box.isConnected) {
      const more = document.getElementById('disc-more');
      if (more) { more.disabled = false; more.textContent = `Load more (${s.hits.length} of ${s.total})`; }
      return;
    }
    s.total = r.total;
    s.hits = s.hits.concat(r.hits);
    this.renderResults();
  },

  renderResults() {
    const s = this.state;
    const box = document.getElementById('disc-results');
    if (!s.hits.length) { box.innerHTML = `<div class="empty">No results</div>`; return; }
    box.innerHTML = s.hits.map(h => `
      <div class="mr-row">
        <img src="${h.icon ? App.esc(h.icon) : 'icon.png'}" alt="" loading="lazy">
        <div class="mr-info">
          <div class="t">${App.esc(h.title)} <span class="muted" style="font-weight:400;font-size:11px">${(h.downloads / 1000).toFixed(0)}k downloads</span></div>
          <div class="d">${App.esc(h.description)}</div>
        </div>
        <button class="btn-sm" data-details="${App.esc(h.slug)}">Details</button>
        ${s.tab === 'modpacks' ? '' : `<button class="btn-sm" data-install="${App.esc(h.slug)}">Install</button>`}
      </div>`).join('') +
      (s.hits.length < s.total
        ? `<button class="btn-sm disc-more" id="disc-more">Load more (${s.hits.length} of ${s.total})</button>`
        : `<div class="muted disc-total" style="text-align:center;margin-top:8px">${s.hits.length} of ${s.total}</div>`);
    const more = document.getElementById('disc-more');
    if (more) more.onclick = () => { more.disabled = true; more.textContent = 'Loading…'; s.offset += 20; this.search(false); };
    box.querySelectorAll('[data-install]').forEach(b => { b.onclick = () => this.quickInstall(b); });
    box.querySelectorAll('[data-details]').forEach(b => { b.onclick = () => this.openDetails(b.dataset.details); });
  },

  async quickInstall(btn) {
    const s = this.state;
    btn.disabled = true;
    btn.textContent = 'Installing…';
    const body = { slug: btn.dataset.install, loader: s.loader };
    if (s.gameVersion) body.gameVersion = s.gameVersion;
    const r = await App.tryApi('/modrinth/install', { method: 'POST', body });
    btn.disabled = false;
    btn.textContent = r ? 'Installed ✓' : 'Install';
    if (r) {
      App.toast(`Installed ${r.file} (${r.version}) — restart the server to load it`);
      const dir = ['fabric', 'neoforge', 'forge'].includes(s.loader) ? 'mods' : 'plugins';
      if (this.hooks.onInstalled) this.hooks.onInstalled(dir);
    }
  },

  openDetails(slug) { App.toast('Details view lands in the next commit'); }
};
