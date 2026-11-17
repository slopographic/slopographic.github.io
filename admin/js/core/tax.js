// Tax rates in use. The shared model keeps a tax rate on each product (set in Slop Inventory) and a default for new
// lines (set in the company profile); there is no separate tax-rate table. This lists what the records use.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopAdmin = g.SlopAdmin || {});

  /** [{ rate (basis points), products (count) }] for live products, highest rate first. */
  async function inUse() {
    const r = await S.store.list('products');
    if (!r.ok) return r;
    const map = new Map();
    for (const p of r.value) map.set(p.taxRate, (map.get(p.taxRate) || 0) + 1);
    const rows = [...map.entries()].map(([rate, products]) => ({ rate, products })).sort((a, b) => b.rate - a.rate);
    return { ok: true, value: rows };
  }

  /** "20%" for 2000 basis points, "7.5%" for 750. */
  const pct = (bp) => `${(bp / 100).toFixed(2).replace(/\.?0+$/, '')}%`;

  NS.tax = { inUse, pct };
})(typeof window !== 'undefined' ? window : globalThis);
