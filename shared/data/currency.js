// Currency and locale helpers: the ISO currency list, the browser's defaults, rate text parsing and
// date display. Only browserDefaults() reads the browser. Exposes window.SlopData.locale.
// Translations of the app text are not part of this module: locale only changes number, currency and date formats.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const RX_CUR = /^[A-Z]{3}$/;
  const FALLBACK = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'INR', 'CNY', 'KRW', 'BRL', 'MXN', 'SGD', 'HKD', 'ZAR'];
  // Region -> currency for the browser default. Regions not listed fall back to USD.
  const REGION = {
    US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
    PL: 'PLN', CZ: 'CZK', HU: 'HUF', IN: 'INR', CN: 'CNY', KR: 'KRW', BR: 'BRL', MX: 'MXN', SG: 'SGD', HK: 'HKD',
    ZA: 'ZAR', RU: 'RUB', TR: 'TRY', IL: 'ILS', AR: 'ARS', TH: 'THB', ID: 'IDR', PH: 'PHP', MY: 'MYR', NG: 'NGN',
    AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR', GR: 'EUR', HR: 'EUR',
    IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
  };
  const LOCALE_RX = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

  /** ISO 4217 codes from Intl when the browser has them, else a short list. */
  function currencies() {
    try { if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('currency'); } catch (e) { /* not supported: use the list */ }
    return FALLBACK.slice();
  }

  const isCurrency = (c) => typeof c === 'string' && RX_CUR.test(c);

  /** A language tag Intl accepts, or null. */
  function canonicalLocale(tag) {
    if (typeof tag !== 'string' || !LOCALE_RX.test(tag)) return null;
    try { return Intl.getCanonicalLocales(tag)[0] || null; } catch (e) { return null; }
  }

  /** The region of a tag ("en-GB" -> "GB"). Uses the likely-subtags data when Intl.Locale exists. */
  function regionOf(tag) {
    try { return new Intl.Locale(tag).maximize().region || ''; } catch (e) {
      const m = /-([A-Za-z]{2})(?:-|$)/.exec(tag || '');
      return m ? m[1].toUpperCase() : '';
    }
  }

  /** The browser's language tag, or en-US when it cannot be read. */
  function browserLocale() {
    const nav = g.navigator || {};
    const tag = nav.language || (Array.isArray(nav.languages) && nav.languages[0]) || '';
    return canonicalLocale(tag) || 'en-US';
  }

  /** Defaults for a new settings record: the browser's locale and the currency of its region (USD when unknown). */
  function browserDefaults() {
    const locale = browserLocale();
    return { locale, defaultCurrency: REGION[regionOf(locale)] || 'USD' };
  }

  /** Exchange rate text such as "1.0842" as an integer scaled by 1e6 (1084200). More than six decimals round
   *  half away from zero. Null when the text is not a plain positive decimal or the result is out of range. */
  function parseRate(text) {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(String(text ?? '').trim());
    if (!m) return null;
    const frac = m[2] || '';
    let v = BigInt(m[1] + frac.slice(0, 6).padEnd(6, '0'));
    if (frac.length > 6 && frac[6] >= '5') v += 1n;
    const n = Number(v);
    return v > 0n && Number.isSafeInteger(n) && n <= 1e12 ? n : null;
  }

  /** A stored YYYY-MM-DD date shown in the locale's format. Formatted in UTC so the day never shifts. */
  function formatDate(iso, locale) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const opts = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    try { return new Intl.DateTimeFormat(canonicalLocale(locale) || 'en-US', opts).format(d); } catch (e) { return new Intl.DateTimeFormat('en-US', opts).format(d); }
  }

  ns.locale = { currencies, isCurrency, canonicalLocale, browserLocale, browserDefaults, parseRate, formatDate, REGION };
})(typeof window !== 'undefined' ? window : globalThis);
