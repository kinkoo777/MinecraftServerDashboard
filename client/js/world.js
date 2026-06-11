App.pages.world = {
  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>World</h1>
        <button id="w-backup" class="btn-primary">${App.icon('archive', 14)} Create backup</button>
      </div>
      <div class="grid grid-4" id="w-info"></div>
      <div class="card">
        <h2>Backups</h2>
        <div id="w-backups"><div class="empty">Loading…</div></div>
      </div>
      <div class="card">
        <h2 style="color:var(--red)">Danger zone</h2>
        <p class="muted" style="margin-bottom:12px">Deleting the world removes the world folder permanently. The server must be stopped. Make a backup first.</p>
        <button id="w-delete" class="btn-danger">Delete world</button>
      </div>`;

    document.getElementById('w-backup').onclick = async () => {
      const btn = document.getElementById('w-backup');
      btn.disabled = true;
      btn.textContent = 'Backing up…';
      await App.tryApi('/world/backup', { method: 'POST' }, 'Backup created');
      btn.disabled = false;
      btn.innerHTML = `${App.icon('archive', 14)} Create backup`;
      this.load();
    };

    document.getElementById('w-delete').onclick = async () => {
      if (!confirm('Really delete the world? This cannot be undone.')) return;
      if (await App.tryApi('/world', { method: 'DELETE' }, 'World deleted')) this.load();
    };

    await this.load();
  },

  async load() {
    const data = await App.tryApi('/world');
    if (!data) return;

    const info = document.getElementById('w-info');
    if (info) info.innerHTML = `
      <div class="card stat-card"><div class="label">World name</div><div class="value" style="font-size:18px">${App.esc(data.name)}</div></div>
      <div class="card stat-card"><div class="label">Seed</div><div class="value" style="font-size:18px">${App.esc(data.seed)}</div></div>
      <div class="card stat-card"><div class="label">Size on disk</div><div class="value" style="font-size:18px">${data.exists ? App.fmtBytes(data.size) : 'not generated'}</div></div>
      <div class="card stat-card"><div class="label">Backups</div><div class="value" style="font-size:18px">${data.backups.length}</div></div>`;

    const box = document.getElementById('w-backups');
    if (!box) return;
    if (!data.backups.length) {
      box.innerHTML = `<div class="empty">No backups yet</div>`;
      return;
    }
    box.innerHTML = `<table>
      <thead><tr><th>File</th><th>Size</th><th>Created</th><th></th></tr></thead>
      <tbody>${data.backups.map(b => `
        <tr>
          <td>${App.esc(b.name)}</td>
          <td>${App.fmtBytes(b.size)}</td>
          <td class="muted">${new Date(b.created).toLocaleString()}</td>
          <td style="text-align:right">
            <a class="btn btn-icon" title="Download" href="/api/world/backup/${encodeURIComponent(b.name)}">${App.icon('download', 14)}</a>
            <button class="btn-icon" title="Restore this backup" data-restore="${App.esc(b.name)}">${App.icon('restore', 14)}</button>
            <button class="btn-icon btn-danger" title="Delete backup" data-del="${App.esc(b.name)}">${App.icon('trash', 14)}</button>
          </td>
        </tr>`).join('')}</tbody>
    </table>`;

    box.querySelectorAll('[data-restore]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm(`Restore "${btn.dataset.restore}"? The current world will be replaced. Server must be stopped.`)) return;
        if (await App.tryApi('/world/restore', { method: 'POST', body: { name: btn.dataset.restore } }, 'World restored')) this.load();
      };
    });
    box.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm(`Delete backup "${btn.dataset.del}"?`)) return;
        if (await App.tryApi(`/world/backup/${encodeURIComponent(btn.dataset.del)}`, { method: 'DELETE' }, 'Backup deleted')) this.load();
      };
    });
  }
};
