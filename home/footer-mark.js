/* The footer wordmark (.footer-mark, style/footer.css): scaled so the name exactly fills its row, and filled with the
 * accent when it scrolls into view (not under reduced motion). Used by the homepage.
 * It waits for the faces the page draws with (the font tokens of style/base.css, first family of each) before measuring,
 * which also starts those downloads early. */
(function () {
  'use strict';
  const marks = () => document.querySelectorAll('.footer-mark');

  function fit() {
    marks().forEach((w) => {
      if (!w.offsetParent) return;
      w.style.fontSize = '100px';
      const range = document.createRange();
      range.selectNodeContents(w);
      const textW = range.getBoundingClientRect().width;
      const cs = getComputedStyle(w);
      const avail = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (textW) w.style.fontSize = Math.min(320, (100 * avail) / textW) * 0.99 + 'px';
    });
  }

  const fam = (t) => getComputedStyle(document.documentElement).getPropertyValue(t).split(',')[0].trim() || 'serif';
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.race([
        Promise.all([
          document.fonts.load(`900 40px ${fam('--cond')}`),
          document.fonts.load(`italic 400 40px ${fam('--serif')}`),
          document.fonts.load(`400 40px ${fam('--serif')}`),
          document.fonts.load(`400 16px ${fam('--sans')}`),
          document.fonts.load(`600 12px ${fam('--mono')}`),
        ]),
        new Promise((r) => setTimeout(r, 1500)),
      ]).catch(() => {})
    : Promise.resolve();

  fit();
  fontsReady.then(fit);
  window.addEventListener('resize', fit);

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.target.classList.toggle('filled', e.isIntersecting));
    }, { threshold: 0.6 });
    marks().forEach((m) => io.observe(m));
  }
  window.SlopFooterMark = { fit, fontsReady };
})();
