/* Slop Tables engine: value model. Cell values are number | string | boolean | null (blank) | FErr.
   Arrays are 2D JS arrays (rows of values). References are Ref objects (see refs.js). */

export class FErr {
  constructor(code, msg) { this.code = code; this.msg = msg || ''; }
  toString() { return this.code; }
}
const E = (c) => new FErr(c);
export const ERR = {
  DIV0: E('#DIV/0!'), NA: E('#N/A'), NAME: E('#NAME?'), VALUE: E('#VALUE!'), REF: E('#REF!'),
  NUM: E('#NUM!'), NULL: E('#NULL!'), CIRC: E('#CIRC!'), SPILL: E('#SPILL!'), CALC: E('#CALC!'),
};
export const ERR_CODES = Object.fromEntries(Object.values(ERR).map((e) => [e.code, e]));
export const isErr = (v) => v instanceof FErr;
export const errFrom = (code) => ERR_CODES[code.toUpperCase()] || null;
/** Excel ERROR.TYPE numbers. */
export const ERR_TYPE = { '#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4, '#NAME?': 5, '#NUM!': 6, '#N/A': 7, '#SPILL!': 9, '#CALC!': 14, '#CIRC!': 4 };

export const isArr = (v) => Array.isArray(v);
export const blank = (v) => v === null || v === undefined;

/** Throwable wrapper so deep helpers can bail out with an error value. */
export class Bail extends Error { constructor(e) { super(e.code); this.err = e; } }
export const bail = (e) => { throw new Bail(e); };

/** Parse a string the way Excel coerces text to number ("1,234.5", "50%", "$3", "1e3", dates/times). */
export function parseNumber(s, opts) {
  if (typeof s !== 'string') return null;
  let t = s.trim();
  if (!t) return null;
  const dec = (opts && opts.decimal) || '.', grp = (opts && opts.group) || ',';
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
  if (t[0] === '-' || t[0] === '+') { neg = neg !== (t[0] === '-'); t = t.slice(1).trim(); }
  t = t.replace(/^[$€£¥]\s*/, '').replace(/\s*[$€£¥]$/, '');
  if (t[0] === '-') { neg = !neg; t = t.slice(1); }
  let pct = 0;
  while (t.endsWith('%')) { pct++; t = t.slice(0, -1).trim(); }
  if (grp && t.includes(grp)) {
    const re = new RegExp('^\\d{1,3}(' + esc(grp) + '\\d{3})+(' + esc(dec) + '\\d*)?$');
    if (!re.test(t)) return null;
    t = t.split(grp).join('');
  }
  if (dec !== '.') t = t.replace(dec, '.');
  if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  let n = parseFloat(t);
  if (neg) n = -n;
  while (pct--) n /= 100;
  return n;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Excel-style text rendering of a raw value (no number format): 15 significant digits. */
export function numToText(n) {
  if (!isFinite(n)) return '#NUM!';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  let s = String(+n.toPrecision(15));
  if (/e/.test(s)) {
    const a = Math.abs(n);
    if (a >= 1e-9 && a < 1e21) s = n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
    if (s.length > 20 || /e/.test(s)) {
      const [m, x] = n.toExponential(14).split('e');
      s = (+m).toString() + 'E' + (x[0] === '-' ? '-' : '+') + x.replace(/^[+-]/, '').padStart(2, '0');
    }
  }
  return s;
}
export function toText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return numToText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof FErr) return v.code;
  return String(v);
}

/** Rounds away binary noise like Excel does when comparing/displaying (15 significant digits). */
export const fix15 = (n) => (n === 0 || !isFinite(n) ? n : +n.toPrecision(15));

/** Excel comparison order: numbers < text < booleans; text case-insensitive. Returns -1/0/1. */
export function compare(a, b) {
  if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ta = typeRank(a), tb = typeRank(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (ta === 1) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  if (ta === 0) { const x = fix15(a), y = fix15(b); return x < y ? -1 : x > y ? 1 : 0; }
  return a === b ? 0 : a ? 1 : -1;
}
const typeRank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);

/** Map a 2D array through fn. */
export const map2 = (a, fn) => a.map((row, r) => row.map((v, c) => fn(v, r, c)));
export const dims = (a) => [a.length, a.length ? a[0].length : 0];
export function fill2(rows, cols, v) { const o = []; for (let r = 0; r < rows; r++) o.push(new Array(cols).fill(v)); return o; }
