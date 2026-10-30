/* Slop Tables engine: cell addressing. Rows/cols are 0-based internally; A1 = {r:0, c:0}. */
export const MAX_ROWS = 1048576, MAX_COLS = 16384;
export const key = (r, c) => r * MAX_COLS + c;
export const unkey = (k) => [Math.floor(k / MAX_COLS), k % MAX_COLS];

export function colName(c) {
  let s = ''; c += 1;
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; }
  return s;
}
export function colIndex(s) {
  let n = 0; s = s.toUpperCase();
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}
export const addr = (r, c) => colName(c) + (r + 1);

/** A rectangular reference on a sheet (sheet is a Sheet object while evaluating). */
export class Ref {
  constructor(sheet, r1, c1, r2 = r1, c2 = c1) {
    this.sheet = sheet;
    this.r1 = Math.min(r1, r2); this.r2 = Math.max(r1, r2);
    this.c1 = Math.min(c1, c2); this.c2 = Math.max(c1, c2);
  }
  get rows() { return this.r2 - this.r1 + 1; }
  get cols() { return this.c2 - this.c1 + 1; }
  get single() { return this.r1 === this.r2 && this.c1 === this.c2; }
  contains(r, c) { return r >= this.r1 && r <= this.r2 && c >= this.c1 && c <= this.c2; }
  toString() { return rangeText(this.r1, this.c1, this.r2, this.c2); }
}
/** A union of references, e.g. (A1:B2,D4). */
export class RefList { constructor(refs) { this.refs = refs; } }
export const isRef = (v) => v instanceof Ref || v instanceof RefList;

export function quoteSheet(name) {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) && !/^R\d*C\d*$/i.test(name) ? name : "'" + name.replace(/'/g, "''") + "'";
}
/** Text for a range: whole columns (A:C) and rows (1:3) are detected. */
export function rangeText(r1, c1, r2, c2, abs) {
  const a = abs || [0, 0, 0, 0];
  const d = (f) => (f ? '$' : '');
  if (r1 === 0 && r2 === MAX_ROWS - 1) return d(a[1]) + colName(c1) + ':' + d(a[3]) + colName(c2);
  if (c1 === 0 && c2 === MAX_COLS - 1) return d(a[0]) + (r1 + 1) + ':' + d(a[2]) + (r2 + 1);
  const p = d(a[1]) + colName(c1) + d(a[0]) + (r1 + 1);
  if (r1 === r2 && c1 === c2) return p;
  return p + ':' + d(a[3]) + colName(c2) + d(a[2]) + (r2 + 1);
}

const CELL = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})$/;
/** Parse "A1", "$B$2" → {r, c, ra, ca} or null. */
export function parseCell(s) {
  const m = CELL.exec(s.trim());
  if (!m) return null;
  const c = colIndex(m[2]), r = +m[4] - 1;
  if (c >= MAX_COLS || r < 0 || r >= MAX_ROWS) return null;
  return { r, c, ra: !!m[3], ca: !!m[1] };
}
/** Parse a range text like "Sheet 1!A1:B3", "A:A", "3:5", "B2" → {sheet, r1,c1,r2,c2} or null. */
export function parseRange(s) {
  s = s.trim();
  let sheet = null;
  const bang = s.lastIndexOf('!');
  if (bang >= 0) {
    sheet = s.slice(0, bang);
    if (sheet[0] === "'") sheet = sheet.slice(1, -1).replace(/''/g, "'");
    s = s.slice(bang + 1);
  }
  const parts = s.split(':');
  if (parts.length > 2) return null;
  if (parts.length === 1) { const p = parseCell(parts[0]); return p && { sheet, r1: p.r, c1: p.c, r2: p.r, c2: p.c }; }
  const [a, b] = parts.map((x) => x.replace(/\$/g, ''));
  if (/^[A-Za-z]{1,3}$/.test(a) && /^[A-Za-z]{1,3}$/.test(b)) return { sheet, r1: 0, c1: colIndex(a), r2: MAX_ROWS - 1, c2: colIndex(b) };
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return { sheet, r1: +a - 1, c1: 0, r2: +b - 1, c2: MAX_COLS - 1 };
  const p = parseCell(a), q = parseCell(b);
  if (!p || !q) return null;
  return { sheet, r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) };
}

/** R1C1 single component: "R[2]C[-1]", "R3C4", "RC" relative to (br, bc). */
const RC = /^R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?$/i;
export function parseR1C1(s, br, bc) {
  const m = RC.exec(s.trim());
  if (!m) return null;
  const part = (x, base) => (x === undefined ? [base, false] : x[0] === '[' ? [base + +x.slice(1, -1), false] : [+x - 1, true]);
  const [r, ra] = part(m[1], br), [c, ca] = part(m[2], bc);
  if (r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS) return null;
  return { r, c, ra, ca };
}
export function r1c1Text(r, c, ra, ca, br, bc) {
  const p = (v, abs, base, L) => (abs ? L + (v + 1) : v === base ? L : L + '[' + (v - base) + ']');
  return p(r, ra, br, 'R') + p(c, ca, bc, 'C');
}
