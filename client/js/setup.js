/* First-run setup wizard: download a server, accept the EULA, and start it —
   all from one overlay, so a new user never has to hunt across pages. */
App.wizard = {
  autoShown: false,
  busy: false,
  st: null,
  versions: null,

  // open once automatically on first run when there's no server yet
  async maybeAutoOpen(status) {
    if (this.autoShown || status.jarExists) return;
    this.autoShown = true;
    this.open();
  },

  async open() {
    if (document.getElementById('wizard-overlay')) return;
    this.st = await App.tryApi('/server/status');
    if (!this.st) return;

    const ov = document.createElement('div');
    ov.id = 'wizard-overlay';
    ov.innerHTML = `
      <div class="wizard-card">
        <button class="wiz-close" title="Close" aria-label="Close">${App.icon('x', 18)}</button>
        <div class="wiz-logo"><img src="icon.svg" class="logo-img" alt=""><span>Quick setup</span></div>
        <h1>Let's set up your server</h1>
        <p class="muted wiz-sub">A couple of clicks and you're playing. We'll download a server, accept Mojang's rules, and start it for you.</p>
        <div id="wiz-body"></div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('.wiz-close').onclick = () => this.close();
    ov.addEventListener('mousedown', (e) => { if (e.target === ov && !this.busy) this.close(); });

    this.renderChoose();
  },

  close() {
    const ov = document.getElementById('wizard-overlay');
    if (ov) ov.remove();
  },

  // Step 1: pick the server software
  async renderChoose() {
    const body = document.getElementById('wiz-body');
    const hasJar = this.st.jarExists;
    body.innerHTML = `
      ${hasJar ? `
        <div class="wiz-note">${App.icon('server', 16)} You already have a server installed. We'll just start it.</div>
      ` : `
        <div class="wiz-choices">
          <button type="button" class="wiz-choice active" data-type="paper">
            <span class="wiz-check">${App.icon('play', 13)}</span>
            <b>Recommended</b>
            <span class="wiz-choice-sub">Latest Paper — fast and supports plugins. Best for almost everyone.</span>
          </button>
          <button type="button" class="wiz-choice" data-type="vanilla">
            <b>Vanilla</b>
            <span class="wiz-choice-sub">The pure Mojang server, no plugins.</span>
          </button>
        </div>
        <div class="wiz-adv">
          <a id="wiz-adv-toggle">Choose a specific version…</a>
          <div id="wiz-adv-box" style="display:none">
            <label>Version</label>
            <select id="wiz-version"><option>Loading…</option></select>
          </div>
        </div>
      `}
      <label class="wiz-eula">
        <span class="switch"><input type="checkbox" id="wiz-eula-ok" checked><span class="track" onclick="document.getElementById('wiz-eula-ok').click()"></span></span>
        <span>I agree to the <a href="https://www.minecraft.net/eula" target="_blank" rel="noopener">Minecraft EULA</a> (required by Mojang to run a server).</span>
      </label>
      <button id="wiz-go" class="btn-primary wiz-go">${hasJar ? 'Start my server' : 'Create my server'} →</button>
    `;

    if (!hasJar) {
      let picked = 'paper';
      body.querySelectorAll('.wiz-choice').forEach(b => {
        b.onclick = () => {
          picked = b.dataset.type;
          body.querySelectorAll('.wiz-choice').forEach(x => x.classList.toggle('active', x === b));
          this.fillVersions(picked);
        };
      });
      this._pickedType = () => picked;

      const advToggle = document.getElementById('wiz-adv-toggle');
      advToggle.onclick = () => {
        const box = document.getElementById('wiz-adv-box');
        const show = box.style.display === 'none';
        box.style.display = show ? 'block' : 'none';
        advToggle.textContent = show ? 'Use the latest version' : 'Choose a specific version…';
        if (show && !this.versions) this.loadVersions(picked);
        else if (show) this.fillVersions(picked);
      };
    }

    document.getElementById('wiz-go').onclick = () => this.run();
  },

  async loadVersions(type) {
    this.versions = await App.tryApi('/jars/versions');
    this.fillVersions(type);
  },

  fillVersions(type) {
    const sel = document.getElementById('wiz-version');
    if (!sel || !this.versions) return;
    sel.innerHTML = (this.versions[type] || []).map(v => `<option>${App.esc(v)}</option>`).join('')
      || '<option value="">unavailable</option>';
  },

  // chosen version: explicit selection if the advanced box is open, else newest
  chosenVersion(type) {
    const sel = document.getElementById('wiz-version');
    const box = document.getElementById('wiz-adv-box');
    if (sel && box && box.style.display !== 'none' && sel.value) return sel.value;
    return this.versions ? (this.versions[type] || [])[0] : null;
  },

  // Step 2: run download -> eula -> start, showing progress
  async run() {
    if (this.busy) return;
    if (!document.getElementById('wiz-eula-ok').checked) {
      return App.toast('Please agree to the Minecraft EULA to continue', true);
    }
    this.busy = true;
    const type = this.st.jarExists ? null : this._pickedType();

    // make sure we have a version to download before we start showing progress
    if (!this.st.jarExists && !this.versions) await this.loadVersions(type);
    const version = this.st.jarExists ? null : this.chosenVersion(type);
    if (!this.st.jarExists && !version) {
      this.busy = false;
      return App.toast('Could not load server versions — check your internet and try again', true);
    }

    const steps = [];
    if (!this.st.jarExists) steps.push(['dl', `Downloading ${type} ${version}`]);
    if (this.st.eula !== 'accepted') steps.push(['eula', 'Accepting the Minecraft EULA']);
    steps.push(['start', 'Starting the server']);

    const body = document.getElementById('wiz-body');
    body.innerHTML = `<div class="wiz-steps">${steps.map(([k, label]) =>
      `<div class="wiz-step" data-step="${k}"><span class="wiz-step-ico"></span><span class="wiz-step-label">${App.esc(label)}</span></div>`
    ).join('')}</div><div id="wiz-step-hint" class="muted wiz-step-hint">This can take a minute the first time.</div>`;

    const set = (k, state) => {
      const row = body.querySelector(`.wiz-step[data-step="${k}"]`);
      if (!row) return;
      row.className = `wiz-step ${state}`;
      const ico = row.querySelector('.wiz-step-ico');
      ico.innerHTML = state === 'done' ? App.icon('play', 12) : '';
    };

    try {
      if (!this.st.jarExists) {
        set('dl', 'run');
        await App.api('/jars/download', { method: 'POST', body: { type, version } });
        set('dl', 'done');
        this.st.jarExists = true;
      }
      if (this.st.eula !== 'accepted') {
        set('eula', 'run');
        await App.api('/server/eula', { method: 'POST' });
        set('eula', 'done');
        this.st.eula = 'accepted';
      }
      set('start', 'run');
      await App.api('/server/start', { method: 'POST' });
      await this.waitOnline();
      set('start', 'done');
      this.busy = false;
      this.renderSuccess();
    } catch (e) {
      this.busy = false;
      this.renderError(e.message);
    }
  },

  // resolve when the server reports online; reject if it stops or takes too long
  waitOnline() {
    return new Promise((resolve, reject) => {
      if (App.status === 'online') return resolve();
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (App.status === 'online') { clearInterval(iv); resolve(); }
        else if (App.status === 'offline' && Date.now() - t0 > 4000) {
          clearInterval(iv); reject(new Error('The server stopped while starting — open the Console to see why.'));
        } else if (Date.now() - t0 > 180000) {
          clearInterval(iv); reject(new Error('The server is taking unusually long — check the Console.'));
        }
      }, 500);
    });
  },

  renderSuccess() {
    const body = document.getElementById('wiz-body');
    body.innerHTML = `
      <div class="wiz-success">
        <div class="wiz-success-ico">${App.icon('play', 26)}</div>
        <h2>Your server is ready! 🎉</h2>
        <p class="muted">It's running now. Here's how to join:</p>
      </div>
      <div class="wiz-connect">
        <div class="wiz-connect-row">
          <div><b>On this computer</b><span class="muted">Open Minecraft → Multiplayer → Add Server</span></div>
          <span class="wiz-addr">localhost <button class="wiz-copy" data-copy="localhost">Copy</button></span>
        </div>
        <div class="wiz-connect-row">
          <div><b>Friends over the internet</b><span class="muted">Get a shareable link in one click</span></div>
          <a href="#tunnel" class="btn-sm" id="wiz-tunnel">Play Online →</a>
        </div>
      </div>
      <button id="wiz-done" class="btn-primary wiz-go">Go to dashboard</button>`;
    body.querySelector('.wiz-copy').onclick = (e) => {
      navigator.clipboard?.writeText(e.target.dataset.copy);
      App.toast('Copied “localhost”');
    };
    document.getElementById('wiz-tunnel').onclick = () => this.close();
    document.getElementById('wiz-done').onclick = () => this.close();
  },

  renderError(msg) {
    const body = document.getElementById('wiz-body');
    body.innerHTML = `
      <div class="wiz-error">${App.icon('x', 16)} ${App.esc(msg)}</div>
      <div class="btn-row" style="margin-top:14px">
        <button id="wiz-retry" class="btn-primary">Try again</button>
        <a href="#console" class="btn-sm" id="wiz-console">Open Console</a>
      </div>`;
    document.getElementById('wiz-retry').onclick = () => this.renderChoose();
    document.getElementById('wiz-console').onclick = () => this.close();
  }
};
