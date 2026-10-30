// Fulfilling a confirmed order takes its stock out through SlopData.stock (one 'sale' movement per stock line, from
// the main location) and then marks the order fulfilled. Stock is checked first, so a refusal changes nothing. If a
// later step fails, the movements already made are undone with 'return' movements (the history keeps both).
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const { fail } = S.result;
  const LOCATION = 'main';

  async function undo(done, order) {
    for (const l of done) {
      await S.stock.move({ productId: l.productId, location: LOCATION, qty: l.qty, reason: 'return', ref: `${order.number} undo` });
    }
  }

  async function fulfil(id) {
    const got = await S.store.get('orders', id);
    if (!got.ok) return got;
    const order = got.value;
    const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
    if (!order) return fail('not_found', t('orders.core.gone'));
    if (order.status !== 'open') return fail('invalid_transition', t('orders.core.only_confirmed'));
    const stockLines = order.lines.filter((l) => l.productId);
    for (const l of stockLines) {
      const have = await S.stock.onHand(l.productId, LOCATION);
      if (!have.ok) return have;
      if (have.value < l.qty) return fail('insufficient_stock', `${l.description} has ${have.value} on hand, the order needs ${l.qty}`);
    }
    const done = [];
    for (const l of stockLines) {
      const m = await S.stock.move({ productId: l.productId, location: LOCATION, qty: -l.qty, reason: 'sale', ref: order.number, date: S.ledger.today() });
      if (!m.ok) { await undo(done, order); return m; }
      done.push(l);
    }
    const put = await S.store.put('orders', { ...order, status: 'fulfilled' });
    if (!put.ok) await undo(done, order);
    return put;
  }

  NS.fulfil = { fulfil, LOCATION };
})(typeof window !== 'undefined' ? window : globalThis);
