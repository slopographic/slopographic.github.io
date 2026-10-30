// The delivery note of an order, pure: one row per line with its SKU, description, quantity and unit (the product's unit, or
// "each" for a line without a product), and the totals (lines and items). No prices: a delivery note goes in the box.
// Classic script: SlopOrders.delivery (and module.exports for the Node tests).
(function (g) {
  'use strict';
  const NS = (g.SlopOrders = g.SlopOrders || {});

  /** { rows: [{ sku, description, qty, unit }], lines, items } for an order and the products (for their units). */
  function noteOf(order, products) {
    const unit = new Map((products || []).map((p) => [p.id, p.unit || 'each']));
    const rows = (order.lines || []).map((l) => ({ sku: l.sku || '', description: l.description || '', qty: l.qty, unit: (l.productId && unit.get(l.productId)) || 'each' }));
    return { rows, lines: rows.length, items: rows.reduce((s, r) => s + r.qty, 0) };
  }

  const api = { noteOf };
  NS.delivery = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
