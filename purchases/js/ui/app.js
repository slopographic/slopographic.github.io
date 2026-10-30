// Slop Purchases boot: the shared document app (shared/docs/doc-app.js) with the routes list, new, po/<id>, data, and
// reorder/<product id> (a new purchase order filled in for that product, ui/reorder.js).
(function (g) {
  'use strict';
  const more = (h) => (h.startsWith('reorder/') && h.length > 8 ? { view: 'edit', arg: null, reorder: h.slice(8) } : null);
  g.SlopDocs.docApp.start({ ns: (g.SlopPurchases = g.SlopPurchases || {}), app: 'purchases', route: 'po', noun: 'purchase order', more });   // i18n-ignore: class names and the noun id
})(typeof window !== 'undefined' ? window : globalThis);
