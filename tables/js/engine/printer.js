/* Slop Tables engine: AST → formula text (A1 or R1C1), and reference shifting for copy/fill/move. */
import { mapAst } from './parser.js';
import { rangeText, colName, quoteSheet, r1c1Text, MAX_ROWS, MAX_COLS } from './refs.js';

const BIN = { '=': 10, '<>': 10, '<': 10, '>': 10, '<=': 10, '>=': 10, '&': 20, '+': 30, '-': 30, '*': 40, '/': 40, '^': 50 };

function numText(v) {
  if (Number.isInteger(v) && Math.abs(v) < 1e21) return String(v);
  const s = String(v);
  return s.replace('e+', 'E+').replace('e-', 'E-');
}
export function refText(n, opts = {}) {
  const sh = n.sheet ? quoteSheet(n.sheet) + '!' : '';
  if (n.t === 'refErr') return sh + '#REF!';
  if (opts.r1c1) {
    const b = opts.base || { r: 0, c: 0 };
    const a = r1c1Text(n.r1, n.c1, n.abs[0], n.abs[1], b.r, b.c);
    if (n.kind === 'cell') return sh + a;
    return sh + a + ':' + r1c1Text(n.r2, n.c2, n.abs[2], n.abs[3], b.r, b.c);
  }
  if (n.kind === 'cols') return sh + (n.abs[1] ? '$' : '') + colName(n.c1) + ':' + (n.abs[3] ? '$' : '') + colName(n.c2);
  if (n.kind === 'rows') return sh + (n.abs[0] ? '$' : '') + (n.r1 + 1) + ':' + (n.abs[2] ? '$' : '') + (n.r2 + 1);
  if (n.kind === 'cell') return sh + rangeText(n.r1, n.c1, n.r1, n.c1, n.abs);
  const d = (f) => (f ? '$' : '');
  return sh + d(n.abs[1]) + colName(n.c1) + d(n.abs[0]) + (n.r1 + 1) + ':' + d(n.abs[3]) + colName(n.c2) + d(n.abs[2]) + (n.r2 + 1);
}

/** Render an AST back to formula text (without the leading "="). */
export function print(n, opts = {}) {
  const P = (x) => print(x, opts);
  const sep = opts.sep || ',';
  switch (n.t) {
    case 'num': return numText(n.v);
    case 'str': return '"' + n.v.replace(/"/g, '""') + '"';
    case 'bool': return n.v ? 'TRUE' : 'FALSE';
    case 'err': return n.v;
    case 'empty': return '';
    case 'ref': case 'refErr': return refText(n, opts);
    case 'name': return n.name;
    case 'fn': return (opts.fnName ? opts.fnName(n.name) : n.name) + '(' + n.args.map(P).join(sep) + ')';
    case 'call': return P(n.callee) + '(' + n.args.map(P).join(sep) + ')';
    case 'paren': return '(' + P(n.e) + ')';
    case 'union': return '(' + n.items.map(P).join(sep) + ')';
    case 'un': return n.op + P(n.e);
    case 'at': return '@' + P(n.e);
    case 'pct': return P(n.e) + '%';
    case 'spill': return P(n.e) + '#';
    case 'range': return P(n.l) + ':' + P(n.r);
    case 'arr': return '{' + n.rows.map((r) => r.map(P).join(opts.arrCol || ',')).join(opts.arrRow || ';') + '}';
    case 'bin': {
      const bp = BIN[n.op];
      const wrap = (x, right) => {
        const s = P(x);
        if (x.t !== 'bin') return s;
        const xb = BIN[x.op];
        return xb < bp || (right && xb === bp) ? '(' + s + ')' : s;
      };
      return wrap(n.l, false) + n.op + wrap(n.r, true);
    }
  }
  return '';
}

/** Shift relative references by (dr, dc), e.g. when a formula is copied or filled. Out of grid → #REF!. */
export function shiftAst(ast, dr, dc) {
  return mapAst(ast, (n) => {
    if (n.t !== 'ref') return;
    const [ra1, ca1, ra2, ca2] = n.abs;
    if (n.kind !== 'cols') { if (!ra1) n.r1 += dr; if (!ra2) n.r2 += dr; }
    if (n.kind !== 'rows') { if (!ca1) n.c1 += dc; if (!ca2) n.c2 += dc; }
    if (n.r1 < 0 || n.c1 < 0 || n.r2 >= MAX_ROWS || n.c2 >= MAX_COLS || n.r2 < 0 || n.c2 < 0) return { t: 'err', v: '#REF!' };
  });
}

/** Adjust references for an inserted/deleted block of rows or columns on sheet `sheetName`.
    axis 'r'|'c', at = first index, count > 0 inserts, < 0 deletes. curSheet = name of the formula's sheet. */
export function adjustForStructure(ast, sheetName, curSheet, axis, at, count) {
  const lo = axis === 'r' ? 'r1' : 'c1', hi = axis === 'r' ? 'r2' : 'c2';
  const whole = axis === 'r' ? 'cols' : 'rows';
  return mapAst(ast, (n) => {
    if (n.t !== 'ref') return;
    const sh = n.sheet || curSheet;
    if (sh.toLowerCase() !== sheetName.toLowerCase() || n.kind === whole) return;
    if (count > 0) {
      if (n[lo] >= at) n[lo] += count;
      if (n[hi] >= at) n[hi] += count;
    } else {
      const d0 = at, d1 = at - count - 1;
      if (n[lo] >= d0 && n[hi] <= d1) return { t: 'err', v: '#REF!' };
      const f = (v, isHi) => (v > d1 ? v + count : v >= d0 ? (isHi ? d0 - 1 : d0) : v);
      n[lo] = f(n[lo], false); n[hi] = f(n[hi], true);
      if (n[hi] < n[lo]) return { t: 'err', v: '#REF!' };
    }
    const max = axis === 'r' ? MAX_ROWS : MAX_COLS;
    if (n[hi] >= max) n[hi] = max - 1;
    if (n[lo] >= max) return { t: 'err', v: '#REF!' };
  });
}
/** Rename sheet references. */
export function renameSheetAst(ast, from, to) {
  return mapAst(ast, (n) => { if (n.t === 'ref' && n.sheet && n.sheet.toLowerCase() === from.toLowerCase()) n.sheet = to; });
}
