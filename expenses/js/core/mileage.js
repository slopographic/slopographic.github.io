// Slop Expenses: a mileage claim, the pure part. Distance at a rate per kilometre or mile is the amount to claim, recorded
// as an expense (no tax to reclaim). Exposes SlopExpenses.mileage = { amount, describe, parseDistance, typedNumber }.
// Needs shared/data/money.js (typed numbers); the Node tests load both.
(function (g) {
  'use strict';
  const NS = (g.SlopExpenses = g.SlopExpenses || {});
  /** A number typed in the page's language (or lang): "42.5", "42,5" in sv, "1,250" in en (SlopData.money.plainFromTyped
   *  rules: "42,5" in en is refused, not read as 425 or 42.5). NaN when it is not one. */
  const typedNumber = (text, lang) => Number(g.SlopData.money.plainFromTyped(text, lang) ?? NaN);
  /** A typed distance: 42 or 42.5 (42,5 in sv); null when it is not a positive number up to 100,000. One decimal kept. */
  function parseDistance(text, lang) {
    const v = typedNumber(text, lang);
    return Number.isFinite(v) && v > 0 && v <= 100000 ? Math.round(v * 10) / 10 : null;
  }
  /** The amount in minor units: distance × rate (rate in minor units per km or mile, may have a fraction), rounded. */
  const amount = (distance, rateMinor) => Math.round(distance * rateMinor);
  /** The expense's description: "Mileage: Leeds to York and back, 42 km at 0.45 (client visit)". */
  function describe({ from, to, distance, unit, rateText, purpose, roundTrip }) {
    const route = [from, to].filter(Boolean).join(' to ') + (roundTrip ? ' and back' : '');   // i18n-ignore: CSV columns and the claim text stored on the expense (records stay as written)
    return `Mileage: ${route ? route + ', ' : ''}${distance} ${unit} at ${rateText}${purpose ? ` (${purpose})` : ''}`.slice(0, 300);   // i18n-ignore: CSV columns and the claim text stored on the expense (records stay as written)
  }
  NS.mileage = { amount, describe, parseDistance, typedNumber };
})(typeof window !== 'undefined' ? window : globalThis);
