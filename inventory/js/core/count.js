// Stock count session, in memory: one location, counted quantities per product. Counting changes no stock.
// review() shows the difference against the book for each counted product. post() writes the differences as
// count movements in one step (SlopData.stock.postCount). A session is not kept across a page reload.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const { ok, fail } = S.result;
  let session = null; // { location, startedAt, tallies: Map<productId, counted> }
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);

  const isOpen = () => !!session;

  /** Opens a count at a location. Refused while another count is open. */
  function start(location) {
    if (session) return fail('invalid', `a count is already open at ${session.location}`);
    session = { location: NS.util.cleanLocation(location), startedAt: Date.now(), tallies: new Map() };
    return ok(snapshot());
  }

  /** What the page shows: location, start time and the counted lines in the order they were first counted. */
  function snapshot() {
    if (!session) return null;
    return { location: session.location, startedAt: session.startedAt, lines: [...session.tallies].map(([productId, counted]) => ({ productId, counted })) };
  }

  /** Adds qty to a product's counted total (a scan in Count mode). Never below zero. A total that reaches zero
   *  leaves the count, so an undone scan can never post a zero count for a product nobody counted. */
  function add(productId, qty = 1) {
    if (!session) return fail('invalid', t('inventory.ct.e_none'));
    const next = (session.tallies.get(productId) || 0) + qty;
    if (!Number.isSafeInteger(next) || next < 0) return fail('invalid', t('inventory.ct.e_below'));
    if (next === 0) session.tallies.delete(productId);
    else session.tallies.set(productId, next);
    return ok(next);
  }

  /** Sets a product's counted total exactly (a typed count). Zero is a real count. */
  function set(productId, counted) {
    if (!session) return fail('invalid', t('inventory.ct.e_none'));
    if (!Number.isSafeInteger(counted) || counted < 0) return fail('invalid', t('inventory.ct.e_whole'));
    session.tallies.set(productId, counted);
    return ok(counted);
  }

  /** Takes a product out of the count without changing stock. */
  function remove(productId) {
    if (!session) return fail('invalid', t('inventory.ct.e_none'));
    session.tallies.delete(productId);
    return ok(true);
  }

  /** Abandons the count. Nothing was written, so nothing is undone. */
  function cancel() {
    session = null;
    return ok(true);
  }

  /** Lines for the review: expected (book, from the movements now), counted, and the difference. */
  async function review() {
    if (!session) return fail('invalid', t('inventory.ct.e_none'));
    const rows = [];
    for (const [productId, counted] of session.tallies) {
      const p = await S.store.get('products', productId);
      if (!p.ok) return p;
      const on = await S.stock.onHand(productId, session.location);
      if (!on.ok) return on;
      const product = p.value || { sku: '?', name: '(deleted product)' };
      rows.push({ productId, sku: product.sku, name: product.name, expected: on.value, counted, diff: counted - on.value });
    }
    rows.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    return ok({ location: session.location, rows, changes: rows.filter((r) => r.diff !== 0).length });
  }

  /** Posts every counted product in one transaction. The session closes only when posting succeeds. */
  async function post(notes) {
    if (!session) return fail('invalid', t('inventory.ct.e_none'));
    const counts = [...session.tallies].map(([productId, counted]) => ({ productId, counted }));
    const r = await S.stock.postCount({ location: session.location, counts, notes: notes || undefined });
    if (r.ok) session = null;
    return r;
  }

  NS.count = { isOpen, start, snapshot, add, set, remove, cancel, review, post };
})(typeof window !== 'undefined' ? window : globalThis);
