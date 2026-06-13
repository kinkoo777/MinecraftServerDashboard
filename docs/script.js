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
      btn.textContent = 'Copied ✓';
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
