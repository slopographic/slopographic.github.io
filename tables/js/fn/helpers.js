/* Slop Tables: coercion and iteration helpers shared by the function library. */
import { FErr, ERR, Bail, bail, parseNumber, toText, isErr, compare, fix15 } from '../engine/values.js';
import { Ref, RefList } from '../engine/refs.js';
import { parseDateTime } from '../engine/datetime.js';
export { ERR, bail, isErr, FErr, toText, compare, fix15 };

/** Text → number the way Excel coerces ("12", "1,000", "50%", "1/2/2024", "10:30"). */
export function textNum(s) {
  const n = parseNumber(s);
  if (n !== null) return n;
  const d = parseDateTime(s);
  return d ? d.v : null;
}
const one = (v) => (Array.isArray(v) ? v[0][0] : v);
export function num(v) {
  v = one(v);
  if (typeof v === 'number') { if (!isFinite(v)) bail(ERR.NUM); return v; }
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof FErr) bail(v);
  if (typeof v === 'string') { const n = textNum(v); if (n === null) bail(ERR.VALUE); return n; }
  bail(ERR.VALUE);
}
export const int = (v) => Math.trunc(num(v));
export const floor = (v) => Math.floor(num(v));
export function str(v) {
  v = one(v);
  if (v instanceof FErr) bail(v);
  if (v && typeof v === 'object') bail(ERR.VALUE);
  return toText(v);
}
export function bool(v) {
  v = one(v);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null || v === undefined) return false;
  if (v instanceof FErr) bail(v);
  if (typeof v === 'string') { const u = v.toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; }
  bail(ERR.VALUE);
}
export const opt = (v, d) => (v === undefined || v === null ? d : v);
export const isRefV = (v) => v instanceof Ref || v instanceof RefList;
export const check = (cond, e = ERR.NUM) => { if (!cond) bail(e); };

/** Every value (row-major) of a Ref / RefList / array / scalar. */
export function flat(c, v) {
  if (v instanceof RefList) return v.refs.flatMap((r) => flat(c, r));
  if (v instanceof Ref) v = c.deref(v);
  if (Array.isArray(v)) { const o = []; for (const row of v) for (const x of row) o.push(x); return o; }
  return [v];
}
/** 2D matrix for a Ref/array/scalar. */
export function matrix(c, v) {
  if (v instanceof RefList) bail(ERR.VALUE);
  if (v instanceof Ref) v = c.deref(v, true);
  return Array.isArray(v) ? v : [[v]];
}
/** SUM-style numbers: direct scalars are coerced; values from refs/arrays count only if numeric.
    mode 'A' = AVERAGEA-style (text in refs = 0, booleans count). Errors propagate. */
export function nums(c, args, mode) {
  const out = [];
  for (const a of args) {
    if (a === undefined) continue;
    if (a instanceof Ref || a instanceof RefList || Array.isArray(a)) {
      for (const v of flat(c, a)) {
        if (typeof v === 'number') out.push(v);
        else if (v instanceof FErr) bail(v);
        else if (mode === 'A' && v !== null && v !== undefined) out.push(typeof v === 'boolean' ? (v ? 1 : 0) : 0);
      }
    } else if (a !== null) out.push(num(a));
    else if (mode === 'A') out.push(0);
  }
  return out;
}
/** Numbers from refs/arrays only, skipping everything else (used where Excel ignores text). */
export function numsOnly(c, v) { return flat(c, v).filter((x) => { if (x instanceof FErr) bail(x); return typeof x === 'number'; }); }

/** COUNTIF-style criteria → predicate. */
export function criteria(cr) {
  if (cr instanceof FErr) return (v) => v instanceof FErr && v.code === cr.code;
  if (cr === null || cr === undefined) cr = '';
  let op = '=', rhs = cr;
  if (typeof cr === 'string') {
    const m = /^(<=|>=|<>|=|<|>)?([\s\S]*)$/.exec(cr);
    op = m[1] || '='; rhs = m[2];
    const n = rhs === '' ? null : parseNumber(rhs) ?? (parseDateTime(rhs) || {}).v ?? null;
    if (/^(TRUE|FALSE)$/i.test(rhs)) rhs = rhs.toUpperCase() === 'TRUE';
    else if (n !== null) rhs = n;
  }
  const wild = typeof rhs === 'string' && /[*?~]/.test(rhs);
  const re = wild ? wildRe(rhs) : null;
  const eq = (v) => {
    if (rhs === '') return v === null || v === undefined || v === '';
    if (v === null || v === undefined) return false;
    if (typeof rhs === 'number') return typeof v === 'number' ? fix15(v) === fix15(rhs) : typeof v === 'string' && textNum(v) === rhs;
    if (typeof rhs === 'boolean') return v === rhs;
    if (typeof v !== 'string') return false;
    return re ? re.test(v) : v.toLowerCase() === rhs.toLowerCase();
  };
  if (op === '=') return eq;
  if (op === '<>') return (v) => !eq(v);
  return (v) => {
    if (v === null || v === undefined || v instanceof FErr) return false;
    if (typeof rhs === 'number' && typeof v !== 'number') return false;
    if (typeof rhs === 'string' && typeof v !== 'string') return false;
    const k = compare(v, rhs);
    return op === '<' ? k < 0 : op === '>' ? k > 0 : op === '<=' ? k <= 0 : k >= 0;
  };
}
export function wildRe(p) {
  let s = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '~' && i + 1 < p.length) s += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '*') s += '[\\s\\S]*';
    else if (ch === '?') s += '[\\s\\S]';
    else s += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + s + '$', 'i');
}
/** Pairs of [range, criteria] → boolean mask over the first range's flattened cells. */
export function ifsMask(c, pairs) {
  let rows = -1, cols = -1, mask = null;
  for (const [rng, cr] of pairs) {
    const m = matrix(c, rng);
    if (rows < 0) { rows = m.length; cols = m[0].length; mask = new Array(rows * cols).fill(true); }
    else if (m.length !== rows || m[0].length !== cols) bail(ERR.VALUE);
    const p = criteria(Array.isArray(cr) ? cr[0][0] : cr);
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (mask[r * cols + k] && !p(m[r][k])) mask[r * cols + k] = false;
  }
  return { mask, rows, cols };
}
/** Values of `rng` (a Ref) resized to rows×cols starting at its top-left (Excel SUMIF sum_range behaviour). */
export function sized(c, rng, rows, cols) {
  if (rng instanceof Ref) return matrix(c, new Ref(rng.sheet, rng.r1, rng.c1, rng.r1 + rows - 1, rng.c1 + cols - 1));
  const m = matrix(c, rng);
  if (m.length !== rows || m[0].length !== cols) bail(ERR.VALUE);
  return m;
}
export { Bail, Ref, RefList };
