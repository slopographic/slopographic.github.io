// The price list: every product by name with its SKU, unit, price before tax, tax rate and price with tax (SlopData.money.taxOn,
// the same rounding as invoices), filtered by a search; and the CSV of it. Pure. Classic script: SlopInv.pricelist (and
// module.exports for the Node tests).
(function (g) {
  'use strict';
  const NS = (g.SlopInv = g.SlopInv || {});
  const money = () => g.SlopData.money;

  /** The rows: [{ sku, name, unit, price, taxRate, gross }], by name, then SKU. search matches SKU, name or EAN. */
  function rows(products, { search = '' } = {}) {
    const q = String(search).trim().toLowerCase();
    return (products || [])
      .filter((p) => !q || [p.sku, p.name, p.ean].some((x) => String(x || '').toLowerCase().includes(q)))
      .map((p) => ({ sku: p.sku, name: p.name, unit: p.unit || 'each', price: p.price, taxRate: p.taxRate || 0, gross: p.price + money().taxOn(p.price, p.taxRate || 0) }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));
  }

  /** The CSV: SKU, Name, Unit, Price, Tax %, Price with tax; plain(minor) gives a plain amount. */
  function csv(list, plain) {
    const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const out = [['SKU', 'Name', 'Unit', 'Price', 'Tax %', 'Price with tax'].join(',')];   // i18n-ignore: CSV columns, a file format for other programs
    for (const r of list) out.push([r.sku, r.name, r.unit, plain(r.price), (r.taxRate / 100).toFixed(2), plain(r.gross)].map(cell).join(','));
    return out.join('\r\n') + '\r\n';
  }

  const api = { rows, csv };
  NS.pricelist = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
