// The order on the page: the shared paper view and PDF download (shared/docs/doc-page.js) for an order. Draft and
// confirmed orders are edited in place; fulfilled and cancelled ones show read only.
(function (g) {
  'use strict';
  const NS = (g.SlopOrders = g.SlopOrders || {});
  NS.page = g.SlopDocs.docPage.create({
    ns: NS, kind: 'order',
    editable: (st) => st.status === 'draft' || st.status === 'open',
    pdf: (id) => NS.pdf.orderPdf(id),
  });
})(typeof window !== 'undefined' ? window : globalThis);
