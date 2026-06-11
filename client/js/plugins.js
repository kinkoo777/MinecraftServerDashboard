App.pages.plugins = {
  dir: 'plugins',

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Plugins & Mods</h1>
        <div class="btn-row">
          <select id="pg-dir" style="width:130px">
            <option value="plugins">plugins/</option>
            <option value="mods">mods/</option>
          </select>
          <button id="pg-upload" class="btn-primary btn-sm">${App.icon('upload', 14)} Upload .jar</button>
          <input type="file" id="pg-input" accept=".jar" multiple style="display:none">
        </div>
      </div>
      <p class="muted" style="margin-bottom:16px">Plugins need a Paper/Spigot server jar; mods need Forge/Fabric. Restart the server after changes.</p>
      <div class="card">
        <h2>Browse Modrinth</h2>
        <div class="btn-row" style="margin-bottom:6px">
          <input id="mr-q" placeholder="Search plugins & mods…" style="flex:1;min-width:140px;width:auto">
          <select id="mr-loader" style="width:120px">
            <option value="paper">paper</option>
            <option value="spigot">spigot</option>
            <option value="fabric">fabric</option>
            <option value="forge">forge</option>
            <option value="neoforge">neoforge</option>
          </select>
          <button id="mr-go" class="btn-primary btn-sm">${App.icon('search', 14)} Search</button>
        </div>
        <div id="mr-results"></div>
      </div>
      <div class="card" id="pg-list"><div class="empty">Loading…</div></div>`;

    const dirSel = document.getElementById('pg-dir');
    dirSel.value = this.dir;
    dirSel.onchange = () => { this.dir = dirSel.value; this.load(); };

    document.getElementById('pg-upload').onclick = () => document.getElementById('pg-input').click();
    document.getElementById('pg-input').onchange = async (e) => {
      await App.tryApi('/files/mkdir', { method: 'POST', body: { path: this.dir } });
      const form = new FormData();
      for (const f of e.target.files) form.append('files', f);
      try {
        const res = await fetch(`/api/files/upload?path=${encodeURIComponent(this.dir)}`, { method: 'POST', body: form });
        if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
        App.toast('Uploaded — restart the server to load it');
        this.load();
      } catch (err) { App.toast(err.message, true); }
      e.target.value = '';
    };

    const doSearch = async () => {
      const q = document.getElementById('mr-q').value.trim();
      const loader = document.getElementById('mr-loader').value;
      const box = document.getElementById('mr-results');
      box.innerHTML = `<div class="empty">Searching…</div>`;
      const hits = await App.tryApi(`/modrinth/search?q=${encodeURIComponent(q)}&loader=${loader}`);
      if (!hits || !box.isConnected) return;
      if (!hits.length) { box.innerHTML = `<div class="empty">No results</div>`; return; }
      box.innerHTML = hits.map(h => `
        <div class="mr-row">
          <img src="${h.icon ? App.esc(h.icon) : 'icon.svg'}" alt="" loading="lazy">
          <div class="mr-info">
            <div class="t">${App.esc(h.title)} <span class="muted" style="font-weight:400;font-size:11px">${(h.downloads / 1000).toFixed(0)}k downloads</span></div>
            <div class="d">${App.esc(h.description)}</div>
          </div>
          <button class="btn-sm" data-install="${App.esc(h.slug)}">Install</button>
        </div>`).join('');
      box.querySelectorAll('[data-install]').forEach(b => {
        b.onclick = async () => {
          b.disabled = true;
          b.textContent = 'Installing…';
          const r = await App.tryApi('/modrinth/install', { method: 'POST', body: { slug: b.dataset.install, loader } });
          b.disabled = false;
          b.textContent = r ? 'Installed ✓' : 'Install';
          if (r) {
            App.toast(`Installed ${r.file} (${r.version}) — restart the server to load it`);
            this.dir = ['fabric', 'forge', 'neoforge'].includes(loader) ? 'mods' : 'plugins';
            document.getElementById('pg-dir').value = this.dir;
            this.load();
          }
        };
      });
    };
    document.getElementById('mr-go').onclick = doSearch;
    document.getElementById('mr-q').onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };

    await this.load();
  },

  async load() {
    const box = document.getElementById('pg-list');
    let data;
    try {
      data = await App.api(`/files?path=${encodeURIComponent(this.dir)}`);
    } catch (e) {
      box.innerHTML = `<div class="empty">No <b>${this.dir}/</b> folder yet — upload a .jar to create it.</div>`;
      return;
    }
    const jars = data.items.filter(it => !it.dir && it.name.endsWith('.jar'));
    if (!jars.length) {
      box.innerHTML = `<div class="empty">No .jar files in ${this.dir}/</div>`;
      return;
    }
    box.innerHTML = `<table>
      <thead><tr><th>File</th><th>Size</th><th>Modified</th><th></th></tr></thead>
      <tbody>${jars.map(j => `
        <tr>
          <td><span style="display:inline-flex;align-items:center;gap:10px">${App.icon('plugins', 15)} ${App.esc(j.name)}</span></td>
          <td class="muted">${App.fmtBytes(j.size)}</td>
          <td class="muted">${new Date(j.modified).toLocaleString()}</td>
          <td style="text-align:right"><button class="btn-icon btn-danger" title="Delete" data-del="${App.esc(j.name)}">${App.icon('trash', 14)}</button></td>
        </tr>`).join('')}</tbody>
    </table>`;

    box.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = async () => {
        if (!confirm(`Delete "${b.dataset.del}"?`)) return;
        if (await App.tryApi(`/files?path=${encodeURIComponent(this.dir + '/' + b.dataset.del)}`, { method: 'DELETE' }, 'Deleted')) this.load();
      };
    });
  }
};
