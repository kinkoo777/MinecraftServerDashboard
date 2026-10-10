App.pages.files = {
  path: '',

  render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Files</h1>
        <div class="btn-row">
          <button id="f-mkdir" class="btn-sm">${App.icon('folderplus', 14)} New folder</button>
          <button id="f-upload-dir" class="btn-sm">${App.icon('folder', 14)} Upload folder</button>
          <button id="f-upload" class="btn-primary btn-sm">${App.icon('upload', 14)} Upload</button>
          <input type="file" id="f-input" multiple style="display:none">
          <input type="file" id="f-input-dir" webkitdirectory multiple style="display:none">
        </div>
      </div>
      <div class="breadcrumb" id="f-crumbs"></div>
      <div class="hint muted" id="f-progress" style="margin:-6px 0 10px">Tip: drag files or whole folders onto the list to upload them here.</div>
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
    document.getElementById('f-upload-dir').onclick = () => document.getElementById('f-input-dir').click();
    // webkitRelativePath is "picked-folder/sub/file" for the folder picker, '' for plain files
    const onPick = async (e) => {
      const list = [...e.target.files].map(f => ({ file: f, rel: f.webkitRelativePath || f.name }));
      e.target.value = '';
      await this.uploadAll(list);
    };
    document.getElementById('f-input').onchange = onPick;
    document.getElementById('f-input-dir').onchange = onPick;

    // drag & drop of files or folders onto the listing
    const zone = document.getElementById('f-list');
    let depth = 0; // dragenter/leave fire for every child element
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    zone.ondragenter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; zone.classList.add('drop-over'); };
    zone.ondragover = (e) => { if (hasFiles(e)) e.preventDefault(); };
    zone.ondragleave = () => { if (--depth <= 0) { depth = 0; zone.classList.remove('drop-over'); } };
    zone.ondrop = async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      zone.classList.remove('drop-over');
      try {
        await this.uploadAll(await this.collectDropped(e.dataTransfer));
      } catch (err) { App.toast(`Could not read the dropped items: ${err.message || err}`, true); }
    };

    document.getElementById('f-mkdir').onclick = async () => {
      const name = prompt('Folder name:');
      if (!name) return;
      if (await App.tryApi('/files/mkdir', { method: 'POST', body: { path: this.joinPath(name) } }, 'Folder created')) this.load();
    };

    this.load();
  },

  joinPath(name) { return this.path ? `${this.path}/${name}` : name; },

  // Flatten a drop (files and/or folders) into [{ file, rel }], rel = path inside the drop
  async collectDropped(dt) {
    // entries must be taken synchronously — the DataTransfer is emptied once the handler yields
    const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return [...dt.files].map(f => ({ file: f, rel: f.name }));
    const out = [];
    const walk = async (entry, prefix) => {
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        out.push({ file, rel: prefix + entry.name });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) { // readEntries returns the folder in chunks; empty = done
          const chunk = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!chunk.length) break;
          for (const child of chunk) await walk(child, `${prefix}${entry.name}/`);
        }
      }
    };
    for (const entry of entries) await walk(entry, '');
    return out;
  },

  // Upload [{ file, rel }] into the current folder, in batches so a big folder
  // (a modpack, a world) is neither one giant request nor thousands of tiny ones.
  async uploadAll(list) {
    if (!list.length || this.uploading) return;
    this.uploading = true;
    const dest = this.path;
    const prog = document.getElementById('f-progress');
    const idle = prog ? prog.textContent : '';
    let done = 0;
    try {
      for (let i = 0; i < list.length;) {
        const form = new FormData();
        let n = 0, bytes = 0;
        while (i < list.length && n < 25 && (n === 0 || bytes + list[i].file.size <= 64 * 1024 * 1024)) {
          form.append('files', list[i].file, list[i].rel);
          bytes += list[i].file.size;
          n++; i++;
        }
        const p = document.getElementById('f-progress');
        if (p) p.textContent = `Uploading ${done + 1}–${done + n} of ${list.length}…`;
        const res = await fetch(`/api/files/upload?path=${encodeURIComponent(dest)}`, { method: 'POST', body: form });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
        done += n;
      }
      App.toast(`Uploaded ${done} file${done === 1 ? '' : 's'}`);
    } catch (err) {
      App.toast(done ? `${err.message} — ${done} of ${list.length} files were uploaded` : err.message, true);
    }
    this.uploading = false;
    const p = document.getElementById('f-progress');
    if (p) p.textContent = idle;
    if (App.currentName === 'files') this.load();
  },

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
