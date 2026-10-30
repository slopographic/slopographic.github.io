// The boot and #hash router every business app shares: opens the shared store (a plain message when it cannot), mounts the
// views, wires the view tabs (SlopTabs, shared/ui/tabs.js), registers the commands and the hub, redraws the current view
// when the store reports a change (from this tab or another), and shows a view for each hash. Classic script.
// SlopBiz.router.start(cfg) sets ns.app = { go, route, boot, parse, show(name) (that view, its name in the address), booted } and
// returns it. cfg:
//   ns, app                 the namespace (ns.views, ns.commands, ns.util) and the app id ('expenses')
//   parse(hash)             -> { view, arg?, ... } for the hash without '#'
//   editRoute()             the hash the edit tab goes to (default: the current hash, or 'new')
//   editLabel?(t)           the edit tab's text for a route
//   leave?(t)               async: false keeps the person where they are (unsaved changes); the hash is put back
//   current?()              the hash to put back when leave() says no
//   after?(t, shown)        runs after a view is shown (shown: what its show returned)
//   mount?()                runs once with the views (an app's own bar)
//   tabRoute?(name)         the hash a view tab goes to (default: editRoute() for the edit tab, else the tab's name)
//   start?()                async: the hash to open when the page has none (such as the view the app was left on)
//   refresh?(view)          async: redraws after a store change (default: the view's refresh)
//   ready?()                runs once after the first view is shown
// The views are ns.views[name] = { mount?, show?(arg, t) (or onShow, or render), refresh? (or render) }. A view whose tab
// is hidden in the page (#tab-edit, a print view) is a record view: its tab stays hidden and SlopBiz.docbar shows instead.
(function (g) {
  'use strict';
  const B = (g.SlopBiz = g.SlopBiz || {});

  function start(cfg) {
    const NS = cfg.ns, $ = (id) => document.getElementById(id);
    let tabs = null, timer = 0, at = null;
    const docViews = new Set();   // the views whose tabs the page hides: an open record (edit, print, statement)

    /** Moves to a route. Hash changes run route(). */
    const go = (path) => { location.hash = path; };

    /** Shows one view for a parsed route and marks its tab. */
    async function show(t) {
      at = t;
      NS.state = Object.assign(NS.state || {}, { view: t.view });
      // A record view (its tab is hidden in the page) gets the record bar (SlopBiz.docbar); the tabs stay as they are.
      const tab = $('tab-' + t.view), isDoc = docViews.has(t.view);
      const text = cfg.editLabel && t.view === 'edit' ? cfg.editLabel(t) : tab ? tab.textContent.trim() : '';
      if (B.docbar && docViews.size) B.docbar.show(isDoc, text, t.view);
      document.body.dataset.bizDoc = isDoc ? 'open' : '';
      const app = document.querySelector('.app');
      if (app) app.dataset.view = t.view;   // the panes (shared/docs/workspace.css) and the print rules key on it
      tabs.show(t.view);
      if (g.SlopLayouts) g.SlopLayouts.refresh(cfg.app);
      const v = NS.views[t.view];
      const fn = v && (v.show || v.onShow || v.render);
      const out = fn ? fn.call(v, t.arg, t) : undefined;
      if (cfg.after) cfg.after(t, out);
      return out;
    }

    async function route() {
      const t = cfg.parse(location.hash.slice(1));
      if (at && cfg.leave && !(await cfg.leave(t, at))) { history.replaceState(null, '', `#${cfg.current()}`); return; }
      await show(t);
    }

    function redraw() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!at) return;
        if (cfg.refresh) { cfg.refresh(at.view); return; }
        const v = NS.views[at.view], fn = v && (v.refresh || v.render);
        if (fn) fn.call(v);
      }, 40);
    }

    async function boot() {
      const S = g.SlopData, ready = await S.store.ready();
      if (!ready.ok) { $('boot').textContent = g.SlopI18n ? g.SlopI18n.t('biz.err.storage', { why: B.refusal(ready) }) : `Storage is not available here: ${B.refusal(ready)}.`; return; }   // i18n-ignore: the fallback when SlopI18n did not load
      $('boot').hidden = true;
      const editRoute = cfg.editRoute || (() => location.hash.slice(1) || 'new');
      const tabRoute = cfg.tabRoute || ((name) => (name === 'edit' ? editRoute() : name));
      for (const t of document.querySelectorAll('.tabs [role="tab"][hidden]')) docViews.add(t.dataset.view);
      tabs = g.SlopTabs.mount(document.querySelector('.tabs'), { select: (name) => go(tabRoute(name)) });
      for (const v of Object.values(NS.views)) if (v.mount) v.mount();
      if (NS.commands) NS.commands.init();
      if (cfg.mount) cfg.mount();
      if (g.SlopHub) { try { g.SlopHub.register(cfg.app); } catch (e) { /* the hub is optional */ } }
      S.store.subscribe(redraw);
      if (g.SlopI18n) g.SlopI18n.on(redraw);   // the open view's words in the new language
      addEventListener('hashchange', route);
      if (cfg.start && !location.hash.slice(1)) { const h = await cfg.start(); if (h) history.replaceState(null, '', `#${h}`); }
      await route();
      if (cfg.ready) cfg.ready();
      NS.app.booted = true;   // the first view is shown (after start(): tests and callers wait on it, not on the boot cover)
    }

    NS.views = NS.views || {};
    NS.app = { go, route, boot, parse: () => cfg.parse(location.hash.slice(1)), show: (name, arg) => { history.replaceState(null, '', `#${name}`); return show({ view: name, arg }); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    return NS.app;
  }

  B.router = { start };
})(typeof window !== 'undefined' ? window : globalThis);
