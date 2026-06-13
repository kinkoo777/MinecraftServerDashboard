App.pages.tunnel = {
  data: { installed: false, status: 'offline', claimUrl: null, address: null, log: [] },

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Play Online</h1>
        <span class="badge"><span id="tn-dot" class="dot offline"></span><span id="tn-status">Off</span></span>
      </div>
      <div class="card">
        <h2>Let friends join over the internet — free, no port forwarding</h2>
        <p class="muted" style="margin-bottom:14px">
          This uses <b>playit.gg</b>, a free tunnelling service, so people can join your server from anywhere
          without changing any router settings. The dashboard downloads and runs the playit agent for you —
          you just click one link to finish the one-time setup, then share the address it gives you.
        </p>
        <div id="tn-action"></div>
      </div>
      <div class="card" id="tn-info" style="display:none">
        <h2>Your server address</h2>
        <div id="tn-address"></div>
      </div>
      <div class="card">
        <h2>Agent log</h2>
        <div id="tn-log" class="console console-mini"></div>
      </div>`;

    document.addEventListener('keydown', this._esc);
    await this.refresh();
    this.renderLog();
  },

  async refresh() {
    const s = await App.tryApi('/tunnel/status');
    if (s) { this.data = s; this.update(); }
  },

  update() {
    const d = this.data;
    const dot = document.getElementById('tn-dot');
    if (!dot) return;
    const running = d.status === 'running' || d.status === 'starting';
    dot.className = `dot ${running ? (d.status === 'running' ? 'online' : 'starting') : 'offline'}`;
    document.getElementById('tn-status').textContent =
      d.status === 'running' ? 'Online' : d.status === 'starting' ? 'Starting…' : 'Off';

    const action = document.getElementById('tn-action');
    if (action) {
      if (!running) {
        action.innerHTML = `<button id="tn-start" class="btn-primary">${App.icon('globe', 14)} Enable internet access</button>
          <p class="hint muted" style="margin-top:8px">First time downloads a small agent (~a few MB) from playit.gg.</p>`;
        document.getElementById('tn-start').onclick = async () => {
          const btn = document.getElementById('tn-start');
          btn.disabled = true; btn.textContent = 'Starting…';
          await App.tryApi('/tunnel/start', { method: 'POST' }, 'Starting playit agent…');
          this.refresh();
        };
      } else {
        let html = '';
        if (d.claimUrl) {
          html += `<div class="notice" style="margin-bottom:12px"><span class="notice-text"><b>One-time setup:</b> open this link, sign in to playit.gg (free) and add a <b>Minecraft Java</b> tunnel to <code>127.0.0.1:25565</code>.</span>
            <a class="btn btn-primary btn-sm" href="${App.esc(d.claimUrl)}" target="_blank" rel="noopener">Finish setup ${App.icon('external', 13)}</a></div>`;
        }
        html += `<button id="tn-stop" class="btn-danger">Turn off</button>
          <a class="btn" href="https://playit.gg/account/tunnels" target="_blank" rel="noopener" style="margin-left:8px">Open playit.gg dashboard ${App.icon('external', 13)}</a>`;
        action.innerHTML = html;
        document.getElementById('tn-stop').onclick = async () => {
          await App.tryApi('/tunnel/stop', { method: 'POST' }, 'Turning off…');
          this.refresh();
        };
      }
    }

    const info = document.getElementById('tn-info');
    const addr = document.getElementById('tn-address');
    if (info && addr) {
      if (d.address) {
        info.style.display = '';
        addr.innerHTML = `<p class="muted" style="margin-bottom:8px">Share this address with your friends — they paste it into Minecraft → Multiplayer → Add Server:</p>
          <div class="tn-addr"><code>${App.esc(d.address)}</code><button class="btn-sm" id="tn-copy">Copy</button></div>`;
        document.getElementById('tn-copy').onclick = () => {
          navigator.clipboard.writeText(d.address).then(() => App.toast('Address copied'));
        };
      } else {
        info.style.display = 'none';
      }
    }
  },

  renderLog() {
    const box = document.getElementById('tn-log');
    if (!box) return;
    box.innerHTML = this.data.log.map(l => App.logLineHtml(l)).join('');
    box.scrollTop = box.scrollHeight;
  },

  // WebSocket hooks (wired in app.js dispatch)
  onTunnelLog(line) {
    this.data.log.push(line);
    if (this.data.log.length > 400) this.data.log.shift();
    const box = document.getElementById('tn-log');
    if (box) { box.insertAdjacentHTML('beforeend', App.logLineHtml(line)); box.scrollTop = box.scrollHeight; }
  },
  onTunnelUpdate(u) {
    Object.assign(this.data, u);
    this.update();
  },

  _esc() {}
};
