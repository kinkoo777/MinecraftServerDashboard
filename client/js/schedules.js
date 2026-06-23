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
              <option value="daily">Daily (at one or more times)</option>
              <option value="interval">Interval (every N …)</option>
              <option value="once">Once (specific date &amp; time)</option>
              <option value="cron">Cron (advanced)</option>
            </select>
          </div>

          <!-- daily fields -->
          <div class="field" id="sc-daily-field" style="display:none">
            <label>Times</label>
            <div id="sc-times-list" style="display:flex;flex-direction:column;gap:6px"></div>
            <button type="button" id="sc-add-time" class="btn-sm" style="margin-top:6px">${App.icon('plus', 12)} Add time</button>
          </div>
          <div class="field" id="sc-dow-field" style="display:none">
            <label>Days of week <span class="muted" style="font-size:11px;font-weight:400">(none = every day)</span></label>
            <div id="sc-dow-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"></div>
          </div>

          <!-- interval fields -->
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

          <!-- once fields -->
          <div class="field" id="sc-once-field" style="display:none">
            <label>Date &amp; time</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input type="date" id="sc-once-date" style="width:160px;max-width:100%">
              <input type="time" id="sc-once-time" value="04:00" style="width:130px;max-width:100%">
            </div>
          </div>

          <!-- cron fields -->
          <div class="field" id="sc-cron-field" style="display:none">
            <label>Cron expression</label>
            <input id="sc-cron" placeholder="0 4 * * *" style="font-family:var(--mono)">
            <div class="hint">5 fields: min hour day month weekday (e.g. <code style="font-family:var(--mono)">0 4 * * *</code> = every day at 04:00)</div>
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
          <div class="field" id="sc-warnmsg-field" style="display:none">
            <label>Warning message <span class="muted" style="font-size:11px;font-weight:400">(optional — use {time} for the countdown)</span></label>
            <input id="sc-warnmsg" maxlength="200" placeholder="Server restarting in {time} — wrap up what you're doing!">
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

    // build day-of-week chip toggles
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowContainer = document.getElementById('sc-dow-chips');
    dowNames.forEach((name, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = name;
      btn.dataset.dow = String(i);
      btn.className = 'btn-sm sc-dow-chip';
      btn.style.cssText = 'min-width:40px;font-size:12px';
      btn.onclick = () => btn.classList.toggle('active');
      dowContainer.appendChild(btn);
    });

    const typeSel = document.getElementById('sc-type');
    const actionSel = document.getElementById('sc-action');

    const syncFields = () => {
      const t = typeSel.value;
      document.getElementById('sc-daily-field').style.display = t === 'daily' ? '' : 'none';
      document.getElementById('sc-dow-field').style.display  = t === 'daily' ? '' : 'none';
      document.getElementById('sc-int-field').style.display   = t === 'interval' ? '' : 'none';
      document.getElementById('sc-once-field').style.display  = t === 'once' ? '' : 'none';
      document.getElementById('sc-cron-field').style.display  = t === 'cron' ? '' : 'none';
      const needsText = actionSel.value === 'command' || actionSel.value === 'announce';
      document.getElementById('sc-cmd-field').style.display = needsText ? '' : 'none';
      document.getElementById('sc-cmd-label').textContent = actionSel.value === 'announce' ? 'Message' : 'Command';
      document.getElementById('sc-command').placeholder = actionSel.value === 'announce' ? 'Welcome! Join our Discord at…' : 'say Hello everyone';
      document.getElementById('sc-warnmsg-field').style.display = warnSel.value !== '0' ? '' : 'none';
    };
    const warnSel = document.getElementById('sc-warn');
    typeSel.onchange = syncFields;
    actionSel.onchange = syncFields;
    warnSel.onchange = syncFields;

    document.getElementById('sc-add-time').onclick = () => this._addTimeRow('04:00');

    document.getElementById('sc-save').onclick = () => this.save();
    document.getElementById('sc-cancel').onclick = () => this.resetForm();

    // initialise with one daily time row and sync fields
    this._addTimeRow('04:00');
    syncFields();

    await this.load();
  },

  // add one <input type="time"> row to the daily times list
  _addTimeRow(val) {
    const list = document.getElementById('sc-times-list');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center';
    const inp = document.createElement('input');
    inp.type = 'time';
    inp.value = val || '04:00';
    inp.style.cssText = 'width:130px;max-width:100%';
    inp.className = 'sc-time-input';
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn-icon btn-danger btn-sm';
    rm.title = 'Remove';
    rm.innerHTML = App.icon('trash', 12);
    rm.onclick = () => {
      // keep at least one row
      if (list.children.length > 1) row.remove();
    };
    row.appendChild(inp);
    row.appendChild(rm);
    list.appendChild(row);
  },

  formData() {
    const type = document.getElementById('sc-type').value;
    const base = {
      action: document.getElementById('sc-action').value,
      type,
      warnMinutes: Number(document.getElementById('sc-warn').value),
      warnMessage: document.getElementById('sc-warnmsg').value,
      onlyWhenEmpty: document.getElementById('sc-empty').checked,
      command: document.getElementById('sc-command').value
    };

    if (type === 'daily') {
      const times = Array.from(document.querySelectorAll('.sc-time-input'))
        .map(i => i.value).filter(Boolean);
      const days = Array.from(document.querySelectorAll('.sc-dow-chip.active'))
        .map(b => Number(b.dataset.dow));
      return Object.assign(base, { times, days });
    }
    if (type === 'interval') {
      return Object.assign(base, {
        intervalValue: Number(document.getElementById('sc-int-val').value),
        intervalUnit: document.getElementById('sc-int-unit').value
      });
    }
    if (type === 'once') {
      return Object.assign(base, {
        date: document.getElementById('sc-once-date').value,
        time: document.getElementById('sc-once-time').value
      });
    }
    if (type === 'cron') {
      return Object.assign(base, { cron: document.getElementById('sc-cron').value });
    }
    return base;
  },

  setForm(s) {
    this.editingId = s.id;
    document.getElementById('sc-action').value = s.action;
    document.getElementById('sc-type').value = s.type || 'daily';
    document.getElementById('sc-warn').value = String(s.warnMinutes || 0);
    document.getElementById('sc-warnmsg').value = s.warnMessage || '';
    document.getElementById('sc-empty').checked = !!s.onlyWhenEmpty;
    document.getElementById('sc-command').value = s.command || '';

    if (s.type === 'daily') {
      // rebuild times list
      const list = document.getElementById('sc-times-list');
      list.innerHTML = '';
      const times = Array.isArray(s.times) && s.times.length ? s.times : ['04:00'];
      times.forEach(t => this._addTimeRow(t));
      // set day chips
      const days = Array.isArray(s.days) ? s.days : [];
      document.querySelectorAll('.sc-dow-chip').forEach(b => {
        b.classList.toggle('active', days.includes(Number(b.dataset.dow)));
      });
    }
    if (s.type === 'interval') {
      if (s.intervalValue) document.getElementById('sc-int-val').value = s.intervalValue;
      if (s.intervalUnit) document.getElementById('sc-int-unit').value = s.intervalUnit;
    }
    if (s.type === 'once') {
      if (s.date) document.getElementById('sc-once-date').value = s.date;
      if (s.time) document.getElementById('sc-once-time').value = s.time;
    }
    if (s.type === 'cron') {
      document.getElementById('sc-cron').value = s.cron || '';
    }

    document.getElementById('sc-form-title').textContent = 'Edit scheduled task';
    document.getElementById('sc-save').innerHTML = `${App.icon('edit', 14)} Save changes`;
    document.getElementById('sc-cancel').style.display = '';
    // fire onchange to sync field visibility
    document.getElementById('sc-type').onchange();
    document.getElementById('sc-action').onchange();
    document.getElementById('sc-form-title').scrollIntoView({ behavior: 'smooth' });
  },

  resetForm() {
    this.editingId = null;
    document.getElementById('sc-form-title').textContent = 'New scheduled task';
    document.getElementById('sc-save').innerHTML = `${App.icon('plus', 14)} Add schedule`;
    document.getElementById('sc-cancel').style.display = 'none';
    document.getElementById('sc-command').value = '';
    document.getElementById('sc-warnmsg').value = '';
    document.getElementById('sc-type').value = 'daily';
    // reset times list to one entry
    const list = document.getElementById('sc-times-list');
    if (list) {
      list.innerHTML = '';
      this._addTimeRow('04:00');
    }
    // deselect all day chips
    document.querySelectorAll('.sc-dow-chip').forEach(b => b.classList.remove('active'));
    document.getElementById('sc-type').onchange();
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
    let when = '';
    if (s.type === 'interval') {
      when = `every ${s.intervalValue} ${s.intervalUnit}`;
    } else if (s.type === 'once') {
      const d = s.date ? new Date(s.date + 'T00:00:00') : null;
      const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?';
      when = `once on ${dateStr} at ${s.time || '?'}`;
    } else if (s.type === 'cron') {
      when = `cron ${App.esc(s.cron || '')}`;
    } else {
      // daily
      const times = Array.isArray(s.times) && s.times.length ? s.times : (s.time ? [s.time] : []);
      const timesStr = times.join(', ') || '?';
      const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = Array.isArray(s.days) && s.days.length
        ? ' on ' + s.days.map(d => dowNames[d]).join(', ')
        : '';
      when = `daily at ${App.esc(timesStr)}${days}`;
    }
    const notes = [];
    if (s.warnMinutes) notes.push(`warns players ${s.warnMinutes} min before`);
    if (s.onlyWhenEmpty) notes.push('only when no players online');
    return `<strong>${labels[s.action] || s.action}</strong> <span class="muted">— ${when}</span>` +
      (s.command ? ` <span class="muted" style="font-family:var(--mono)">${App.esc(s.command)}</span>` : '') +
      (notes.length ? `<div class="muted" style="font-size:12px;margin-top:2px">${App.icon('schedules', 11)} ${notes.join(' · ')}</div>` : '');
  },

  // relative hint: "in 5 min", "in 2 h 10 min", "due now"
  fmtIn(ts) {
    const d = ts - Date.now();
    if (d <= 30000) return 'due now';
    const m = Math.round(d / 60000);
    if (m < 60) return `in ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h} h ${m % 60} min`;
    return `in ${Math.floor(h / 24)} d ${h % 24} h`;
  },

  // absolute label: "Today 16:30", "Tomorrow 04:00", "Sat 16:30", "Mon Jun 23, 04:00"
  fmtWhen(ts) {
    const now = new Date();
    const target = new Date(ts);

    // zero out time for day-difference calculation
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.round((targetDay - nowDay) / 86400000);

    const hhmm = target.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (diffDays === 0) return `Today ${hhmm}`;
    if (diffDays === 1) return `Tomorrow ${hhmm}`;
    if (diffDays >= 2 && diffDays <= 6) return `${weekdays[target.getDay()]} ${hhmm}`;

    const monthDay = `${weekdays[target.getDay()]} ${months[target.getMonth()]} ${target.getDate()}`;
    const yearSuffix = target.getFullYear() !== now.getFullYear() ? `, ${target.getFullYear()}` : '';
    return `${monthDay}${yearSuffix}, ${hhmm}`;
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
      <thead><tr><th>Task</th><th style="width:140px">Next run</th><th style="width:70px">Enabled</th><th style="width:100px"></th></tr></thead>
      <tbody>${list.map(s => `
        <tr>
          <td>${this.describe(s)}</td>
          <td>${s.enabled && s.nextRun ? `
            <div>${this.fmtWhen(s.nextRun)}</div>
            <div class="muted" style="font-size:11px">${this.fmtIn(s.nextRun)}</div>` : '<span class="muted">—</span>'}</td>
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
