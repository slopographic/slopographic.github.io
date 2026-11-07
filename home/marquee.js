/* The capability strip under the hero (written into index.html by tools/seo/marquee.mjs): each label links to its app.
 *  - Pointing at a label, or focusing it, turns the app globe to that app, highlights it and shows its name
 *    (SlopGlobe.focusApp, the way the globe's own keyboard list does); leaving lets it go. The strip pauses meanwhile
 *    (home/hero.css, :hover and :focus-within) and stands still under reduced motion.
 *  - One tab stop: the arrow keys, Home and End move along the first list (the aria-hidden copy is never focusable).
 *  - A profile with plain names shows each app's name from the registry (slopAppName, in the chosen language).
 * Classic script, after shared/apps.js and home/globe/globe.js. */
(function () {
  'use strict';
  const strip = document.querySelector('.hx-marquee');
  if (!strip) return;
  const lists = strip.querySelectorAll('.mq-list'), main = lists[0];
  if (!main) return;
  const globe = (id) => { if (window.SlopGlobe) window.SlopGlobe.focusApp(id); };
  const linkOf = (n) => n && n.closest && n.closest('a[data-id]');

  function names() {
    if (window.SLOP_NAMING !== 'plain' || !window.slopAppName) return;
    for (const a of strip.querySelectorAll('a[data-id]')) { const s = window.slopAppName(a.dataset.id); if (s && a.textContent !== s) a.textContent = s; }
  }
  names();
  addEventListener('slop-lang', names);
  addEventListener('slopi18n', names);   // the language's tables are in (they load lazily)

  let on = null;
  const point = (a) => { const id = a ? a.dataset.id : null; if (id === on) return; on = id; globe(id); };
  strip.addEventListener('pointerover', (e) => point(linkOf(e.target)));
  strip.addEventListener('pointerout', (e) => {
    if (strip.contains(e.relatedTarget) && linkOf(e.relatedTarget)) return;   // onto the next label: its pointerover takes it
    point(strip.contains(document.activeElement) ? linkOf(document.activeElement) : null);
  });
  strip.addEventListener('focusin', (e) => point(linkOf(e.target)));
  strip.addEventListener('focusout', (e) => {
    if (strip.contains(e.relatedTarget)) return;
    point(null);
    strip.scrollLeft = 0;   // focus may have scrolled the clipped strip to a label; the loop starts from the edge again
  });

  main.addEventListener('keydown', (e) => {
    const all = [...main.querySelectorAll('a')], i = all.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const j = step ? (i + step + all.length) % all.length : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    all[i].tabIndex = -1; all[j].tabIndex = 0; all[j].focus();
  });
})();
