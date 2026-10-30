// Slop Invoices: the io for random samples (shared/docs/samples-run.js). Samples are drafts: they take no number until
// issued, so deleting one leaves no gap. Every write is a SlopData call. No DOM here, so the browser test can use it.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;

  /** The io object for one batch or one action, with the current settings (currency, terms, locale) and today. */
  async function io() {
    const s = await U.settings();
    return {
      base: s.currency, terms: s.paymentTermsDays, locale: s.locale, today: S.ledger.today(),
      customers: () => NS.invoices.customers(),
      products: () => NS.invoices.products(),
      addCustomer: (rec) => S.store.put('customers', rec),
      addProduct: (rec) => S.store.put('products', rec),
      saveDocument: (draft) => NS.invoices.saveDraft(draft),
      sampleDocuments: async () => {
        const r = await S.store.list('invoices');
        return r.ok ? S.result.ok(r.value.filter((x) => x.sample && x.status === 'draft')) : r;
      },
      removeDocument: (doc) => NS.invoices.removeDraft(doc.id),
    };
  }

  NS.samples = { io };
})(typeof window !== 'undefined' ? window : globalThis);
