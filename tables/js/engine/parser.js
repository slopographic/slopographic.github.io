/* Slop Tables engine: Pratt parser → AST.
   Nodes: num str bool err | ref {sheet,r1,c1,r2,c2,abs,kind} | name | fn {name,args} | call {callee,args}
          bin {op,l,r} | un {op,e} | pct {e} | paren {e} | arr {rows} | spill {e} | at {e} | union {items} | empty */
import { tokenize, FormulaError } from './lexer.js';

const BIN = { '=': 10, '<>': 10, '<': 10, '>': 10, '<=': 10, '>=': 10, '&': 20, '+': 30, '-': 30, '*': 40, '/': 40, '^': 50, ':': 80 };
const PREFIX_BP = 60; // unary minus binds tighter than ^ (Excel: -2^2 = 4)

export function parse(src, opts = {}) {
  if (src[0] === '=') src = src.slice(1);
  const toks = tokenize(src, opts);
  let p = 0, depth = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const fail = (msg, t) => { throw new FormulaError(msg, t ? t.pos : src.length); };
  const expect = (t) => { const k = next(); if (!k || k.t !== t) fail('Expected ' + t, k); return k; };
  const atEnd = (k) => !k || k.t === ')' || k.t === ',' || k.t === ';' || k.t === '}';

  function expr(rbp = 0) {
    let left = nud(next());
    for (;;) {
      const k = peek();
      if (!k) break;
      if (k.t === 'op' && k.v === '%') { next(); left = { t: 'pct', e: left }; continue; }
      if (k.t === 'op' && k.v === '#') { next(); left = { t: 'spill', e: left }; continue; }
      if (k.t === '(' && (left.t === 'paren' || left.t === 'fn' || left.t === 'call' || left.t === 'name')) {
        // LAMBDA(x, x+1)(5) or a LET-bound lambda called by name.
        next(); left = { t: 'call', callee: left, args: args() }; continue;
      }
      if (k.t !== 'op' || !(k.v in BIN)) break;
      const bp = BIN[k.v];
      if (bp <= rbp) break;
      next();
      const right = expr(bp);
      left = k.v === ':' ? { t: 'range', l: left, r: right } : { t: 'bin', op: k.v, l: left, r: right };
    }
    return left;
  }
  function args() {
    const out = [];
    if (peek() && peek().t === ')') { next(); return out; }
    for (;;) {
      const k = peek();
      if (k && (k.t === ',' || k.t === ')')) out.push({ t: 'empty' });
      else out.push(expr());
      const s = next();
      if (!s) fail('Missing )');
      if (s.t === ')') return out;
      if (s.t !== ',') fail('Expected , or )', s);
    }
  }
  function nud(k) {
    if (!k) fail('Unexpected end of formula');
    switch (k.t) {
      case 'num': return { t: 'num', v: k.v };
      case 'str': return { t: 'str', v: k.v };
      case 'bool': return { t: 'bool', v: k.v };
      case 'err': return { t: 'err', v: k.v };
      case 'ref': { const n = { t: 'ref', sheet: k.sheet, r1: k.r1, c1: k.c1, r2: k.r2, c2: k.c2, abs: k.abs, kind: k.kind }; return n; }
      case 'name': return { t: 'name', name: k.v };
      case 'fn': {
        if (++depth > 256) fail('Formula too deeply nested', k);
        expect('('); const n = { t: 'fn', name: k.v.toUpperCase().replace(/^_XLFN\.|^_XLWS\./, ''), args: args() }; depth--; return n;
      }
      case '(': {
        const e = expr();
        if (peek() && peek().t === ',') { // union (A1,B2)
          const items = [e];
          while (peek() && peek().t === ',') { next(); items.push(expr()); }
          expect(')'); return { t: 'union', items };
        }
        expect(')'); return { t: 'paren', e };
      }
      case '{': {
        const rows = [[]];
        for (;;) {
          let k2 = peek();
          let neg = false;
          if (k2 && k2.t === 'op' && (k2.v === '-' || k2.v === '+')) { neg = k2.v === '-'; next(); k2 = peek(); }
          const v = next();
          if (!v || !['num', 'str', 'bool', 'err'].includes(v.t)) fail('Array constants may only hold values', v);
          rows[rows.length - 1].push(v.t === 'num' ? { t: 'num', v: neg ? -v.v : v.v } : nud(v));
          const s = next();
          if (!s) fail('Missing }');
          if (s.t === '}') break;
          if (s.t === ';') rows.push([]);
          else if (s.t !== ',') fail('Expected , ; or }', s);
        }
        if (rows.some((r) => r.length !== rows[0].length)) fail('Array rows must be the same length');
        return { t: 'arr', rows };
      }
      case 'op':
        if (k.v === '-' || k.v === '+') return { t: 'un', op: k.v, e: expr(PREFIX_BP) };
        if (k.v === '@') return { t: 'at', e: expr(PREFIX_BP) };
        if (k.v === '=' && p === 1) return expr();
        break;
    }
    if (atEnd(k)) fail('Missing value', k);
    fail('Unexpected ' + (k.v || k.t), k);
  }
  if (!toks.length) throw new FormulaError('Empty formula', 0);
  const ast = expr();
  if (p < toks.length) fail('Unexpected ' + (toks[p].v || toks[p].t), toks[p]);
  return ast;
}

/** Walk every node (pre-order). */
export function walk(n, fn) {
  if (!n || typeof n !== 'object') return;
  fn(n);
  switch (n.t) {
    case 'fn': case 'call': if (n.callee) walk(n.callee, fn); n.args.forEach((a) => walk(a, fn)); break;
    case 'bin': case 'range': walk(n.l, fn); walk(n.r, fn); break;
    case 'un': case 'pct': case 'paren': case 'spill': case 'at': walk(n.e, fn); break;
    case 'arr': n.rows.forEach((r) => r.forEach((x) => walk(x, fn))); break;
    case 'union': n.items.forEach((x) => walk(x, fn)); break;
  }
}
/** Deep copy with a node transform (returning undefined keeps the copy). */
export function mapAst(n, fn) {
  const c = { ...n };
  switch (n.t) {
    case 'fn': case 'call': if (n.callee) c.callee = mapAst(n.callee, fn); c.args = n.args.map((a) => mapAst(a, fn)); break;
    case 'bin': case 'range': c.l = mapAst(n.l, fn); c.r = mapAst(n.r, fn); break;
    case 'un': case 'pct': case 'paren': case 'spill': case 'at': c.e = mapAst(n.e, fn); break;
    case 'arr': c.rows = n.rows.map((r) => r.map((x) => mapAst(x, fn))); break;
    case 'union': c.items = n.items.map((x) => mapAst(x, fn)); break;
    case 'ref': c.abs = n.abs.slice(); break;
  }
  const r = fn(c);
  return r === undefined ? c : r;
}
