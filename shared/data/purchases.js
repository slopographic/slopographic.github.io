// Purchase orders: what a business orders from a supplier. Drafts and status changes are ordinary store.put calls (draft ->
// ordered -> received, or cancelled; see FLOWS in schema-defs.js). Receiving and the supplier's bill go through here, each in
// one transaction: receive() puts every product line into stock (receipt movements) and marks the order received;
// recordBill() records the bill as a posted expense (SlopData.expenses.recordIn) and links it to the order.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const ok = (v) => ns.result.ok(v), fail = (code, msg) => ns.result.fail(code, msg);

  /** Reads a purchase order inside a transaction, or a refusal. */
  async function load(tx, id) {
    const r = await tx.get('purchases', id);
    if (!r.ok) return r;
    return r.value ? ok(r.value) : fail('not_found', say('ui.data.po.none', { id: String(id) }));
  }

  /** Ordered -> received: one receipt movement per product line (ref: the order number), at location (default 'main'), dated
   *  date (default today). Lines without a product (services, delivery) are not stocked. */
  function receive(id, { date, location = 'main' } = {}) {
    return ns.store.transact(async (tx) => {
      const p = await load(tx, id);
      if (!p.ok) return p;
      const po = p.value, day = date || ns.ledger.today();
      if (po.status !== 'ordered') return fail('invalid_transition', say('ui.data.po.receive'));
      for (const l of po.lines.filter((x) => x.productId)) {
        const m = await ns.stock.moveIn(tx, { productId: l.productId, location, qty: l.qty, reason: 'receipt', ref: po.number, date: day, note: l.description });
        if (!m.ok) return m;
      }
      return tx.put('purchases', { ...po, status: 'received', receivedAt: day, location });
    });
  }

  /** The supplier's bill for an ordered or received purchase order, recorded once as a posted expense: the total paid (tax
   *  included) with the tax to reclaim, on the expense account (default 5000), paid by method (default bank). */
  function recordBill(id, { date, account, method = 'bank' } = {}) {
    return ns.store.transact(async (tx) => {
      const p = await load(tx, id);
      if (!p.ok) return p;
      const po = p.value;
      if (po.status !== 'ordered' && po.status !== 'received') return fail('invalid_transition', say('ui.data.po.bill_state'));
      if (po.expenseId) return fail('conflict', say('ui.data.po.billed'));
      const who = await tx.get('customers', po.customerId);
      if (!who.ok) return who;
      const e = await ns.expenses.recordIn(tx, {
        date: date || ns.ledger.today(), supplier: (who.value && who.value.name) || 'Supplier', description: `Purchase order ${po.number}`,   // i18n-ignore: stored in the bill
        account, amount: po.total, tax: po.tax || 0, currency: po.currency, method,
      });
      if (!e.ok) return e;
      const w = await tx.put('purchases', { ...po, expenseId: e.value.id });
      return w.ok ? e : w;
    });
  }

  /** Pure: the quantity of each product on ordered (placed, not yet received) purchase orders: productId -> qty. */
  function onOrder(purchases) {
    const out = new Map();
    for (const po of purchases || []) {
      if (po.status !== 'ordered') continue;
      for (const l of po.lines || []) if (l.productId) out.set(l.productId, (out.get(l.productId) || 0) + l.qty);
    }
    return out;
  }

  /** Pure: how many to reorder so stock goes back above the reorder level: up to twice the level, less what is on hand and on
   *  order; at least 1. Without a reorder level, 1. */
  function suggestQty(reorderLevel, onHand, ordered) {
    if (!(reorderLevel > 0)) return 1;
    return Math.max(1, reorderLevel * 2 - (onHand || 0) - (ordered || 0));
  }

  /** Pure: what the product was last bought at, from the newest purchase order with a line for it (not cancelled):
   *  { supplierId, unitPrice, taxRate } or null. */
  function lastBought(purchases, productId) {
    const list = (purchases || []).filter((po) => po.status !== 'cancelled' && (po.lines || []).some((l) => l.productId === productId))
      .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
    if (!list.length) return null;
    const l = list[0].lines.find((x) => x.productId === productId);
    return { supplierId: list[0].customerId, unitPrice: l.unitPrice, taxRate: l.taxRate };
  }

  ns.purchases = { receive, recordBill, onOrder, suggestQty, lastBought };
})(typeof window !== 'undefined' ? window : globalThis);
