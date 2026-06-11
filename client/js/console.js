App.pages.console = {
  history: [],
  histIdx: -1,
  autoScroll: true,

  render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Console</h1>
        <div class="btn-row">
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
    log.innerHTML = App.logBuffer.map(l => App.logLineHtml(l)).join('');
    log.scrollTop = log.scrollHeight;

    const auto = document.getElementById('con-auto');
    auto.checked = this.autoScroll;
    auto.onchange = () => { this.autoScroll = auto.checked; };

    document.getElementById('con-clear').onclick = () => { log.innerHTML = ''; };

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

  onLog(line) {
    const log = document.getElementById('con-log');
    if (!log) return;
    log.insertAdjacentHTML('beforeend', App.logLineHtml(line));
    while (log.children.length > 1000) log.firstChild.remove();
    if (this.autoScroll) log.scrollTop = log.scrollHeight;
  },

  onInit() {
    const log = document.getElementById('con-log');
    if (!log) return;
    log.innerHTML = App.logBuffer.map(l => App.logLineHtml(l)).join('');
    log.scrollTop = log.scrollHeight;
  }
};
