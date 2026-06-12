App.pages.schedules = {
  editingId: null,

  async render(el) {
    el.innerHTML = `
      <div class="page-head"><h1>Schedules</h1></div>
      <div class="card">
        <h2 id="sc-form-title">New scheduled task</h2>
        <div class="sched-form">
          <div class="field"><label>Action</label>
            <select id="sc-action">
              <option value="restart">Restart server</option>
              <option value="backup">Backup world</option>
              <option value="command">Run command</option>
              <option value="announce">Announce message</option>
            </select>
          </div>
          <div class="field"><label>Repeat</label>
            <select id="sc-type">
              <option value="daily">Daily at a time</option>
              <option value="interval">Every N minutes / hours / days</option>
            </select>
          </div>
          <div class="field" id="sc-time-field"><label>Time (daily)</label><input type="time" id="sc-time" value="04:00"></div>
          <div class="field" id="sc-int-field" style="display:none"><label>Every</label>
            <div style="display:flex;gap:8px">
              <input type="number" id="sc-int-val" value="7" min="1" max="365" style="width:80px">
              <select id="sc-int-unit">
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days" selected>days</option>
              </select>
            </div>
          </div>
          <div class="field"><label>In-game warning</label>
            <select id="sc-warn">
              <option value="0">No warning</option>
              <option value="1">1 min before</option>
              <option value="5">5 min before</option>
              <option value="10">10 min before</option>
              <option value="15">15 min before</option>
              <option value="30">30 min before</option>
            </select>
          </div>
          <div class="field"><label>Only when empty</label>
            <label style="display:flex;align-items:center;gap:10px;padding:8px 0">
              <span class="switch"><input type="checkbox" id="sc-empty"><span class="track" onclick="document.getElementById('sc-empty').click()"></span></span>
              <span class="muted" style="font-size:12px">skip if players online</span>
            </label>
          </div>
          <div class="field" id="sc-cmd-field" style="display:none"><label id="sc-cmd-label">Command</label><input id="sc-command" placeholder="say Hello everyone"></div>
        </div>
        <div class="btn-row">
          <button id="sc-save" class="btn-primary">${App.icon('plus', 14)} Add schedule</button>
          <button id="sc-cancel" style="display:none">Cancel</button>
        </div>
      </div>
      <div class="card" id="sc-list"><div class="empty">Loading…</div></div>`;

    const typeSel = document.getElementById('sc-type');
    const actionSel = document.getElementById('sc-action');
    const syncFields = () => {
      document.getElementById('sc-time-field').style.display = typeSel.value === 'daily' ? '' : 'none';
      document.getElementById('sc-int-field').style.display = typeSel.value === 'interval' ? '' : 'none';
      const needsText = actionSel.value === 'command' || actionSel.value === 'announce';
      document.getElementById('sc-cmd-field').style.display = needsText ? '' : 'none';
      document.getElementById('sc-cmd-label').textContent = actionSel.value === 'announce' ? 'Message' : 'Command';
      document.getElementById('sc-command').placeholder = actionSel.value === 'announce' ? 'Welcome! Join our Discord at…' : 'say Hello everyone';
    };
    typeSel.onchange = syncFields;
    actionSel.onchange = syncFields;

    document.getElementById('sc-save').onclick = () => this.save();
    document.getElementById('sc-cancel').onclick = () => this.resetForm();

    await this.load();
  },

  formData() {
    return {
      action: document.getElementById('sc-action').value,
      type: document.getElementById('sc-type').value,
      time: document.getElementById('sc-time').value,
      intervalValue: Number(document.getElementById('sc-int-val').value),
      intervalUnit: document.getElementById('sc-int-unit').value,
      warnMinutes: Number(document.getElementById('sc-warn').value),
      onlyWhenEmpty: document.getElementById('sc-empty').checked,
      command: document.getElementById('sc-command').value
    };
  },

  setForm(s) {
    this.editingId = s.id;
    document.getElementById('sc-action').value = s.action;
    document.getElementById('sc-type').value = s.type || 'daily';
    if (s.time) document.getElementById('sc-time').value = s.time;
    if (s.intervalValue) document.getElementById('sc-int-val').value = s.intervalValue;
    if (s.intervalUnit) document.getElementById('sc-int-unit').value = s.intervalUnit;
    document.getElementById('sc-warn').value = String(s.warnMinutes || 0);
    document.getElementById('sc-empty').checked = !!s.onlyWhenEmpty;
    document.getElementById('sc-command').value = s.command || '';
    document.getElementById('sc-form-title').textContent = 'Edit scheduled task';
    document.getElementById('sc-save').innerHTML = `${App.icon('edit', 14)} Save changes`;
    document.getElementById('sc-cancel').style.display = '';
    document.getElementById('sc-action').onchange();
    document.getElementById('sc-form-title').scrollIntoView({ behavior: 'smooth' });
  },

  resetForm() {
    this.editingId = null;
    document.getElementById('sc-form-title').textContent = 'New scheduled task';
    document.getElementById('sc-save').innerHTML = `${App.icon('plus', 14)} Add schedule`;
    document.getElementById('sc-cancel').style.display = 'none';
    document.getElementById('sc-command').value = '';
  },

  async save() {
    const body = this.formData();
    const ok = this.editingId
      ? await App.tryApi(`/schedules/${this.editingId}`, { method: 'PUT', body }, 'Schedule updated')
      : await App.tryApi('/schedules', { method: 'POST', body }, 'Schedule added');
    if (ok) {
      this.resetForm();
      this.load();
    }
  },

  describe(s) {
    const labels = { restart: 'Restart server', backup: 'Backup world', command: 'Run command', announce: 'Announce' };
    const when = s.type === 'interval'
      ? `every ${s.intervalValue} ${s.intervalUnit}`
      : `daily at ${s.time}`;
    const notes = [];
    if (s.warnMinutes) notes.push(`warns players ${s.warnMinutes} min before`);
    if (s.onlyWhenEmpty) notes.push('only when no players online');
    return `<strong>${labels[s.action]}</strong> <span class="muted">— ${when}</span>` +
      (s.command ? ` <span class="muted" style="font-family:var(--mono)">${App.esc(s.command)}</span>` : '') +
      (notes.length ? `<div class="muted" style="font-size:12px;margin-top:2px">${App.icon('schedules', 11)} ${notes.join(' · ')}</div>` : '');
  },

  fmtIn(ts) {
    const d = ts - Date.now();
    if (d <= 30000) return 'due now';
    const m = Math.round(d / 60000);
    if (m < 60) return `in ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h} h ${m % 60} min`;
    return `in ${Math.floor(h / 24)} d ${h % 24} h`;
  },

  async load() {
    const list = await App.tryApi('/schedules');
    const box = document.getElementById('sc-list');
    if (!box || !list) return;
    if (!list.length) {
      box.innerHTML = `<div class="empty">No scheduled tasks — add an automatic backup or restart above.</div>`;
      return;
    }

    box.innerHTML = `<table>
      <thead><tr><th>Task</th><th style="width:120px">Next run</th><th style="width:70px">Enabled</th><th style="width:100px"></th></tr></thead>
      <tbody>${list.map(s => `
        <tr>
          <td>${this.describe(s)}</td>
          <td class="muted">${s.enabled && s.nextRun ? this.fmtIn(s.nextRun) : '—'}</td>
          <td><span class="switch"><input type="checkbox" data-toggle="${s.id}" ${s.enabled ? 'checked' : ''}><span class="track" data-track="${s.id}"></span></span></td>
          <td style="text-align:right">
            <button class="btn-icon" title="Edit" data-edit="${s.id}">${App.icon('rename', 14)}</button>
            <button class="btn-icon btn-danger" title="Delete" data-del="${s.id}">${App.icon('trash', 14)}</button>
          </td>
        </tr>`).join('')}</tbody>
    </table>`;

    box.querySelectorAll('[data-track]').forEach(t => {
      t.onclick = () => box.querySelector(`[data-toggle="${t.dataset.track}"]`).click();
    });
    box.querySelectorAll('[data-toggle]').forEach(cb => {
      cb.onchange = async () => {
        await App.tryApi(`/schedules/${cb.dataset.toggle}`, { method: 'PUT', body: { enabled: cb.checked } });
        this.load();
      };
    });
    box.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => {
        const s = list.find(x => x.id === Number(b.dataset.edit));
        if (s) this.setForm(s);
      };
    });
    box.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = async () => {
        if (await App.tryApi(`/schedules/${b.dataset.del}`, { method: 'DELETE' }, 'Schedule deleted')) {
          if (this.editingId === Number(b.dataset.del)) this.resetForm();
          this.load();
        }
      };
    });
  }
};
