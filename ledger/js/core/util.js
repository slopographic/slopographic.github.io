// Slop Ledger core helpers: the namespace, the base currency from settings, money text and the account list.
// Classic script. Exposes window.SlopLedger. The data rules (balance, immutability, rates) live in SlopData.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const pad = (n) => String(n).padStart(2, '0');

  /** Local calendar date as YYYY-MM-DD. */
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** True for a real calendar date written YYYY-MM-DD. */
  function isDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  /** Base currency and locale from the shared settings record (USD and en-US when there is none). */
  async function settings() {
    const r = await S.store.get('settings', 'main');
    const v = r.ok && r.value ? r.value : {};
    return { base: v.defaultCurrency || 'USD', locale: v.locale || 'en-US' };
  }

  /** Accounts sorted by code. Resolves to a Result. */
  async function accounts() {
    const r = await S.store.list('accounts');
    return r.ok ? { ok: true, value: r.value.slice().sort((a, b) => a.code.localeCompare(b.code)) } : r;
  }

  /** Money text in a currency, e.g. "$12.34" or "€500.00". */
  const money = (minor, cur, loc) => S.money.formatMinor(minor, cur, loc);

  /** Plain decimal text for CSV: 1234 USD -> "12.34" (SlopData.money.plainMinor). */
  const decimal = (minor, cur) => S.money.plainMinor(minor, cur);

  /** Text for a failed Result: the first message, which already names the problem. */
  const refusal = (r) => (r && r.message) || (g.SlopI18n ? g.SlopI18n.t('ledger.gen.nothing_saved') : 'ledger.gen.nothing_saved');

  NS.util = { today, isDate, settings, accounts, money, decimal, refusal, TYPE_SIDE: S.ledger.TYPE_SIDE };
})(typeof window !== 'undefined' ? window : globalThis);
