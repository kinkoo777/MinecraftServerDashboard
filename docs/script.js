// Scroll-reveal: fade sections in as they enter the viewport
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach((el, i) => {
  // small stagger for grids
  el.style.transitionDelay = `${Math.min(i % 6, 5) * 50}ms`;
  io.observe(el);
});

// Copy-to-clipboard on code blocks
document.querySelectorAll('.copy').forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      const old = btn.textContent;
      btn.textContent = 'Copied \u2713';
      setTimeout(() => { btn.textContent = old; }, 1500);
    } catch (e) {
      btn.textContent = 'Copy failed';
    }
  });
});

// Header shadow on scroll
const header = document.querySelector('header');
addEventListener('scroll', () => {
  header.style.boxShadow = window.scrollY > 10 ? '0 6px 24px rgba(0,0,0,0.3)' : 'none';
}, { passive: true });

// ---------- Download counter (counts Download-button clicks) ----------
// Uses the free Abacus hit-counter (no signup, CORS-enabled): /get reads the
// running total without incrementing; /hit adds one when a Download button is
// clicked. The ZIP download keeps the page open, so the increment completes.
(function () {
  const API = 'https://abacus.jasoncameron.dev';
  const NS = 'chunkdeck-dev-dl', KEY = 'total';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => n.toLocaleString('en-US');
  let current = 0, shown = false;

  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  function reveal() {
    if (shown) return; shown = true;
    ['dl-strip', 'dl-note'].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = false; });
  }

  function countUp(id, to, from) {
    const el = document.getElementById(id);
    if (!el) return;
    if (reduceMotion || to - from < 2) { el.textContent = fmt(to); return; }
    const dur = 800, start = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  function paint(value) {
    const from = current; current = value;
    reveal();
    countUp('dl-count', value, from);
    setText('dl-note-num', fmt(value));
  }

  // show the running total on load (404 = counter not created yet = 0)
  fetch(`${API}/get/${NS}/${KEY}`)
    .then((r) => (r.ok ? r.json() : { value: 0 }))
    .then((d) => paint(d.value || 0))
    .catch(() => { /* counter service unreachable — leave the tracker hidden */ });

  // count a download when a Download button is clicked
  document.querySelectorAll('[data-dl-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fetch(`${API}/hit/${NS}/${KEY}`, { keepalive: true })
        .then((r) => r.json())
        .then((d) => { if (typeof d.value === 'number') paint(d.value); })
        .catch(() => {});
    });
  });
})();

// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open);
  });
  // Close nav when a link is clicked
  navLinks.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}
