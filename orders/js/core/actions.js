// The order actions the list menu and the editor share. Each takes an order id and resolves to a Result from SlopData.
// Confirm, cancel and convert are status and invoice changes through the store and billing; fulfil is in fulfil.js.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const M = g.SlopDocs.model;
  const { fail } = S.result;

  /** Draft -> confirmed (open). Lines are checked by the store, so an incomplete draft is refused. */
  async function confirmId(id) {
    const r = await NS.orders.setStatus(id, 'open');
    return r;
  }

  /** Confirmed or fulfilled -> an invoice draft (billing.invoiceFromOrder). Due date is the order date plus the payment terms. */
  async function convertId(id) {
    const o = await S.store.get('orders', id);
    if (!o.ok) return o;
    if (!o.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('orders.core.gone') : 'orders.core.gone');
    const st = await S.store.get('settings', 'main');
    const days = st.ok && st.value ? st.value.paymentTermsDays : S.schema.DEFAULT_SETTINGS.paymentTermsDays;
    return S.billing.invoiceFromOrder(id, { dueDate: M.addDays(o.value.date, days) });
  }

  NS.actions = { confirmId, convertId, fulfilId: (id) => NS.fulfil.fulfil(id), cancelId: (id) => NS.orders.cancel(id) };
})(typeof window !== 'undefined' ? window : globalThis);
