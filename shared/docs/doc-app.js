// The routes the document apps share (Slop Orders, Slop Quotes), on the business router (shared/biz/router.js): list, new,
// <route>/<id> and data. Leaving the editor with unsaved changes asks first; the edit tab goes back to the open document.
// SlopDocs.docApp.start(cfg) returns ns.app. cfg: { ns, app: 'orders', route: 'o', noun: 'order', more?(hash) -> a route of
// the app's own (such as Invoices' p/<id> print view) or null, after?(t, shown), mount?(), tabRoute?(name) }. The views are
// ns.views.list, .edit and .data ({ mount, refresh, onShow(arg) }). Classic script, loaded after shared/biz/router.js.
(function (g) {
  'use strict';
  const D = (g.SlopDocs = g.SlopDocs || {});

  function start(cfg) {
    const NS = cfg.ns, pre = `${cfg.route}/`;
    /** The route for a hash: list, new, <route>/<id> or data. */
    function parse(h) {
      const own = cfg.more ? cfg.more(h) : null;
      if (own) return own;
      if (h === 'data') return { view: 'data' };
      if (h === 'new') return { view: 'edit', arg: null };
      if (h.startsWith(pre) && h.length > pre.length) return { view: 'edit', arg: h.slice(pre.length) };
      return { view: 'list' };
    }
    /** Asks before leaving an editor with unsaved changes (staying on the same document is not leaving). */
    async function leave(t, at) {
      const staying = t.view === 'edit' && t.arg === NS.editor.id();
      if (at.view !== 'edit' || !NS.editor.isDirty() || staying) return true;
      const yes = await g.SlopUI.confirm(D.tr('biz.doc.unsaved_title'), D.tr('biz.doc.unsaved_' + D.nounKey(cfg.noun)), D.tr('biz.doc.leave'), { danger: true });
      if (yes) NS.editor.clean();
      return yes;
    }
    /** The list beside an open record (the workspace layout, shared/docs/doc-layout.js) shows while another view is current:
     *  it is redrawn with that view, after a route and after every store change, so a save or an issue shows in it at once. */
    const listBeside = (t) => t !== 'list' && NS.views && NS.views.list && document.getElementById('view-list') && !document.getElementById('view-list').hidden;
    function after(t, shown) {
      if (listBeside(t.view)) Promise.resolve(shown).then(() => NS.views.list.refresh());
      if (cfg.after) cfg.after(t, shown);
    }
    function refresh(view) {
      const v = NS.views[view], fn = v && (v.refresh || v.render);
      if (fn) fn.call(v);
      if (listBeside(view)) NS.views.list.refresh();
    }
    NS.state = { view: 'list' };
    if (!NS.views || !NS.views.data) g.SlopBiz.backup.attach(NS);   // the Data view: full backup and restore
    // a language change: the open view again in the new words (the editor repaints its form and its paper)
    if (g.SlopI18n) g.SlopI18n.on(() => { if (NS.app && NS.app.booted) { refresh(NS.state.view); if (NS.state.view === 'edit' && NS.editor && NS.editor.repaint) NS.editor.repaint(); } });
    return g.SlopBiz.router.start({ ns: NS, app: cfg.app, parse, leave, after, refresh, mount: cfg.mount, tabRoute: cfg.tabRoute,
      editRoute: () => NS.editor.route(), current: () => NS.editor.route() });
  }

  D.docApp = { start };
})(typeof window !== 'undefined' ? window : globalThis);
