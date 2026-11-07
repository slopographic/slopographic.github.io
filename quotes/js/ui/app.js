// Slop Quotes boot: the shared document app (shared/docs/doc-app.js) with the quote routes (list, new, q/<id>, data).
(function (g) {
  'use strict';
  g.SlopDocs.docApp.start({ ns: (g.SlopQuotes = g.SlopQuotes || {}), app: 'quotes', route: 'q', noun: 'quote' });
})(typeof window !== 'undefined' ? window : globalThis);
