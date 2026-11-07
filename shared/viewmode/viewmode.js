/* SlopViewMode: one set of view modes for every app. Classic script; needs grid.js first. Sets window.SlopViewMode.
 * Modes: full, focus (toolbars and sidebars hidden), content (every region hidden). Ctrl+Shift+F cycles, Ctrl+Shift+L
 * shows every hidden region, Escape returns to Full. The controls sit in the app's toolbar (the mount element): the View
 * button (a menu of the modes) and "Show panels". Hidden tracks of the app's grid are given back, so the workspace grows. HANDOFF.md has the API.
 * Saved in localStorage through try/catch: 'slop.viewmode' and 'slop.viewmode.layout.<app>'. */
(function (win) {
  'use strict';
  if (win.SlopViewMode) return;
  const doc = win.document;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  const MODES = ['full', 'focus', 'content'];
  const LABEL = { full: () => tr('ui.viewmode.full', 'Full'), focus: () => tr('ui.viewmode.focus', 'Focus'), content: () => tr('ui.viewmode.content', 'Content') };
  const KEY = 'slop.viewmode', LAYOUT = 'slop.viewmode.layout.';
  const EDGE_PX = 6, LEAVE_MS = 700;
  const DEFAULT_EDGE = { toolbar: 'top', sidebar: 'left', panels: 'right' };
  const DEFAULT_HIDES = { focus: ['toolbar', 'sidebar'], content: ['toolbar', 'sidebar', 'panels'] };
  const SELF = doc.currentScript && doc.currentScript.src;
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  const store = {
    get(k) { return safe(() => win.localStorage.getItem(k), null); },
    set(k, v) { safe(() => win.localStorage.setItem(k, v)); },
  };

  let mode = MODES.includes(store.get(KEY)) ? store.get(KEY) : 'full';
  let peekAll = false, sweep = null, painting = false, wired = false;
  const apps = new Map();   // app -> { app, spec, regions: [], hides, buttons: [] }
  const shells = new Set(); // grid containers whose template paint() changed
  const regions = () => [...apps.values()].flatMap((e) => e.regions);
  const el = (sel) => (typeof sel === 'string' ? safe(() => doc.querySelector(sel), null) : sel || null);
  const wantHidden = (r) => (apps.get(r.app).hides[mode] || []).includes(r.name);
  /** A toolbar that holds the mode controls stays on screen as a strip (only the controls show in it). */
  const isStrip = (r) => { const m = el(apps.get(r.app).spec.mount); return !!m && r.el.contains(m); };
  // The grid measuring (shared/viewmode/grid.js, loaded just before this file).
  const { shown, isGrid, tracks, giveBack, flowGrid, fillTrack } = win.SlopViewModeGrid;

  /** Put the classes on every region for the current mode, give hidden tracks back to the grid, and label the buttons.
   *  Measure first, on the page as it is with nothing hidden; then apply. notify: a mode change tells the app to re-measure. */
  function paint(notify) {
    painting = true;
    for (const s of shells) { s.style.gridTemplateColumns = ''; s.style.gridTemplateRows = ''; }
    shells.clear();
    const all = regions();
    for (const r of all) { r.el.classList.remove('slopvm-off', 'slopvm-strip', 'slopvm-peek'); }
    for (const r of all) { r.off = wantHidden(r) && !(r.peek || peekAll); r.strip = r.off && isStrip(r); }
    const hiddenEls = all.filter((r) => r.off && !r.strip).map((r) => r.el);
    const gone = (n) => hiddenEls.some((h) => h === n || h.contains(n));
    const plan = new Map();   // grid -> { cols, rows, colSizes, rowSizes }
    for (const r of all) {
      const P = r.el.parentElement;
      if (!r.off || r.strip || !P || !isGrid(P)) continue;
      const rr = r.el.getBoundingClientRect();
      const others = [...P.children].filter((c) => c !== r.el && !gone(c) && shown(c)).map((c) => c.getBoundingClientRect());
      const cols = tracks(P, 'col'), rows = tracks(P, 'row');
      const p = plan.get(P) || { cols: new Set(), rows: new Set(), colSizes: cols, rowSizes: rows, kids: [], flowX: flowGrid(P, cols.length), flowY: flowGrid(P, rows.length) };
      giveBack(cols, rr.left, rr.right, others, 'x').forEach((i) => p.cols.add(i));
      giveBack(rows, rr.top, rr.bottom, others, 'y').forEach((i) => p.rows.add(i));
      p.kids = [...P.children].filter((c) => !gone(c) && shown(c)).map((c) => c.getBoundingClientRect());
      plan.set(P, p);
    }
    // A grid whose item shrinks (a planned grid inside it) must give that item's row the freed height: the item was sized
    // by its content, and now its content is smaller. The outer grid's row for it becomes the fill row.
    for (const P of [...plan.keys()]) {
      const Q = P.parentElement;
      if (!Q || plan.has(Q) || !isGrid(Q) || !shown(P)) continue;
      const cols = tracks(Q, 'col'), rows = tracks(Q, 'row');
      plan.set(Q, { cols: new Set(), rows: new Set(), colSizes: cols, rowSizes: rows, kids: [...Q.children].filter(shown).map((c) => c.getBoundingClientRect()),
        flowX: flowGrid(Q, cols.length), flowY: flowGrid(Q, rows.length), fillEl: P.getBoundingClientRect() });
    }
    for (const r of all) {
      r.el.classList.toggle('slopvm-off', r.off && !r.strip);
      r.el.classList.toggle('slopvm-strip', !!r.strip);
      r.el.classList.toggle('slopvm-peek', wantHidden(r) && r.peek && !peekAll);
    }
    for (const [P, p] of plan) {
      const setX = p.cols.size > 0, setY = p.rows.size > 0 || !!p.fillEl;
      if (!setX && !setY) continue;
      // A named-area grid keeps the hidden track at 0px (its areas name it). An auto-placed grid drops the track: the
      // items after a hidden one move up into its place, so their tracks must move up too.
      const fmt = (list, zero, fill, flow) => list.map((t, i) => {
        if (zero.has(i)) return flow ? null : '0px';
        return i === fill ? 'minmax(0, 1fr)' : (t.b - t.a) + 'px';
      }).filter((v) => v !== null).join(' ');
      if (setX && p.colSizes.length) P.style.gridTemplateColumns = fmt(p.colSizes, p.cols, fillTrack(p.colSizes, p.kids, 'x', p.cols), p.flowX);
      if (setY && p.rowSizes.length) P.style.gridTemplateRows = fmt(p.rowSizes, p.rows, fillTrack(p.rowSizes, p.kids, 'y', p.rows, p.fillEl), p.flowY);
      shells.add(P);
      watch(P);
    }
    words();
    if (doc.documentElement) doc.documentElement.dataset.slopvm = mode;
    if (watcher) watcher.takeRecords();   // our own class changes are not an app change
    painting = false;
    // A changed layout needs a re-measure: apps listen for resize (canvases, editors, grids).
    if (notify && win.requestAnimationFrame) win.requestAnimationFrame(() => fire());
  }
  /** The controls' words and icons for the mode; again after a language change (shared/i18n). */
  function words() {
    for (const e of apps.values()) {
      for (const b of e.buttons) {
        b.querySelector('.slopvm-txt').textContent = LABEL[mode](); b.firstChild.innerHTML = ICON[mode];
        b.setAttribute('aria-label', tr('ui.viewmode.aria', 'View: {mode}. Opens the view menu.', { mode: LABEL[mode]() }));
        b.title = tr('ui.viewmode.tip', 'View: choose what is shown (Ctrl+Shift+F next view, Escape back to Full)');
      }
      for (const b of e.reveal) {
        b.lastChild.textContent = peekAll ? tr('ui.viewmode.hide', 'Hide panels') : tr('ui.viewmode.show', 'Show panels'); b.setAttribute('aria-pressed', String(peekAll));
        b.title = tr('ui.viewmode.reveal_tip', 'Show every hidden panel and toolbar (Ctrl+Shift+L)');
      }
    }
  }
  if (win.SlopI18n && win.SlopI18n.on) win.SlopI18n.on(words);
  /** A resize for the app to re-measure; paint() ignores the resize this sends. */
  let firing = false;
  function fire() { firing = true; try { win.dispatchEvent(new Event('resize')); } finally { firing = false; } }

  /** An app that toggles a class on a grid shell (a panel) gets the layout re-measured. */
  let watcher = null;
  function watch(P) {
    if (!win.MutationObserver) return;
    if (!watcher) watcher = new win.MutationObserver(() => { if (!painting && !firing) paint(false); });
    watcher.observe(P, { attributes: true, attributeFilter: ['class'] });
  }
  function setMode(next) {
    if (!MODES.includes(next) || next === mode) return mode;
    mode = next; peekAll = false;
    for (const r of regions()) r.peek = false;
    store.set(KEY, mode);
    paint(true);
    return mode;
  }
  const cycle = () => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  function revealAll() { if (mode === 'full') return; peekAll = !peekAll; paint(true); }

  /** Is the point inside the edge zone of a region? */
  function inZone(r, x, y) {
    const w = win.innerWidth, h = win.innerHeight;
    switch (r.edge) {
      case 'left': return x <= EDGE_PX;
      case 'right': return x >= w - EDGE_PX;
      case 'bottom': return y >= h - EDGE_PX;
      default: return y <= EDGE_PX;   // top
    }
  }
  function onPointer(e) {
    if (mode === 'full') return;
    const now = Date.now(); let changed = false;
    for (const r of regions()) {
      if (r.off && inZone(r, e.clientX, e.clientY)) { r.peek = true; r.lastIn = now; changed = true; }
      else if (r.peek && (r.el.contains(e.target) || inZone(r, e.clientX, e.clientY))) r.lastIn = now;
    }
    if (changed) paint(true);
    if (regions().some((r) => r.peek)) startSweep();
  }
  /** Hide a peeked region again once the pointer has been away from it for LEAVE_MS. */
  function startSweep() {
    if (sweep) return;
    sweep = win.setInterval(() => {
      const now = Date.now(); let changed = false;
      for (const r of regions()) if (r.peek && now - r.lastIn > LEAVE_MS) { r.peek = false; changed = true; }
      if (changed) paint(true);
      if (!regions().some((r) => r.peek)) { win.clearInterval(sweep); sweep = null; }
    }, 200);
  }
  function onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
    const k = String(e.key || '').toLowerCase();
    if (k === 'f') { e.preventDefault(); e.stopImmediatePropagation(); cycle(); }
    else if (k === 'l') { e.preventDefault(); e.stopImmediatePropagation(); revealAll(); }
  }
  /** Escape returns to Full, unless an app is using Escape (a dialog, a text field, or a key the app already handled). */
  function onEscape(e) {
    if (e.key !== 'Escape' || mode === 'full') return;
    if ((!!window.SlopTyping && window.SlopTyping.isTyping(e, { controls: true }))) return;   // shared/input/typing.js
    if (doc.querySelector('dialog[open], [aria-modal="true"], .sui-menu')) return;   // a dialog or a menu closes first
    setMode('full');
  }

  /** Put the saved layout back into the app. A bad saved value is ignored. */
  function restoreLayout(spec, app) {
    if (!spec.layout || typeof spec.layout.set !== 'function') return;
    const raw = store.get(LAYOUT + app);
    const saved = raw ? safe(() => JSON.parse(raw), null) : null;
    if (saved && typeof saved === 'object') safe(() => spec.layout.set(saved));
  }
  function saveLayout(app) {
    const e = apps.get(app);
    if (!e || !e.spec.layout || typeof e.spec.layout.get !== 'function') return false;
    const obj = safe(() => e.spec.layout.get(), null);
    if (!obj || typeof obj !== 'object') return false;
    store.set(LAYOUT + app, safe(() => JSON.stringify(obj), '{}'));
    return true;
  }
  // The View button's icon per mode (a window with its bars), and the eye of "Show panels".
  const BOX = '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/>';
  const ICON = { full: BOX + '<path d="M3.5 9h17M9 9v10.5"/>', focus: BOX + '<path d="M3.5 9h17"/>', content: BOX + '<path d="M8 12h8"/>' };
  const HINT = { full: () => tr('ui.viewmode.hint_full', 'everything shown'), focus: () => tr('ui.viewmode.hint_focus', 'fewer bars and sidebars'), content: () => tr('ui.viewmode.hint_content', 'only the work area') };
  const svg = (inner) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>';
  function button(cls, title, html, fn) {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = cls + ' slop-hbtn'; b.title = title; b.innerHTML = html;
    b.addEventListener('click', fn);
    return b;
  }
  /** The View button (it opens the View menu) and "Show panels" (only in Focus and Content), in the app's toolbar, never
   *  over the page. Both are shared header buttons (shared/ui/hbtn.css). */
  function mountControls(e) {
    const host = el(e.spec.mount);
    if (!host) return;
    const bar = doc.createElement('span');
    bar.className = 'slopvm-bar';
    const b = button('slopvm-btn', tr('ui.viewmode.tip', 'View: choose what is shown (Ctrl+Shift+F next view, Escape back to Full)'),
      svg('') + '<span class="slop-hbtn-txt"><span class="slopvm-txt"></span><span class="slopvm-caret" aria-hidden="true"></span></span>', () => openMenu(b));
    b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
    const reveal = button('slopvm-reveal', tr('ui.viewmode.reveal_tip', 'Show every hidden panel and toolbar (Ctrl+Shift+L)'),
      svg('<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>') + '<span class="slop-hbtn-txt"></span>', revealAll);
    bar.append(reveal, b);   // the reveal sits left of the View button, so the button stays put when it shows
    host.appendChild(bar);
    e.buttons.push(b); e.reveal.push(reveal); e.bar = bar;
  }
  /** The View menu (SlopUI.menu): the three modes with the current one checked, then Show hidden panels and Next view.
   *  A page without SlopUI gets the old behaviour: the button goes to the next mode. */
  function openMenu(b) {
    const UI = win.SlopUI;
    if (!UI || !UI.menu) { cycle(); return; }
    const items = MODES.map((m) => ({ label: tr('ui.viewmode.item', '{mode}: {hint}', { mode: LABEL[m](), hint: HINT[m]() }), check: m === mode, radio: true, act: () => setMode(m) }));
    items.push('-', { label: peekAll ? tr('ui.viewmode.hide_again', 'Hide the panels again') : tr('ui.viewmode.show_hidden', 'Show hidden panels'), key: 'Ctrl+Shift+L', disabled: mode === 'full', act: revealAll },
      { label: tr('ui.viewmode.next', 'Next view'), key: 'Ctrl+Shift+F', act: cycle });
    const r = b.getBoundingClientRect(), m = UI.menu(items, r.left, r.bottom + 4);
    m.classList.add('slopvm-menu');
    b.setAttribute('aria-expanded', 'true');
    const gone = new win.MutationObserver(() => { if (!m.isConnected) { b.setAttribute('aria-expanded', 'false'); gone.disconnect(); } });
    gone.observe(doc.body, { childList: true });
  }

  /** Register an app. Returns its handle. Regions the page does not have are skipped. */
  function register(app, spec) {
    spec = spec || {};
    const old = apps.get(app);
    if (old) { for (const r of old.regions) r.el.classList.remove('slopvm-off', 'slopvm-strip', 'slopvm-peek'); if (old.bar) old.bar.remove(); }
    const edges = Object.assign({}, DEFAULT_EDGE, spec.edges || {});
    const e = { app, spec, buttons: [], reveal: [], bar: null, hides: Object.assign({}, DEFAULT_HIDES, spec.hides || {}), regions: [] };
    for (const name of Object.keys(spec.regions || {})) {
      for (const sel of [].concat(spec.regions[name])) {   // a region may be several elements (a menu bar and a control bar)
        const node = el(sel);
        if (node) e.regions.push({ app, name, el: node, edge: edges[name] || 'top', peek: false, off: false, strip: false, lastIn: 0 });
      }
    }
    apps.set(app, e);
    mountControls(e);
    restoreLayout(spec, app);
    if (!wired) wire();
    paint();
    return {
      mode: () => mode,
      set: (m) => setMode(m),
      cycle,
      saveLayout: () => saveLayout(app),
    };
  }
  // The key and pointer listeners are set up when this script loads, before the app's own scripts, so the shortcuts
  // come first. Escape is checked before the app too: it returns to Full unless a dialog is open or a field has focus.
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('keydown', onEscape, true);
  doc.addEventListener('pointermove', onPointer, { passive: true });
  function wire() {
    wired = true;
    // A window resize re-measures a locked layout (its tracks are fixed to the sizes measured in paint()).
    win.addEventListener('resize', () => { if (!firing && shells.size) paint(false); });
    win.addEventListener('pagehide', () => { for (const a of apps.keys()) saveLayout(a); });
    safe(() => {
      if (!SELF) return;
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = SELF.replace(/[^/]*$/, 'viewmode.css');
      doc.head.appendChild(link);
    });
    safe(() => { const s = doc.createElement('style'); s.id = 'slopvm-style'; s.textContent = CRITICAL; doc.head.appendChild(s); });
  }
  // Before viewmode.css loads: a hidden region, and a strip showing only its controls. The rest is in viewmode.css.
  const CRITICAL = '.slopvm-off{display:none!important}.slopvm-strip>:not(.slopvm-bar){display:none!important}';

  win.SlopViewMode = {
    register, mode: () => mode, set: setMode, cycle, saveLayout,
    modes: MODES.slice(),
    shortcuts: { cycle: 'Ctrl+Shift+F', reveal: 'Ctrl+Shift+L' },
  };
})(window);
