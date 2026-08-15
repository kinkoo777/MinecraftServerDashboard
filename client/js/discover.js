// Discover zone for the Content page — browse Modrinth (plugins/mods/modpacks).
App.discover = {
  ctx: null, hooks: null, root: null,
  state: { tab: 'plugins', q: '', sort: 'relevance', category: '', gameVersion: '', loader: 'paper', offset: 0, total: 0, hits: [], busy: false, reqId: 0 },
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
    const myReq = ++s.reqId;
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
    if (myReq !== s.reqId) return; // a newer search superseded this one — do nothing at all, not even cleanup
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

  async openDetails(slug) {
    const [p, versions] = await Promise.all([
      App.tryApi(`/modrinth/project/${encodeURIComponent(slug)}`),
      App.tryApi(`/modrinth/project/${encodeURIComponent(slug)}/versions?` + new URLSearchParams({
        ...(this.state.tab !== 'modpacks' ? { loader: this.state.loader } : {}),
        ...(this.state.gameVersion ? { gameVersion: this.state.gameVersion } : {})
      }))
    ]);
    if (!p) return;
    const vlist = versions || [];
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal" style="max-width:640px">
        <div class="disc-modal-head">
          <img src="${p.icon ? App.esc(p.icon) : 'icon.png'}" alt="">
          <div style="flex:1;min-width:0">
            <h2 style="margin:0">${App.esc(p.title)}</h2>
            <div class="muted" style="font-size:12px">${(p.downloads / 1000).toFixed(0)}k downloads · ${p.followers} followers
              ${p.sourceUrl ? ` · <a href="${App.esc(p.sourceUrl)}" target="_blank" rel="noopener">Source</a>` : ''}</div>
            <div style="margin-top:4px">${(p.categories || []).slice(0, 6).map(c => `<span class="badge">${App.esc(c)}</span>`).join(' ')}</div>
          </div>
          <button class="btn-icon" id="disc-close" title="Close">✕</button>
        </div>
        ${p.gallery.length ? `<div class="disc-gallery">${p.gallery.map(g =>
          `<img src="${App.esc(g.url)}" title="${App.esc(g.title)}" loading="lazy" data-full="${App.esc(g.url)}">`).join('')}</div>` : ''}
        <div class="disc-body">${this.sanitizeBody(p.body || p.description || '')}</div>
        <div class="disc-verrow">
          <select id="disc-ver">${vlist.length ? vlist.map(v => `
            <option value="${App.esc(v.id)}">${App.esc(v.versionNumber)} — MC ${App.esc((v.gameVersions || []).slice(-1)[0] || '?')} · ${App.esc((v.loaders || []).join('/'))} · ${App.esc(v.versionType)}</option>`).join('')
            : '<option value="">No compatible versions</option>'}</select>
          <button class="btn-primary btn-sm" id="disc-install" ${vlist.length ? '' : 'disabled'}>
            ${p.projectType === 'modpack' ? 'Install modpack…' : 'Install'}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.querySelector('#disc-close').onclick = () => ov.remove();
    ov.querySelectorAll('.disc-gallery img').forEach(img => { img.onclick = () => window.open(img.dataset.full, '_blank', 'noopener'); });
    ov.querySelector('#disc-install').onclick = () => {
      const versionId = ov.querySelector('#disc-ver').value;
      const v = vlist.find(x => x.id === versionId);
      if (!versionId || !v) return;
      if (p.projectType === 'modpack') this.startPackInstall(p, v, ov);
      else this.installVersion(p, v, ov.querySelector('#disc-install'));
    };
  },

  async installVersion(p, v, btn) {
    btn.disabled = true;
    btn.textContent = 'Installing…';
    const loader = (v.loaders || []).includes(this.state.loader) ? this.state.loader : (v.loaders || [])[0];
    const r = await App.tryApi('/modrinth/install', { method: 'POST', body: { loader, versionId: v.id } });
    btn.disabled = false;
    btn.textContent = r ? 'Installed ✓' : 'Install';
    if (r) {
      App.toast(`Installed ${r.file} (${r.version}) — restart the server to load it`);
      const dir = ['fabric', 'neoforge', 'forge'].includes(loader) ? 'mods' : 'plugins';
      if (this.hooks.onInstalled) this.hooks.onInstalled(dir);
    }
  },

  startPackInstall() { App.toast('Modpack install lands in an upcoming commit'); },

  // Escape-first markdown subset, then DOMParser whitelist rebuild for raw-HTML bodies.
  sanitizeBody(src) {
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(src);
    const html = looksHtml ? src : this.miniMarkdown(src);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ALLOW = new Set(['P', 'BR', 'A', 'IMG', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'CODE', 'PRE', 'BLOCKQUOTE', 'HR', 'DETAILS', 'SUMMARY', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'CENTER', 'DIV', 'SPAN']);
    const okImg = (u) => { try { const h = new URL(u, location.href).hostname; return h.endsWith('modrinth.com') || h.endsWith('githubusercontent.com'); } catch (e) { return false; } };
    const okHref = (u) => { try { return new URL(u, location.href).protocol === 'https:'; } catch (e) { return false; } };
    const walk = (node, out) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) { out.appendChild(document.createTextNode(child.textContent)); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        if (!ALLOW.has(child.tagName)) { walk(child, out); continue; } // unwrap unknown tags, keep their text
        const el = document.createElement(child.tagName.toLowerCase());
        if (child.tagName === 'A' && okHref(child.getAttribute('href') || '')) {
          el.setAttribute('href', child.getAttribute('href'));
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener');
        }
        if (child.tagName === 'IMG') {
          const src2 = child.getAttribute('src') || '';
          if (!okImg(src2)) continue; // drop the image entirely
          el.setAttribute('src', src2);
          el.setAttribute('loading', 'lazy');
          if (child.getAttribute('alt')) el.setAttribute('alt', child.getAttribute('alt'));
        }
        walk(child, el);
        out.appendChild(el);
      }
    };
    const out = document.createElement('div');
    walk(doc.body, out);
    return out.innerHTML;
  },

  // Minimal markdown for md-only bodies: headings, bold/italic, inline code, fenced code,
  // links, images, unordered lists, paragraphs. Input is escaped FIRST so nothing injects.
  miniMarkdown(src) {
    const esc = App.esc(src);
    const lines = esc.split(/\r?\n/);
    let out = [], inCode = false, inList = false;
    const inline = (t) => t
      .replace(/!\[([^\]]*)\]\((https:[^)\s]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\((https:[^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    for (const line of lines) {
      if (/^```/.test(line)) { out.push(inCode ? '</pre>' : '<pre>'); inCode = !inCode; continue; }
      if (inCode) { out.push(line); continue; }
      const h = line.match(/^(#{1,6})\s+(.*)/);
      if (h) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
      if (/^\s*[-*]\s+/.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
        continue;
      }
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line.trim() ? `<p>${inline(line)}</p>` : '');
    }
    if (inList) out.push('</ul>');
    if (inCode) out.push('</pre>');
    return out.join('\n');
  }
};
