App.pages.files = {
  path: '',

  render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Files</h1>
        <div class="btn-row">
          <button id="f-mkdir" class="btn-sm">${App.icon('folderplus', 14)} New folder</button>
          <button id="f-upload" class="btn-primary btn-sm">${App.icon('upload', 14)} Upload</button>
          <input type="file" id="f-input" multiple style="display:none">
        </div>
      </div>
      <div class="breadcrumb" id="f-crumbs"></div>
      <div class="card" id="f-list"><div class="empty">Loading…</div></div>
      <div class="card" id="f-editor" style="display:none">
        <h2 id="f-editor-name"></h2>
        <textarea id="f-editor-text" rows="18" style="font-family:var(--mono);font-size:12.5px"></textarea>
        <div class="btn-row" style="margin-top:12px">
          <button id="f-editor-save" class="btn-primary">Save file</button>
          <button id="f-editor-close">Close</button>
        </div>
      </div>`;

    document.getElementById('f-upload').onclick = () => document.getElementById('f-input').click();
    document.getElementById('f-input').onchange = async (e) => {
      const form = new FormData();
      for (const f of e.target.files) form.append('files', f);
      try {
        const res = await fetch(`/api/files/upload?path=${encodeURIComponent(this.path)}`, { method: 'POST', body: form });
        if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
        App.toast(`Uploaded ${e.target.files.length} file(s)`);
        this.load();
      } catch (err) { App.toast(err.message, true); }
      e.target.value = '';
    };

    document.getElementById('f-mkdir').onclick = async () => {
      const name = prompt('Folder name:');
      if (!name) return;
      if (await App.tryApi('/files/mkdir', { method: 'POST', body: { path: this.joinPath(name) } }, 'Folder created')) this.load();
    };

    this.load();
  },

  joinPath(name) { return this.path ? `${this.path}/${name}` : name; },

  async load() {
    const data = await App.tryApi(`/files?path=${encodeURIComponent(this.path)}`);
    if (!data) return;

    // breadcrumb
    const crumbs = document.getElementById('f-crumbs');
    const parts = this.path ? this.path.split('/') : [];
    let acc = '';
    crumbs.innerHTML = `<a data-path="">server root</a>` + parts.map(p => {
      acc += (acc ? '/' : '') + p;
      return ` / <a data-path="${App.esc(acc)}">${App.esc(p)}</a>`;
    }).join('');
    crumbs.querySelectorAll('a').forEach(a => {
      a.onclick = () => { this.path = a.dataset.path; this.load(); };
    });

    const box = document.getElementById('f-list');
    if (!data.items.length) {
      box.innerHTML = `<div class="empty">Empty folder</div>`;
      return;
    }
    box.innerHTML = `<table>
      <thead><tr><th>Name</th><th style="width:100px">Size</th><th style="width:170px">Modified</th><th style="width:220px"></th></tr></thead>
      <tbody>${data.items.map(it => `
        <tr class="file-row">
          <td><span class="file-name ${it.dir ? 'is-dir' : ''}" data-nav="${it.dir ? App.esc(it.name) : ''}">${App.icon(it.dir ? 'folder' : 'file', 15)} ${App.esc(it.name)}</span></td>
          <td class="muted">${it.dir ? '—' : App.fmtBytes(it.size)}</td>
          <td class="muted">${new Date(it.modified).toLocaleString()}</td>
          <td><div class="file-actions">
            ${!it.dir ? `<a class="btn btn-icon" title="Download" href="/api/files/download?path=${encodeURIComponent(this.joinPath(it.name))}">${App.icon('download', 14)}</a>` : ''}
            ${!it.dir && it.size < 512 * 1024 ? `<button class="btn-icon" title="Edit" data-edit="${App.esc(it.name)}">${App.icon('edit', 14)}</button>` : ''}
            <button class="btn-icon" title="Rename" data-rename="${App.esc(it.name)}">${App.icon('rename', 14)}</button>
            <button class="btn-icon btn-danger" title="Delete" data-delete="${App.esc(it.name)}">${App.icon('trash', 14)}</button>
          </div></td>
        </tr>`).join('')}</tbody>
    </table>`;

    box.querySelectorAll('[data-nav]').forEach(s => {
      if (!s.dataset.nav) return;
      s.onclick = () => { this.path = this.joinPath(s.dataset.nav); this.load(); };
    });
    box.querySelectorAll('[data-rename]').forEach(b => {
      b.onclick = async () => {
        const to = prompt('New name:', b.dataset.rename);
        if (!to || to === b.dataset.rename) return;
        if (await App.tryApi('/files/rename', {
          method: 'POST',
          body: { from: this.joinPath(b.dataset.rename), to: this.joinPath(to) }
        }, 'Renamed')) this.load();
      };
    });
    box.querySelectorAll('[data-delete]').forEach(b => {
      b.onclick = async () => {
        if (!confirm(`Delete "${b.dataset.delete}"?`)) return;
        if (await App.tryApi(`/files?path=${encodeURIComponent(this.joinPath(b.dataset.delete))}`, { method: 'DELETE' }, 'Deleted')) this.load();
      };
    });
    box.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => this.openEditor(b.dataset.edit);
    });
  },

  async openEditor(name) {
    const rel = this.joinPath(name);
    const data = await App.tryApi(`/files/content?path=${encodeURIComponent(rel)}`);
    if (!data) return;
    const panel = document.getElementById('f-editor');
    panel.style.display = '';
    document.getElementById('f-editor-name').textContent = rel;
    document.getElementById('f-editor-text').value = data.content;
    document.getElementById('f-editor-save').onclick = async () => {
      await App.tryApi('/files/content', {
        method: 'PUT',
        body: { path: rel, content: document.getElementById('f-editor-text').value }
      }, 'File saved');
    };
    document.getElementById('f-editor-close').onclick = () => { panel.style.display = 'none'; };
    panel.scrollIntoView({ behavior: 'smooth' });
  }
};
