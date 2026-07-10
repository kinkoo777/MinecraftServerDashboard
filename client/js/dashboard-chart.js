/* Canvas activity chart for the Dashboard page. Extracted from dashboard.js to keep
   that file focused and under the project's file-size limit. Attaches renderChart onto
   the already-defined dashboard page object; called as this.renderChart() from there. */
App.pages.dashboard.renderChart = function () {
  const canvas = document.getElementById('db-chart');
  if (!canvas) return;
  document.querySelectorAll('#db-chart-tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.ct === this.chartTab));

  const caps = {
    players: 'Number of players connected over time.',
    cpu: 'CPU used by the server process. Brief spikes during world generation or chunk loading are normal.',
    mem: 'RAM used by the server process. It usually climbs then plateaus near your Max RAM setting.',
    tps: 'TPS = ticks per second, the server’s heartbeat (20 ticks = 1 second of game time). 20 is perfect; a flat line at 20 means no lag. If it drops below ~18 and stays there, the server is struggling to keep up — that’s lag. Needs a server that answers /tick query (MC 1.20.3+).'
  };
  const cap = document.getElementById('db-chart-cap');
  if (cap) cap.textContent = caps[this.chartTab] || '';

  const css = getComputedStyle(document.body);
  const accent = css.getPropertyValue('--accent').trim();
  const border = css.getPropertyValue('--border').trim();
  const muted = css.getPropertyValue('--muted').trim();

  const w = canvas.parentElement.clientWidth - 36;
  const h = 160;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';

  let pts = this.overview.history;
  if (this.chartTab === 'tps') pts = pts.filter(p => p.tps != null);
  if (pts.length < 2) {
    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    ctx.fillText(this.chartTab === 'tps'
      ? 'No TPS data yet — appears about a minute after the server is online.'
      : 'Collecting data — the chart fills in as the dashboard runs…', w / 2, h / 2);
    return;
  }

  const val = { players: p => p.players, cpu: p => p.cpu, mem: p => p.mem / 1048576, tps: p => p.tps }[this.chartTab];
  const fmt = {
    players: v => String(Math.round(v)),
    cpu: v => Math.round(v) + '%',
    mem: v => v >= 1024 ? (v / 1024).toFixed(1) + ' GB' : Math.round(v) + ' MB',
    tps: v => v.toFixed(0)
  }[this.chartTab];

  const padL = 8, padR = 44, padT = 10, padB = 18;
  const cw = w - padL - padR, ch = h - padT - padB;
  const rawMax = Math.max(...pts.map(val));
  const max = { players: Math.max(4, Math.ceil(rawMax)), cpu: Math.max(25, Math.ceil(rawMax / 25) * 25), mem: Math.max(256, Math.ceil(rawMax / 256) * 256), tps: 20 }[this.chartTab];
  const x = i => padL + (i / (pts.length - 1)) * cw;
  const y = v => padT + ch - (v / max) * ch;

  // horizontal grid lines + right-side labels
  ctx.textAlign = 'left';
  for (let g = 0; g <= 3; g++) {
    const gy = padT + (g / 3) * ch;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(padL + cw, gy);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(fmt(max * (1 - g / 3)), padL + cw + 6, gy + 3);
  }

  // time labels
  ctx.fillStyle = muted;
  const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  ctx.textAlign = 'left';
  ctx.fillText(t(pts[0].t), padL, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(t(pts[pts.length - 1].t), padL + cw, h - 4);

  // area fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
  grad.addColorStop(0, accent + '4d');
  grad.addColorStop(1, accent + '00');
  ctx.beginPath();
  ctx.moveTo(x(0), y(val(pts[0])));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(x(i), y(val(pts[i])));
  ctx.lineTo(x(pts.length - 1), padT + ch);
  ctx.lineTo(x(0), padT + ch);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  ctx.moveTo(x(0), y(val(pts[0])));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(x(i), y(val(pts[i])));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // last-value dot
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(x(pts.length - 1), y(val(last)), 3, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
};
