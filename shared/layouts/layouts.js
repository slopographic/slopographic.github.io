/* Workspace layouts, the DOM side. Each app mounts its panels once; the layout module then only moves them on the
 * app's own grid (grid rows and columns) and calls the app's own show hook when a panel must hide. On a phone the
 * module steps aside and the app's own CSS applies, unchanged. Classic script, after core.js; extends window.SlopLayouts.
 *   SlopLayouts.mount({ app, root, panels: { id: { el, show? } }, fixed?: { top: [el], bottom: [el] },
 *                       sizeVars?: { id: '--css-var' } (a size the app already drives), phone?: media query (default '(max-width: 760px)'),
 *                       active?: () => bool, release?: () => void })
 * ?layout=<category or preset id> at boot chooses a layout for the app and saves it. */
(function (g) {
  'use strict';
  const NS = (g.SlopLayouts = g.SlopLayouts || {});
  const mounts = {};
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/templates.js

  function storage() { try { return g.localStorage || null; } catch (e) { return null; } }
  function readRaw(app) { try { const s = storage(); return s ? s.getItem(NS.storageKey(app)) : null; } catch (e) { return null; } }
  function writeRaw(app, value) {
    try { const s = storage(); if (!s) return; if (value === null) s.removeItem(NS.storageKey(app)); else s.setItem(NS.storageKey(app), value); } catch (e) { /* storage blocked: the layout still applies for this visit */ }
  }
  function apply(app, id) {
    if (id === null) writeRaw(app, null);
    else writeRaw(app, NS.envelope({ preset: id }));
    refresh(app);
  }

  /** Shows or hides one panel: the app's own hook when it has one, else the element's display. */
  function setShown(m, id, on) {
    const q = m.panels[id];
    if (q.show) { q.show(on); return; }
    if (on) { if (m.hiddenEls.delete(q.el)) q.el.style.display = ''; } else { q.el.style.display = 'none'; m.hiddenEls.add(q.el); }
  }
  function place(el, column, row) { el.style.gridColumn = column; el.style.gridRow = row; }

  /** Gives the grid back to the app: no inline grid styles, panels shown as the app had them. */
  function release(m) {
    const r = m.root;
    r.style.gridTemplateColumns = ''; r.style.gridTemplateRows = ''; r.style.gridTemplateAreas = '';
    delete r.dataset.slopLayout;
    for (const el of m.fixed.top.concat(m.fixed.bottom)) place(el, '', '');
    for (const id of Object.keys(m.panels)) { place(m.panels[id].el, '', ''); }
    for (const el of m.hiddenEls) el.style.display = '';
    m.hiddenEls.clear();
    if (m.engaged) { m.engaged = false; if (m.release) m.release(); }
  }

  /** Re-applies the app's layout: after a choice, a resize of the window, or when the app changes its view. */
  function refresh(app) {
    const m = mounts[app];
    if (!m || m.busy) return;
    m.busy = true;
    try {
      const phone = !!(m.mq && m.mq.matches);
      if (phone || (m.active && !m.active())) { release(m); return; }
      const p = NS.resolve(app, readRaw(app));
      const present = Object.keys(m.panels);
      const a = NS.arrange(p, present, { fixedTop: m.fixed.top.length, fixedBottom: m.fixed.bottom.length, sizeVars: m.sizeVars });
      const r = m.root;
      r.style.gridTemplateColumns = a.columns;
      r.style.gridTemplateRows = a.rows;
      r.style.gridTemplateAreas = 'none';
      r.dataset.slopLayout = p.id;
      m.engaged = true;
      m.fixed.top.forEach((el, i) => place(el, '1 / -1', `${i + 1} / ${i + 2}`));
      m.fixed.bottom.forEach((el, i) => place(el, '1 / -1', `${a.fixedBottomStart + i} / ${a.fixedBottomStart + i + 1}`));
      for (const id of present) {
        const pl = a.placements[id];
        if (pl) { place(m.panels[id].el, pl.column, pl.row); setShown(m, id, true); } else { place(m.panels[id].el, '', ''); setShown(m, id, false); }
      }
    } finally { m.busy = false; }
  }

  /** Picks up ?layout= from the address bar: a category (video, image, 3d, business) or a preset id. */
  function fromUrl(app) {
    let want = null;
    try { want = new URLSearchParams(g.location.search).get('layout'); } catch (e) { want = null; }
    const p = want && NS.pick(app, want);
    if (p) writeRaw(app, NS.envelope({ preset: p.id }));
  }

  function registerCommands(app) {
    const SC = g.SlopCmd;
    if (!SC || typeof SC.register !== 'function') return;
    const words = () => {   // again on a language change, so the palette follows it
      const group = say('ui.layout.group');
      const list = NS.presetsFor(app).map((p) => ({ id: 'layout.' + p.id, title: say('ui.layout.cmd', { name: p.name }), group, keywords: ['workspace', 'panels', 'arrange', p.category], keys: [], run: () => NS.choose(app, p.id) }));
      if (!list.length) return false;
      list.push({ id: 'layout.reset', title: say('ui.layout.cmd_reset'), group, keywords: ['workspace', 'panels', 'default', 'reset'], keys: [], run: () => NS.reset(app) });
      SC.register(list);
      return true;
    };
    if (words() && g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(words);
  }

  /** Mounts an app's panels. Safe to call once per page; without a root or panels it does nothing. */
  NS.mount = function (cfg) {
    if (!cfg || !cfg.root) return null;
    const panels = {};
    for (const id of Object.keys(cfg.panels || {})) if (cfg.panels[id] && cfg.panels[id].el) panels[id] = cfg.panels[id];
    const fixed = (cfg.fixed && cfg.fixed.top) || [];
    const m = (mounts[cfg.app] = {
      root: cfg.root, panels,
      fixed: { top: fixed.filter(Boolean), bottom: ((cfg.fixed && cfg.fixed.bottom) || []).filter(Boolean) },
      active: cfg.active || null, release: cfg.release || null, sizeVars: cfg.sizeVars || {},
      hiddenEls: new Set(), engaged: false, busy: false,
      mq: g.matchMedia ? g.matchMedia(cfg.phone || '(max-width: 760px)') : null,
    });
    fromUrl(cfg.app);
    if (m.mq && m.mq.addEventListener) m.mq.addEventListener('change', () => refresh(cfg.app));
    registerCommands(cfg.app);
    refresh(cfg.app);
    return NS;
  };

  NS.refresh = refresh;
  NS.current = (app) => NS.resolve(app, readRaw(app)).id;
  NS.choose = function (app, id) {
    const p = NS.preset(id);
    if (!p || !p.apps.includes(app)) return false;
    apply(app, id);
    return true;
  };
  NS.reset = function (app) { apply(app, null); return NS.current(app); };
  /** Menu items for a Layout menu: one per preset the app can use, then Reset. */
  NS.menu = function (app) {
    const cur = NS.current(app);
    const items = NS.presetsFor(app).map((p) => ({ label: p.name, check: p.id === cur, act: () => NS.choose(app, p.id) }));
    return items.length ? items.concat(['-', { label: say('ui.layout.reset'), act: () => NS.reset(app) }]) : [];
  };
})(typeof window !== 'undefined' ? window : globalThis);
