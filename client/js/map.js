App.pages.map = {
  dim: 'overworld',
  tile: 256, // on-screen px per 512-block region

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <h1>World Map</h1>
        <div class="btn-row" id="map-dims"></div>
      </div>
      <div class="card">
        <p class="muted" style="margin-bottom:12px">Elevation map rendered from the world's region files — green lowlands, blue water, brown mountains, white peaks. Spawn is near the center (block 0,0). Hover to read coordinates.</p>
        <div class="btn-row" style="margin-bottom:12px">
          <button id="map-zoom-out" class="btn-sm">−</button>
          <button id="map-zoom-in" class="btn-sm">+</button>
          <span class="muted" id="map-coord" style="align-self:center;font-family:var(--mono);font-size:12px"></span>
        </div>
        <div id="map-viewport" class="map-viewport"><div class="empty">Loading…</div></div>
      </div>`;
    await this.load();
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
        b.onclick = () => { this.dim = b.dataset.dim; this.load(); };
      });
    }

    const vp = document.getElementById('map-viewport');
    if (!vp) return;
    if (!info.regions.length) {
      vp.innerHTML = `<div class="empty">No map data yet for ${this.dim}. Start the server and explore the world — region files appear as chunks are generated and saved.</div>`;
      return;
    }
    this.regions = info.regions;
    this.draw();

    document.getElementById('map-zoom-in').onclick = () => { this.tile = Math.min(512, this.tile * 1.5); this.draw(); };
    document.getElementById('map-zoom-out').onclick = () => { this.tile = Math.max(64, this.tile / 1.5); this.draw(); };
  },

  draw() {
    const vp = document.getElementById('map-viewport');
    if (!vp) return;
    const rxs = this.regions.map(r => r.rx), rzs = this.regions.map(r => r.rz);
    const minRx = Math.min(...rxs), maxRx = Math.max(...rxs);
    const minRz = Math.min(...rzs), maxRz = Math.max(...rzs);
    const t = this.tile;
    const w = (maxRx - minRx + 1) * t;
    const h = (maxRz - minRz + 1) * t;

    const inner = document.createElement('div');
    inner.className = 'map-canvas';
    inner.style.width = w + 'px';
    inner.style.height = h + 'px';

    for (const r of this.regions) {
      const img = document.createElement('img');
      img.className = 'map-tile';
      img.loading = 'lazy';
      img.src = `/api/map/region/${this.dim}/${r.rx}/${r.rz}.png`;
      img.style.left = (r.rx - minRx) * t + 'px';
      img.style.top = (r.rz - minRz) * t + 'px';
      img.style.width = t + 'px';
      img.style.height = t + 'px';
      img.title = `region ${r.rx}, ${r.rz}`;
      img.onmousemove = (e) => {
        const rect = img.getBoundingClientRect();
        const bx = Math.round(r.rx * 512 + (e.clientX - rect.left) / t * 512);
        const bz = Math.round(r.rz * 512 + (e.clientY - rect.top) / t * 512);
        const c = document.getElementById('map-coord');
        if (c) c.textContent = `X ${bx}, Z ${bz}`;
      };
      inner.appendChild(img);
    }

    // crosshair marker at world origin (0,0) if within view
    if (minRx <= 0 && maxRx >= 0 && minRz <= 0 && maxRz >= 0) {
      const o = document.createElement('div');
      o.className = 'map-origin';
      o.style.left = ((0 - minRx) * t + (t / 2)) + 'px';
      o.style.top = ((0 - minRz) * t + (t / 2)) + 'px';
      o.title = 'World origin (0,0)';
      inner.appendChild(o);
    }

    vp.innerHTML = '';
    vp.appendChild(inner);
  }
};
