// Stock on hand is never stored. It is the sum of stockMovements for a product (and location).
// Every change is a movement record: receipts, sales, adjustments, transfers (two legs sharing a ref),
// counts (one adjustment per difference, posted with a stockCounts record) and returns.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail } = ns.result;

  /** Pure: quantity on hand for a product, optionally at one location. */
  function onHandOf(movements, productId, location) {
    let q = 0;
    for (const m of movements) if (m.productId === productId && (location === undefined || m.location === location)) q += m.qty;
    return q;
  }

  /** Pure: on hand per location for one product, as { location: qty }. */
  function levelsOf(movements, productId) {
    const out = {};
    for (const m of movements) if (m.productId === productId) out[m.location] = (out[m.location] || 0) + m.qty;
    return out;
  }

  /** Pure: products whose total on hand is below the threshold, lowest first. Products with no movements count as 0. */
  function lowStockRows(products, movements, threshold) {
    const sums = new Map();
    for (const m of movements) sums.set(m.productId, (sums.get(m.productId) || 0) + m.qty);
    return products
      .map((p) => ({ productId: p.id, sku: p.sku, name: p.name, onHand: sums.get(p.id) || 0 }))
      .filter((r) => r.onHand < threshold)
      .sort((a, b) => a.onHand - b.onHand || String(a.sku).localeCompare(String(b.sku)));
  }

  /** Pure: a count against the book. counts = [{ productId, counted }]. Returns the lines of a stockCounts record. */
  function countRows(counts, movements, location) {
    return counts.map((c) => {
      const expected = onHandOf(movements, c.productId, location);
      return { productId: c.productId, expected, counted: c.counted, diff: c.counted - expected };
    });
  }

  /** Stock on hand, optionally for one location. */
  async function onHand(productId, location) {
    const r = await ns.store.list('stockMovements', { index: 'productId', value: productId });
    return r.ok ? ok(onHandOf(r.value, productId, location)) : r;
  }

  /** Per-location quantities for a product. */
  async function levels(productId) {
    const r = await ns.store.list('stockMovements', { index: 'productId', value: productId });
    return r.ok ? ok(levelsOf(r.value, productId)) : r;
  }

  /** One movement inside a transaction. Refuses to take a location below zero unless allowNegative is set. */
  async function moveIn(tx, m) {
    const p = await tx.get('products', m.productId);
    if (!p.ok) return p;
    if (!p.value) return tx.fail(fail('not_found', say('ui.data.st.no_product', { id: String(m.productId) })));
    const location = m.location || 'main';
    if (m.qty < 0 && !m.allowNegative) {
      const rows = await tx.list('stockMovements', { index: 'productId', value: m.productId });
      if (!rows.ok) return rows;
      const have = onHandOf(rows.value, m.productId, location);
      if (have + m.qty < 0) return tx.fail(fail('insufficient_stock', say('ui.data.st.short', { have: String(have), location })));
    }
    return tx.put('stockMovements', {
      id: ns.store.newId(), productId: m.productId, location, qty: m.qty, reason: m.reason,
      date: m.date || ns.ledger.today(), ref: m.ref, note: m.note,
    }, { posting: true });
  }

  /** Records one movement. Example: move({ productId, location: 'main', qty: 5, reason: 'receipt' }). */
  const move = (input) => ns.store.transact((tx) => moveIn(tx, input || {}));

  /** Moves qty from one location to another, as two movements sharing one ref. */
  function transfer({ productId, from, to, qty, date, note } = {}) {
    return ns.store.transact(async (tx) => {
      if (!Number.isSafeInteger(qty) || qty < 1) return fail('invalid', say('ui.data.st.qty'));
      if (!from || !to || from === to) return fail('invalid', say('ui.data.st.transfer'));
      const ref = `transfer:${ns.store.newId()}`;
      const out = await moveIn(tx, { productId, location: from, qty: -qty, reason: 'transfer', date, ref, note });
      if (!out.ok) return out;
      const into = await moveIn(tx, { productId, location: to, qty, reason: 'transfer', date, ref, note });
      return into.ok ? ok({ ref }) : into;
    });
  }

  /** Stock count: one 'count' movement per difference and one stockCounts record, in one transaction. */
  function postCount({ location, date, counts = [], notes } = {}) {
    return ns.store.transact(async (tx) => {
      if (!counts.length) return fail('invalid', say('ui.data.st.count_one'));
      if (counts.some((c) => !Number.isSafeInteger(c.counted) || c.counted < 0)) return fail('invalid', say('ui.data.st.count_whole'));
      const all = await tx.list('stockMovements');
      if (!all.ok) return all;
      const id = ns.store.newId();
      const day = date || ns.ledger.today();
      const lines = countRows(counts, all.value, location || 'main');
      for (const l of lines) {
        if (l.diff === 0) continue;
        const m = await tx.put('stockMovements', {
          id: ns.store.newId(), productId: l.productId, location: location || 'main', qty: l.diff, reason: 'count', date: day, ref: `count:${id}`,
        }, { posting: true });
        if (!m.ok) return m;
      }
      return tx.put('stockCounts', { id, location: location || 'main', date: day, lines, notes, status: 'posted' }, { posting: true });
    });
  }

  /** Products below a threshold. */
  function lowStock(threshold) {
    return ns.store.readAll(async (tx) => {
      const p = await tx.list('products');
      if (!p.ok) return p;
      const m = await tx.list('stockMovements');
      if (!m.ok) return m;
      return ok(lowStockRows(p.value, m.value, threshold));
    });
  }

  /** Finds a product by EAN (when the code has a valid check digit) or by SKU. Resolves to the product or null. */
  function lookupBarcode(code) {
    const raw = String(code ?? '').trim();
    if (!raw) return Promise.resolve(ok(null));
    const ean = ns.barcode.normalizeEan(raw);
    return ns.store.readAll(async (tx) => {
      if (ean && ns.barcode.isValidEan(ean)) {
        const r = await tx.list('products', { index: 'ean', value: ean });
        if (!r.ok) return r;
        if (r.value[0]) return ok(r.value[0]);
      }
      const s = await tx.list('products', { index: 'sku', value: raw });
      return s.ok ? ok(s.value[0] || null) : s;
    });
  }

  ns.stock = { onHandOf, levelsOf, lowStockRows, countRows, onHand, levels, move, moveIn, transfer, postCount, lowStock, lookupBarcode };
})(typeof window !== 'undefined' ? window : globalThis);
