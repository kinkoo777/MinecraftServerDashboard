App.pages.schedules = {
  async render(el) {
    el.innerHTML = `
      <div class="page-head"><h1>Schedules</h1></div>
      <div class="card">
        <h2>New scheduled task</h2>
        <div class="form-grid" style="grid-template-columns:140px 160px 1fr auto;align-items:end">
          <div class="field"><label>Time (daily)</label><input type="time" id="sc-time" value="04:00"></div>
          <div class="field"><label>Action</label>
            <select id="sc-action">
              <option value="restart">Restart server</option>
              <option value="backup">Backup world</option>
              <option value="command">Run command</option>
            </select>
          </div>
          <div class="field"><label>Command</label><input id="sc-command" placeholder="(only for Run command)" disabled></div>
          <div class="field"><button id="sc-add" class="btn-primary">${App.icon('plus', 14)} Add</button></div>
        </div>
      </div>
      <div class="card" id="sc-list"><div class="empty">Loading…</div></div>`;

    const actionSel = document.getElementById('sc-action');
    const cmdInput = document.getElementById('sc-command');
    actionSel.onchange = () => { cmdInput.disabled = actionSel.value !== 'command'; };

    document.getElementById('sc-add').onclick = async () => {
      const body = {
        time: document.getElementById('sc-time').value,
        action: actionSel.value,
        command: cmdInput.value
      };
      if (await App.tryApi('/schedules', { method: 'POST', body }, 'Schedule added')) {
        cmdInput.value = '';
        this.load();
      }
    };

    await this.load();
  },

  async load() {
    const list = await App.tryApi('/schedules');
    const box = document.getElementById('sc-list');
    if (!box || !list) return;
    if (!list.length) {
      box.innerHTML = `<div class="empty">No scheduled tasks</div>`;
      return;
    }

    const labels = { restart: 'Restart server', backup: 'Backup world', command: 'Run command' };
    box.innerHTML = `<table>
      <thead><tr><th style="width:90px">Time</th><th>Action</th><th style="width:70px">Enabled</th><th style="width:80px"></th></tr></thead>
      <tbody>${list.map(s => `
        <tr>
          <td style="font-variant-numeric:tabular-nums">${App.esc(s.time)}</td>
          <td>${labels[s.action]}${s.command ? ` <span class="muted" style="font-family:var(--mono)">${App.esc(s.command)}</span>` : ''}</td>
          <td><span class="switch"><input type="checkbox" data-toggle="${s.id}" ${s.enabled ? 'checked' : ''}><span class="track" data-track="${s.id}"></span></span></td>
          <td style="text-align:right"><button class="btn-icon btn-danger" title="Delete" data-del="${s.id}">${App.icon('trash', 14)}</button></td>
        </tr>`).join('')}</tbody>
    </table>`;

    box.querySelectorAll('[data-track]').forEach(t => {
      t.onclick = () => box.querySelector(`[data-toggle="${t.dataset.track}"]`).click();
    });
    box.querySelectorAll('[data-toggle]').forEach(cb => {
      cb.onchange = () => App.tryApi(`/schedules/${cb.dataset.toggle}`, {
        method: 'PUT', body: { enabled: cb.checked }
      });
    });
    box.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = async () => {
        if (await App.tryApi(`/schedules/${b.dataset.del}`, { method: 'DELETE' }, 'Schedule deleted')) this.load();
      };
    });
  }
};
