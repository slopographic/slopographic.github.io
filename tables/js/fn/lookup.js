/* Slop Tables functions: lookup and reference. */
import { def } from './registry.js';
import { num, int, str, bool, opt, check, ERR, bail, flat, matrix, isErr, compare, wildRe, fix15, Ref, RefList } from './helpers.js';
import { parseRange, parseR1C1, rangeText, quoteSheet, MAX_ROWS, MAX_COLS } from '../engine/refs.js';
const L = { cat: 'Lookup' };
const sameType = (a, b) => typeof a === typeof b || (a === null && typeof b === 'number');

/** Exact match position in a 1D list (wildcards for text when wild). -1 if none. */
export function exactIdx(list, key, wild, rev) {
  const re = wild && typeof key === 'string' && /[*?~]/.test(key) ? wildRe(key) : null;
  const n = list.length;
  for (let k = 0; k < n; k++) {
    const i = rev ? n - 1 - k : k, v = list[i];
    if (re) { if (typeof v === 'string' && re.test(v)) return i; continue; }
    if (v === null || v === undefined) { if (key === '' || key === null) continue; continue; }
    if (typeof v === typeof key && compare(v, key) === 0) return i;
  }
  return -1;
}
/** Approximate match in ascending data: last index with value <= key (same type). */
export function approxIdx(list, key, desc) {
  let lo = 0, hi = list.length - 1, best = -1;
  // binary search like Excel (skips blanks/other types by scanning to a same-typed neighbour)
  while (lo <= hi) {
    let mid = (lo + hi) >> 1, m = mid;
    while (m <= hi && !sameType(list[m], key)) m++;
    if (m > hi) { hi = mid - 1; continue; }
    const k = compare(list[m], key);
    if (desc ? k >= 0 : k <= 0) { best = m; lo = m + 1; } else hi = mid - 1;
  }
  return best;
}
const keyOf = (c, v) => { v = c.scalar(v); if (isErr(v)) bail(v); return v === null ? 0 : v; };

def('VLOOKUP', (c, key, tbl, col, approx) => {
  key = keyOf(c, key); const m = matrix(c, tbl); col = int(col);
  if (col < 1) bail(ERR.VALUE); if (col > m[0].length) bail(ERR.REF);
  const first = m.map((r) => r[0]);
  const i = bool(opt(approx, true)) ? approxIdx(first, key) : exactIdx(first, key, true);
  if (i < 0) bail(ERR.NA);
  return m[i][col - 1];
}, { min: 3, max: 4, sc: [0], help: 'key, table, column, [approximate]|Look up in the first column', ...L });
def('HLOOKUP', (c, key, tbl, row, approx) => {
  key = keyOf(c, key); const m = matrix(c, tbl); row = int(row);
  if (row < 1) bail(ERR.VALUE); if (row > m.length) bail(ERR.REF);
  const i = bool(opt(approx, true)) ? approxIdx(m[0], key) : exactIdx(m[0], key, true);
  if (i < 0) bail(ERR.NA);
  return m[row - 1][i];
}, { min: 3, max: 4, sc: [0], help: 'key, table, row, [approximate]|Look up in the first row', ...L });
def('LOOKUP', (c, key, a, b) => {
  key = keyOf(c, key); const m = matrix(c, a);
  const vec = m.length >= m[0].length ? m.map((r) => r[0]) : m[0];
  const i = approxIdx(m.length === 1 || m[0].length === 1 ? flat(c, a) : vec, key);
  if (i < 0) bail(ERR.NA);
  if (b === undefined) return m.length >= m[0].length ? m[i][m[0].length - 1] : m[m.length - 1][i];
  const r = flat(c, b); return i < r.length ? r[i] : ERR.NA;
}, { min: 2, max: 3, sc: [0], ...L });
def('MATCH', (c, key, a, t) => {
  key = keyOf(c, key); const list = flat(c, a); t = int(opt(t, 1));
  const m = matrix(c, a); if (m.length > 1 && m[0].length > 1) bail(ERR.NA);
  const i = t === 0 ? exactIdx(list, key, true) : approxIdx(list, key, t < 0);
  if (i < 0) bail(ERR.NA);
  return i + 1;
}, { min: 2, max: 3, sc: [0], help: 'key, range, [type]|Position of a value (0 = exact)', ...L });
function xfind(list, key, mode, search) {
  mode = mode || 0; search = search || 1;
  if (Math.abs(search) === 2) { const i = approxIdx(list, key, search < 0); if (i >= 0 && compare(list[i], key) === 0) return i; if (mode === 0) return -1; if (mode === -1) return search > 0 ? i : (i + 1 < list.length ? i + 1 : -1); return search > 0 ? (i + 1 < list.length ? i + 1 : -1) : i; }
  const rev = search < 0;
  const e = exactIdx(list, key, mode === 2, rev);
  if (e >= 0 || mode === 0 || mode === 2) return e;
  let best = -1;
  for (let k = 0; k < list.length; k++) {
    const i = rev ? list.length - 1 - k : k, v = list[i];
    if (!sameType(v, key) || v === null) continue;
    const d = compare(v, key);
    if (mode === -1 && d < 0 && (best < 0 || compare(v, list[best]) > 0)) best = i;
    if (mode === 1 && d > 0 && (best < 0 || compare(v, list[best]) < 0)) best = i;
  }
  return best;
}
def('XMATCH', (c, key, a, mode, search) => {
  key = keyOf(c, key); const i = xfind(flat(c, a), key, int(opt(mode, 0)), int(opt(search, 1)));
  if (i < 0) bail(ERR.NA); return i + 1;
}, { min: 2, max: 4, sc: [0], help: 'key, array, [match_mode], [search_mode]|Position of a value', ...L });
def('XLOOKUP', (c, key, la, ra, nf, mode, search) => {
  key = keyOf(c, key);
  const lm = matrix(c, la), vertical = lm[0].length === 1;
  if (lm.length > 1 && lm[0].length > 1) bail(ERR.VALUE);
  const i = xfind(flat(c, la), key, int(opt(mode, 0)), int(opt(search, 1)));
  if (i < 0) return nf === undefined ? ERR.NA : nf;
  if (ra instanceof Ref) return vertical ? new Ref(ra.sheet, ra.r1 + i, ra.c1, ra.r1 + i, ra.c2) : new Ref(ra.sheet, ra.r1, ra.c1 + i, ra.r2, ra.c1 + i);
  const rm = matrix(c, ra);
  return vertical ? [rm[i]] : rm.map((r) => [r[i]]);
}, { min: 3, max: 6, help: 'key, lookup_array, return_array, [if_not_found], [match_mode], [search_mode]|Modern lookup', ...L });
def('INDEX', (c, a, r, k, area) => {
  if (a instanceof RefList) { const n = int(opt(area, 1)); if (n < 1 || n > a.refs.length) bail(ERR.REF); a = a.refs[n - 1]; }
  r = int(opt(r, 0)); k = int(opt(k, 0));
  if (r < 0 || k < 0) bail(ERR.VALUE);
  if (a instanceof Ref) {
    const R = a.rows, C = a.cols;
    if (R === 1 && k === 0 && r > 0 && C > 1) { k = r; r = 1; }
    if (r > R || k > C) bail(ERR.REF);
    const r1 = r ? a.r1 + r - 1 : a.r1, r2 = r ? r1 : a.r2, c1 = k ? a.c1 + k - 1 : a.c1, c2 = k ? c1 : a.c2;
    return new Ref(a.sheet, r1, c1, r2, c2);
  }
  const m = matrix(c, a);
  if (m.length === 1 && k === 0 && r > 0) { k = r; r = 1; }
  if (r > m.length || k > m[0].length) bail(ERR.REF);
  if (r && k) return m[r - 1][k - 1];
  if (r) return [m[r - 1]];
  if (k) return m.map((row) => [row[k - 1]]);
  return m;
}, { min: 1, max: 4, help: 'range, row, [column]|Value at a position', ...L });
def('CHOOSE', (c, i, ...a) => {
  const pick = (n) => { n = Math.floor(num(n)); if (n < 1 || n > a.length) bail(ERR.VALUE); return a[n - 1]; };
  const iv = c.deref(i);
  if (Array.isArray(iv)) return iv.map((row) => row.map((n) => { const v = c.deref(pick(n)); return Array.isArray(v) ? v[0][0] : v; }));
  return pick(iv);
}, { min: 2, help: 'index, value1, value2, …|Pick the n-th value', ...L });
def('OFFSET', (c, ref, dr, dc, h, w) => {
  if (!(ref instanceof Ref)) bail(ERR.VALUE);
  dr = int(dr); dc = int(dc); h = h === undefined || h === null ? ref.rows : int(h); w = w === undefined || w === null ? ref.cols : int(w);
  if (h === 0 || w === 0) bail(ERR.REF);
  const r1 = ref.r1 + dr, c1 = ref.c1 + dc, r2 = r1 + h - (h > 0 ? 1 : -1), c2 = c1 + w - (w > 0 ? 1 : -1);
  if (Math.min(r1, r2) < 0 || Math.min(c1, c2) < 0 || Math.max(r1, r2) >= MAX_ROWS || Math.max(c1, c2) >= MAX_COLS) bail(ERR.REF);
  return new Ref(ref.sheet, r1, c1, r2, c2);
}, { min: 3, max: 5, vol: true, help: 'ref, rows, cols, [height], [width]|A shifted reference', ...L });
def('INDIRECT', (c, t, a1) => {
  t = str(c.scalar(t)).trim(); const isA1 = bool(opt(a1, true));
  let sheet = c.sheet, txt = t;
  const bang = t.lastIndexOf('!');
  if (bang >= 0) { let sn = t.slice(0, bang); if (sn[0] === "'") sn = sn.slice(1, -1).replace(/''/g, "'"); sheet = c.wb.sheetByName(sn); if (!sheet) bail(ERR.REF); txt = t.slice(bang + 1); }
  if (!isA1) {
    const [p, q] = txt.split(':').map((x) => parseR1C1(x, c.r, c.c));
    if (!p) bail(ERR.REF); const e = q || p; return new Ref(sheet, p.r, p.c, e.r, e.c);
  }
  const g = parseRange(txt);
  if (!g) { const def2 = c.wb.nameDef(txt.toUpperCase(), c.sheet); if (def2) { const v = c.ev(def2.ast); if (v instanceof Ref) return v; } bail(ERR.REF); }
  return new Ref(sheet, g.r1, g.c1, g.r2, g.c2);
}, { min: 1, max: 2, vol: true, help: 'ref_text, [a1]|Reference from text', ...L });
def('ADDRESS', (c, r, k, abs, a1, sh) => {
  r = int(r); k = int(k); abs = int(opt(abs, 1)); const isA1 = bool(opt(a1, true));
  check(r >= 1 && k >= 1 && r <= MAX_ROWS && k <= MAX_COLS, ERR.VALUE);
  const ra = abs === 1 || abs === 2, ca = abs === 1 || abs === 3;
  const s = isA1 ? rangeText(r - 1, k - 1, r - 1, k - 1, [ra, ca, ra, ca]) : (ra ? 'R' + r : 'R[' + r + ']') + (ca ? 'C' + k : 'C[' + k + ']');
  return (sh !== undefined && sh !== null ? quoteSheet(str(sh)) + '!' : '') + s;
}, { min: 2, max: 5, sc: true, ...L });
def('AREAS', (c, r) => (r instanceof RefList ? r.refs.length : r instanceof Ref ? 1 : bail(ERR.VALUE)), { min: 1, max: 1, ...L });
def('ROW', (c, r) => { if (r === undefined || r === null) return c.r + 1; if (!(r instanceof Ref)) bail(ERR.VALUE); if (r.rows === 1) return r.r1 + 1; return Array.from({ length: r.rows }, (_, i) => [r.r1 + i + 1]); }, { max: 1, help: '[ref]|Row number', ...L });
def('COLUMN', (c, r) => { if (r === undefined || r === null) return c.c + 1; if (!(r instanceof Ref)) bail(ERR.VALUE); if (r.cols === 1) return r.c1 + 1; return [Array.from({ length: r.cols }, (_, i) => r.c1 + i + 1)]; }, { max: 1, help: '[ref]|Column number', ...L });
def('ROWS', (c, r) => (r instanceof Ref ? r.rows : matrix(c, r).length), { min: 1, max: 1, help: 'range|Number of rows', ...L });
def('COLUMNS', (c, r) => (r instanceof Ref ? r.cols : matrix(c, r)[0].length), { min: 1, max: 1, help: 'range|Number of columns', ...L });
def('FORMULATEXT', (c, r) => { if (!(r instanceof Ref)) bail(ERR.NA); const cell = r.sheet.get(r.r1, r.c1); if (!cell || !cell.f) bail(ERR.NA); return '=' + cell.f; }, { min: 1, max: 1, ...L });
export { fix15 };
