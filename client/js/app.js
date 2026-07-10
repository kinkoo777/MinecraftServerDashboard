/* Inline SVG icon set (feather-style: 24px grid, 2px stroke, round caps) */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  console: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  players: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  world: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  files: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  plugins: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  schedules: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  restart: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  rename: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  folderplus: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/>',
  file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
  archive: '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
  restore: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 15"/>',
  map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  tunnel: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
  move: '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="9 19 12 22 15 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
  chevup: '<polyline points="18 15 12 9 6 15"/>',
  chevdown: '<polyline points="6 9 12 15 18 9"/>'
};

/* Shared app shell: hash router, WebSocket, API helper, toasts */
const App = {
  pages: {},          // name -> { render(el), onLog?, onStatus?, onStats?, onPlayers? }
  current: null,
  currentName: '',
  status: 'offline',
  players: [],
  stats: { cpu: 0, memory: 0, uptime: 0, online: false },
  logBuffer: [],
  ws: null,
  reconnectDelay: 1000,

  icon(name, size = 16) {
    return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  },

  async init() {
    document.querySelectorAll('#nav a').forEach(a => {
      const s = a.querySelector('.icon');
      if (s) s.innerHTML = this.icon(a.dataset.page, 16);
    });
    this.applyTheme(localStorage.getItem('theme') || 'dark');
    document.getElementById('theme-toggle').onclick = () => {
      const next = document.body.classList.contains('light') ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      this.applyTheme(next);
    };
    const reportIcon = document.getElementById('report-bug-icon');
    if (reportIcon) reportIcon.innerHTML = this.icon('bug', 14);
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.innerHTML = this.icon('logout', 14);
    logoutBtn.onclick = async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        location.reload(); // always return to login, even if the request fails
      }
    };

    let st = { setup: false, authed: false };
    try { st = await (await fetch('/api/auth/status')).json(); } catch (e) { /* server down; boot will retry via WS */ }
    if (!st.authed) return this.renderAuth(st.setup);
    this.boot();
  },

  boot() {
    window.addEventListener('hashchange', () => this.route());
    this.connect();
    this.route();
  },

  renderAuth(isSetup) {
    const MIN = 6;
    // A password field with a built-in show/hide (eye) button.
    const pwField = (id, ph, ac) => `
      <div class="pw-wrap">
        <input type="password" id="${id}" placeholder="${ph}" autocomplete="${ac}">
        <button type="button" class="pw-toggle" data-for="${id}" aria-label="Show password" tabindex="-1">${this.icon('eye', 18)}</button>
      </div>`;

    // Warn if the dashboard is reached over plain HTTP from a non-local address
    // (e.g. through a tunnel) — the password would travel unencrypted.
    const local = /^(localhost|127\.|0\.0\.0\.0|::1|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
    const insecure = location.protocol !== 'https:' && !local;

    const ov = document.createElement('div');
    ov.id = 'auth-overlay';
    ov.innerHTML = `
      <form class="auth-card" id="auth-form">
        <div class="logo" style="border:none;justify-content:center;padding:0"><img src="icon.svg" class="logo-img" alt=""><span>ChunkDeck</span></div>
        <h1 style="text-align:center;margin:4px 0">${isSetup ? 'Log in' : 'Create a password'}</h1>
        ${isSetup ? '' : '<p class="muted" style="text-align:center">First run — protect your dashboard before anything else.</p>'}
        ${insecure ? `<div class="auth-warn">🔓 This connection isn't encrypted (plain HTTP). Anyone between you and the server could read your password. Set up HTTPS before exposing the dashboard over the internet.</div>` : ''}
        ${pwField('auth-pw', 'Password', isSetup ? 'current-password' : 'new-password')}
        ${isSetup ? '' : pwField('auth-pw2', 'Repeat password', 'new-password')}
        ${isSetup ? '' : `<div class="pw-meter" id="pw-meter"><span></span><span></span><span></span></div>
        <p class="auth-hint muted" id="pw-hint">Use at least ${MIN} characters — longer is safer.</p>`}
        <div id="auth-caps" class="auth-note">⚠ Caps Lock is on</div>
        <div class="pw-2fa" id="auth-2fa-wrap" style="display:none">
          <input id="auth-2fa" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code from your app">
          <div style="margin-top:8px"><a href="#" id="auth-2fa-recover" class="muted" style="font-size:12px">Lost access to your authenticator?</a></div>
          <div id="auth-2fa-recover-box" style="display:none;margin-top:10px;text-align:left">
            <p class="muted" style="font-size:12px;margin-bottom:8px">Enter one of the recovery codes you saved when you turned 2FA on. This disables 2FA — you can turn it back on afterward.</p>
            <input id="auth-2fa-recovery-code" placeholder="Recovery code (e.g. ABCD-2345)" autocomplete="off" style="margin-bottom:8px">
            <button type="button" id="auth-2fa-recover-submit" class="btn-sm">Disable 2FA & log in</button>
          </div>
        </div>
        <label class="auth-remember">
          <span class="switch"><input type="checkbox" id="auth-remember" checked><span class="track"></span></span>
          <span>Keep me signed in on this device</span>
        </label>
        <button class="btn-primary" type="submit" id="auth-submit">${isSetup ? 'Log in' : 'Set password & enter'}</button>
        <div id="auth-err" class="auth-err"></div>
      </form>`;
    document.body.appendChild(ov);

    const $ = (s) => ov.querySelector(s);
    const err = (m) => { $('#auth-err').textContent = m; };
    const pw = $('#auth-pw');
    const pw2 = isSetup ? null : $('#auth-pw2');

    // show/hide password toggles
    ov.querySelectorAll('.pw-toggle').forEach(btn => {
      btn.onclick = () => {
        const inp = ov.querySelector('#' + btn.dataset.for);
        const reveal = inp.type === 'password';
        inp.type = reveal ? 'text' : 'password';
        btn.innerHTML = this.icon(reveal ? 'eyeoff' : 'eye', 18);
        btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
        inp.focus();
      };
    });

    // Caps Lock indicator
    const caps = $('#auth-caps');
    const checkCaps = (e) => {
      if (e.getModifierState) caps.classList.toggle('show', e.getModifierState('CapsLock'));
    };
    [pw, pw2].filter(Boolean).forEach(i => { i.addEventListener('keydown', checkCaps); i.addEventListener('keyup', checkCaps); });

    // First-run: strength meter + live validation (don't let them submit a too-short/mismatched password)
    if (!isSetup) {
      const meter = $('#pw-meter');
      const hint = $('#pw-hint');
      const submit = $('#auth-submit');
      const score = (p) => {
        let s = 0;
        if (p.length >= MIN) s++;
        if (p.length >= 12) s++;
        if (/[^a-zA-Z0-9]/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p))) s++;
        return p.length ? Math.max(1, Math.min(s, 3)) : 0;
      };
      const labels = ['', 'Weak', 'Okay', 'Strong'];
      const update = () => {
        const s = score(pw.value);
        meter.dataset.score = String(s);
        const tooShort = pw.value.length > 0 && pw.value.length < MIN;
        const mismatch = pw2.value.length > 0 && pw.value !== pw2.value;
        hint.textContent = tooShort ? `A bit short — use at least ${MIN} characters.`
          : mismatch ? 'The two passwords don’t match yet.'
          : pw.value ? `Strength: ${labels[s]}` : `Use at least ${MIN} characters — longer is safer.`;
        submit.disabled = pw.value.length < MIN || pw.value !== pw2.value;
      };
      [pw, pw2].forEach(i => i.addEventListener('input', update));
      update();
    }

    // the .track click forwards to its checkbox (matches the app's toggle pattern)
    const remember = $('#auth-remember');
    $('.auth-remember .track').onclick = () => remember.click();

    let need2fa = false;
    const twoFaWrap = $('#auth-2fa-wrap');
    const twoFa = $('#auth-2fa');

    $('#auth-form').onsubmit = async (e) => {
      e.preventDefault();
      const password = pw.value;
      if (!isSetup && password !== pw2.value) return err('Passwords do not match');
      const body = { password, remember: remember.checked };
      if (need2fa) body.code = twoFa.value.trim();
      const res = await fetch(`/api/auth/${isSetup ? 'login' : 'setup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const j = await res.json().catch(() => ({}));
      if (j.need2fa) {
        // password accepted — now ask for the authenticator code
        need2fa = true;
        twoFaWrap.style.display = 'block';
        pw.closest('.pw-wrap').style.display = 'none';
        $('#auth-submit').textContent = 'Verify code';
        err(j.error || '');
        twoFa.focus();
        const recoverLink = $('#auth-2fa-recover');
        const recoverBox = $('#auth-2fa-recover-box');
        if (recoverLink) recoverLink.onclick = (e) => {
          e.preventDefault();
          const show = recoverBox.style.display === 'none';
          recoverBox.style.display = show ? '' : 'none';
          if (show) $('#auth-2fa-recovery-code').focus();
        };
        const recoverSubmit = $('#auth-2fa-recover-submit');
        if (recoverSubmit) recoverSubmit.onclick = async () => {
          const recoveryCode = $('#auth-2fa-recovery-code').value.trim();
          if (!recoveryCode) return err('Enter one of your recovery codes');
          const r = await fetch('/api/auth/2fa/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw.value, recoveryCode })
          });
          const rj = await r.json().catch(() => ({}));
          if (!r.ok) return err(rj.error || 'Recovery failed');
          err('2FA disabled — log in with your password.');
          need2fa = false;
          twoFaWrap.style.display = 'none';
          recoverBox.style.display = 'none';
          pw.closest('.pw-wrap').style.display = '';
          $('#auth-submit').textContent = isSetup ? 'Log in' : 'Set password & enter';
        };
        return;
      }
      if (!res.ok) return err(j.error || 'Something went wrong');
      ov.remove();
      this.boot();
    };
    pw.focus();
  },

  applyTheme(theme) {
    document.body.classList.toggle('light', theme === 'light');
    document.getElementById('theme-toggle').innerHTML = this.icon(theme === 'light' ? 'moon' : 'sun', 15);
  },

  route() {
    const name = location.hash.replace('#', '') || 'dashboard';
    const page = this.pages[name] || this.pages.dashboard;
    // let the outgoing page tear down its timers/listeners before we swap it out
    if (this.current && this.current !== page && this.current.onLeave) {
      try { this.current.onLeave(); } catch (e) { /* never let teardown block navigation */ }
    }
    this.current = page;
    this.currentName = name;
    document.querySelectorAll('#nav a').forEach(a =>
      a.classList.toggle('active', a.dataset.page === name));
    const el = document.getElementById('content');
    el.innerHTML = '';
    el.classList.remove('page-anim');
    void el.offsetWidth; // restart the entrance animation
    el.classList.add('page-anim');
    page.render(el);
  },

  connect() {
    // guard against overlapping connect() calls (e.g. a queued reconnect firing
    // while a socket is already opening/open)
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => { this.reconnectDelay = 1000; }; // reset backoff on a healthy connection
    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); }
      catch (err) { return; } // ignore a malformed frame rather than killing the handler
      const { type, data } = msg;
      if (type === 'init') {
        this.status = data.status;
        this.players = data.players;
        this.logBuffer = data.log;
        this.updateSidebar();
        if (this.current?.onStatus) this.current.onStatus(data.status);
        if (this.current?.onInit) this.current.onInit(data);
      } else if (type === 'log') {
        this.logBuffer.push(data);
        if (this.logBuffer.length > 1000) this.logBuffer.shift();
        if (this.current?.onLog) this.current.onLog(data);
      } else if (type === 'status') {
        this.status = data;
        this.updateSidebar();
        if (this.current?.onStatus) this.current.onStatus(data);
      } else if (type === 'stats') {
        this.stats = data;
        if (this.current?.onStats) this.current.onStats(data);
      } else if (type === 'players') {
        this.players = data;
        if (this.current?.onPlayers) this.current.onPlayers(data);
      } else if (type === 'tunnel-log') {
        if (this.current?.onTunnelLog) this.current.onTunnelLog(data);
      } else if (type === 'tunnel-update') {
        if (this.current?.onTunnelUpdate) this.current.onTunnelUpdate(data);
      } else if (type === 'cf-log') {
        if (this.current?.onCfLog) this.current.onCfLog(data);
      } else if (type === 'cf-update') {
        if (this.current?.onCfUpdate) this.current.onCfUpdate(data);
      }
    };
    this.ws.onclose = (e) => {
      if (e.code === 4001) return location.reload(); // logged out
      // exponential backoff with a ceiling, so a server that stays down doesn't
      // get hammered with reconnects every 2s
      const delay = this.reconnectDelay || 1000;
      this.reconnectDelay = Math.min(delay * 2, 30000);
      setTimeout(() => this.connect(), delay);
    };
  },

  // plain-language status for non-technical users (keep the raw value for dot classes)
  statusText(s) {
    return { offline: 'Offline', starting: 'Starting up…', online: 'Ready to join', stopping: 'Stopping…' }[s]
      || (s ? s[0].toUpperCase() + s.slice(1) : '');
  },

  updateSidebar() {
    const dot = document.getElementById('side-status-dot');
    const text = document.getElementById('side-status-text');
    dot.className = `dot ${this.status}`;
    text.textContent = this.statusText(this.status);
  },

  async api(path, opts = {}) {
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers = { 'Content-Type': 'application/json', ...opts.headers };
    }
    const res = await fetch(`/api${path}`, opts);
    if (res.status === 401) {
      location.reload(); // session expired -> back to login
      throw new Error('Session expired');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' error' : ''}`;
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4000);
  },

  // try an API call, toast on failure; returns null on error
  async tryApi(path, opts, successMsg) {
    try {
      const r = await this.api(path, opts);
      if (successMsg) this.toast(successMsg);
      return r;
    } catch (e) {
      this.toast(e.message, true);
      return null;
    }
  },

  fmtBytes(n) {
    if (n == null) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
  },

  fmtAgo(t) {
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h ago`;
    return `${Math.floor(h / 24)} d ago`;
  },

  fmtUptime(ms) {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
  },

  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },

  logLineHtml(line) {
    let cls = '';
    if (line.startsWith('>')) cls = 'log-cmd';
    else if (/\/(WARN|WARNING)\]/.test(line)) cls = 'log-warn';
    else if (/\/(ERROR|FATAL)\]/.test(line) || line.includes('[dashboard] Failed')) cls = 'log-error';
    // dim the "[12:34:56] [Server thread/INFO]:" prefix so the message stands out
    const html = this.esc(line).replace(
      /^(\[\d{2}:\d{2}:\d{2}\] \[[^\]]*\]:?|\[dashboard\])/,
      '<span class="log-meta">$1</span>'
    );
    return `<div class="${cls}">${html}</div>`;
  }
};
