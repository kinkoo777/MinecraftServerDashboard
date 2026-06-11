App.pages.history = {
  data: { today: null, days: [] },
  selected: null, // date string; null = today

  async render(el) {
    el.innerHTML = `
      <div class="page-head"><h1>Server History</h1></div>
      <div id="hist-detail"></div>
      <h2 style="margin:24px 0 12px">Previous days</h2>
      <div id="hist-days" class="card"><div class="empty">Loading…</div></div>`;
    await this.load();
  },

  async load() {
    const data = await App.tryApi('/reports');
    if (!data) return;
    this.data = data;
    this.renderDetail();
    this.renderDays();
  },

  selectedReport() {
    if (!this.selected || this.selected === this.data.today.date) return this.data.today;
    return this.data.days.find(d => d.date === this.selected) || this.data.today;
  },

  fmtUptime(min) {
    if (!min) return '0m';
    const h = Math.floor(min / 60);
    return h > 0 ? `${h}h ${min % 60}m` : `${min}m`;
  },

  fmtDate(s, isToday) {
    if (isToday) return 'Today';
    const d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  },

  renderDetail() {
    const r = this.selectedReport();
    const isToday = r.date === this.data.today.date;
    const box = document.getElementById('hist-detail');
    if (!box) return;

    const tiles = [
      ['Peak players', r.peakPlayers],
      ['Avg players', r.avgPlayers],
      ['Unique players', r.uniquePlayers.length],
      ['Joins', r.joins],
      ['Uptime', this.fmtUptime(r.uptimeMinutes)],
      ['Peak RAM', r.peakMemMB ? `${r.peakMemMB} MB` : '—'],
      ['Avg RAM', r.avgMemMB ? `${r.avgMemMB} MB` : '—'],
      ['Peak CPU', r.peakCpu ? `${r.peakCpu}%` : '—'],
      ['Avg TPS', r.avgTps ?? '—'],
      ['Min TPS', r.minTps ?? '—'],
      ['Crashes', r.crashes],
      ['Backups', r.backups]
    ];

    box.innerHTML = `
      <div class="card">
        <div class="chart-head">
          <h2 style="margin:0">${this.fmtDate(r.date, isToday)} ${isToday ? '<span class="chip chip-green" style="margin-left:6px">live</span>' : ''}</h2>
          <span class="muted" style="font-size:12px">${r.date}</span>
        </div>
        <div class="grid grid-4" style="margin-bottom:18px">
          ${tiles.map(([l, v]) => `<div class="pstat"><span class="label">${l}</span>${v}</div>`).join('')}
        </div>
        <div class="chart-head"><h2 style="margin:0;font-size:13px">Players by hour</h2></div>
        <canvas id="hist-chart" height="150"></canvas>
        ${r.uniquePlayers.length ? `<div style="margin-top:14px"><span class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.5px">Players seen</span>
          <div class="hist-players">${r.uniquePlayers.map(n => `
            <span class="hist-player" data-name="${App.esc(n)}"><img src="https://mc-heads.net/avatar/${App.esc(n)}/22" alt="">${App.esc(n)}</span>`).join('')}</div></div>` : ''}
      </div>`;

    this.drawHourly(document.getElementById('hist-chart'), r, 150, true);
    box.querySelectorAll('.hist-player').forEach(p => {
      p.onclick = () => App.pages.players.openModal(p.dataset.name);
    });
  },

  renderDays() {
    const box = document.getElementById('hist-days');
    if (!box) return;
    const days = this.data.days;
    if (!days.length) {
      box.innerHTML = `<div class="empty">No finished days yet — the first report is filed after midnight. Today's stats are shown above and update live.</div>`;
      return;
    }
    box.innerHTML = days.map(d => `
      <div class="report-row" data-date="${d.date}">
        <div class="report-when">
          <div class="report-date">${this.fmtDate(d.date, false)}</div>
          <div class="muted" style="font-size:11px">${d.date}</div>
        </div>
        <canvas class="report-spark" data-spark="${d.date}" width="130" height="34"></canvas>
        <div class="report-metrics">
          <span title="Peak players">${App.icon('players', 12)} ${d.peakPlayers}</span>
          <span title="Uptime">${App.icon('schedules', 12)} ${this.fmtUptime(d.uptimeMinutes)}</span>
          <span title="Avg TPS">TPS ${d.avgTps ?? '—'}</span>
          ${d.crashes ? `<span class="report-bad" title="Crashes">${d.crashes} crash${d.crashes > 1 ? 'es' : ''}</span>` : ''}
        </div>
      </div>`).join('');

    box.querySelectorAll('.report-spark').forEach(c => {
      const d = days.find(x => x.date === c.dataset.spark);
      this.drawHourly(c, d, 34, false);
    });
    box.querySelectorAll('.report-row').forEach(row => {
      row.onclick = () => {
        this.selected = row.dataset.date;
        this.renderDetail();
        document.getElementById('hist-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
  },

  // Bar chart of 24 hourly player peaks. detailed=true draws axis labels.
  drawHourly(canvas, r, h, detailed) {
    if (!canvas) return;
    const css = getComputedStyle(document.body);
    const accent = css.getPropertyValue('--accent').trim();
    const border = css.getPropertyValue('--border').trim();
    const muted = css.getPropertyValue('--muted').trim();

    const w = detailed ? (canvas.parentElement.clientWidth - 36) : canvas.width;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const peaks = r.hourlyPlayers || [];
    const online = r.hourlyOnline || [];
    const max = Math.max(1, ...peaks);
    const padB = detailed ? 16 : 2, padT = detailed ? 6 : 2;
    const ch = h - padB - padT;
    const gap = detailed ? 3 : 1.5;
    const bw = (w - gap * 23) / 24;

    if (detailed) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, padT + ch);
      ctx.lineTo(w, padT + ch);
      ctx.stroke();
    }

    for (let i = 0; i < 24; i++) {
      const x = i * (bw + gap);
      const bh = Math.max(peaks[i] > 0 ? 2 : 0, (peaks[i] / max) * ch);
      // faint baseline tick for hours the server was online but empty
      if (bh === 0 && online[i]) {
        ctx.fillStyle = border;
        ctx.fillRect(x, padT + ch - 1.5, bw, 1.5);
      } else {
        ctx.fillStyle = accent;
        ctx.globalAlpha = online[i] ? 1 : 0.5;
        ctx.fillRect(x, padT + ch - bh, bw, bh);
        ctx.globalAlpha = 1;
      }
    }

    if (detailed) {
      ctx.fillStyle = muted;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const hr of [0, 6, 12, 18, 23]) {
        ctx.fillText(`${hr}:00`, hr * (bw + gap) + bw / 2, h - 3);
      }
    }
  },

  onStats() {
    // refresh the live "today" tiles roughly every ~30 stats ticks
    if (this.selected && this.selected !== this.data.today.date) return;
    this._tick = (this._tick || 0) + 1;
    if (this._tick % 15 === 0) this.load();
  }
};
