/* Slopculator display: a value → text. Pure, classic script. Exposes window.SlopCalc.format(value) and fmtNumber(n).
 * Numbers use en-US separators and at most 10 decimals after 12 significant digits, so 0.1 + 0.2 shows 0.3.
 * Durations read "2 h 45 min", dates "Sat 2026-01-31", times "09:30", currency "90.00 EUR". */
(function (g) {
  'use strict';
  const ns = (g.SlopCalc = g.SlopCalc || {});
  /** A word from the shared tables (shared/i18n/ui/<code>/calc.js), the key without SlopI18n. */
  const say = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  const { units, dates } = ns;
  const LOCALE = 'en-US';

  function fmtNumber(x) {
    if (!Number.isFinite(x)) return say('ui.calc.nan');
    let r = Number(x.toPrecision(12));
    if (r === 0) r = 0; // no −0
    return r.toLocaleString(LOCALE, { maximumFractionDigits: 10 });
  }
  const fmtMoney = (x) => x.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad2 = (n) => String(n).padStart(2, '0');

  function fmtDuration(minutes) {
    const sign = minutes < 0 ? '-' : '';
    const total = Math.abs(minutes);
    const h = Math.floor(total / 60);
    const rest = Math.round((total - h * 60) * 1e6) / 1e6;
    const parts = [];
    if (h) parts.push(`${h} h`);
    if (rest || !h) parts.push(`${fmtNumber(rest)} min`);
    return sign + parts.join(' ');
  }

  function fmtQuantity(q) {
    if (q.dim === 'time' && (q.unit === 'min' || q.unit === 'h')) return fmtDuration(units.toBase('time', q.unit, q.v));
    if (q.dim === 'currency') return `${fmtMoney(q.v)} ${q.unit}`;
    const label = (units.lookup(q.unit) || { label: q.unit }).label;
    if (q.dim === 'calendar') {
      const word = Math.abs(q.v) === 1 ? label.replace(/s$/, '') : label;
      return `${fmtNumber(q.v)} ${word}`;
    }
    if (q.dim === 'temp') return q.unit === 'k' ? `${fmtNumber(q.v)} K` : `${fmtNumber(q.v)}${label}`;
    return `${fmtNumber(q.v)} ${label}`;
  }

  function format(v) {
    switch (v.t) {
      case 'n': return fmtNumber(v.v);
      case 'pct': return `${fmtNumber(v.v * 100)}%`;
      case 'q': return fmtQuantity(v);
      case 'd': return `${dates.weekday(v.iso)} ${v.iso}`;
      case 'tod': return `${pad2(Math.floor(v.min / 60))}:${pad2(Math.round(v.min % 60))}`;
      default: return '';
    }
  }

  ns.format = format;
  ns.fmtNumber = fmtNumber;
})(typeof window !== 'undefined' ? window : globalThis);
