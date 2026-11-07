// The quote PDF: the shared document PDF (shared/docs/doc-pdf.js) for a quote, with its valid-until date. Pure: bytes out.
(function (g) {
  'use strict';
  const NS = (g.SlopQuotes = g.SlopQuotes || {});
  const P = g.SlopDocs.docPdf.create({
    ns: NS, collection: 'quotes', kind: 'quote',
    view: (q) => ({ moreMeta: [{ key: 'biz.pr.valid_until', value: q.validUntil, field: 'validUntil' }] }),
  });
  NS.pdf = { load: P.load, viewOf: P.viewOf, quotePdf: P.pdf };
})(typeof window !== 'undefined' ? window : globalThis);
