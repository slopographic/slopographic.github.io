// The order PDF: the shared document PDF (shared/docs/doc-pdf.js) for an order. Pure: bytes out.
(function (g) {
  'use strict';
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const P = g.SlopDocs.docPdf.create({ ns: NS, collection: 'orders', kind: 'order' });
  NS.pdf = { load: P.load, viewOf: P.viewOf, orderPdf: P.pdf };
})(typeof window !== 'undefined' ? window : globalThis);
