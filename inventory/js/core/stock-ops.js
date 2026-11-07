// Stock changes. Every change goes through SlopData.stock.move or SlopData.stock.transfer, so the rules
// (no negative stock unless allowed, sign rules per reason) are enforced by the data layer. This module checks
// the typed quantity and names the movement. It never writes stockMovements itself.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const { fail } = S.result;
  const whole = (n) => Number.isSafeInteger(n) && n > 0;
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);

  /** Receipt: adds stock at a location. */
  function receive({ productId, location, qty, note }) {
    if (!whole(qty)) return Promise.resolve(fail('invalid', t('inventory.st.e_qty')));
    return S.stock.move({ productId, location: NS.util.cleanLocation(location), qty, reason: 'receipt', note });
  }

  /** Sale: removes stock. Refused below zero unless allowNegative is set. */
  function sell({ productId, location, qty, allowNegative = false, note }) {
    if (!whole(qty)) return Promise.resolve(fail('invalid', t('inventory.st.e_qty')));
    return S.stock.move({ productId, location: NS.util.cleanLocation(location), qty: -qty, reason: 'sale', note, allowNegative: !!allowNegative });
  }

  /** Adjustment: a signed correction (positive adds, negative removes). Zero is refused. */
  function adjust({ productId, location, qty, allowNegative = false, note }) {
    if (!Number.isSafeInteger(qty) || qty === 0) return Promise.resolve(fail('invalid', t('inventory.st.e_adjust')));
    return S.stock.move({ productId, location: NS.util.cleanLocation(location), qty, reason: 'adjustment', note, allowNegative: !!allowNegative });
  }

  /** Transfer between two locations: two movements sharing one ref. */
  function transfer({ productId, from, to, qty, note }) {
    if (!whole(qty)) return Promise.resolve(fail('invalid', t('inventory.st.e_qty')));
    return S.stock.transfer({ productId, from: NS.util.cleanLocation(from), to: NS.util.cleanLocation(to), qty, note });
  }

  /** Counter-movement that reverses one movement. The original stays in the history. Resolves to the new movement. */
  function undo(movement) {
    if (!movement || !movement.id) return Promise.resolve(fail('not_found', t('inventory.st.e_no_move')));
    const reason = movement.reason === 'sale' ? 'return' : 'adjustment';
    return S.stock.move({
      productId: movement.productId, location: movement.location, qty: -movement.qty, reason,
      ref: `undo:${movement.id}`, note: 'Undo of an earlier movement',   // i18n-ignore: the movement note stored in the stock history (records stay as written)
    });
  }

  NS.stockOps = { receive, sell, adjust, transfer, undo };
})(typeof window !== 'undefined' ? window : globalThis);
