App.pages.tunnel = {
  data: { installed: false, claimed: false, status: 'offline', claimUrl: null, address: null, pendingLink: null, log: [] },

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Play Online</h1>
        <span class="badge"><span id="tn-dot" class="dot offline"></span><span id="tn-status">Off</span></span>
      </div>
      <div class="card">
        <h2>Let friends join over the internet — free, no port forwarding</h2>
        <p class="muted" style="margin-bottom:14px">
          This uses <a href="https://playit.gg" target="_blank" rel="noopener">playit.gg</a>, a free tunnelling
          service, so people can join from anywhere without touching your router. The dashboard sets everything up
          for you — you just click one link and approve.
        </p>
        <div id="tn-action"></div>
        <p class="hint muted" style="margin-top:12px">
          Powered by <a href="https://playit.gg" target="_blank" rel="noopener">playit.gg</a>. The agent downloads
          automatically — if that ever fails, you can get it from
          <a href="https://playit.gg/download" target="_blank" rel="noopener">playit.gg/download ${App.icon('external', 12)}</a>
          and drop it in the <code>playit</code> folder.
        </p>
      </div>
      <div class="card" id="tn-info" style="display:none">
        <h2>Your server address</h2>
        <div id="tn-address"></div>
      </div>
      <div class="card">
        <h2>Agent log</h2>
        <div id="tn-log" class="console console-mini"></div>
      </div>`;

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

    const dotClass = { running: 'online', starting: 'starting', claiming: 'starting' }[d.status] || 'offline';
    const label = { running: 'Online', starting: 'Connecting…', claiming: 'Waiting for you' }[d.status] || 'Off';
    dot.className = `dot ${dotClass}`;
    document.getElementById('tn-status').textContent = label;

    const action = document.getElementById('tn-action');
    if (action) action.innerHTML = this.actionHtml(d);
    this.wireAction(d);

    // Public address card
    const info = document.getElementById('tn-info');
    const addr = document.getElementById('tn-address');
    if (info && addr) {
      if (d.address) {
        info.style.display = '';
        addr.innerHTML = `<p class="muted" style="margin-bottom:8px">Send this to your friends — they paste it into Minecraft → Multiplayer → Add Server:</p>
          <div class="tn-addr"><code>${App.esc(d.address)}</code><button class="btn-sm" id="tn-copy">Copy</button></div>`;
        document.getElementById('tn-copy').onclick = () => {
          // navigator.clipboard is undefined on non-secure (http) origins — fall
          // back to a temporary textarea + execCommand, or no-op gracefully.
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(d.address).then(() => App.toast('Address copied'));
            return;
          }
          try {
            const ta = document.createElement('textarea');
            ta.value = d.address;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            App.toast('Address copied');
          } catch (_) {
            App.toast('Copy not supported here — select the address and copy it manually', true);
          }
        };
      } else {
        info.style.display = 'none';
      }
    }
  },

  actionHtml(d) {
    if (d.status === 'claiming') {
      return `
        <div class="tn-claim">
          <a class="btn btn-primary btn-lg" href="${App.esc(d.claimUrl || '#')}" target="_blank" rel="noopener">
            ${App.icon('globe', 16)} Sign in &amp; approve</a>
          <p class="hint muted" style="margin-top:10px">
            <span class="tn-spin"></span> A playit.gg page opened — sign in (or <b>continue as guest</b>) and click
            <b>Allow</b>. This page finishes the rest automatically. Keep it open.</p>
        </div>
        <button id="tn-cancel" class="btn-sm" style="margin-top:12px">Cancel</button>`;
    }
    if (d.status === 'starting') {
      return `<p class="muted"><span class="tn-spin"></span> Connecting to playit…</p>
        <button id="tn-stop" class="btn-danger" style="margin-top:12px">Turn off</button>`;
    }
    if (d.status === 'running') {
      let html = '';
      if (!d.address && d.pendingLink) {
        html += `<div class="notice" style="margin-bottom:12px"><span class="notice-text">
          Almost there — add one Minecraft tunnel to finish. Open the link, click <b>Add Tunnel</b> →
          <b>Minecraft Java</b> (point it at <code>127.0.0.1:25565</code>). The address shows up here once it's added.</span>
          <a class="btn btn-primary btn-sm" href="${App.esc(d.pendingLink)}" target="_blank" rel="noopener">Add tunnel ${App.icon('external', 13)}</a></div>`;
      }
      html += `<button id="tn-stop" class="btn-danger">Turn off</button>
        <a class="btn" href="https://playit.gg/account/tunnels" target="_blank" rel="noopener" style="margin-left:8px">playit.gg dashboard ${App.icon('external', 13)}</a>`;
      return html;
    }
    // offline
    const cta = d.claimed ? 'Go online' : 'Enable internet access';
    const agentBadge = d.installed
      ? `<span class="chip chip-green" style="font-size:11px;vertical-align:middle">Agent ready</span> `
      : `<span class="chip" style="font-size:11px;vertical-align:middle;background:var(--border)">Agent not downloaded</span> `;
    let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${agentBadge}<button id="tn-start" class="btn-primary">${App.icon('globe', 14)} ${cta}</button></div>`;
    if (d.claimed) {
      html += `<p class="hint muted">Already set up — this just reconnects${d.installed ? ' instantly' : ' (will re-download agent first)'}. <a href="#" id="tn-reset" class="text-link">Use a different account</a>.</p>`;
    } else {
      html += d.installed
        ? `<p class="hint muted">Agent already downloaded — click to connect your playit.gg account. No download needed.</p>`
        : `<p class="hint muted">One click, then approve in your browser. First start downloads a small agent (~few MB).</p>`;
    }
    html += `
      <details style="margin-top:14px" id="tn-secret-details">
        <summary class="muted" style="cursor:pointer;font-size:12px;user-select:none">Already have an agent secret key?</summary>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;max-width:480px">
          <p class="muted" style="font-size:12px">Paste the secret from a previous installation, another machine, or from your playit.gg agent settings.</p>
          <div style="display:flex;gap:8px">
            <input id="tn-secret-input" type="password" placeholder="Agent secret key…" style="flex:1">
            <button id="tn-secret-save" class="btn-primary btn-sm">Use this agent</button>
          </div>
          <p class="hint muted" id="tn-secret-msg" style="font-size:11px"></p>
        </div>
      </details>`;
    return html;
  },

  wireAction(d) {
    const start = document.getElementById('tn-start');
    if (start) start.onclick = async () => {
      start.disabled = true;
      start.innerHTML = `${App.icon('globe', 14)} Starting…`;
      await App.tryApi('/tunnel/start', { method: 'POST' });
      this.refresh();
    };
    const stop = document.getElementById('tn-stop');
    if (stop) stop.onclick = async () => {
      await App.tryApi('/tunnel/stop', { method: 'POST' }, 'Turning off…');
      this.refresh();
    };
    const cancel = document.getElementById('tn-cancel');
    if (cancel) cancel.onclick = async () => {
      await App.tryApi('/tunnel/stop', { method: 'POST' });
      this.refresh();
    };
    const reset = document.getElementById('tn-reset');
    if (reset) reset.onclick = async (e) => {
      e.preventDefault();
      if (!confirm('Forget the current playit setup and connect a different account next time?')) return;
      await App.tryApi('/tunnel/reset', { method: 'POST' }, 'Reset — you can set up again');
      this.refresh();
    };

    const secretSave = document.getElementById('tn-secret-save');
    if (secretSave) secretSave.onclick = async () => {
      const input = document.getElementById('tn-secret-input');
      const msg = document.getElementById('tn-secret-msg');
      const secret = input.value.trim();
      if (!secret) return App.toast('Paste the agent secret key first', true);
      secretSave.disabled = true; secretSave.textContent = 'Verifying…'; msg.textContent = '';
      const r = await App.tryApi('/tunnel/use-secret', { method: 'POST', body: { secret } }, null);
      if (r) {
        input.value = '';
        App.toast('Agent secret saved — click Go Online to connect');
        this.refresh();
      } else {
        secretSave.disabled = false; secretSave.textContent = 'Use this agent';
      }
    };
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
  }
};
