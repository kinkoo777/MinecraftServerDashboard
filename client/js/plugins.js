App.pages.plugins = {
  dir: 'plugins',

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Content</h1>
        <div class="btn-row">
          <select id="pg-dir" style="width:130px">
            <option value="plugins">plugins/</option>
            <option value="mods">mods/</option>
          </select>
          <button id="pg-upload" class="btn-primary btn-sm">${App.icon('upload', 14)} Upload .jar</button>
          <input type="file" id="pg-input" accept=".jar" multiple style="display:none">
        </div>
      </div>
      <p class="muted" id="pg-hint" style="margin-bottom:16px"></p>
      <div id="disc-root"></div>
      <div class="card" id="pg-list"><div class="empty">Loading…</div></div>`;

    const cfg = await App.tryApi('/settings/config');
    this.ctx = this.serverCtx(cfg);
    const hint = document.getElementById('pg-hint');
    hint.textContent = this.ctx.modded
      ? `Your server is ${this.ctx.type} ${this.ctx.mc || ''}${this.ctx.modpackName ? ` (via ${this.ctx.modpackName})` : ''} — install mods below. Plugins won't load on a modded server. Restart after changes.`
      : `Your server is ${this.ctx.type || 'not installed yet'} — plugins need Paper/Spigot; mods need a Fabric/NeoForge/Forge server (Settings → Server software). Restart after changes.`;
    this.dir = this.ctx.modded ? 'mods' : 'plugins';

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
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
        App.toast('Uploaded — restart the server to load it');
        this.load();
      } catch (err) { App.toast(err.message, true); }
      e.target.value = '';
    };

    App.discover.mount(document.getElementById('disc-root'), this.ctx, {
      onInstalled: (dir) => { this.dir = dir; dirSel.value = dir; this.load(); }
    });
    await this.load();
  },

  serverCtx(cfg) {
    const [type, mc] = ((cfg && cfg.installedJar) || '').split(' ');
    const modded = ['fabric', 'neoforge', 'forge'].includes(type);
    return { type: type || null, mc: mc || null, modded, loader: modded ? type : 'paper', modpackName: (cfg && cfg.modpackName) || '' };
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
      <thead><tr><th>File</th><th>Size</th><th>Modified</th><th>Update</th><th></th></tr></thead>
      <tbody>${jars.map(j => `
        <tr data-row="${App.esc(j.name)}">
          <td><span style="display:inline-flex;align-items:center;gap:10px">${App.icon('plugins', 15)} ${App.esc(j.name)}</span></td>
          <td class="muted">${App.fmtBytes(j.size)}</td>
          <td class="muted">${new Date(j.modified).toLocaleString()}</td>
          <td class="pg-update muted" style="font-size:12px">Checking…</td>
          <td style="text-align:right"><button class="btn-icon btn-danger" title="Delete" data-del="${App.esc(j.name)}">${App.icon('trash', 14)}</button></td>
        </tr>`).join('')}</tbody>
    </table>`;

    box.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = async () => {
        if (!confirm(`Delete "${b.dataset.del}"?`)) return;
        if (await App.tryApi(`/files?path=${encodeURIComponent(this.dir + '/' + b.dataset.del)}`, { method: 'DELETE' }, 'Deleted')) this.load();
      };
    });

    this.checkUpdates(box);
  },

  // Fill in the Update column asynchronously so a slow/unreachable Modrinth never
  // blocks the jar list. `box` is captured so a directory switch mid-flight is a no-op.
  async checkUpdates(box) {
    const loader = this.dir === 'mods' ? (this.ctx && this.ctx.modded ? this.ctx.type : 'fabric') : 'paper';
    const res = await App.tryApi(`/modrinth/check-updates?path=${encodeURIComponent(this.dir)}`);
    if (!box.isConnected) return;
    if (!res) { box.querySelectorAll('.pg-update').forEach(c => { c.textContent = ''; }); return; }
    const byFile = {};
    for (const it of res.items) byFile[it.file] = it;

    box.querySelectorAll('tr[data-row]').forEach(row => {
      const cell = row.querySelector('.pg-update');
      if (!cell) return;
      const it = byFile[row.dataset.row];
      if (!it || !it.matched) { cell.textContent = it ? 'Unknown' : ''; return; }
      if (!it.updateAvailable) {
        cell.className = 'pg-update';
        cell.innerHTML = `<span style="color:var(--ok,#3fb950)">Up to date</span> <span class="muted">${App.esc(it.latestVersion)}</span>`;
        return;
      }
      cell.className = 'pg-update';
      cell.innerHTML = `<button class="btn-sm" data-update="${App.esc(it.latestVersionId)}"
        title="${App.esc(it.currentVersion)} → ${App.esc(it.latestVersion)}">Update to ${App.esc(it.latestVersion)}</button>`;
      const btn = cell.querySelector('[data-update]');
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Updating…';
        const r = await App.tryApi('/modrinth/install', {
          method: 'POST',
          body: { loader, versionId: btn.dataset.update, replaceFile: row.dataset.row }
        });
        if (r) {
          App.toast(`Updated to ${r.file} (${r.version}) — restart the server to load it`);
          this.load();
        } else {
          btn.disabled = false;
          btn.textContent = `Update to ${it.latestVersion}`;
        }
      };
    });
  }
};
