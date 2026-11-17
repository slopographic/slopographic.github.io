// The PDF of a stored document for the document apps (Slop Orders, Quotes, Invoices, Purchases): reads the document, its
// customer and the company block from settings, fetches the words of the document's language (SlopBiz.docLang: its own,
// else the company's), builds its view (doc-view.js) in its template, and draws it with the shared renderer (pdf-render.js).
// Pure: bytes out. SlopDocs.docPdf.create(cfg) returns { load, viewOf, pdf }. cfg: { ns, collection: 'orders', kind: 'order',
// more?(rec) -> (async) more context such as payments, view?(rec, ctx) -> extra view fields such as moreMeta }. Classic script.
(function (g) {
  'use strict';
  const D = (g.SlopDocs = g.SlopDocs || {});

  function create(cfg) {
    const S = g.SlopData, M = D.model, NS = cfg.ns;

    /** The document with its customer, company and words, for the PDF (read only). Result: { rec, customer, company, locale,
     *  words (the document language's, SlopBiz.docLang), ...more }. */
    async function load(id) {
      const r = await S.store.get(cfg.collection, id);
      if (!r.ok) return r;
      if (!r.value || r.value.deletedAt) return S.result.fail('not_found', `this ${cfg.kind} no longer exists`);
      const c = await S.store.get('customers', r.value.customerId);
      if (!c.ok) return c;
      const s = await NS.util.settings();
      const words = await g.SlopBiz.docLang.load(g.SlopBiz.docLang.pick(r.value.docLang, s.docLang), s.locale);
      const ctx = { rec: r.value, customer: c.value || {}, company: { name: s.companyName, address: s.address, taxNumber: s.taxNumber }, locale: s.locale, words };
      return S.result.ok(cfg.more ? { ...ctx, ...(await cfg.more(r.value, ctx)) } : ctx);
    }

    /** The view of a loaded document (the paper and the PDF both draw it). */
    function viewOf(ctx) {
      const o = ctx.rec;
      const w = ctx.words;
      return D.view.build({
        kind: cfg.kind, id: o.id, number: o.number || '', status: o.status, words: w,
        date: o.date, dueDate: '', notes: o.notes || '', currency: o.currency, locale: ctx.locale, lines: o.lines,
        customer: ctx.customer, customerId: o.customerId, company: ctx.company, totals: M.totals(o.lines), paid: 0, balance: null,
        money: (m) => NS.util.money(m, o.currency, w ? w.locale : ctx.locale), pdfSeed: o.pdfSeed, pdfLayout: o.pdfLayout, ...(cfg.view ? cfg.view(o, ctx) : {}),
      });
    }

    /** The PDF bytes for a document id: { ok: true, value } or a refusal. */
    async function pdf(id) {
      const c = await load(id);
      return c.ok ? D.pdf.renderPdf(viewOf(c.value)) : c;
    }

    return { load, viewOf, pdf };
  }

  D.docPdf = { create };
})(typeof window !== 'undefined' ? window : globalThis);
