// Product rows with stock, read in one transaction: on hand (all locations), on order (placed purchase orders, through
// SlopData.purchases.onOrder), movement count, low-stock flag and
// stock value at the selling price (integer minor units, through money.mulDiv). Reports and the product list use this.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const { ok } = S.result;

  /** Pure: one row per product. A product with no reorder level is never flagged low. */
  function rowsOf(products, movements, purchases = []) {
    const ordered = S.purchases.onOrder(purchases);
    const sums = new Map(), counts = new Map();
    for (const m of movements) {
      sums.set(m.productId, (sums.get(m.productId) || 0) + m.qty);
      counts.set(m.productId, (counts.get(m.productId) || 0) + 1);
    }
    return products.map((p) => {
      const onHand = sums.get(p.id) || 0;
      const low = p.reorderLevel !== undefined && onHand <= p.reorderLevel;
      return {
        id: p.id, sku: p.sku, ean: p.ean || '', name: p.name, price: p.price, taxRate: p.taxRate, unit: p.unit || 'each',
        reorderLevel: p.reorderLevel, onHand, onOrder: ordered.get(p.id) || 0, moves: counts.get(p.id) || 0, low,
        value: S.money.mulDiv(onHand, p.price, 1),
      };
    });
  }

  /** Totals for a list of rows: the stock value (sum of on hand x price) and counts. */
  function totalsOf(rows) {
    let value = 0;
    for (const r of rows) value += r.value;
    return { value, products: rows.length, low: rows.filter((r) => r.low).length, units: rows.reduce((s, r) => s + r.onHand, 0) };
  }

  /** Every product with its stock, read once. */
  function stockRows() {
    return S.store.readAll(async (tx) => {
      const p = await tx.list('products');
      if (!p.ok) return p;
      const m = await tx.list('stockMovements');
      if (!m.ok) return m;
      const po = await tx.list('purchases');
      if (!po.ok) return po;
      return ok(rowsOf(p.value, m.value, po.value));
    });
  }

  NS.rows = { rowsOf, totalsOf, stockRows };
})(typeof window !== 'undefined' ? window : globalThis);
