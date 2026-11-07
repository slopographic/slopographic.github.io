// Reading money and dates out of text people did not type for us: OCR lines of a receipt, cells of a bank statement CSV.
// Pure; works in the browser and in Node. Exposes SlopData.readText:
//   amountsIn(line)          every money amount on a line, as minor units (cents): 1,234.50  1.234,50  1 234,50  12.5;
//                            not percentages, not bare whole numbers (an order number)
//   amountOf(cell)           one signed amount from a cell: -1 234,50  (12.00)  12.00-  +5  1.234  €-3,20; null if none
//   dateIn(text, dayFirst)   the first date as YYYY-MM-DD: 2026-10-24, 24/10/2026 (10/24/2026 when dayFirst is false, or
//                            when the first number cannot be a month), 24.10.26, 20261024, 24 Oct 2026, Oct 24, 2026
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const pad = (n) => String(n).padStart(2, '0');

  function amountsIn(line) {
    const out = [];
    const rx = /(\d{1,3}(?:[ .,' ]\d{3})+|\d+)([.,]\d{1,2})(?!\d)(?!\s*%)/g;
    let m;
    while ((m = rx.exec(String(line)))) {
      const whole = m[1].replace(/[ .,' ]/g, ''), frac = m[2].slice(1).padEnd(2, '0');
      out.push(Number(whole) * 100 + Number(frac));
    }
    return out;
  }

  /** One signed amount. The decimal mark is the last of . and , when both are there; a lone mark followed by exactly three
   *  digits is a thousands mark (1.234 or 1,234), otherwise a decimal one. Negative: a minus in front or behind, or brackets. */
  function amountOf(cell) {
    let s = String(cell == null ? '' : cell).trim();
    if (!s) return null;
    const neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || /^[^\d]*-/.test(s) || /^−/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return null;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    let dec = -1;
    if (lastDot >= 0 && lastComma >= 0) dec = Math.max(lastDot, lastComma);
    else if (lastDot >= 0 || lastComma >= 0) {
      const at = Math.max(lastDot, lastComma);
      dec = s.length - at - 1 === 3 ? -1 : at;
    }
    const whole = (dec >= 0 ? s.slice(0, dec) : s).replace(/[.,]/g, ''), frac = dec >= 0 ? s.slice(dec + 1).replace(/[.,]/g, '') : '';
    if (frac.length > 2) return null;
    const v = Number(whole || '0') * 100 + Number((frac || '').padEnd(2, '0') || '0');
    if (!Number.isSafeInteger(v)) return null;
    return neg ? -v : v;
  }

  /** A real calendar day as YYYY-MM-DD, or null. */
  function day(y, mo, d) {
    if (y < 100) y += 2000;
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  function dateIn(text, dayFirst = true) {
    const s = String(text == null ? '' : text);
    let m = /\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/.exec(s);
    if (m) return day(+m[1], +m[2], +m[3]);
    m = /\b(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})\b/.exec(s);
    if (m) {
      const a = +m[1], b = +m[2], y = +m[3];
      const df = a > 12 ? true : b > 12 ? false : dayFirst;
      return df ? day(y, b, a) : day(y, a, b);
    }
    m = /\b(20\d{2})(\d{2})(\d{2})\b/.exec(s);
    if (m) return day(+m[1], +m[2], +m[3]);
    m = /\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})\b/i.exec(s);
    if (m && MONTHS.includes(m[2].toLowerCase())) return day(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
    m = /\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(s);
    if (m && MONTHS.includes(m[1].toLowerCase())) return day(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
    return null;
  }

  ns.readText = { amountsIn, amountOf, dateIn };
})(typeof window !== 'undefined' ? window : globalThis);
