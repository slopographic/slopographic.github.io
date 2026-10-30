// One invoice with everything its views need, loaded from SlopData through the shared document loader
// (shared/docs/doc-pdf.js): the invoice, its customer and company block, its payments, what is paid, the balance (from
// billing), its credit notes, the totals and money in its currency. The PDF, the print sheet, the payment dialog and the editor read it.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;

  const P = g.SlopDocs.docPdf.create({
    ns: NS, collection: 'invoices', kind: 'invoice',
    /** The payments and balance; a draft's balance is its total. */
    async more(inv, ctx) {
      const r = await S.store.list('payments', { index: 'invoiceId', value: inv.id });
      const payments = r.ok ? r.value : [];
      const cr = S.credits ? await S.credits.forInvoice(inv.id) : null;   // shared/data/credits.js
      const balance = inv.status === 'issued' ? S.billing.balanceDue(inv, payments) : inv.status === 'draft' ? inv.total : 0;
      return { invoice: inv, payments, credits: cr && cr.ok ? cr.value : [], paid: S.billing.paidOn(payments), balance, totals: S.money.documentTotals(inv.lines),
        money: (minor) => U.money(minor, inv.currency, ctx.locale) };
    },
    view: (inv, ctx) => ({ dueDate: inv.dueDate || '', paid: ctx.paid || 0, status: inv.status === 'issued' && ctx.balance <= 0 ? 'paid' : inv.status,
      balance: inv.status === 'issued' || inv.status === 'paid' ? ctx.balance : null }),
  });

  /** Resolves to { invoice, customer, payments, credits, paid, balance, totals, company, locale, words, money(minor) } or a failed Result. */
  NS.context = { load: P.load };
  /** The view of a loaded context (the print sheet and the PDF both draw it), and the PDF bytes for one. */
  NS.pdf = { viewOf: P.viewOf, invoicePdf: async (ctx) => g.SlopDocs.pdf.renderPdf(P.viewOf(ctx)) };
})(typeof window !== 'undefined' ? window : globalThis);
