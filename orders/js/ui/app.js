// Slop Orders boot: the shared document app (shared/docs/doc-app.js) with the order routes (list, new, o/<id>, data) and
// d/<id>, an order's delivery note (ui/delivery.js). An open order and its delivery note show the record bar
// (shared/biz/docbar.js); the tabs stay Orders and Data.
(function (g) {
  'use strict';
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const more = (h) => (h.startsWith('d/') && h.length > 2 ? { view: 'delivery', arg: h.slice(2) } : null);
  const tabRoute = (n) => (n === 'edit' ? NS.editor.route() : n === 'delivery' ? location.hash.slice(1) : n);
  g.SlopDocs.docApp.start({ ns: NS, app: 'orders', route: 'o', noun: 'order', more, tabRoute });
})(typeof window !== 'undefined' ? window : globalThis);
