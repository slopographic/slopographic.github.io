/* Slopographic homepage: renders Apps and the Status board from
 * shared/apps.js (the single source of truth), and smooth-scrolls the section links. */
(() => {
  'use strict';
  const APPS = window.SLOP_APPS || [];
  // Status words, links and the tone's choices: home/sections.js (loaded first), so cards, list and table say the same.
  const H = window.SlopHomeSections || {};
  const tr = H.tr || ((k, en) => en);
  const STATUS = { live: tr('status.live', 'Live'), beta: tr('status.beta', 'Beta'), building: tr('status.building', 'In development') };
  const ICONS = {
    page: '<path d="M12 6h17l9 9v27H12z"/><path d="M29 6v9h9M17 22h14M17 27h14M17 32h10"/>',
    grid: '<rect x="6" y="8" width="36" height="32" rx="2"/><path d="M6 17h36M6 26h36M6 33h36M17 8v32M29 8v32"/>',
    slides: '<rect x="6" y="8" width="36" height="24" rx="2"/><path d="M24 32v8M16 42h16M13 16h14M13 22h20"/>',
    folder: '<path d="M6 12h13l4 5h19v21H6z"/><path d="M6 20h36"/>',
    spark: '<path d="M24 6l4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/><path d="M38 6v6M35 9h6"/>',
    film: '<rect x="6" y="10" width="36" height="28" rx="3"/><path d="M6 17h36M6 31h36M13 10v7M21 10v7M29 10v7M37 10v7M13 31v7M21 31v7M29 31v7M37 31v7"/><path d="m21 21 7 3-7 3z"/>',
    layout: '<rect x="8" y="6" width="32" height="36" rx="2"/><path d="M13 12h22M13 18h10v12H13zM27 18h8M27 23h8M27 28h8M13 35h22"/>',
    brush: '<path d="M14 34c4 0 7-3 7-7l-4-4c-4 0-7 3-7 7 0 2-1 3-3 4 2 0 5 0 7 0z"/><path d="M19 25 36 8l4 4-17 17"/>',
    pen: '<path d="M24 6 10 20l4 18 10 4 10-4 4-18z"/><circle cx="24" cy="24" r="3"/><path d="M24 6v15"/>',
    doc: '<path d="M12 6h17l9 9v27H12z"/><path d="M29 6v9h9M17 24h14M17 30h14M17 36h9"/>',
    tag: '<path d="M6 8h18l18 18-16 16L8 24z"/><circle cx="15" cy="16" r="3"/><path d="M20 32l10-10"/>',
  };
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    for (const c of kids) if (c != null) n.append(c);
    return n;
  };
  /* The name shown for an app (see shared/apps.js). The switch relabels the names already on the page. */
  const label = (a) => window.slopAppLabel(a, window.slopBrandNamesOn());
  const tag = (a) => (window.slopAppTagline ? window.slopAppTagline(a) : a.tagline);   // in the chosen language (plain names)
  /** The names and one-liners already on the page, again: after the switch, and in a new language (its tables are in). */
  function relabel() {
    const withSlop = window.slopBrandNamesOn(), set = (n, s) => { if (n.textContent !== s) n.textContent = s; };
    document.querySelectorAll('.app-title[data-id], .shot-ph b[data-id]').forEach((n) => {
      const a = APPS.find((x) => x.id === n.dataset.id);
      if (a) set(n, window.slopAppLabel(a, withSlop));
    });
    document.querySelectorAll('[data-tag]').forEach((n) => { const a = APPS.find((x) => x.id === n.dataset.tag); if (a) set(n, tag(a)); });
  }
  window.addEventListener('slopi18n', relabel);
  /** An SVG-namespace <svg> holding the badge. Created with createElementNS so the markup parses as SVG (not HTML). */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (inner, cls, attrs) => {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 48 48');
    s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    for (const k in attrs || {}) s.setAttribute(k, attrs[k]);
    s.innerHTML = inner; // innerHTML on an SVG element parses in SVG context
    return s;
  };
  /** The status badge. Live tiles stay unbadged; app cards always show their status. */
  const badge = (a, always) => { const t = H.badgeLabel ? H.badgeLabel(a.status, always) : (a.status === 'live' && !always ? '' : STATUS[a.status]); return t ? el('span', { class: 'badge ' + a.status, 'data-stage': a.status }, t) : null; };

  /** A screenshot, or (until one exists) a generated tile in the app's colours. */
  function shot(a) {
    const box = el('div', { class: 'shot', 'data-id': a.id, 'aria-hidden': 'true' });
    const ph = el('div', { class: 'shot-ph' }, el('b', { 'data-id': a.id }, label(a)));
    const glyph = (window.SLOP_ICONS && window.SLOP_ICONS[a.id]) || ICONS[a.icon];
    if (glyph) ph.prepend(svgEl(window.SLOP_ICON_BADGE ? window.SLOP_ICON_BADGE(glyph) : glyph, 'shot-icon', { 'data-icon': a.id }));
    box.append(ph);
    if (a.shot) {
      const img = el('img', { alt: '', loading: 'lazy', decoding: 'async', src: a.shot });
      img.addEventListener('load', () => { box.classList.add('has-img'); if (!stillOnly()) { box.dataset.clip = a.shot.replace('/shots/', '/clips/').replace(/\.jpe?g$/, ''); pickCentre(); } });
      img.addEventListener('error', () => img.remove());
      box.append(img);
    }
    return box;
  }

  /* ---------- clips: a muted loop on hover/focus (desktop) or for the one card in view (touch) ---------- */
  const mq = (q) => window.matchMedia && matchMedia(q).matches;
  function stillOnly() {
    const c = navigator.connection;
    return mq('(prefers-reduced-motion: reduce)') || !!(c && c.saveData);
  }
  /** The card's <video>, made on first use (preload none, poster = the shot). Null if the clip is missing. */
  function clipOf(box) {
    if (!box || !box.dataset.clip || box.dataset.noclip) return null;
    let v = box.querySelector('video');
    if (v) return v;
    const src = box.dataset.clip;
    v = el('video', { muted: '', loop: '', playsinline: '', preload: 'none', poster: src.replace('/clips/', '/shots/') + '.jpg', 'aria-hidden': 'true', tabindex: '-1' },
      el('source', { src: src + '.webm', type: 'video/webm' }), el('source', { src: src + '.mp4', type: 'video/mp4' }));
    v.muted = true;
    v.addEventListener('playing', () => box.classList.add('playing'));
    v.lastElementChild.addEventListener('error', () => { box.dataset.noclip = '1'; box.classList.remove('playing'); v.remove(); });
    box.append(v);
    return v;
  }
  function play(box) {
    if (stillOnly()) return;
    const v = clipOf(box);
    if (v) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  }
  function stop(box) {
    const v = box && box.querySelector('video');
    box && box.classList.remove('playing');
    if (v) v.pause();
  }
  const cardShot = (t) => { const c = t && t.closest && t.closest('.app-card, .tile'); return c && c.querySelector('.shot[data-clip]'); };
  const hoverable = () => mq('(hover: hover) and (pointer: fine)');
  document.addEventListener('pointerover', (e) => { if (hoverable() && e.pointerType !== 'touch') { const s = cardShot(e.target); if (s) play(s); } });
  document.addEventListener('pointerout', (e) => { const s = cardShot(e.target); if (s && !s.closest('.app-card, .tile').contains(e.relatedTarget)) stop(s); });
  document.addEventListener('focusin', (e) => { const s = cardShot(e.target); if (s) play(s); });
  document.addEventListener('focusout', (e) => { const s = cardShot(e.target); if (s) stop(s); });
  /* Touch screens: play the single card nearest the middle of the viewport. */
  let current = null;
  const seen = new Set();
  function pickCentre() {
    if (hoverable()) return;
    let best = null, bd = Infinity;
    const mid = innerHeight / 2;
    for (const s of seen) {
      if (!s.isConnected) { seen.delete(s); continue; }
      if (!s.dataset.clip) continue;
      const r = s.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - mid);
      if (r.top >= -r.height * 0.2 && r.bottom <= innerHeight + r.height * 0.2 && d < bd) { bd = d; best = s; }
    }
    if (best === current) return;
    if (current) stop(current);
    current = best;
    if (best) play(best);
  }
  let io = null;
  const watchShots = () => { if (io) document.querySelectorAll('.shot').forEach((s) => io.observe(s)); };
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => {
      for (const en of entries) { if (en.intersectionRatio >= 0.6) seen.add(en.target); else { seen.delete(en.target); if (en.target === current) { stop(current); current = null; } } }
      pickCentre();
    }, { threshold: [0, 0.6, 1] });
    queueMicrotask(watchShots);
    let raf = 0;
    addEventListener('scroll', () => { if (!raf && seen.size) raf = requestAnimationFrame(() => { raf = 0; pickCentre(); }); }, { passive: true });
  }
  /** The app's icon as a small badge (for the finder's list rows), in the same style as the cards. */
  function appIcon(a, cls) {
    const glyph = (window.SLOP_ICONS && window.SLOP_ICONS[a.id]) || ICONS[a.icon];
    return glyph ? svgEl(window.SLOP_ICON_BADGE ? window.SLOP_ICON_BADGE(glyph) : glyph, cls, { 'data-icon': a.id }) : null;
  }
  window.SlopHomeCards = { appCard, tile, watch: watchShots, icon: appIcon };
  /* A compact card: thumbnail, name, status badge, one line of what it does, and the link. */
  function appCard(a, line) {
    return el('a', { class: 'app-card', href: a.path, 'data-perch': 'card', 'data-id': a.id },
      shot(a),
      el('div', { class: 'app-body' },
        el('div', { class: 'app-name' }, el('h3', { class: 'app-title', 'data-id': a.id }, label(a)), badge(a, true)),
        el('p', { class: 'app-tag', 'data-tag': line ? null : a.id }, line || tag(a)),
        el('span', { class: 'go' }, (a.status === 'building' && !H.PLAIN && !H.STORE ? tr('home.preview', 'Preview') : tr('home.open', 'Open')) + ' →')));
  }
  function tile(a) {
    return el('a', { class: 'tile', href: a.path, 'data-perch': 'card', 'data-id': a.id, ...(a.path.startsWith('#') ? { 'data-view': a.path.slice(1) } : {}) },
      shot(a),
      el('div', { class: 'tile-body' }, el('div', { class: 'app-name' }, el('h3', { class: 'app-title', 'data-id': a.id }, label(a)), badge(a)), el('p', { 'data-tag': a.id }, tag(a))));
  }
  /* ---------- status board ---------- */
  const board = document.getElementById('status-board');
  if (board && !H.STORE) {   // the iPhone/iPad app has no Status board (home/sections.js STORE)
    const counts = { live: 0, beta: 0, building: 0 };
    APPS.forEach((a) => counts[a.status]++);
    document.getElementById('status-sum').textContent = tr('home.status_sum', '{n} projects: {live} live, {beta} in beta, {building} in development. Statuses come straight from the app registry, so this board is always current.',
      { n: APPS.length, live: counts.live, beta: counts.beta, building: counts.building });
    const kinds = { app: tr('home.kind_app', 'App'), game: tr('home.kind_game', 'Game'), experiment: H.PLAIN ? tr('home.kind_app', 'App') : tr('home.kind_experiment', 'Experiment') };
    const order = { building: 0, beta: 1, live: 2 };
    [...APPS].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name)).forEach((a) => {
      board.append(el('a', { class: 'status-row', href: a.path, role: 'row', ...(a.path.startsWith('#') ? { 'data-view': a.path.slice(1) } : {}) },
        el('span', { class: 'dot ' + a.status, role: 'cell', 'aria-label': STATUS[a.status] }),
        el('b', { role: 'cell', class: 'app-title', 'data-id': a.id }, label(a)),
        el('span', { class: 'kind', role: 'cell' }, kinds[a.kind]),
        el('span', { class: 'state', role: 'cell' }, STATUS[a.status]),
        el('span', { class: 'tagline', role: 'cell', 'data-tag': a.id }, tag(a))));
    });
  }

  /* ---------- the Slop-in-names switch ---------- */
  const names = document.getElementById('slop-names');
  if (names) {
    names.checked = window.slopBrandNamesOn();
    names.addEventListener('change', () => { window.slopSetBrandNames(names.checked); relabel(); });
  }

  /* ---------- section links: work from either view, and scroll smoothly ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-jump]');
    if (!a) return;
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (window.slopShowView) window.slopShowView('home');
    history.replaceState(null, '', location.pathname + location.search);
    requestAnimationFrame(() => target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  });
  if (window.SlopHub) window.SlopHub.register('home');
})();
