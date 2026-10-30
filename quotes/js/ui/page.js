// The quote on the page: the shared paper view and PDF download (shared/docs/doc-page.js) for a quote, with its
// valid-until date under the date. Draft and sent quotes are edited in place; accepted and declined ones show read only.
(function (g) {
  'use strict';
  const NS = (g.SlopQuotes = g.SlopQuotes || {});
  NS.page = g.SlopDocs.docPage.create({
    ns: NS, kind: 'quote',
    editable: (st) => st.status === 'draft' || st.status === 'sent',
    pdf: (id) => NS.pdf.quotePdf(id),
    view: (st) => ({ moreMeta: [{ key: 'biz.pr.valid_until', value: st.validUntil, field: 'validUntil' }] }),
    field: (st, name, value) => { if (name !== 'validUntil') return false; st.validUntil = value; return true; },
  });
})(typeof window !== 'undefined' ? window : globalThis);
