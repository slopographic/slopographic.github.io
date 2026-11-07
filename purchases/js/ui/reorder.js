// Reorder: a new purchase order filled in for one product (from Slop Inventory's low-stock list, #reorder/<product id>): the
// supplier and buying price it was last bought at, and the quantity that brings it back above its reorder level, less what is
// already on order (SlopData.purchases.lastBought and suggestQty). It is a draft with unsaved changes; nothing is stored
// until it is saved.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopPurchases = g.SlopPurchases || {});
  const M = g.SlopDocs.model;

  /** Opens the editor on a new purchase order for productId, filled in. */
  async function open(productId) {
    const ed = NS.editor;
    if (!(await ed.open(null))) return false;
    const [p, moves, pos] = await Promise.all([S.store.get('products', productId), S.store.list('stockMovements', { index: 'productId', value: productId }), S.store.list('purchases')]);
    const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    if (!p.ok || !p.value) { ed.note(t('purchases.ro.gone')); return false; }
    const prod = p.value, all = pos.ok ? pos.value : [];
    const onHand = moves.ok ? S.stock.onHandOf(moves.value, productId) : 0;
    const qty = S.purchases.suggestQty(prod.reorderLevel, onHand, S.purchases.onOrder(all).get(productId) || 0);
    const last = S.purchases.lastBought(all, productId);
    const st = ed.live();
    const line = M.newLine(prod, st.defaultTaxRate);
    st.lines = [{ ...line, qty, unitPrice: last ? last.unitPrice : line.unitPrice, taxRate: last ? last.taxRate : line.taxRate }];
    if (last && st.customers.some((c) => c.id === last.supplierId)) st.customerId = last.supplierId;
    ed.edited(last ? '' : t('purchases.ro.check'));
    const lead = prod.reorderLevel ? t('purchases.ro.on_hand_reorder', { qty: String(qty), name: prod.name, on_hand: String(onHand), level: String(prod.reorderLevel) })
      : t('purchases.ro.on_hand', { qty: String(qty), name: prod.name, on_hand: String(onHand) });
    ed.setMsg(`${lead} ${t(last ? 'purchases.ro.last' : 'purchases.ro.choose')}`);
    return true;
  }

  NS.reorder = { open };
})(typeof window !== 'undefined' ? window : globalThis);
