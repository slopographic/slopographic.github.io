/* Slopculator exact arithmetic: decimal text to a fraction (BigInt), conversion between units with no rounding,
 * and back to decimal text. An answer that terminates is shown exactly; one that does not is rounded to 12 places
 * and marked approximate. Temperatures are affine and go through kelvin. Pure. Classic script, loaded after lexer.js
 * and before units.js (units.js reads its factors through parseDecimal). Exposes window.SlopCalc.exact:
 *   parseDecimal(text)            → { n, d } exact fraction; throws Error "… is not a number." on bad text
 *   formatDecimal(r, places)      → { text, exact }
 *   convert(dim, from, to, text)  → { text, exact, value } where value is the exact fraction; throws Error on a bad unit
 */
(function (g) {
  'use strict';
  const ns = (g.SlopCalc = g.SlopCalc || {});
  /** A word from the shared tables (shared/i18n/ui/<code>/calc.js), the key without SlopI18n. */
  const say = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);

  const gcd = (a, b) => { if (a < 0n) a = -a; if (b < 0n) b = -b; while (b) [a, b] = [b, a % b]; return a; };
  const norm = (n, d) => {
    if (d === 0n) throw new RangeError('Division by zero');
    if (d < 0n) { n = -n; d = -d; }
    const k = gcd(n, d) || 1n;
    return { n: n / k, d: d / k };
  };
  const add = (a, b) => norm(a.n * b.d + b.n * a.d, a.d * b.d);
  const neg = (a) => ({ n: -a.n, d: a.d });
  const mul = (a, b) => norm(a.n * b.n, a.d * b.d);
  const div = (a, b) => norm(a.n * b.d, a.d * b.n);

  /** Parses "12", "-0.5", "1e3", "2.50". Throws on anything else. */
  function parseDecimal(text) {
    const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d{1,3}))?\s*$/.exec(String(text));
    if (!m || (!m[2] && !m[3])) throw new Error(say('ui.calc.nan_text', { text: String(text) }));
    const frac = m[3] || '';
    let n = BigInt((m[2] || '0') + frac);
    let d = 10n ** BigInt(frac.length);
    const e = m[4] ? Number(m[4]) : 0;
    if (e >= 0) n *= 10n ** BigInt(e); else d *= 10n ** BigInt(-e);
    if (m[1] === '-') n = -n;
    return norm(n, d);
  }

  /** Exact decimal text of a fraction. Terminating values are exact; others are rounded to `places`. */
  function formatDecimal(r, places = 12) {
    const exactLimit = 60;
    const a = r.n < 0n ? -r.n : r.n;
    const sign = r.n < 0n && a !== 0n ? '-' : '';
    const scale = (p) => {
      const q = 10n ** BigInt(p);
      return (2n * a * q + r.d) / (2n * r.d); // round half up
    };
    const exact = (a * 10n ** BigInt(exactLimit)) % r.d === 0n;
    const P = exact ? exactLimit : places;
    const digits = scale(P).toString().padStart(P + 1, '0');
    const ip = digits.slice(0, digits.length - P), fp = digits.slice(digits.length - P).replace(/0+$/, '');
    return { text: sign + ip + (fp ? '.' + fp : ''), exact };
  }

  const KELVIN_OFFSET = { n: 27315n, d: 100n };   // 273.15
  const RANKINE_OFFSET = { n: 45967n, d: 100n };  // 459.67
  // Each temperature unit: value → kelvin, and kelvin → value.
  const TEMP = {
    k: { toK: (v) => v, fromK: (k) => k },
    c: { toK: (v) => add(v, KELVIN_OFFSET), fromK: (k) => add(k, neg(KELVIN_OFFSET)) },
    f: { toK: (v) => mul(add(v, RANKINE_OFFSET), { n: 5n, d: 9n }), fromK: (k) => add(mul(k, { n: 9n, d: 5n }), neg(RANKINE_OFFSET)) },
  };

  /** Converts decimal text from one unit to another of the same dimension, exactly. */
  function convert(dim, from, to, text) {
    const v = parseDecimal(text);
    let r;
    if (dim === 'temp') {
      const f = TEMP[from], t = TEMP[to];
      if (!f || !t) throw new Error(say('ui.calc.bad_temp_unit'));
      r = t.fromK(f.toK(v));
    } else {
      const f = ns.units.rational(dim, from), t = ns.units.rational(dim, to);
      if (!f || !t) throw new Error(say('ui.calc.bad_unit'));
      r = div(mul(v, f), t);
    }
    return { ...formatDecimal(r), value: r };
  }

  ns.exact = Object.freeze({ parseDecimal, formatDecimal, convert });
})(typeof window !== 'undefined' ? window : globalThis);
