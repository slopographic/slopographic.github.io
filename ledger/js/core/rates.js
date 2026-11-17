// Exchange rates for the ledger. A row says 1 unit of a foreign currency = rate / 1e6 units of the base currency,
// on a date (the shared fx module stores it; rows are never edited). Online ECB rates are opt-in: the 'rates'
// consent category must be on, and the request itself is made by SlopData.rates (rates-ecb.js), not by this app.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const { fail } = S.result;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Adds a manual row from typed text: foreign currency, rate text such as "1.0842" (base per 1 foreign; in the page's language), date, note. */
  async function addManual({ foreign, base, rateText, date, note }) {
    const f = String(foreign || '').trim().toUpperCase();
    if (!S.locale.isCurrency(f)) return fail('invalid', t('ledger.rt.e_foreign'));
    if (f === base) return fail('invalid', t('ledger.rt.e_base', { cur: base }));
    if (!NS.util.isDate(date)) return fail('invalid', t('ledger.rt.e_date'));
    const rate = S.locale.parseRate(S.money.plainFromTyped(rateText) ?? '');   // typed in the page's language ("1,0842" in sv)
    if (rate === null) return fail('invalid', t('ledger.rt.e_rate'));
    return S.fx.addRate({ base: f, quote: base, date, rate, source: 'manual', note: String(note || '').trim() || undefined });
  }

  /** Rows, newest date first. */
  async function list() {
    const r = await S.store.list('exchangeRates');
    return r.ok ? { ok: true, value: r.value.slice().sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1)) } : r;
  }

  /** Whether the visitor has allowed the 'rates' category (missing record means no). */
  function onlineAllowed() {
    try { return !!(g.SlopConsentState && g.SlopConsentState.current().rates); } catch (e) { return false; }
  }

  /** Turns the 'rates' category on or off, keeping the other categories as they are. */
  function setOnline(on) {
    const cur = g.SlopConsentState ? g.SlopConsentState.current() : {};
    return g.SlopConsentState ? g.SlopConsentState.write({ analytics: !!cur.analytics, ads: !!cur.ads, rates: !!on }) : null;
  }

  /** Asks the ECB for today's reference rates (only when allowed). Stores nothing when the download fails. */
  async function updateOnline() {
    if (!onlineAllowed()) return fail('consent_off', t('ledger.rt.e_online'));
    return S.rates.updateRates({});
  }

  NS.rates = { addManual, list, onlineAllowed, setOnline, updateOnline };
})(typeof window !== 'undefined' ? window : globalThis);
