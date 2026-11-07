// Slop Inventory: shared helpers. Classic script, loaded after shared/data and shared/biz/biz.js (refusal, settings, money
// and h are SlopBiz's). Exposes window.SlopInv.util.
// Nothing here stores anything; it formats, parses and explains.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});

  // Plain words for each refusal code. The data layer's own message follows in brackets.
  // words in the chosen language, read each time a refusal is shown (getters)
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const PLAIN = {
    get insufficient_stock() { return t('inventory.u.insufficient_stock'); }, get in_use() { return t('inventory.u.in_use'); },
    get conflict() { return t('inventory.u.conflict'); }, get not_found() { return t('inventory.u.not_found'); }, get invalid() { return t('inventory.u.invalid'); },
    get immutable() { return t('inventory.u.immutable'); }, get posting_required() { return t('inventory.u.posting_required'); },
    get blocked() { return t('inventory.u.blocked'); }, get unavailable() { return t('inventory.u.unavailable'); },
  };
  const FIELD = { get sku() { return t('inventory.f.sku'); }, get ean() { return t('inventory.f.ean'); }, get name() { return t('inventory.f.name'); }, get price() { return t('inventory.f.price'); },
    get taxRate() { return t('inventory.f.tax_rate'); }, get unit() { return t('inventory.f.unit'); }, get reorderLevel() { return t('inventory.f.reorder'); }, get description() { return t('inventory.f.description'); } };

  const B = g.SlopBiz;
  /** One readable line for a failed Result (SlopBiz.refusal with the inventory's words, the message in brackets). */
  const refusal = (r) => B.refusal(r, { plain: PLAIN, fields: FIELD, brackets: true });

  /** Minor units as plain text with the currency's decimals, such as 1250 -> "12.50" (SlopData.money.plainMinor). */
  const majorText = (minor, currency) => S.money.plainMinor(minor, currency);

  /** A basis-point rate as text: 2000 -> "20.00". */
  const percentText = (bp) => majorText(bp, 'USD');

  /** A whole number from typed text, or NaN. */
  function wholeOf(v) {
    const str = String(v ?? '').trim();
    return /^-?\d+$/.test(str) ? Number(str) : NaN;
  }

  /** A location name as typed, or 'main' when blank. */
  const cleanLocation = (v) => String(v ?? '').trim().slice(0, 40) || 'main';

  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const stamp = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  NS.util = { PLAIN, FIELD, refusal, settings: B.settings, money: B.money, majorText, percentText, wholeOf, cleanLocation, h: B.h, plural, stamp, ok: S.result.ok, fail: S.result.fail };
})(typeof window !== 'undefined' ? window : globalThis);
