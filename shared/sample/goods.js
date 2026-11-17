/* SlopSample, goods: products and services with believable prices, quantities, document lines and dates. Pure; after
 * rng.js and the language files. Money is integer minor units, tax rates and discounts basis points (the store's shapes).
 * o: { locale, currency ('USD'; prices are scaled to it: SEK ×10, JPY ×100), digits (the currency's minor digits, 2) }.
 *   item(seed, o)          -> { name, unit, price, kind: 'product' | 'service' }
 *   lines(seed, o)         -> [{ description, qty, unitPrice, taxRate, discount? }]   o.count lines (1 to 5 by default)
 *   day(seed, from, to)    -> a 'YYYY-MM-DD' from from to to (inclusive)        addDays(iso, n), dayCount(from, to)
 *   scaleOf(currency, locale) -> how much a price in that currency is above one in USD or EUR */
(function (g) {
  'use strict';
  const NS = g.SlopSample;
  if (!NS || !NS.rng || NS.item) return;
  const R = (s) => (s && typeof s === 'object' && typeof s.next === 'function' ? s : NS.rng(s == null ? '' : s));
  const SCALE = { SEK: 10, NOK: 10, DKK: 7, JPY: 150, ISK: 140, INR: 80, CZK: 25, PLN: 4, HUF: 350, MXN: 18, ZAR: 18, CNY: 7, HKD: 8, BRL: 5 };
  const scaleOf = (currency, locale) => (currency ? SCALE[String(currency).toUpperCase()] || 1 : NS.locale(locale).priceScale || 1);

  /** A price in minor units from a span in major units: rounded the way price lists are (.50 steps, whole fives, tens). */
  function price(r, lo, hi, o) {
    const k = scaleOf(o && o.currency, o && o.locale), digits = o && o.digits != null ? o.digits : 2;
    const v = r.float(lo, hi) * k;
    const step = v >= 1000 ? 10 : v >= 100 ? 5 : v >= 20 ? 1 : 0.5;
    const major = Math.max(step, Math.round(v / step) * step);
    return Math.round(major * 10 ** digits);
  }
  function item(seed, o) {
    const r = R(seed), w = NS.locale(o && o.locale);
    const kind = o && o.kind ? o.kind : r.chance(0.5) ? 'service' : 'product';
    const [name, unit, lo, hi] = r.pick(kind === 'service' ? w.services : w.products);
    return { name, unit, price: price(r, lo, hi, o), kind };
  }
  /** How many of a thing: hours come by the dozen, a project once, goods by the handful. */
  function qty(r, unit) {
    if (/^(project|projekt|year|år)$/.test(unit)) return 1;
    if (/^(hour|tim)$/.test(unit)) return r.int(2, 40);
    if (/^(day|dag|month|mån)$/.test(unit)) return r.int(1, 12);
    return r.pick([1, 1, 2, 3, 4, 5, 6, 10, 12, 20, 24, 50]);
  }
  function lines(seed, o) {
    const r = R(seed), w = NS.locale(o && o.locale), n = (o && o.count) || r.int(1, 5), out = [], used = new Set();
    for (let i = 0; i < n; i++) {
      let it = item(r, o);
      for (let k = 0; k < 4 && used.has(it.name); k++) it = item(r, o);   // the same thing twice reads oddly
      used.add(it.name);
      const line = { description: it.name, qty: qty(r, it.unit), unitPrice: it.price, taxRate: r.pick(w.taxRates) };
      if (r.chance(0.15)) line.discount = r.pick([500, 1000, 1500]);
      out.push(line);
    }
    return out;
  }

  /* ---------- dates (UTC calendar arithmetic, no clock) ---------- */
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const addDays = (d, n) => iso(utc(d) + n * 86400000);
  const dayCount = (from, to) => Math.round((utc(to) - utc(from)) / 86400000);
  const day = (seed, from, to) => { const r = R(seed); return addDays(from, r.int(0, Math.max(0, dayCount(from, to)))); };

  Object.assign(NS, { item, lines, qty, price, day, addDays, dayCount, scaleOf });
})(typeof window !== 'undefined' ? window : globalThis);
