// Slop Orders: the io for random samples (shared/docs/samples-run.js). An order takes its number on creation and orders
// cannot be deleted, so "delete" for a sample order means cancel (the number stays used, as the data layer requires).
// Fulfilled samples stay. No DOM here, so a test can use it.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const U = g.SlopOrders.util;

  /** The io object for one batch or one action, with the current settings (currency, terms, locale) and today. */
  async function io() {
    const s = await U.settings();
    return {
      base: s.currency, terms: s.paymentTermsDays, locale: s.locale, today: S.ledger.today(),
      customers: () => NS.orders.customers(),
      products: () => NS.orders.products(),
      addCustomer: (rec) => S.store.put('customers', rec),
      addProduct: (rec) => S.store.put('products', rec),
      saveDocument: (draft) => NS.orders.save(draft),
      sampleDocuments: async () => {
        const r = await S.store.list('orders');
        return r.ok ? S.result.ok(r.value.filter((x) => x.sample && (x.status === 'draft' || x.status === 'open'))) : r;
      },
      removeDocument: (doc) => NS.orders.cancel(doc.id),
    };
  }

  NS.samples = { io };
})(typeof window !== 'undefined' ? window : globalThis);
