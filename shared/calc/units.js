/* Slopculator units: the one unit table, used by the expression language (evaluate.js, parser.js) and by the Convert
 * panel (convert.js). Classic script, loaded after exact.js. Exposes window.SlopCalc.units:
 *   lookup(word)                  → { dim, unit, label } for a unit word (case-insensitive), or null
 *   isCurrency(code)              → true for an ISO 4217 code known to the browser
 *   rational(dim, unit)           → the exact factor { n, d } to the dimension's base unit, or null (temperature)
 *   toBase(dim, unit, v)          → v in the base unit of the dimension (m, kg, L, min, days, B)
 *   convertFactor(dim, from, to)  → multiply by this to go from one unit to another (same dimension, not temperature)
 *   convertTemp(v, from, to)      → temperature conversion between 'c', 'f', 'k' (exact, then a number)
 *   categories()                  → [{ key, label, units: [{ key, label }] }] for the Convert panel
 *   CALENDAR_DAYS                 → days in a month and a year on average, used to compare calendar units
 * Factors are exact: a decimal such as '0.0254', or a fraction such as '1/60' (one second is 1/60 minute).
 * Base units: length m, mass kg, volume L, time min, calendar days, data B. Currency is not in the table: it is
 * converted with a rate the caller supplies (see evaluate.js). Temperature is affine: see exact.js. */
(function (g) {
  'use strict';
  const ns = (g.SlopCalc = g.SlopCalc || {});
  /** A word from the shared tables (shared/i18n/ui/<code>/calc.js), the key without SlopI18n. */
  const say = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  const CALENDAR_DAYS = Object.freeze({ days: 1, weeks: 7, months: 30.436875, years: 365.2425 });

  // [dim, unit, exact factor to the base (null for temperature), label, aliases…]
  const ROWS = [
    ['length', 'mm', '0.001', 'mm', 'millimetre', 'millimetres', 'millimeter', 'millimeters'],
    ['length', 'cm', '0.01', 'cm', 'centimetre', 'centimetres', 'centimeter', 'centimeters'],
    ['length', 'm', '1', 'm', 'metre', 'metres', 'meter', 'meters'],
    ['length', 'km', '1000', 'km', 'kilometre', 'kilometres', 'kilometer', 'kilometers'],
    ['length', 'in', '0.0254', 'in', 'inch', 'inches'],
    ['length', 'ft', '0.3048', 'ft', 'foot', 'feet'],
    ['length', 'yd', '0.9144', 'yd', 'yard', 'yards'],
    ['length', 'mi', '1609.344', 'mi', 'mile', 'miles'],
    ['length', 'nmi', '1852', 'nmi', 'nautical mile'],
    ['mass', 'mg', '0.000001', 'mg', 'milligram', 'milligrams'],
    ['mass', 'g', '0.001', 'g', 'gram', 'grams', 'gramme', 'grammes'],
    ['mass', 'kg', '1', 'kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
    ['mass', 't', '1000', 't', 'tonne', 'tonnes', 'metric ton'],
    ['mass', 'oz', '0.028349523125', 'oz', 'ounce', 'ounces'],
    ['mass', 'lb', '0.45359237', 'lb', 'lbs', 'pound', 'pounds'],
    ['mass', 'st', '6.35029318', 'st', 'stone', 'stones'],
    ['mass', 'ton', '907.18474', 'US ton', 'short ton'],
    ['volume', 'ml', '0.001', 'ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
    ['volume', 'cl', '0.01', 'cl', 'centilitre', 'centiliter'],
    ['volume', 'L', '1', 'L', 'l', 'litre', 'litres', 'liter', 'liters'],
    ['volume', 'tsp', '0.00492892159375', 'tsp', 'teaspoon', 'teaspoons'],
    ['volume', 'tbsp', '0.01478676478125', 'tbsp', 'tablespoon', 'tablespoons'],
    ['volume', 'cup', '0.2365882365', 'cup', 'cups'],
    ['volume', 'floz', '0.0295735295625', 'fl oz', 'fluidounce', 'fluidounces'],
    ['volume', 'pt', '0.473176473', 'pt', 'pint', 'pints'],
    ['volume', 'qt', '0.946352946', 'qt', 'quart', 'quarts'],
    ['volume', 'gal', '3.785411784', 'gal', 'gallon', 'gallons'],
    ['time', 'ms', '1/60000', 'ms', 'millisecond', 'milliseconds'],
    ['time', 's', '1/60', 's', 'sec', 'secs', 'second', 'seconds'],
    ['time', 'min', '1', 'min', 'mins', 'minute', 'minutes'],
    ['time', 'h', '60', 'h', 'hr', 'hrs', 'hour', 'hours'],
    ['calendar', 'days', '1', 'days', 'day'],
    ['calendar', 'weeks', '7', 'weeks', 'week'],
    ['calendar', 'months', String(CALENDAR_DAYS.months), 'months', 'month'],
    ['calendar', 'years', String(CALENDAR_DAYS.years), 'years', 'year'],
    ['data', 'B', '1', 'B', 'byte', 'bytes'],
    ['data', 'KB', '1000', 'KB', 'kilobyte', 'kilobytes'],
    ['data', 'MB', '1000000', 'MB', 'megabyte', 'megabytes'],
    ['data', 'GB', '1000000000', 'GB', 'gigabyte', 'gigabytes'],
    ['data', 'TB', '1000000000000', 'TB', 'terabyte', 'terabytes'],
    ['data', 'PB', '1000000000000000', 'PB', 'petabyte', 'petabytes'],
    ['data', 'KiB', '1024', 'KiB', 'kibibyte', 'kibibytes'],
    ['data', 'MiB', '1048576', 'MiB', 'mebibyte', 'mebibytes'],
    ['data', 'GiB', '1073741824', 'GiB', 'gibibyte', 'gibibytes'],
    ['data', 'TiB', '1099511627776', 'TiB', 'tebibyte', 'tebibytes'],
    ['temp', 'c', null, '°C', 'celsius'],
    ['temp', 'f', null, '°F', 'fahrenheit'],
    ['temp', 'k', null, 'K', 'kelvin'],
  ];
  const CATEGORIES = ['length', 'mass', 'volume', 'time', 'calendar', 'data', 'temp'];   // labels: ui.calc.cat_<key>

  /** '0.0254' or '1/60' → exact fraction { n, d } (not reduced; exact.js reduces every result). */
  function parseFactor(text) {
    const [p, q = '1'] = text.split('/');
    const a = ns.exact.parseDecimal(p), b = ns.exact.parseDecimal(q);
    return { n: a.n * b.d, d: a.d * b.n };
  }
  const BY_NAME = new Map();
  const RATIONAL = new Map(); // dim|unit → { n, d }
  for (const [dim, unit, f, label, ...names] of ROWS) {
    const entry = Object.freeze({ dim, unit, label });
    for (const n of [unit, ...names]) BY_NAME.set(n.toLowerCase(), entry);
    if (f !== null) RATIONAL.set(dim + '|' + unit, parseFactor(f));
  }

  // ISO currency codes. Intl knows the list in every browser and in Node 18+; a short list is the fallback.
  const FALLBACK_CODES = 'USD EUR GBP JPY CHF CAD AUD NZD SEK NOK DKK PLN CZK HUF RON BGN HRK ISK TRY CNY HKD SGD KRW INR BRL MXN ZAR AED SAR ILS THB'.split(' ');
  let codes = null;
  function currencyCodes() {
    if (codes) return codes;
    let list = [];
    try { list = Intl.supportedValuesOf ? Intl.supportedValuesOf('currency') : []; } catch (e) { list = []; }
    codes = new Set((list.length ? list : FALLBACK_CODES).map((c) => c.toUpperCase()));
    return codes;
  }

  /** The unit a word stands for. Table words win over currency codes, so 'm' is metres, never a currency. */
  function lookup(word) {
    const w = String(word || '').toLowerCase();
    if (!w) return null;
    const hit = BY_NAME.get(w);
    if (hit) return hit;
    if (/^[a-z]{3}$/.test(w) && currencyCodes().has(w.toUpperCase())) return { dim: 'currency', unit: w.toUpperCase(), label: w.toUpperCase() };
    return null;
  }
  const isCurrency = (code) => currencyCodes().has(String(code || '').toUpperCase());

  const rational = (dim, unit) => RATIONAL.get(dim + '|' + unit) || null;
  function factorOf(dim, unit) {
    const f = rational(dim, unit);
    if (!f) throw new Error(`no factor for ${dim} ${unit}`);
    return Number(f.n) / Number(f.d);
  }
  const toBase = (dim, unit, v) => v * factorOf(dim, unit);
  const convertFactor = (dim, from, to) => factorOf(dim, from) / factorOf(dim, to);

  /** Temperature, through the exact converter, as a number for the evaluator. */
  const convertTemp = (v, from, to) => Number(ns.exact.convert('temp', from, to, String(v)).text);

  /** Categories for the Convert panel: every unit of a dimension, in table order. The label is in the chosen language. */
  function categories() {
    return CATEGORIES.map((key) => ({
      key, label: say('ui.calc.cat_' + key), units: ROWS.filter((r) => r[0] === key).map((r) => ({ key: r[1], label: r[3] })),
    }));
  }

  ns.units = Object.freeze({ lookup, isCurrency, currencyCodes, rational, toBase, convertFactor, convertTemp, categories, CALENDAR_DAYS });
})(typeof window !== 'undefined' ? window : globalThis);
