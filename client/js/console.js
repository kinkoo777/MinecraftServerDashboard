App.pages.console = {
  history: [],
  histIdx: -1,
  autoScroll: true,

  render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Console</h1>
        <div class="btn-row">
          <input id="con-search" placeholder="Filter…" style="width:130px" autocomplete="off">
          <select id="con-level" style="width:auto">
            <option value="">All</option>
            <option value="warn">Warnings</option>
            <option value="error">Errors</option>
            <option value="cmd">Commands</option>
          </select>
          <select id="con-saved" style="min-width:160px;width:auto"><option value="">Saved logs…</option></select>
          <button id="con-saved-dl" class="btn-icon" title="Download selected log" disabled>${App.icon('download', 14)}</button>
          <label style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px">
            Auto-scroll
            <span class="switch"><input type="checkbox" id="con-auto" checked><span class="track"></span></span>
          </label>
          <button id="con-clear" class="btn-sm">Clear view</button>
        </div>
      </div>
      <div id="con-log" class="console console-full"></div>
      <div class="console-input-row">
        <input id="con-input" placeholder="Type a command (e.g. say Hello) — Enter to send, ↑/↓ for history" autocomplete="off">
        <button id="con-send" class="btn-primary">${App.icon('send', 14)} Send</button>
      </div>`;

    const log = document.getElementById('con-log');
    this.repaint();

    const search = document.getElementById('con-search');
    const level = document.getElementById('con-level');
    search.oninput = () => this.repaint();
    level.onchange = () => this.repaint();

    const auto = document.getElementById('con-auto');
    auto.checked = this.autoScroll;
    auto.onchange = () => { this.autoScroll = auto.checked; };

    document.getElementById('con-clear').onclick = () => { log.innerHTML = ''; };

    const savedSel = document.getElementById('con-saved');
    const savedDl = document.getElementById('con-saved-dl');
    App.tryApi('/server/console-logs').then(logs => {
      if (!logs || !savedSel.isConnected) return;
      for (const l of logs) {
        const o = document.createElement('option');
        o.value = l.name;
        o.textContent = `${l.name} (${App.fmtBytes(l.size)})`;
        savedSel.appendChild(o);
      }
    });
    savedSel.onchange = () => { savedDl.disabled = !savedSel.value; };
    savedDl.onclick = () => {
      if (savedSel.value) location.href = `/api/server/console-logs/${encodeURIComponent(savedSel.value)}`;
    };

    const input = document.getElementById('con-input');
    const send = async () => {
      const command = input.value.trim();
      if (!command) return;
      this.history.push(command);
      this.histIdx = this.history.length;
      input.value = '';
      await App.tryApi('/server/command', { method: 'POST', body: { command } });
    };
    document.getElementById('con-send').onclick = send;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') send();
      else if (e.key === 'ArrowUp') {
        if (this.histIdx > 0) { this.histIdx--; input.value = this.history[this.histIdx]; }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (this.histIdx < this.history.length - 1) { this.histIdx++; input.value = this.history[this.histIdx]; }
        else { this.histIdx = this.history.length; input.value = ''; }
        e.preventDefault();
      }
    };
    input.focus();
  },

  matches(line) {
    const search = document.getElementById('con-search');
    const level = document.getElementById('con-level');
    if (search && search.value && !line.toLowerCase().includes(search.value.toLowerCase())) return false;
    const lv = level ? level.value : '';
    if (!lv) return true;
    if (lv === 'cmd') return line.startsWith('>');
    if (lv === 'warn') return /\/(WARN|WARNING)\]/.test(line);
    if (lv === 'error') return /\/(ERROR|FATAL)\]/.test(line) || line.includes('[dashboard] Failed');
    return true;
  },

  repaint() {
    const log = document.getElementById('con-log');
    if (!log) return;
    log.innerHTML = App.logBuffer.filter(l => this.matches(l)).map(l => App.logLineHtml(l)).join('');
    log.scrollTop = log.scrollHeight;
  },

  onLog(line) {
    const log = document.getElementById('con-log');
    if (!log || !this.matches(line)) return;
    log.insertAdjacentHTML('beforeend', App.logLineHtml(line));
    while (log.children.length > 1000) log.firstChild.remove();
    if (this.autoScroll) log.scrollTop = log.scrollHeight;
  },

  onInit() { this.repaint(); }
};
