// The purchase order PDF: the shared document PDF (shared/docs/doc-pdf.js), with the supplier under "Order from" and the
// expected date under the date. Pure: bytes out.
(function (g) {
  'use strict';
  const NS = (g.SlopPurchases = g.SlopPurchases || {});
  const P = g.SlopDocs.docPdf.create({
    ns: NS, collection: 'purchases', kind: 'purchase',
    view: (po) => ({ partyKey: 'biz.pr.order_from', moreMeta: [{ key: 'biz.pr.expected', value: po.expectedDate, field: 'expectedDate' }] }),
  });
  NS.pdf = { load: P.load, viewOf: P.viewOf, purchasePdf: P.pdf };
})(typeof window !== 'undefined' ? window : globalThis);
