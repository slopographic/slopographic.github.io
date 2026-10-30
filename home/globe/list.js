/* The app globe's keyboard and screen-reader way in (home/globe/globe.js): every app in .gx-nav as one tab stop; the arrow
 * keys, Home and End move along it (the lead apps first, then the registry order); the focused app shows as a chip and its icon comes round to the front
 * (SlopGlobe.focusApp). Built once the globe starts, in an idle task of its own, so neither task is long on a phone.
 * Its nav is data-live (index.html): it is filled late, so page snapshots leave it out. Classic script, after globe.js. */
(function () {
  'use strict';
  const hero = document.getElementById('hero'), nav = hero && hero.querySelector('.gx-nav'), C = window.SlopHomeCards;
  const ICONS = window.SLOP_ICONS || {};
  if (!nav || !C || !window.SlopGlobe) return;
  const M = window.SlopGlobeMath, all = (window.SLOP_APPS || []).filter((a) => a.path && !a.path.startsWith('#') && ICONS[a.id]);
  const APPS = M ? M.leadFirst(all, window.SLOP_LEAD) : all;   // the lead apps first (shared/apps.js SLOP_LEAD), as the globe opens on them
  const name = (a) => (window.slopAppLabel ? window.slopAppLabel(a, !!(window.slopBrandNamesOn && window.slopBrandNamesOn())) : a.name);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    n.append(...kids.filter(Boolean));
    return n;
  };
  const list = el('ul', { class: 'gx-list' });
  function fill() {
    nav.append(list);
    APPS.forEach((a, i) => list.append(el('li', null, el('a', { href: a.path, tabindex: i ? '-1' : '0', 'data-id': a.id }, C.icon(a, 'gx-svg') || '', el('span', null, name(a))))));
  }
  window.addEventListener('slopi18n', () => { for (const a of list.querySelectorAll('a[data-id]')) { const s = name(APPS.find((x) => x.id === a.dataset.id)); a.lastChild.textContent = s; } });   // a new language
  list.addEventListener('keydown', (e) => {
    const all = [...list.querySelectorAll('a')], i = all.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const j = step ? (i + step + all.length) % all.length : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    all[i].tabIndex = -1; all[j].tabIndex = 0; all[j].focus();
  });
  list.addEventListener('focusin', (e) => window.SlopGlobe.focusApp(e.target.closest('a').dataset.id));
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) window.SlopGlobe.focusApp(null); });
  hero.addEventListener('gx-start', () => {
    if (window.requestIdleCallback) window.requestIdleCallback(fill, { timeout: 1000 }); else setTimeout(fill, 50);   // compat-ok: feature-detected
  }, { once: true });
})();
