/* Slop Compare: two JSON documents compared by structure, not by text: what was added, removed or changed at which key
 * path, whatever the key order or the formatting. Pure.
 *   diffJson(a, b, { ignoreCase, arrays }) → { entries: [{ path, kind: 'added' | 'removed' | 'changed', a?, b? }], stats }
 *     a and b are parsed values. Objects are compared key by key. Arrays of objects that share an id-like key (id, key,
 *     uuid, sku, code, name: unique on both sides) are matched by it, so a reordered or inserted item is not a cascade of
 *     changes (paths read `$.items[id=7].price`); arrays of plain values are aligned with the sequence diff; other arrays
 *     go index by index. arrays: 'auto' (that rule) or 'index'.
 *   pathText(parts) → '$.a["b c"][2]'   matchKey(xs, ys) → the key two arrays share, or ''
 *   show(v) → a short text of a value for the tables (strings quoted, long values cut) */
import { diffSeq, runs } from './myers.js';

const KEYS = ['id', 'key', 'uuid', 'sku', 'code', 'name'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const prim = (v) => v === null || typeof v !== 'object';

export function pathText(parts) {
  let s = '$';
  for (const p of parts) {
    if (typeof p === 'number') s += `[${p}]`;
    else if (p && typeof p === 'object') s += `[${p.key}=${JSON.stringify(p.value).replace(/^"(.*)"$/, '$1')}]`;
    else s += /^[A-Za-z_$][\w$]*$/.test(p) ? `.${p}` : `[${JSON.stringify(p)}]`;
  }
  return s;
}

export function matchKey(xs, ys) {
  if (!xs.length || !ys.length || !xs.concat(ys).every(isObj)) return '';
  for (const k of KEYS) {
    const ok = (list) => { const seen = new Set(); for (const o of list) { const v = o[k]; if (!prim(v) || v === null || v === '' || seen.has(v)) return false; seen.add(v); } return true; };
    if (ok(xs) && ok(ys)) return k;
  }
  return '';
}

function same(x, y, o) {
  if (typeof x === 'string' && typeof y === 'string' && o.ignoreCase) return x.toLowerCase() === y.toLowerCase();
  return x === y;
}

export function diffJson(a, b, opts = {}) {
  const o = { ignoreCase: !!opts.ignoreCase, arrays: opts.arrays || 'auto' };
  const entries = [];
  walk(a, b, [], o, entries);
  for (const e of entries) e.path = pathText(e.parts);
  const stats = { added: 0, removed: 0, changed: 0 };
  for (const e of entries) stats[e.kind]++;
  stats.total = entries.length;
  return { entries, stats };
}

function walk(x, y, parts, o, out) {
  if (isObj(x) && isObj(y)) {
    for (const k of Object.keys(x)) {
      if (!Object.prototype.hasOwnProperty.call(y, k)) out.push({ parts: [...parts, k], kind: 'removed', a: x[k] });
      else walk(x[k], y[k], [...parts, k], o, out);
    }
    for (const k of Object.keys(y)) if (!Object.prototype.hasOwnProperty.call(x, k)) out.push({ parts: [...parts, k], kind: 'added', b: y[k] });
    return;
  }
  if (Array.isArray(x) && Array.isArray(y)) return arrays(x, y, parts, o, out);
  if (typeOf(x) !== typeOf(y) || !same(x, y, o)) out.push({ parts, kind: 'changed', a: x, b: y });
}

function arrays(x, y, parts, o, out) {
  const key = o.arrays === 'auto' ? matchKey(x, y) : '';
  if (key) {
    const inY = new Map(y.map((v) => [v[key], v])), inX = new Set(x.map((v) => v[key]));
    for (const v of x) {
      const at = [...parts, { key, value: v[key] }];
      if (inY.has(v[key])) walk(v, inY.get(v[key]), at, o, out); else out.push({ parts: at, kind: 'removed', a: v });
    }
    for (const v of y) if (!inX.has(v[key])) out.push({ parts: [...parts, { key, value: v[key] }], kind: 'added', b: v });
    return;
  }
  if (o.arrays === 'auto' && x.concat(y).every(prim)) {
    const k = (v) => (typeof v === 'string' && o.ignoreCase ? 's' + v.toLowerCase() : typeOf(v)[0] + String(v));
    const { ops } = diffSeq(x.map(k), y.map(k));
    // deletions beside insertions at the same place are changes of those items, pair by pair
    for (const r of runs(ops)) {
      if (r.eq) continue;
      const pairs = Math.min(r.dels.length, r.ins.length);
      for (let i = 0; i < pairs; i++) out.push({ parts: [...parts, r.ins[i]], kind: 'changed', a: x[r.dels[i]], b: y[r.ins[i]] });
      for (let i = pairs; i < r.dels.length; i++) out.push({ parts: [...parts, r.dels[i]], kind: 'removed', a: x[r.dels[i]] });
      for (let i = pairs; i < r.ins.length; i++) out.push({ parts: [...parts, r.ins[i]], kind: 'added', b: y[r.ins[i]] });
    }
    return;
  }
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (i >= y.length) out.push({ parts: [...parts, i], kind: 'removed', a: x[i] });
    else if (i >= x.length) out.push({ parts: [...parts, i], kind: 'added', b: y[i] });
    else walk(x[i], y[i], [...parts, i], o, out);
  }
}

export function show(v, max = 80) {
  if (v === undefined) return '';
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
