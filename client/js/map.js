App.pages.map = {
  dim: 'overworld',
  view: { cx: 0, cz: 0, scale: 0.5 }, // cx/cz = world block at canvas centre, scale = px per block
  regions: [],
  images: {},

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>World Map</h1>
        <div class="btn-row" id="map-dims"></div>
      </div>
      <div class="card">
        <h2>Generate area from your seed</h2>
        <p class="muted" style="margin-bottom:12px">A map can't be drawn from the seed number alone — but the running server can generate the area for you (it uses your seed), then it appears below. Server must be online; this briefly loads it, so keep the radius modest.</p>
        <div class="btn-row" style="align-items:flex-end">
          <div class="field" style="margin:0"><label>Radius (chunks from spawn)</label>
            <input type="number" id="map-gen-radius" value="6" min="1" max="12" style="width:120px"></div>
          <button id="map-gen" class="btn-primary">${App.icon('map', 14)} Generate around spawn</button>
          <span class="muted" id="map-gen-note" style="align-self:center;font-size:12px"></span>
        </div>
      </div>
      <div class="card">
        <div class="btn-row" style="margin-bottom:10px;align-items:center">
          <button id="map-zoom-out" class="btn-icon" title="Zoom out">−</button>
          <button id="map-zoom-in" class="btn-icon" title="Zoom in">+</button>
          <button id="map-center" class="btn-sm">Center on spawn</button>
          <button id="map-fit" class="btn-sm">Fit terrain</button>
          <button id="map-refresh" class="btn-sm">Refresh</button>
          <span class="muted" id="map-coord" style="align-self:center;font-family:var(--mono);font-size:12px;margin-left:auto"></span>
        </div>
        <div id="map-viewport" class="map-viewport">
          <canvas id="map-canvas"></canvas>
          <div id="map-empty" class="map-empty"></div>
        </div>
        <p class="muted" style="font-size:11px;margin-top:8px">Drag to pan · scroll to zoom · only generated chunks appear. The Nether's roof makes its elevation map look flat — that's expected.</p>
      </div>`;

    this.setupGenerate();
    this.setupCanvas();
    document.getElementById('map-zoom-in').onclick = () => this.zoom(1.4);
    document.getElementById('map-zoom-out').onclick = () => this.zoom(1 / 1.4);
    document.getElementById('map-center').onclick = () => { this.view.cx = 0; this.view.cz = 0; this.draw(); };
    document.getElementById('map-fit').onclick = () => { this.fit(); this.draw(); };
    document.getElementById('map-refresh').onclick = () => this.load();
    window.onresize = () => { if (App.currentName === 'map') { this.resizeCanvas(); this.draw(); } };

    await this.load();
  },

  setupGenerate() {
    const genBtn = document.getElementById('map-gen');
    const note = document.getElementById('map-gen-note');
    genBtn.disabled = App.status !== 'online';
    if (App.status !== 'online') note.textContent = 'Server must be online';
    genBtn.onclick = async () => {
      const radius = Number(document.getElementById('map-gen-radius').value);
      genBtn.disabled = true;
      const r = await App.tryApi('/map/pregenerate', { method: 'POST', body: { radius } });
      if (!r) { genBtn.disabled = App.status !== 'online'; return; }
      App.toast(`Generating ${r.chunks} chunks — the map refreshes in ~${r.estSeconds}s`);
      note.textContent = `Generating ${r.chunks} chunks…`;
      setTimeout(() => { note.textContent = ''; genBtn.disabled = App.status !== 'online'; this.load(); }, (r.estSeconds + 2) * 1000);
    };
  },

  resizeCanvas() {
    const c = document.getElementById('map-canvas');
    if (!c) return;
    const vp = document.getElementById('map-viewport');
    const dpr = window.devicePixelRatio || 1;
    this.w = vp.clientWidth;
    this.h = vp.clientHeight;
    c.width = this.w * dpr;
    c.height = this.h * dpr;
    c.style.width = this.w + 'px';
    c.style.height = this.h + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  },

  setupCanvas() {
    this.resizeCanvas();
    const c = document.getElementById('map-canvas');
    let dragging = false, lastX = 0, lastY = 0, moved = false;

    const worldAt = (clientX, clientY) => {
      const rect = c.getBoundingClientRect();
      return {
        x: this.view.cx + (clientX - rect.left - this.w / 2) / this.view.scale,
        z: this.view.cz + (clientY - rect.top - this.h / 2) / this.view.scale
      };
    };

    c.onmousedown = (e) => { dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY; c.style.cursor = 'grabbing'; };
    window.onmouseup = () => { dragging = false; if (c) c.style.cursor = 'grab'; }; // single-slot: no accumulation across visits
    c.onmousemove = (e) => {
      if (dragging) {
        this.view.cx -= (e.clientX - lastX) / this.view.scale;
        this.view.cz -= (e.clientY - lastY) / this.view.scale;
        lastX = e.clientX; lastY = e.clientY; moved = true;
        this.draw();
      } else {
        const w = worldAt(e.clientX, e.clientY);
        const el = document.getElementById('map-coord');
        if (el) el.textContent = `X ${Math.round(w.x)}, Z ${Math.round(w.z)}`;
      }
    };
    c.onwheel = (e) => {
      e.preventDefault();
      const before = worldAt(e.clientX, e.clientY);
      this.view.scale = Math.max(0.03, Math.min(8, this.view.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      const rect = c.getBoundingClientRect();
      this.view.cx = before.x - (e.clientX - rect.left - this.w / 2) / this.view.scale;
      this.view.cz = before.z - (e.clientY - rect.top - this.h / 2) / this.view.scale;
      this.draw();
    };
    // touch: one-finger pan
    c.ontouchstart = (e) => { if (e.touches.length === 1) { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; } };
    c.ontouchmove = (e) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        this.view.cx -= (e.touches[0].clientX - lastX) / this.view.scale;
        this.view.cz -= (e.touches[0].clientY - lastY) / this.view.scale;
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        this.draw();
      }
    };
    c.style.cursor = 'grab';
  },

  zoom(factor) {
    this.view.scale = Math.max(0.03, Math.min(8, this.view.scale * factor));
    this.draw();
  },

  fit() {
    if (!this.regions.length) { this.view = { cx: 0, cz: 0, scale: 0.5 }; return; }
    const rxs = this.regions.map(r => r.rx), rzs = this.regions.map(r => r.rz);
    const minBx = Math.min(...rxs) * 512, maxBx = (Math.max(...rxs) + 1) * 512;
    const minBz = Math.min(...rzs) * 512, maxBz = (Math.max(...rzs) + 1) * 512;
    this.view.cx = (minBx + maxBx) / 2;
    this.view.cz = (minBz + maxBz) / 2;
    this.view.scale = Math.max(0.03, Math.min(4, Math.min(this.w / (maxBx - minBx), this.h / (maxBz - minBz)) * 0.9));
  },

  async load() {
    const info = await App.tryApi(`/map/regions?dim=${this.dim}`);
    if (!info) return;
    this.dim = info.dim;

    const dims = document.getElementById('map-dims');
    if (dims) {
      const all = info.dimensions.length ? info.dimensions : ['overworld'];
      dims.innerHTML = all.map(d =>
        `<button class="btn-sm ${d === this.dim ? 'btn-primary' : ''}" data-dim="${d}">${d}</button>`).join('');
      dims.querySelectorAll('[data-dim]').forEach(b => {
        b.onclick = () => { if (this.dim === b.dataset.dim) return; this.dim = b.dataset.dim; this.images = {}; this.load(); };
      });
    }

    this.regions = info.regions || [];
    const empty = document.getElementById('map-empty');
    if (empty) {
      empty.style.display = this.regions.length ? 'none' : 'flex';
      empty.textContent = `No generated chunks in the ${this.dim} yet. Use “Generate around spawn” above (overworld), or explore in-game.`;
    }

    // preload region images, redraw as each arrives
    for (const r of this.regions) {
      const key = `${this.dim}:${r.rx}:${r.rz}`;
      if (this.images[key]) continue;
      const img = new Image();
      img.onload = () => { if (App.currentName === 'map') this.draw(); };
      img.src = `/api/map/region/${this.dim}/${r.rx}/${r.rz}.png`;
      this.images[key] = img;
    }
    this.fit();
    this.draw();
  },

  draw() {
    const c = document.getElementById('map-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.w, this.h);
    const { cx, cz, scale } = this.view;
    const size = 512 * scale;
    for (const r of this.regions) {
      const img = this.images[`${this.dim}:${r.rx}:${r.rz}`];
      if (!img || !img.complete || !img.naturalWidth) continue;
      const sx = (r.rx * 512 - cx) * scale + this.w / 2;
      const sy = (r.rz * 512 - cz) * scale + this.h / 2;
      if (sx > this.w || sy > this.h || sx + size < 0 || sy + size < 0) continue; // off-screen cull
      ctx.drawImage(img, sx, sy, size, size);
    }
    // spawn marker
    const ox = (0 - cx) * scale + this.w / 2;
    const oy = (0 - cz) * scale + this.h / 2;
    if (ox >= 0 && ox <= this.w && oy >= 0 && oy <= this.h) {
      ctx.strokeStyle = '#00d26a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox - 9, oy); ctx.lineTo(ox + 9, oy); ctx.moveTo(ox, oy - 9); ctx.lineTo(ox, oy + 9); ctx.stroke();
    }
  }
};
