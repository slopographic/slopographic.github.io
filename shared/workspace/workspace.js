/* SlopWorkspace: a reusable split workspace. One host holds 1 to 4 panes in a row of columns, a column of rows, or a grid.
 * Each pane shows its own document with its own view (an app's viewer, with its own zoom, page and layers). The focused
 * pane is the one the tools act on: a click or a key on a pane focuses it.
 *
 *   const ws = SlopWorkspace.mount(hostEl, {
 *     panes: 2,                       // 1 to 4
 *     layout: 'columns',              // 'columns' | 'rows' | 'grid'
 *     view: {
 *       create(pane, doc)  -> view    // build the view into pane.el for doc (called once per pane when a doc is opened)
 *       load(view, doc, pane)         // optional: show another doc in an existing view
 *       activate(view, pane)          // the pane gets the tools
 *       deactivate(view, pane)        // another pane got them
 *       destroy(view, pane)           // the pane closed or the workspace was destroyed
 *     },
 *     onFocus(pane)                   // optional: after the focus changed
 *   });
 *   ws.open(paneId, doc)  ws.focus(paneId)  ws.setPanes(n)  ws.setLayout(kind)  ws.active()  ws.panes()  ws.destroy()
 *
 * The grid is pure (SlopWorkspace.gridFor): 1 pane fills the host; 2 and 3 pane columns or rows run one line; 4 panes in
 * a grid are 2 by 2. Classic script, no network, no storage. Exposes window.SlopWorkspace. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopWorkspace = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }

  const LAYOUTS = ['columns', 'rows', 'grid'];
  const clampPanes = (n) => Math.min(4, Math.max(1, Math.floor(Number(n)) || 1));

  /** The track counts of a layout: how many columns and rows the panes take. Pure. */
  function gridFor(n, layout) {
    const count = clampPanes(n);
    const kind = LAYOUTS.includes(layout) ? layout : 'columns';
    if (kind === 'rows') return { cols: 1, rows: count };
    if (kind === 'grid') { const cols = Math.ceil(Math.sqrt(count)); return { cols, rows: Math.ceil(count / cols) }; }
    return { cols: count, rows: 1 };
  }

  let seq = 0;

  function mount(host, opts) {
    if (!host) throw new Error('SlopWorkspace.mount needs a host element');
    const o = opts || {};
    const view = o.view || {};
    const call = (fn, ...args) => { if (typeof fn === 'function') return fn(...args); };
    const id = 'ws' + (++seq);
    let layout = LAYOUTS.includes(o.layout) ? o.layout : 'columns';
    let panes = [];
    let activeId = null;
    host.classList.add('sw-host');
    host.dataset.ws = id;

    function paint() {
      const g = gridFor(panes.length, layout);
      host.style.gridTemplateColumns = `repeat(${g.cols}, minmax(0, 1fr))`;
      host.style.gridTemplateRows = `repeat(${g.rows}, minmax(0, 1fr))`;
      host.dataset.layout = layout;
      host.dataset.panes = String(panes.length);
      for (const p of panes) p.el.classList.toggle('is-active', p.id === activeId);
    }
    function makePane(index) {
      const el = document.createElement('section');
      el.className = 'sw-pane';
      el.dataset.pane = String(index);
      el.setAttribute('aria-label', tr('ui.pane_n', 'Pane {n}', { n: String(index + 1) }));
      const p = { id: index, el, doc: null, view: null };
      // A press anywhere in the pane focuses it, before the view sees the press.
      el.addEventListener('pointerdown', () => { if (activeId !== p.id) focus(p.id); }, true);
      host.append(el);
      return p;
    }
    function dropPane(p) {
      if (p.view !== null) { call(view.deactivate, p.view, p); call(view.destroy, p.view, p); p.view = null; }
      p.el.remove();
    }
    function byId(n) { return panes.find((p) => p.id === n) || null; }

    function focus(n) {
      const next = byId(n);
      if (!next || n === activeId) return;
      const prev = byId(activeId);
      if (prev && prev.view !== null) call(view.deactivate, prev.view, prev);
      activeId = next.id;
      paint();
      if (next.view !== null) call(view.activate, next.view, next);
      call(o.onFocus, next);
    }

    function setPanes(count) {
      const n = clampPanes(count);
      while (panes.length < n) panes.push(makePane(panes.length));
      while (panes.length > n) dropPane(panes.pop());
      if (!byId(activeId)) activeId = null;
      if (activeId === null && panes.length) { activeId = panes[0].id; if (panes[0].view !== null) call(view.activate, panes[0].view, panes[0]); }
      paint();
      return n;
    }

    function open(n, doc) {
      const p = byId(n);
      if (!p) throw new Error('No pane ' + n);
      p.doc = doc;
      if (p.view === null) {
        p.view = call(view.create, p, doc);
        if (p.id === activeId) call(view.activate, p.view, p);
      } else {
        call(view.load, p.view, doc, p);
      }
      return p.view;
    }

    function setLayout(kind) {
      if (!LAYOUTS.includes(kind)) throw new Error('Unknown layout ' + kind);
      layout = kind;
      paint();
    }

    function destroy() {
      for (const p of panes) dropPane(p);
      panes = []; activeId = null;
      host.classList.remove('sw-host');
      host.style.gridTemplateColumns = ''; host.style.gridTemplateRows = '';
    }

    setPanes(o.panes || 1);
    return {
      id,
      open,
      focus,
      setPanes,
      setLayout,
      layout: () => layout,
      active: () => byId(activeId),
      panes: () => panes.slice(),
      pane: byId,
      destroy,
    };
  }

  return { mount, gridFor, LAYOUTS: LAYOUTS.slice() };
});
