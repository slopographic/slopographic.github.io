/* The workspace layout the document apps share (shared/layouts): while a document is open (the edit view), the list sits
   on the left and the document on the right, each shown with the router's own hidden flags. Below 720 px the layout steps
   aside and the one-view-at-a-time screens apply. The details (.ws-panel) are the record panel on the right (SlopBiz.panel,
   shared/biz/panel.js): resizable, with the record's main buttons (Save, Issue…) in its footer; on a phone a bottom sheet
   whose footer stays on screen. SlopDocs.docLayout.mount(ns, app) sets ns.recordPanel. Classic script. */
(function (g) {
  'use strict';
  const D = (g.SlopDocs = g.SlopDocs || {});

  function mount(NS, app) {
    const $ = (id) => document.getElementById(id);
    if (g.SlopBiz && g.SlopBiz.panel) {
      NS.recordPanel = g.SlopBiz.panel.mount({ app, root: $('view-edit'), view: $('view-edit').querySelector('.ws-stage'),
        panel: $('view-edit').querySelector('.ws-panel'), label: 'biz.doc.details', button: '.biz-doc-actions', phone: '(max-width: 720px)' });
    }
    if (!g.SlopLayouts) return;
    /** Shows or hides a view. Showing the list redraws it: it skips drawing while hidden. */
    function setView(id, on) {
      const el = $(id);
      if (el.hidden === !on) return;
      el.hidden = !on;
      if (on && id === 'view-list' && NS.views && NS.views.list) NS.views.list.refresh();
    }
    g.SlopLayouts.mount({
      app, root: $('main'), phone: '(max-width: 720px)',
      active: () => !!NS.state && NS.state.view === 'edit',
      release: () => { $('view-list').hidden = NS.state.view !== 'list'; $('view-edit').hidden = NS.state.view !== 'edit'; },
      panels: {
        list: { el: $('view-list'), show: (on) => setView('view-list', on) },
        document: { el: $('view-edit'), show: (on) => setView('view-edit', on) },
      },
    });
  }

  D.docLayout = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
