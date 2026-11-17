// Slop Orders: the order's own words for refusals; the rest is SlopBiz (shared/biz/biz.js). Classic script, loaded after
// shared/data and shared/biz/biz.js. Exposes window.SlopOrders.util.
// Nothing here stores anything; it formats, parses and explains.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopOrders = g.SlopOrders || {});

  // The order's own words where they differ from SlopBiz.PLAIN; the data layer's message follows after a colon.
  // words in the chosen language, read each time a refusal is shown (getters)
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const PLAIN = {
    get invalid_transition() { return t('orders.core.not_allowed'); },
    get posting_required() { return t('orders.core.stock_rules'); },
  };
  const FIELD = { get customerId() { return t('orders.core.customer'); }, get date() { return t('orders.core.date'); }, get lines() { return t('orders.core.lines'); },
    get notes() { return t('orders.core.notes'); }, get currency() { return t('orders.core.currency'); }, get status() { return t('orders.core.status'); } };

  const B = g.SlopBiz;
  /** One readable line for a failed Result, in the words of an order (SlopBiz.refusal, shared/biz/biz.js). */
  const refusal = (r) => B.refusal(r, { plain: PLAIN, fields: FIELD });

  // settings, money and the DOM builder are SlopBiz's (one copy for the business apps)
  NS.util = { PLAIN, FIELD, refusal, settings: B.settings, money: B.money, h: B.h, ok: S.result.ok, fail: S.result.fail };
})(typeof window !== 'undefined' ? window : globalThis);
