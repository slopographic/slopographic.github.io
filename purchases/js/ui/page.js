// The purchase order on the page: the shared paper view and PDF download (shared/docs/doc-page.js), with the supplier under
// "Order from" and the expected date under the date. Draft and ordered purchase orders are edited in place.
(function (g) {
  'use strict';
  const NS = (g.SlopPurchases = g.SlopPurchases || {});
  NS.page = g.SlopDocs.docPage.create({
    ns: NS, kind: 'purchase',
    editable: (st) => st.status === 'draft' || st.status === 'ordered',
    pdf: (id) => NS.pdf.purchasePdf(id),
    view: (st) => ({ partyKey: 'biz.pr.order_from', moreMeta: [{ key: 'biz.pr.expected', value: st.expectedDate, field: 'expectedDate' }] }),
    field: (st, name, value) => { if (name !== 'expectedDate') return false; st.expectedDate = value; return true; },
  });
})(typeof window !== 'undefined' ? window : globalThis);
