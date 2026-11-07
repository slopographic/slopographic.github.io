/* The app globe in the homepage hero: every app's own icon (SlopHomeCards.icon, the badge the cards use) on a sphere,
 * drawn with true perspective: the far side smaller, fainter and blurred, the near side crisp with a soft accent glow, over
 * a turning wireframe and a faint halo (home/globe/paint.js). Maths: home/globe/sphere.js. Styles: home/globe/globe.css.
 * Classic script, after shared/apps.js, shared/app-icons.js, home/catalog.js, sphere.js, paint.js; then drag.js and list.js.
 *  - Icons are sized by the registry's weight (shared/apps.js): the apps most people come for are drawn 1.7 times larger
 *    and sit round the equator, so each passes the front on every turn (SlopGlobeMath.weighted keeps them clear).
 *  - It draws into .gx-layer over the hero, sized from the reserved .gx-box, 0.7 s after load when the page is idle (2 s,
 *    or the first tap, on a phone or small device): the headline (the largest paint) never waits for it, nothing moves.
 *  - It turns slowly on a tilted axis (drag.js: drag to spin, with inertia). Pointing at an icon (or focusing it in the
 *    list, list.js) eases the globe round until it faces you and shows its name; the turn resumes after.
 *  - It follows the app finder (home/browse.js sends its result set, 'slop-home-filter'): matches stay bright and grow,
 *    the rest fade and shrink, the globe leans in and turns the matches to the front; one match comes forward with its
 *    name; no match dims it with a short note; clearing the search brings back the turn. Reduced motion: at once.
 *  - It runs only while the hero is on screen and the tab is visible. Reduced motion: a still globe. Phones, touch
 *    screens, Save-Data and small devices: 28 icons at 20 fps, no filters, lines repainted only when they would visibly
 *    lag, and no frames while the page scrolls (SlopGlobeMath.tier). Icons over the copy fade almost out (keepOut).
 *  - It opens on the lead apps (shared/apps.js SLOP_LEAD: the PDF family), side by side, the first square in front.
 *  - The front-most icons carry their names without hovering, and a search names its matches (labels.js, decorative).
 *  window.SlopGlobe: { state(), frames(), startedAt(), tier(), view(), icons(), labels(), focusApp(id), reduce(on), pause(on) }. */
(function () {
  'use strict';
  const G = window.SlopGlobeMath, P = window.SlopGlobePaint, C = window.SlopHomeCards;
  const hero = document.getElementById('hero');
  if (!G || !P || !C || !hero) return;
  const box = hero.querySelector('.gx-box');
  const ICONS = window.SLOP_ICONS || {};
  const APPS = (window.SLOP_APPS || []).filter((a) => a.path && !a.path.startsWith('#') && ICONS[a.id]);
  if (!box || !APPS.length) return;
  const mq = (q) => !!(window.matchMedia && matchMedia(q).matches);
  const name = (a) => (window.slopAppLabel ? window.slopAppLabel(a, !!(window.slopBrandNamesOn && window.slopBrandNamesOn())) : a.name);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    n.append(...kids.filter(Boolean));
    return n;
  };
  const t = (k, en) => (window.SlopI18n && window.SlopI18n.t ? window.SlopI18n.t(k) || en : en);
  // tipped towards you; a turn in 75 s (150 s in a plain-tone build: calmer, shared/theme/theme.js)
  const CALM = !!(window.SlopTheme && window.SlopTheme.tone === 'plain');
  const TILT = 0.3, IDLE = G.TAU / (CALM ? 150000 : 75000), RESUME_MS = 1400, BIG = 1.7;
  const LINES = { full: G.grid(30, 30, 6), lite: G.grid(30, 30, 12) };   // the lite globe draws coarser lines
  const big = (a) => ((a.weight || 1) > 1 ? BIG : 1);
  const LEAD = window.SLOP_LEAD || [], lead = G.leadRank(LEAD);   // the family the globe opens on, the first square in front

  // data-live: a region that changes on its own; page snapshots (Sloppo's Restore checks) leave it out. The globe keeps all
  // of its changing state inside it and never touches the hero's own attributes.
  const layer = el('div', { class: 'gx-layer', 'aria-hidden': 'true', 'data-live': '' });
  const canvas = el('canvas', { class: 'gx-lines' });
  const hit = el('div', { class: 'gx-hit' });
  const hint = el('p', { class: 'gx-hint', 'data-i18n': 'hero.no_match' }, t('hero.no_match', 'No apps match'));
  hint.hidden = true;
  const ctx = canvas.getContext && canvas.getContext('2d');
  layer.append(canvas, hit, hint);
  hero.prepend(layer);
  const tags = window.SlopGlobeLabels ? window.SlopGlobeLabels.pool(layer) : null;

  let tierName = 'full', T = G.TIERS.full, icons = [], s = { yaw: 0.7, pitch: TILT, vel: IDLE };
  let focus = null, target = null, resumeAt = 0, match = null, zoom = 1, zoomT = 1;
  function pickTier() {
    const nv = navigator, c = nv.connection;
    tierName = G.tier({ reduced: mq('(prefers-reduced-motion: reduce)'), cores: nv.hardwareConcurrency, memory: nv.deviceMemory,
      saveData: !!(c && c.saveData), coarse: mq('(pointer: coarse)'), width: hero.clientWidth });
  }
  function setApp(ic, a) {
    ic.app = a; ic.k = big(a);
    const n = ic.el;
    n.href = a.path; n.dataset.id = a.id;
    n.setAttribute('aria-label', name(a));
    n.style.setProperty('--gx-k', String(ic.k));
    n.replaceChildren(C.icon(a, 'gx-svg') || '', el('span', { class: 'gx-name' }, name(a)));
  }
  // a new language (its tables are in): the names again; the labels (labels.js) read them from aria-label
  window.addEventListener('slopi18n', () => { for (const ic of icons) { const s = name(ic.app), x = ic.el.querySelector('.gx-name'); ic.el.setAttribute('aria-label', s); if (x) x.textContent = s; } });
  function build() {
    T = G.TIERS[tierName];
    layer.querySelectorAll('.gx-i').forEach((n) => n.remove());
    focus = null; target = null;
    // the lead apps first (shared/apps.js SLOP_LEAD), then the heaviest, so a lite globe keeps them; the registry order otherwise
    const apps = APPS.map((a, i) => ({ a, i })).sort((x, y) => lead(x.a.id) - lead(y.a.id) || (y.a.weight || 1) - (x.a.weight || 1) || x.i - y.i).slice(0, T.icons).map((x) => x.a);
    const w = apps.map((a) => a.weight || 1), pts = G.gather(G.weighted(w), w, apps.map((a, i) => i).filter((i) => lead(apps[i].id) < LEAD.length));   // side by side
    icons = apps.map((a, i) => {
      const ic = { p: pts[i], el: el('a', { class: 'gx-i', tabindex: '-1', 'aria-hidden': 'true', 'data-gx-icon': '' }), x: 0, y: 0, z: 0, op: 0, blur: -1, em: 1, emT: 1 };
      setApp(ic, a);
      layer.append(ic.el);
      return ic;
    });
    linesDirty = true;
    layer.classList.toggle('gx-lite', tierName === 'lite');
    measure();
    if (match) apply(match.raw); else draw();
  }

  /* ---------- geometry: the globe fills the reserved box; the copy's boxes are kept clear ---------- */
  let W = 0, H = 0, geom = { cx: 0, cy: 0, r: 1, d: 3.4 }, rects = [], size = 56, ink = '#888', accent = '#d4ff3a';
  function rel(n, base) {
    const r = n && n.getBoundingClientRect();
    return r && r.width ? { l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top } : null;
  }
  function measure() {
    const base = hero.getBoundingClientRect(), b = rel(box, base);
    if (!b || !hero.clientWidth) return false;   // the home view is hidden (the Authenticator): keep the last geometry
    W = hero.clientWidth; H = hero.clientHeight;
    const r = (Math.min(b.r - b.l, b.b - b.t) / 2) * 0.82;
    geom = { cx: (b.l + b.r) / 2, cy: (b.t + b.b) / 2, r, d: 3.4 };
    rects = ['.hx-kicker', '.hx-title', '.hx-sub', '.hx-cta', '.hx-meta'].map((q) => rel(hero.querySelector(q), base)).filter(Boolean);
    size = Math.round(G.clamp(r * (tierName === 'lite' ? 0.27 : 0.22), 34, 58));   // a phone's fewer icons are larger
    layer.style.setProperty('--gx-size', size + 'px');
    Object.assign(hit.style, { left: geom.cx - r * 1.05 + 'px', top: geom.cy - r * 1.05 + 'px', width: r * 2.1 + 'px', height: r * 2.1 + 'px' });
    Object.assign(hint.style, { left: geom.cx + 'px', top: geom.cy + 'px' });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(hero);
    ink = cs.getPropertyValue('--bone').trim() || ink;
    accent = cs.getPropertyValue('--slop').trim() || accent;
    linesDirty = true;
    return true;
  }

  /* ---------- one frame ---------- */
  let frames = 0, painted = { yaw: 0, pitch: 0, zoom: 1 }, linesDirty = true;
  const frontScale = () => geom.d / (geom.d - 1);
  function draw() {
    const gz = zoom === 1 ? geom : { ...geom, r: geom.r * zoom };
    for (const ic of icons) {
      const q = G.rotate(ic.p, s.yaw, s.pitch), pr = G.project(q, gz), lk = G.look(q.z);
      let op = lk.alpha * G.keepOut(pr.x, pr.y, rects, size * 0.6 * ic.k) * (0.12 + 0.88 * ic.em);
      if (ic === focus) op = 1;
      ic.x = pr.x; ic.y = pr.y; ic.z = q.z; ic.op = op;
      const half = (size * ic.k) / 2, sc = (pr.scale / frontScale()) * (0.6 + 0.4 * ic.em) * (!match || !match.n ? 1 : match.n === 1 ? 1 + 0.6 * ic.em : 1 + 0.18 * ic.em);   // matches grow; one match most
      const st = ic.el.style;
      ic.half = half * sc;
      st.transform = `translate3d(${(pr.x - half).toFixed(1)}px,${(pr.y - half).toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
      st.opacity = op.toFixed(3);
      st.zIndex = String(Math.round(50 + q.z * 40 + ic.em * 10));
      if (lk.blur !== ic.blur) { ic.blur = lk.blur; ic.el.dataset.depth = lk.blur ? 'far' + lk.blur : lk.front ? 'near' : 'mid'; }
      ic.el.classList.toggle('is-live', op > 0.35 && q.z > -0.1);
    }
    // the lite globe repaints its lines only once they would visibly lag the icons
    if (!T.redraw || linesDirty || Math.abs(s.yaw - painted.yaw) + Math.abs(s.pitch - painted.pitch) + Math.abs(zoom - painted.zoom) > T.redraw) {
      P.paint(ctx, { W, H, geom: gz, yaw: s.yaw, pitch: s.pitch, ink, accent, lines: tierName === 'full' ? LINES.full : LINES.lite });
      painted = { yaw: s.yaw, pitch: s.pitch, zoom }; linesDirty = false;
    }
    if (tags) tags.update(icons, { W, H, rects, geom: gz, match: match && match.n ? match.ids : null, still: tierName === 'static' });
    frames++;
  }

  /* ---------- running: on screen, tab visible, motion allowed, not held ---------- */
  let raf = 0, last = 0, inView = true, held = false, scrollQuiet = 0;
  addEventListener('scroll', () => { scrollQuiet = performance.now() + 200; }, { passive: true });
  const running = () => tierName !== 'static' && inView && !document.hidden && !held;
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
  function tick(now) {
    raf = 0;
    if (!running()) return paint();
    raf = requestAnimationFrame(tick);
    if (last && !G.due(now, last, T.fps)) return;
    if (tierName === 'lite' && now < scrollQuiet) { last = now; return; }   // a phone scrolling: the page first
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    if (api.dragging()) { /* the pointer turns it (drag.js) */ }
    else if (target) s = G.seek(s, target, dt, 420);
    else {
      s = G.spin(s, dt, { idle: now < resumeAt ? 0 : IDLE, tau: 900 });
      s.pitch += (TILT - s.pitch) * ease(dt, 1200);   // back to the resting tilt
    }
    const k = ease(dt, 260);
    for (const ic of icons) ic.em += (ic.emT - ic.em) * k;
    zoom += (zoomT - zoom) * k;
    draw();
  }
  function paint() {
    layer.dataset.globe = tierName === 'static' ? 'static' : running() ? 'running' : 'paused';
    if (running() && !raf) { last = 0; raf = requestAnimationFrame(tick); }
  }
  /** When nothing animates (reduced motion, off screen): the end state at once. */
  function settle() {
    for (const ic of icons) ic.em = ic.emT;
    zoom = zoomT;
    if (target) s = { ...s, yaw: target.yaw, pitch: target.pitch, vel: 0 };
    draw();
  }

  /* ---------- the turn the matches (or a focused icon) want ---------- */
  const turnTo = (p, lean) => { const f = G.frontOf(p, TILT, lean); return { yaw: G.nearAngle(s.yaw, f.yaw), pitch: f.pitch }; };
  function aim() {
    if (focus) { target = turnTo(focus.p); return; }
    const hits = match ? match.order.map((id) => icons.find((ic) => ic.app.id === id)).filter(Boolean) : [];
    if (!hits.length) { target = null; resumeAt = performance.now(); return; }
    // the matches' centre, leaning towards the finder's first match (it counts three times); that match when they spread
    target = hits.length === 1 ? turnTo(hits[0].p, 1) : turnTo(G.centroid(hits.map((h) => h.p), hits.map((h, i) => (i ? 1 : 3))) || hits[0].p);   // one match: square in front
  }
  /** The finder's result: { ids (in the finder's order), filtered }. Not filtered: every icon as usual. */
  function apply(r) {
    match = r && r.filtered ? { ids: new Set(r.ids), order: r.ids, raw: r } : null;
    if (match) {   // fewer icons than apps (lite): matches missing from the globe take the places of near non-matches
      const free = icons.filter((ic) => !match.ids.has(ic.app.id)).sort((a, b) => b.z - a.z);
      for (const id of match.order) if (!icons.some((ic) => ic.app.id === id) && free.length) setApp(free.shift(), APPS.find((a) => a.id === id));
    }
    const n = match ? icons.filter((ic) => match.ids.has(ic.app.id)).length : 0;
    if (match) match.n = n;
    for (const ic of icons) {
      ic.emT = !match ? 1 : match.ids.has(ic.app.id) ? 1 : n ? 0 : 0.45;
      ic.el.classList.toggle('is-pick', n === 1 && match.ids.has(ic.app.id));
      ic.el.classList.toggle('is-match', n > 1 && match.ids.has(ic.app.id));
    }
    zoomT = match ? G.zoomFor(n) : 1;
    hint.hidden = !(match && !n);
    layer.classList.toggle('is-searching', !!match);
    aim();
    if (!running()) settle();
  }
  addEventListener('slop-home-filter', (e) => { if (icons.length) apply(e.detail); else match = { raw: e.detail }; });

  /* ---------- focus: point at an icon (or focus it in the list) and it comes round to the front ---------- */
  function focusOn(ic) {
    if (focus === ic) return;
    if (focus) focus.el.classList.remove('is-hot');
    focus = ic || null;
    if (focus) focus.el.classList.add('is-hot');
    if (tierName === 'static') target = null; else aim();
    if (!focus && !target) resumeAt = performance.now() + RESUME_MS;   // a short pause before the idle turn comes back
    draw();
  }
  const iconOf = (n) => { const a = n && n.closest && n.closest('.gx-i'); return a ? icons.find((i) => i.el === a) : null; };
  // While the pointed icon turns away from under the pointer, other icons pass beneath it: they take over only once the
  // pointer itself has moved on (no chase).
  let at = null;
  layer.addEventListener('pointerover', (e) => {
    const ic = iconOf(e.target);
    if (!ic || api.dragging() || ic === focus) return;
    if (focus && at && Math.hypot(e.clientX - at.x, e.clientY - at.y) < 24) return;
    at = { x: e.clientX, y: e.clientY };
    focusOn(ic);
  });
  layer.addEventListener('pointerout', (e) => { if (!api.dragging() && !layer.contains(e.relatedTarget)) focusOn(null); });

  /* ---------- start, and what stops it ---------- */
  let startedAt = 0;
  function start() {
    startedAt = performance.now();
    pickTier();
    const early = match && match.raw;
    match = null;
    build();
    if (icons.length && lead(icons[0].app.id) === 0) { const f = G.frontOf(icons[0].p, TILT, 1); s = { ...s, yaw: f.yaw, pitch: f.pitch }; }   // facing the viewer
    const r = early || (window.SlopHomeBrowse && window.SlopHomeBrowse.result && window.SlopHomeBrowse.result());
    if (r) apply(r);
    paint();
    hero.dispatchEvent(new CustomEvent('gx-start'));   // list.js fills the keyboard list in a task of its own
    if ('IntersectionObserver' in window) new IntersectionObserver((en) => { inView = en[en.length - 1].isIntersecting; paint(); }).observe(hero);
    document.addEventListener('visibilitychange', paint);
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (measure()) draw(); }).observe(hero);
    const rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
    if (rm && rm.addEventListener) rm.addEventListener('change', () => { pickTier(); build(); paint(); });
    new MutationObserver(() => { if (measure()) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-slop-theme'] });
  }
  const api = window.SlopGlobe = {
    state: () => layer.dataset.globe || 'idle',
    frames: () => frames,
    startedAt: () => startedAt,
    tier: () => tierName,
    view: () => ({ ...s, zoom, geom: { ...geom }, focus: focus ? focus.app.id : null, match: match && match.ids ? [...match.ids] : null }),
    labels: () => (tags ? tags.shown() : []),
    icons: () => icons.map((i) => ({ id: i.app.id, x: i.x, y: i.y, z: i.z, opacity: i.op, k: i.k, em: i.em, emT: i.emT, el: i.el })),
    /** Brings an app's icon to the front (the keyboard list); null lets go. In lite, the farthest icon takes the app. */
    focusApp(id) {
      if (id == null) return focusOn(null);
      let ic = icons.find((x) => x.app.id === id);
      if (!ic && icons.length) { ic = icons.reduce((m, x) => (x.z < m.z ? x : m)); setApp(ic, APPS.find((a) => a.id === id)); }
      focusOn(ic);
    },
    /** For drag.js: the layer, the geometry, the turn, and how to redraw. */
    _drag: { layer, hit, still: () => tierName === 'static', radius: () => geom.r, turn: (dy, dx) => { focusOn(null); target = null; s.yaw += dx; s.pitch = G.clamp(s.pitch + dy, -0.6, 0.6); if (!running()) draw(); }, fling: (v) => { s.vel = G.clamp(v, -0.006, 0.006); resumeAt = 0; }, focusAt: (n) => focusOn(iconOf(n)) },
    dragging: () => false,
    /** Reduced motion on or off (what the media query's change does), for the tests. */
    reduce(on) { tierName = on ? 'static' : 'full'; build(); paint(); },
    /** Holds the globe still (the layout tests measure a still page). */
    pause(on) { held = !!on; paint(); },
  };
  // Well after the first paints: a moment past load (2 s on a phone or a small device, or its first tap or key, if sooner),
  // then the next idle time.
  let begun = false;
  const go = () => { if (!begun) { begun = true; start(); } };
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 1500 }) : go());
  const later = () => {
    pickTier();
    setTimeout(idle, G.TIERS[tierName].delay);
    if (tierName === 'lite') for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, idle, { once: true, passive: true });
  };
  if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
})();
