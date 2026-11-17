/* Slop Tables engine: formula tokenizer. Works on the text after the leading "=". */
import { parseCell, parseR1C1, colIndex, MAX_ROWS, MAX_COLS } from './refs.js';
import { ERR_CODES } from './values.js';

export class FormulaError extends Error { constructor(msg, pos) { super(msg); this.pos = pos; } }

const SHEET = /^(?:'((?:[^']|'')+)'|([A-Za-z_À-￿][\w.À-￿]*))!/;
const CELLR = /^\$?[A-Za-z]{1,3}\$?\d{1,7}/;
const COLS = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![\w(.])/;
const ROWS = /^(\$?)(\d{1,7}):(\$?)(\d{1,7})(?![\w(.])/;
const RC1 = /^R(?:\[-?\d+\]|\d+)?C(?:\[-?\d+\]|\d+)?/i;
const NUM = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT = /^[A-Za-z_\\À-￿][\w.À-￿]*/;
const ERRS = Object.keys(ERR_CODES).sort((a, b) => b.length - a.length);
const OPS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '&', '=', '<', '>', '%', '@', '#', ':'];

/** Tokenize. opts: {r1c1, base:{r,c}, sep: ',' (arg separator), dec: '.'}. Tokens: {t, v, pos, end}. */
export function tokenize(src, opts = {}) {
  const out = [], base = opts.base || { r: 0, c: 0 };
  let i = 0;
  const cellAt = (s) => {
    if (opts.r1c1) { const m = RC1.exec(s); if (m && !/^[\w(.]/.test(s.slice(m[0].length))) { const p = parseR1C1(m[0], base.r, base.c); return p && { len: m[0].length, ...p }; } return null; }
    const m = CELLR.exec(s);
    if (!m || /^[\w(.]/.test(s.slice(m[0].length))) return null;
    const p = parseCell(m[0]);
    return p && { len: m[0].length, ...p };
  };
  while (i < src.length) {
    const ch = src[i], rest = src.slice(i), start = i;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= src.length) throw new FormulaError('Unterminated text', i);
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
        s += src[j++];
      }
      out.push({ t: 'str', v: s, pos: start, end: j + 1 }); i = j + 1; continue;
    }
    if (ch === '#') {
      const e = ERRS.find((c) => rest.toUpperCase().startsWith(c));
      if (e) { out.push({ t: 'err', v: e, pos: start, end: i + e.length }); i += e.length; continue; }
    }
    // Reference, possibly sheet-qualified.
    let sheet = null, j = i;
    const sm = SHEET.exec(rest);
    if (sm) { sheet = sm[1] !== undefined ? sm[1].replace(/''/g, "'") : sm[2]; j = i + sm[0].length; }
    const r = src.slice(j);
    let m;
    if ((m = COLS.exec(r)) && !opts.r1c1) {
      out.push({ t: 'ref', sheet, r1: 0, c1: colIndex(m[2]), r2: MAX_ROWS - 1, c2: colIndex(m[4]), abs: [1, !!m[1], 1, !!m[3]], kind: 'cols', pos: start, end: j + m[0].length });
      i = j + m[0].length; continue;
    }
    if ((m = ROWS.exec(r)) && !opts.r1c1 && (sheet || !/^\d/.test(src.slice(j + m[0].length)))) {
      out.push({ t: 'ref', sheet, r1: +m[2] - 1, c1: 0, r2: +m[4] - 1, c2: MAX_COLS - 1, abs: [!!m[1], 1, !!m[3], 1], kind: 'rows', pos: start, end: j + m[0].length });
      i = j + m[0].length; continue;
    }
    const a = cellAt(r);
    if (a) {
      let k = j + a.len, tok = { t: 'ref', sheet, r1: a.r, c1: a.c, r2: a.r, c2: a.c, abs: [a.ra, a.ca, a.ra, a.ca], kind: 'cell', pos: start };
      if (src[k] === ':') {
        const b = cellAt(src.slice(k + 1));
        if (b) { k += 1 + b.len; Object.assign(tok, { r2: b.r, c2: b.c, kind: 'range' }); tok.abs = [a.ra, a.ca, b.ra, b.ca]; }
      }
      tok.end = k; out.push(tok); i = k; continue;
    }
    if (sheet) throw new FormulaError('Bad reference after sheet name', i);
    if ((m = NUM.exec(rest)) && (/\d/.test(ch) || ch === '.')) { out.push({ t: 'num', v: parseFloat(m[0]), pos: start, end: i + m[0].length }); i += m[0].length; continue; }
    if ((m = IDENT.exec(rest))) {
      const name = m[0], after = src.slice(i + name.length);
      const call = /^\s*\(/.test(after);
      if (!call && /^(TRUE|FALSE)$/i.test(name)) out.push({ t: 'bool', v: name.toUpperCase() === 'TRUE', pos: start, end: i + name.length });
      else out.push({ t: call ? 'fn' : 'name', v: name, pos: start, end: i + name.length });
      i += name.length; continue;
    }
    if (ch === '(' || ch === ')' || ch === '{' || ch === '}') { out.push({ t: ch, pos: start, end: i + 1 }); i++; continue; }
    if (ch === (opts.sep || ',')) { out.push({ t: ',', pos: start, end: i + 1 }); i++; continue; }
    if (ch === ';') { out.push({ t: ';', pos: start, end: i + 1 }); i++; continue; }
    if (ch === '\\' && opts.sep === ';') { out.push({ t: ',', pos: start, end: i + 1, col: true }); i++; continue; }
    const op = OPS.find((o) => rest.startsWith(o));
    if (op) { out.push({ t: 'op', v: op, pos: start, end: i + op.length }); i += op.length; continue; }
    throw new FormulaError('Unexpected character ' + ch, i);
  }
  return out;
}
