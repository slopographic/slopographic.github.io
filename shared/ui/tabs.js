// SlopTabs: the view tabs of an app page (a role="tablist" of role="tab" buttons, each with data-view, and one panel per
// view, by default #view-<name>). show(name) shows that panel, hides the others and marks its tab (aria-selected, and
// the only tabbable tab). A click on a tab, or the arrow keys, Home and End on the tab list (the next visible tab, as the
// ARIA tabs pattern does), select a view: through opts.select(name) when the app routes (a #hash), else show(name).
// Classic script. Exposes window.SlopTabs.mount(tablist, { select, onShow, panel }) -> { show(name), current(), names() }.
(function (g) {
  'use strict';
  const doc = g.document;

  function mount(list, opts = {}) {
    const tabs = () => [...list.querySelectorAll('[role="tab"][data-view]')];
    const panelOf = opts.panel || ((name) => doc.getElementById('view-' + name));
    let cur = null;

    /** Shows one view: its panel visible, the others hidden, its tab selected. Unknown names change nothing. */
    function show(name) {
      const all = tabs();
      if (!all.some((t) => t.dataset.view === name)) return false;
      for (const t of all) {
        const on = t.dataset.view === name;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const p = panelOf(t.dataset.view);
        if (p) p.hidden = !on;
      }
      cur = name;
      if (opts.onShow) opts.onShow(name);
      return true;
    }
    const select = (name) => (opts.select ? opts.select(name) : show(name));

    list.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('[role="tab"][data-view]');
      if (t && list.contains(t)) select(t.dataset.view);
    });
    list.addEventListener('keydown', (e) => {
      const vis = tabs().filter((t) => !t.hidden && !t.disabled), i = vis.indexOf(e.target);
      if (i < 0) return;
      const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: vis.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      const t = vis[(to + vis.length) % vis.length];
      t.focus();
      select(t.dataset.view);
    });

    return { show, current: () => cur, names: () => tabs().map((t) => t.dataset.view) };
  }

  g.SlopTabs = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
