/* Slop Tables functions: logic, LET and LAMBDA helpers. */
import { def } from './registry.js';
import { num, int, bool, ERR, bail, flat, isErr, matrix, compare, FErr, Ref } from './helpers.js';
import { Lambda, binary } from '../engine/evaluator.js';
const L = { cat: 'Logical' };
const ev = (c, n) => c.deref(c.ev(n));
const isArr = Array.isArray;
function zip(a, b, fn) {
  const R = Math.max(isArr(a) ? a.length : 1, isArr(b) ? b.length : 1), C = Math.max(isArr(a) ? a[0].length : 1, isArr(b) ? b[0].length : 1);
  const g = (x, r, k) => (!isArr(x) ? x : x[x.length === 1 ? 0 : r]?.[x[0].length === 1 ? 0 : k] ?? ERR.NA);
  const o = []; for (let r = 0; r < R; r++) { const row = []; for (let k = 0; k < C; k++) row.push(fn(g(a, r, k), g(b, r, k), r, k)); o.push(row); }
  return o;
}

def('IF', (c, cond, a, b) => {
  const v = ev(c, cond);
  if (isArr(v)) {
    const A = a ? ev(c, a) : true, B = b ? ev(c, b) : false;
    const t = zip(v, A, (x, y) => [x, y]);
    return zip(t, B, ([x, y], z) => (isErr(x) ? x : truthy(x) ? y : z));
  }
  if (isErr(v)) return v;
  if (truthy(v)) return a ? c.ev(a) : true;
  return b ? c.ev(b) : false;
}, { min: 1, max: 3, lazy: true, help: 'condition, value_if_true, [value_if_false]|Choose by a condition', ...L });
function truthy(v) { if (typeof v === 'string') { const u = v.toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; bail(ERR.VALUE); } return bool(v); }
def('IFS', (c, ...a) => {
  if (a.length % 2) bail(ERR.NA);
  for (let i = 0; i < a.length; i += 2) { const v = c.scalar(ev(c, a[i])); if (isErr(v)) return v; if (truthy(v)) return c.ev(a[i + 1]); }
  return ERR.NA;
}, { min: 2, lazy: true, help: 'cond1, value1, [cond2, value2, …]|First true condition wins', ...L });
function logical(c, args) {
  const out = [];
  for (const a of args) {
    if (a === null || a === undefined) continue;
    if (a instanceof Ref || isArr(a) || a.refs) { for (const v of flat(c, a)) { if (isErr(v)) bail(v); if (typeof v === 'boolean' || typeof v === 'number') out.push(!!v); } }
    else out.push(truthy(a));
  }
  if (!out.length) bail(ERR.VALUE);
  return out;
}
def('AND', (c, ...a) => logical(c, a).every(Boolean), { min: 1, help: 'logical1, …|TRUE if all are true', ...L });
def('OR', (c, ...a) => logical(c, a).some(Boolean), { min: 1, help: 'logical1, …|TRUE if any is true', ...L });
def('XOR', (c, ...a) => logical(c, a).filter(Boolean).length % 2 === 1, { min: 1, ...L });
def('NOT', (c, x) => !truthy(x), { min: 1, max: 1, sc: true, ...L });
def('TRUE', () => true, { max: 0, ...L });
def('FALSE', () => false, { max: 0, ...L });
def('IFERROR', (c, v, alt) => {
  const raw = c.ev(v), x = c.deref(raw);
  if (isArr(x)) { const A = ev(c, alt); return x.map((row) => row.map((y) => (isErr(y) ? (isArr(A) ? A[0][0] : A) : y))); }
  return isErr(x) ? c.ev(alt) : raw;
}, { min: 2, max: 2, lazy: true, help: 'value, value_if_error|Replace errors', ...L });
def('IFNA', (c, v, alt) => {
  const raw = c.ev(v), x = c.deref(raw);
  if (isArr(x)) { const A = ev(c, alt); return x.map((row) => row.map((y) => (y instanceof FErr && y.code === '#N/A' ? (isArr(A) ? A[0][0] : A) : y))); }
  return x instanceof FErr && x.code === '#N/A' ? c.ev(alt) : raw;
}, { min: 2, max: 2, lazy: true, ...L });
def('SWITCH', (c, e, ...a) => {
  const v = c.scalar(ev(c, e)); if (isErr(v)) return v;
  let i = 0;
  for (; i + 1 < a.length; i += 2) { const k = c.scalar(ev(c, a[i])); if (isErr(k)) return k; if (compare(v, k) === 0 && typeof v === typeof k) return c.ev(a[i + 1]); }
  return i < a.length ? c.ev(a[i]) : ERR.NA;
}, { min: 3, lazy: true, help: 'expression, value1, result1, …, [default]|Match against a list', ...L });
def('LET', (c, ...a) => {
  if (a.length < 3 || a.length % 2 === 0) bail(ERR.VALUE);
  c.push(new Map());
  try {
    for (let i = 0; i < a.length - 1; i += 2) { if (a[i].t !== 'name') bail(ERR.VALUE); c.scope.vars.set(a[i].name.toUpperCase(), c.ev(a[i + 1])); }
    return c.ev(a[a.length - 1]);
  } finally { c.pop(); }
}, { min: 3, lazy: true, help: 'name1, value1, …, calculation|Name intermediate results', ...L });
def('LAMBDA', (c, ...a) => {
  const params = a.slice(0, -1);
  if (params.some((p) => p.t !== 'name')) bail(ERR.VALUE);
  return new Lambda(params.map((p) => p.name.toUpperCase()), a[a.length - 1], c.scope);
}, { min: 1, lazy: true, help: 'param1, …, body|Define a reusable function', ...L });
const fnArg = (f) => (f instanceof Lambda ? f : bail(ERR.VALUE));
const val = (v) => (isArr(v) ? v[0][0] : v);
def('MAP', (c, ...a) => {
  const f = fnArg(a.pop()), ms = a.map((x) => matrix(c, x)), R = ms[0].length, C = ms[0][0].length;
  return ms[0].map((row, r) => row.map((_, k) => val(c.deref(c.invoke(f, ms.map((m) => (m[r] ? m[r][k] : ERR.NA)))))));
}, { min: 2, ...L });
def('REDUCE', (c, init, arr, f) => { f = fnArg(f); let acc = init; for (const v of flat(c, arr)) acc = c.deref(c.invoke(f, [acc, v])); return acc; }, { min: 3, max: 3, ...L });
def('SCAN', (c, init, arr, f) => { f = fnArg(f); let acc = init; return matrix(c, arr).map((row) => row.map((v) => (acc = val(c.deref(c.invoke(f, [acc, v])))))); }, { min: 3, max: 3, ...L });
def('MAKEARRAY', (c, r, k, f) => { r = int(r); k = int(k); f = fnArg(f); if (r < 1 || k < 1) bail(ERR.VALUE); const o = []; for (let i = 1; i <= r; i++) { const row = []; for (let j = 1; j <= k; j++) row.push(val(c.deref(c.invoke(f, [i, j])))); o.push(row); } return o; }, { min: 3, max: 3, ...L });
def('BYROW', (c, arr, f) => { f = fnArg(f); return matrix(c, arr).map((row) => [val(c.deref(c.invoke(f, [[row]])))]); }, { min: 2, max: 2, ...L });
def('BYCOL', (c, arr, f) => { f = fnArg(f); const m = matrix(c, arr); return [m[0].map((_, k) => val(c.deref(c.invoke(f, [m.map((row) => [row[k]])]))))]; }, { min: 2, max: 2, ...L });
def('ISOMITTED', (c, x) => x === undefined || x === null, { min: 1, max: 1, ...L });
export { binary, num };
