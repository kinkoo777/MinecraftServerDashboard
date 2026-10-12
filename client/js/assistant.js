/* Assistant: chat with an AI model that can operate the dashboard. One chat widget
   (App.ai) is shown either on the Assistant page or in the floating panel that is
   available on every other page. Conversations live on the server. */
App.ai = {
  cfg: null,
  convoId: null,
  log: [],        // { who: 'you' | 'ai' | 'tool' | 'error', text, ok }
  pending: null,  // { text, canAlways } — an action waiting for Allow / Deny
  busy: false,
  typing: '',     // the answer as it is being written
  host: null,     // element the chat is currently drawn in
  IDEAS: ['How is the server doing?', 'Who is online right now?', 'Make a backup of the world', 'Why did the server fail to start?', 'Restart the server every night at 4:00'],
  PAGES: { dashboard: 'Dashboard', history: 'History', console: 'Console', players: 'Players', settings: 'Settings', world: 'World', tunnel: 'Play Online', files: 'Files', plugins: 'Content', schedules: 'Schedules' },

  async load() {
    if (!this.cfg) this.cfg = await App.tryApi('/ai/config');
    return this.cfg;
  },

  configured() {
    const c = this.cfg;
    if (!c || !c.provider || !c.model) return false;
    const p = c.providers[c.provider];
    return !p.key || p.keyOptional || c.hasKey;
  },

  // Draw the chat into `el` (the page body or the floating panel). Only one place shows it at a time.
  async mount(el, onChange) {
    this.host = el;
    this.onChange = onChange || null;
    el.innerHTML = '<div class="empty">Loading…</div>';
    await this.load();
    if (this.host === el) this.paint();
  },

  unmount(el) { if (this.host === el) { this.host = null; this.onChange = null; } },

  newChat() {
    if (this.busy) return;
    this.convoId = null; this.log = []; this.pending = null; this.typing = '';
    this.paint();
  },

  async openChat(id) {
    if (this.busy) return;
    const c = await App.tryApi(`/ai/chats/${encodeURIComponent(id)}`);
    if (!c) return;
    this.convoId = c.id; this.log = c.log.slice(); this.pending = c.pending; this.typing = '';
    this.paint();
  },

  paint() {
    const el = this.host;
    if (!el || !this.cfg) return;
    if (this.onChange) this.onChange();
    if (!this.configured()) {
      el.innerHTML = `
        <div class="ai-intro">
          ${App.icon('spark', 34)}
          <h2>An assistant that can run your server</h2>
          <p class="muted">Ask in plain words — "who's online?", "back up the world", "why did it crash?", "make it day" — and it does it for you. It asks before anything that changes your server.</p>
          <p class="muted">It needs an AI model. Free: sign in with OpenRouter and use one of its free models, or use Groq or Gemini's free tier. Or connect DeepSeek, Claude, OpenAI, or a model on this computer (Ollama, LM Studio).</p>
          <button class="btn-primary ai-setup">Set up the assistant</button>
        </div>`;
      el.querySelector('.ai-setup').onclick = () => this.openSettings();
      return;
    }
    el.innerHTML = `
      <div class="ai-chat">
        <div class="ai-log"></div>
        <div class="ai-input-row">
          <textarea class="ai-input" rows="1" placeholder="Ask or tell the assistant something…" maxlength="8000"></textarea>
          <button class="btn-primary ai-send">${App.icon('send', 14)} Send</button>
        </div>
      </div>`;
    const input = el.querySelector('.ai-input');
    el.querySelector('.ai-send').onclick = () => this.send();
    input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } };
    input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
    this.paintLog();
    input.focus();
  },

  // tiny Markdown: bold, inline code, bullet lines — everything else stays text
  md(text) {
    return App.esc(text)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/^\s*[-*] (.*)$/gm, '<span class="ai-li">$1</span>')
      .replace(/^#{1,4} (.*)$/gm, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  },

  paintLog() {
    const box = this.host && this.host.querySelector('.ai-log');
    if (!box) return;
    if (!this.log.length && !this.busy) {
      box.innerHTML = `<div class="ai-empty"><p class="muted">Try one of these:</p>${this.IDEAS.map(i => `<button class="ai-idea">${App.esc(i)}</button>`).join('')}</div>`;
      box.querySelectorAll('.ai-idea').forEach(b => { b.onclick = () => this.send(b.textContent); });
      return;
    }
    box.innerHTML = this.log.map(m => {
      if (m.who === 'tool') return `<div class="ai-tool ${m.ok ? '' : 'bad'}">${App.icon(m.ok ? 'check' : 'x', 13)}<span>${App.esc(m.text)}</span></div>`;
      if (m.who === 'error') return `<div class="ai-msg ai-error">${App.esc(m.text)}</div>`;
      return `<div class="ai-msg ai-${m.who}">${m.who === 'ai' ? this.md(m.text) : App.esc(m.text).replace(/\n/g, '<br>')}</div>`;
    }).join('') +
      (this.pending ? `
        <div class="ai-confirm">
          <div><span class="muted">The assistant wants to:</span><br><b>${App.esc(this.pending.text)}</b></div>
          <div class="btn-row">
            <button class="btn-primary btn-sm ai-allow">Allow</button>
            ${this.pending.canAlways ? '<button class="btn-sm ai-always" title="Don\'t ask again for this kind of action">Always allow</button>' : ''}
            <button class="btn-sm ai-deny">Deny</button>
          </div>
        </div>` : '') +
      (this.busy ? (this.typing
        ? `<div class="ai-msg ai-ai ai-live">${this.md(this.typing)}</div>`
        : `<div class="ai-msg ai-ai ai-typing"><span></span><span></span><span></span></div>`) : '');
    const on = (cls, fn) => { const b = box.querySelector(cls); if (b) b.onclick = fn; };
    on('.ai-allow', () => this.answer(true, false));
    on('.ai-always', () => this.answer(true, true));
    on('.ai-deny', () => this.answer(false, false));
    box.scrollTop = box.scrollHeight;
    const send = this.host.querySelector('.ai-send');
    if (send) send.disabled = this.busy || !!this.pending;
  },

  // Send a request whose answer arrives as a stream of JSON lines.
  async stream(path, body) {
    this.busy = true; this.typing = '';
    this.paintLog();
    const handle = (ev) => {
      if (ev.type === 'id') this.convoId = ev.id;
      else if (ev.type === 'delta') {
        this.typing += ev.text;
        const live = this.host && this.host.querySelector('.ai-live');
        if (live) { live.innerHTML = this.md(this.typing); const box = live.parentNode; box.scrollTop = box.scrollHeight; return; }
      } else if (ev.type === 'text') { this.typing = ''; this.log.push({ who: 'ai', text: ev.text }); }
      else if (ev.type === 'tool') { this.typing = ''; this.log.push({ who: 'tool', text: ev.text, ok: ev.ok }); }
      else if (ev.type === 'pending') this.pending = { text: ev.text, canAlways: ev.canAlways };
      else if (ev.type === 'model') this.cfg.model = ev.model;
      else if (ev.type === 'error') { this.typing = ''; this.pending = null; this.log.push({ who: 'error', text: ev.error }); }
      this.paintLog();
    };
    try {
      const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 401) return location.reload();
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) if (line.trim()) { try { handle(JSON.parse(line)); } catch (e) { /* skip a broken line */ } }
      }
    } catch (e) {
      this.log.push({ who: 'error', text: e.message === 'Failed to fetch' ? 'Lost the connection to the dashboard.' : e.message });
    }
    this.busy = false; this.typing = '';
    this.paintLog();
    if (this.onChange) this.onChange();
  },

  send(text) {
    const input = this.host && this.host.querySelector('.ai-input');
    const message = (text || (input ? input.value : '')).trim();
    if (!message || this.busy || this.pending) return;
    if (input) { input.value = ''; input.style.height = 'auto'; }
    this.log.push({ who: 'you', text: message });
    const page = App.currentName !== 'assistant' ? this.PAGES[App.currentName] : undefined;
    this.stream('/ai/chat', { id: this.convoId, message, page });
  },

  answer(allow, always) {
    if (this.busy || !this.pending) return;
    this.pending = null;
    this.stream('/ai/confirm', { id: this.convoId, allow, always });
  },

  /* ---- settings window ---- */
  async openSettings() {
    this.cfg = (await App.tryApi('/ai/config')) || this.cfg; // fresh: "always allow" may have changed it
    const c = this.cfg;
    if (!c) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    let provider = c.provider || 'openrouter';
    ov.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="card-title-row"><h2 style="margin:0">Assistant settings</h2><button class="btn-icon" id="as-close" title="Close">${App.icon('x', 14)}</button></div>
        <div class="field"><label>AI service</label>
          <div class="as-providers" id="as-providers">${Object.entries(c.providers).map(([k, p]) => `<button type="button" class="msg-preset" data-p="${k}">${App.esc(p.label)}</button>`).join('')}</div>
          <div class="hint" id="as-note"></div>
        </div>
        <div class="field" id="as-url-field"><label>Base URL</label><input id="as-url" placeholder="https://…/v1"></div>
        <div class="field" id="as-oauth-field" style="display:none">
          <button class="btn-primary" id="as-oauth">Sign in with OpenRouter</button>
          <div class="hint">Opens OpenRouter, you approve, and you come straight back — no key to copy. Or paste a key below.</div>
        </div>
        <div class="field" id="as-key-field"><label>API key <a id="as-key-link" target="_blank" rel="noopener" class="text-link" style="font-weight:400">Get one</a></label>
          <input id="as-key" type="password" autocomplete="off" placeholder="">
        </div>
        <div class="field"><label>Model</label>
          <div style="display:flex;gap:8px">
            <input id="as-model" list="as-models" placeholder="Pick or type a model name" autocomplete="off">
            <datalist id="as-models"></datalist>
            <button class="btn-sm" id="as-load" style="flex-shrink:0">Load list</button>
          </div>
        </div>
        <label class="ntf-event" style="margin:6px 0 4px">
          <span class="switch"><input type="checkbox" id="as-confirm" ${c.confirm ? 'checked' : ''}><span class="track"></span></span>
          <span>Ask me before it changes anything <span class="muted">(recommended)</span></span>
        </label>
        <p class="hint muted" id="as-confirm-warn" style="display:none;color:var(--amber)">With this off the assistant can stop the server, ban players or run any command without asking — including if something a player typed in chat tricks it.</p>
        <label class="ntf-event" style="margin:10px 0 4px">
          <span class="switch"><input type="checkbox" id="as-watch" ${c.watch ? 'checked' : ''}><span class="track"></span></span>
          <span>Look into crashes and lag by itself and notify me</span>
        </label>
        <p class="hint muted">It only looks (status and console), never changes anything, and sends what it found to your phone or Discord. This uses the model without you asking — on free models it can hit their limits.</p>
        ${c.trusted.length ? `<div class="field" style="margin-top:12px"><label>Allowed without asking</label>
          <div class="msg-presets">${c.trusted.map(t => `<button type="button" class="msg-preset" data-untrust="${App.esc(t.key)}">${App.esc(t.label)}<span class="msg-del" title="Ask again">×</span></button>`).join('')}</div></div>` : ''}
        <p class="hint muted" style="margin-top:10px">Your messages and what the assistant looks up (console lines, player names, settings) are sent to the service you choose. A local model keeps everything on this computer.</p>
        <div class="btn-row" style="margin-top:14px"><button class="btn-primary" id="as-save">Save</button></div>
      </div>`;
    document.body.appendChild(ov);
    const $ = (id) => ov.querySelector('#' + id);
    const close = () => ov.remove();
    ov.onclick = (e) => { if (e.target === ov) close(); };
    $('as-close').onclick = close;
    ov.querySelectorAll('[data-untrust]').forEach(b => {
      b.onclick = async () => {
        const r = await App.tryApi('/ai/config', { method: 'PUT', body: { untrust: b.dataset.untrust } });
        if (r) { this.cfg = r; b.remove(); }
      };
    });
    $('as-confirm').onchange = () => { $('as-confirm-warn').style.display = $('as-confirm').checked ? 'none' : ''; };

    const pick = (k, keepValues) => {
      provider = k;
      const p = c.providers[k];
      ov.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('active', b.dataset.p === k));
      $('as-note').textContent = p.note;
      $('as-url-field').style.display = (k === 'custom' || !p.key) ? '' : 'none';
      $('as-oauth-field').style.display = p.oauth ? '' : 'none';
      $('as-key-field').style.display = p.key ? '' : 'none';
      $('as-key-link').style.display = p.keyUrl ? '' : 'none';
      if (p.keyUrl) $('as-key-link').href = p.keyUrl;
      const same = k === c.provider;
      $('as-key').placeholder = same && c.hasKey ? 'Saved — leave empty to keep it' : (p.keyOptional ? 'Optional' : 'Paste your key');
      if (!keepValues) {
        $('as-url').value = same ? c.baseUrl : (p.baseUrl || '');
        $('as-model').value = same ? c.model : (p.model || '');
        $('as-key').value = '';
        $('as-models').innerHTML = '';
      }
    };
    ov.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => pick(b.dataset.p); });
    pick(provider);

    $('as-oauth').onclick = async () => {
      const r = await App.tryApi('/ai/oauth/start', { method: 'POST', body: { origin: location.origin } });
      if (r) location.href = r.url;
    };

    $('as-load').onclick = async () => {
      $('as-load').disabled = true; $('as-load').textContent = 'Loading…';
      const list = await App.tryApi('/ai/models', { method: 'POST', body: { provider, baseUrl: $('as-url').value, apiKey: $('as-key').value } });
      $('as-load').disabled = false; $('as-load').textContent = 'Load list';
      if (!list) return;
      $('as-models').innerHTML = list.map(m => `<option value="${App.esc(m.id)}">${App.esc(m.name || m.id)}</option>`).join('');
      App.toast(list.length ? `${list.length} models — pick one in the Model box` : 'The service listed no models');
      if (!$('as-model').value && list.length === 1) $('as-model').value = list[0].id;
      $('as-model').focus();
    };

    $('as-save').onclick = async () => {
      const r = await App.tryApi('/ai/config', {
        method: 'PUT',
        body: { provider, baseUrl: $('as-url').value, model: $('as-model').value, apiKey: $('as-key').value, confirm: $('as-confirm').checked, watch: $('as-watch').checked }
      }, 'Assistant settings saved');
      if (!r) return;
      this.cfg = r;
      close();
      this.paint();
    };
  }
};

/* The full Assistant page: the chat plus the list of earlier chats. */
App.pages.assistant = {
  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>Assistant</h1>
        <div class="page-head-right">
          <span class="badge" id="ai-model" style="display:none"></span>
          <select id="ai-chats" style="width:auto;max-width:220px" title="Earlier chats"><option value="">Earlier chats…</option></select>
          <button id="ai-del" class="btn-icon btn-danger" title="Delete this chat" style="display:none">${App.icon('trash', 14)}</button>
          <button id="ai-new" class="btn-sm">${App.icon('plus', 14)} New chat</button>
          <button id="ai-settings" class="btn-sm">${App.icon('settings', 14)} Settings</button>
        </div>
      </div>
      <div id="ai-body"></div>`;
    App.aiPanel.close();
    document.getElementById('ai-settings').onclick = () => App.ai.openSettings();
    document.getElementById('ai-new').onclick = () => App.ai.newChat();
    document.getElementById('ai-chats').onchange = (e) => { if (e.target.value) App.ai.openChat(e.target.value); };
    document.getElementById('ai-del').onclick = async () => {
      if (!App.ai.convoId || !confirm('Delete this chat?')) return;
      await App.tryApi(`/ai/chats/${encodeURIComponent(App.ai.convoId)}`, { method: 'DELETE' });
      App.ai.newChat();
    };
    await App.ai.mount(document.getElementById('ai-body'), () => this.head());
  },

  // model chip, earlier-chats list and delete button follow the chat's state
  async head() {
    const ai = App.ai;
    const chip = document.getElementById('ai-model');
    if (!chip || !ai.cfg) return;
    chip.style.display = ai.configured() ? '' : 'none';
    if (ai.configured()) chip.textContent = `${ai.cfg.providers[ai.cfg.provider].label} · ${ai.cfg.model}`;
    document.getElementById('ai-del').style.display = ai.convoId ? '' : 'none';
    if (ai.busy) return;
    const chats = await App.tryApi('/ai/chats');
    const sel = document.getElementById('ai-chats');
    if (!chats || !sel) return;
    sel.innerHTML = '<option value="">Earlier chats…</option>' + chats.map(c => `<option value="${App.esc(c.id)}"${c.id === ai.convoId ? ' selected' : ''}>${App.esc(c.title)}</option>`).join('');
    sel.style.display = chats.length ? '' : 'none';
  },

  onLeave() { App.ai.unmount(document.getElementById('ai-body')); }
};

/* Floating assistant: a button on every other page that opens the same chat in a small panel. */
App.aiPanel = {
  open: false,

  init() {
    if (document.getElementById('ai-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'ai-fab';
    fab.title = 'Assistant';
    fab.innerHTML = App.icon('spark', 22);
    fab.onclick = () => (this.open ? this.close() : this.show());
    const panel = document.createElement('div');
    panel.id = 'ai-panel';
    panel.innerHTML = `
      <div class="ai-panel-head">
        <b>${App.icon('spark', 15)} Assistant</b>
        <span>
          <button class="btn-icon" id="aip-new" title="New chat">${App.icon('plus', 14)}</button>
          <a class="btn btn-icon" href="#assistant" title="Open the full page">${App.icon('external', 14)}</a>
          <button class="btn-icon" id="aip-close" title="Close">${App.icon('x', 14)}</button>
        </span>
      </div>
      <div id="aip-body"></div>`;
    document.body.append(fab, panel);
    document.getElementById('aip-close').onclick = () => this.close();
    document.getElementById('aip-new').onclick = () => App.ai.newChat();
    this.sync();
  },

  show() {
    this.open = true;
    document.getElementById('ai-panel').classList.add('show');
    App.ai.mount(document.getElementById('aip-body'));
  },

  close() {
    this.open = false;
    const panel = document.getElementById('ai-panel');
    if (!panel) return;
    panel.classList.remove('show');
    App.ai.unmount(document.getElementById('aip-body'));
  },

  // the Assistant page has the chat itself, so the button hides there
  sync() {
    const fab = document.getElementById('ai-fab');
    if (!fab) return;
    const onPage = App.currentName === 'assistant';
    fab.style.display = onPage ? 'none' : '';
    document.body.classList.toggle('has-fab', !onPage);
    if (onPage) this.close();
  }
};
