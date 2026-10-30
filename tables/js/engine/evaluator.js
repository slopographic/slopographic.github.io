/* Slop Tables engine: AST evaluation context. One Ctx per formula evaluation; it records every
   cell/range read (for the dependency index) and every dirty precedent it met (calc.js evaluates
   those first and retries). Operators broadcast over arrays (dynamic-array semantics). */
import { FErr, ERR, ERR_CODES, Bail, bail, compare, toText, parseNumber, isErr } from './values.js';
import { Ref, RefList, MAX_ROWS, MAX_COLS } from './refs.js';
import { FN } from '../fn/registry.js';

export class Lambda { constructor(params, body, scope) { this.params = params; this.body = body; this.scope = scope; } }

export class Ctx {
  constructor(calc, sheet, r, c) {
    this.calc = calc; this.wb = calc.wb; this.sheet = sheet; this.r = r; this.c = c;
    this.reads = []; this.missing = []; this.scope = null; this.fmt = null; this.depth = 0;
  }
  read(sheet, r, c) { return this.calc.readCell(this, sheet, r, c); }
  /** Ref → scalar (1 cell) or 2D array; anything else passes through. keep = always 2D. */
  deref(v, keep) {
    if (v instanceof RefList) return v.refs.length === 1 ? this.deref(v.refs[0], keep) : ERR.VALUE;
    if (!(v instanceof Ref)) return v;
    if (v.single && !keep) return this.read(v.sheet, v.r1, v.c1);
    return this.calc.readRange(this, v);
  }
  /** Implicit intersection: one value from a ref/array. */
  scalar(v) {
    if (v instanceof Ref) {
      if (v.single) return this.read(v.sheet, v.r1, v.c1);
      if (v.c1 === v.c2 && this.r >= v.r1 && this.r <= v.r2 && v.sheet === this.sheet) return this.read(v.sheet, this.r, v.c1);
      if (v.r1 === v.r2 && this.c >= v.c1 && this.c <= v.c2 && v.sheet === this.sheet) return this.read(v.sheet, v.r1, this.c);
      return ERR.VALUE;
    }
    if (v instanceof RefList) return ERR.VALUE;
    if (Array.isArray(v)) return v[0][0];
    return v;
  }
  lookupLocal(name) { for (let s = this.scope; s; s = s.up) if (s.vars.has(name)) return s.vars.get(name); return undefined; }
  push(vars) { this.scope = { vars, up: this.scope }; }
  pop() { this.scope = this.scope.up; }
  sheetFor(n) {
    if (!n.sheet) return this.sheet;
    const sh = this.wb.sheetByName(n.sheet);
    if (!sh) bail(ERR.REF);
    return sh;
  }
  ev(n) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'err': return ERR_CODES[n.v] || ERR.VALUE;
      case 'empty': return null;
      case 'ref': return new Ref(this.sheetFor(n), n.r1, n.c1, n.r2, n.c2);
      case 'paren': return this.ev(n.e);
      case 'range': {
        const a = this.ev(n.l), b = this.ev(n.r);
        if (isErr(a)) return a; if (isErr(b)) return b;
        if (!(a instanceof Ref) || !(b instanceof Ref) || a.sheet !== b.sheet) return ERR.VALUE;
        return new Ref(a.sheet, Math.min(a.r1, b.r1), Math.min(a.c1, b.c1), Math.max(a.r2, b.r2), Math.max(a.c2, b.c2));
      }
      case 'union': {
        const refs = n.items.map((x) => this.ev(x));
        for (const r of refs) { if (isErr(r)) return r; if (!(r instanceof Ref)) return ERR.VALUE; }
        return new RefList(refs);
      }
      case 'name': return this.name(n.name);
      case 'fn': return this.call(n);
      case 'call': {
        const f = this.ev(n.callee);
        if (!(f instanceof Lambda)) return isErr(f) ? f : ERR.VALUE;
        return this.invoke(f, n.args.map((a) => this.ev(a)));
      }
      case 'un': {
        const v = this.deref(this.ev(n.e));
        return n.op === '-' ? lift1(v, (x) => (isErr(x) ? x : negate(x))) : v;
      }
      case 'pct': return lift1(this.deref(this.ev(n.e)), (x) => arith('/', x, 100));
      case 'bin': return binary(n.op, this.deref(this.ev(n.l)), this.deref(this.ev(n.r)));
      case 'arr': return n.rows.map((row) => row.map((x) => this.ev(x)));
      case 'spill': {
        const a = this.ev(n.e);
        if (!(a instanceof Ref)) return ERR.REF;
        return this.calc.spillRef(this, a.sheet, a.r1, a.c1) || ERR.REF;
      }
      case 'at': return this.scalar(this.ev(n.e));
    }
    return ERR.VALUE;
  }
  name(nm) {
    const u = nm.toUpperCase();
    const local = this.lookupLocal(u);
    if (local !== undefined) return local;
    const def = this.wb.nameDef(u, this.sheet);
    if (!def || !def.ast) return ERR.NAME;
    if (this.depth > 64) return ERR.CIRC;
    this.depth++;
    try { return this.ev(def.ast); } finally { this.depth--; }
  }
  invoke(f, args) {
    if (args.length > f.params.length) return ERR.VALUE;
    if (++this.depth > 900) { this.depth--; return ERR.NUM; }
    const saved = this.scope;
    this.scope = f.scope;
    this.push(new Map(f.params.map((p, i) => [p, args[i] === undefined ? null : args[i]])));
    try { return this.ev(f.body); } finally { this.scope = saved; this.depth--; }
  }
  call(n) {
    const local = this.lookupLocal(n.name);
    if (local instanceof Lambda) return this.invoke(local, n.args.map((a) => this.ev(a)));
    const def = FN[n.name];
    if (!def) return ERR.NAME;
    if (n.args.length < def.min || n.args.length > def.max) return ERR.NA;
    let out;
    try {
      if (def.lazy) out = def.f(this, ...n.args);
      else {
        const args = n.args.map((a) => (a.t === 'empty' ? null : this.ev(a)));
        out = def.sc ? this.lifted(def, args) : def.f(this, ...args);
      }
    } catch (e) {
      if (e instanceof Bail) out = e.err;
      else if (e instanceof RangeError) out = ERR.NUM;
      else throw e;
    }
    if (def.fmt && !this.fmt) this.fmt = def.fmt;
    return out === undefined ? null : out;
  }
  lifted(def, args) {
    const idx = def.sc === true ? args.map((_, i) => i) : def.sc;
    let R = 1, C = 1, any = false;
    for (const i of idx) {
      if (i >= args.length) continue;
      let v = args[i];
      if (v instanceof Ref || v instanceof RefList) v = args[i] = this.deref(v);
      if (Array.isArray(v)) {
        if (v.length === 1 && v[0].length === 1) { args[i] = v[0][0]; continue; }
        any = true; R = Math.max(R, v.length); C = Math.max(C, v[0].length);
      }
    }
    const callOne = (a) => { try { const r = def.f(this, ...a); return r === undefined ? null : r; } catch (e) { if (e instanceof Bail) return e.err; throw e; } };
    if (!any) return callOne(args);
    const out = [];
    for (let r = 0; r < R; r++) {
      const row = [];
      for (let c = 0; c < C; c++) {
        const a = args.map((v, i) => (idx.includes(i) && Array.isArray(v) ? at(v, r, c) : v));
        const res = callOne(a);
        row.push(Array.isArray(res) ? res[0][0] : res);
      }
      out.push(row);
    }
    return out;
  }
}

function at(a, r, c) {
  const rr = a.length === 1 ? 0 : r, cc = a[0].length === 1 ? 0 : c;
  return rr < a.length && cc < a[0].length ? a[rr][cc] : ERR.NA;
}
function lift1(v, f) { return Array.isArray(v) ? v.map((row) => row.map(f)) : f(v); }
export function binary(op, a, b) {
  if (isErr(a) && !Array.isArray(b)) return a;
  const A = Array.isArray(a), B = Array.isArray(b);
  if (!A && !B) return scalarOp(op, a, b);
  const R = Math.max(A ? a.length : 1, B ? b.length : 1), C = Math.max(A ? a[0].length : 1, B ? b[0].length : 1);
  const out = [];
  for (let r = 0; r < R; r++) {
    const row = [];
    for (let c = 0; c < C; c++) row.push(scalarOp(op, A ? at(a, r, c) : a, B ? at(b, r, c) : b));
    out.push(row);
  }
  return out;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') { const n = parseNumber(v); if (n !== null) return n; const d = coerceDate(v); return d === null ? ERR.VALUE : d; }
  return ERR.VALUE;
}
let coerceDate = () => null;
export function setDateCoercer(f) { coerceDate = f; }
function negate(x) { const n = toNum(x); return isErr(n) ? n : -n; }
export function arith(op, x, y) {
  if (isErr(x)) return x; if (isErr(y)) return y;
  const a = toNum(x); if (isErr(a)) return a;
  const b = toNum(y); if (isErr(b)) return b;
  let r;
  switch (op) {
    case '+': r = a + b; break;
    case '-': r = a - b; break;
    case '*': r = a * b; break;
    case '/': if (b === 0) return ERR.DIV0; r = a / b; break;
    case '^': if (a === 0 && b === 0) return ERR.NUM; if (a === 0 && b < 0) return ERR.DIV0; r = Math.pow(a, b); break;
  }
  return isFinite(r) ? r : ERR.NUM;
}
function scalarOp(op, x, y) {
  if (isErr(x)) return x; if (isErr(y)) return y;
  if (x instanceof Lambda || y instanceof Lambda) return ERR.VALUE;
  switch (op) {
    case '&': return toText(x) + toText(y);
    case '=': return compare(x, y) === 0;
    case '<>': return compare(x, y) !== 0;
    case '<': return compare(x, y) < 0;
    case '>': return compare(x, y) > 0;
    case '<=': return compare(x, y) <= 0;
    case '>=': return compare(x, y) >= 0;
  }
  return arith(op, x, y);
}
export { FErr, MAX_ROWS, MAX_COLS };
