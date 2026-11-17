// Product records through SlopData.store. The data layer validates (sku, EAN check digit, price, tax rate,
// unique SKU and EAN) and refuses a delete while stock movements exist. This module only adds the plain-words
// explanation and the pre-check, so the person learns why before the store says no.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const { ok, fail } = S.result;

  /** Saves one product. Pass the whole record for an edit (the schema keeps only the fields it is given). */
  function save(input) {
    return S.store.put('products', input);
  }

  /** Number of stock movements that use a product. */
  async function movementCount(productId) {
    const r = await S.store.list('stockMovements', { index: 'productId', value: productId });
    return r.ok ? ok(r.value.length) : r;
  }

  /** Deletes a product only when it has no stock movements; otherwise says why and changes nothing. */
  async function remove(productId) {
    const n = await movementCount(productId);
    if (!n.ok) return n;
    if (n.value > 0) {
      return fail('in_use', `it has ${NS.util.plural(n.value, 'stock movement')}, and stock history must stay for the record`);
    }
    return S.store.remove('products', productId);
  }

  /** Looks a product up by its exact SKU, or null. */
  async function bySku(sku) {
    const r = await S.store.list('products', { index: 'sku', value: sku });
    return r.ok ? ok(r.value[0] || null) : r;
  }

  NS.products = { save, remove, movementCount, bySku };
})(typeof window !== 'undefined' ? window : globalThis);
