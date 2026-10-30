/* Slop Tables functions: descriptive statistics, conditional aggregates, ranking. */
import { def, FN } from './registry.js';
import { num, int, nums, numsOnly, opt, check, ERR, bail, matrix, flat, ifsMask, sized, isErr, fix15, criteria, Ref } from './helpers.js';
const S = { cat: 'Statistical' };
export const sum = (a) => { let s = 0; for (const x of a) s += x; return s; };
export const mean = (a) => { if (!a.length) bail(ERR.DIV0); return sum(a) / a.length; };
export const sorted = (a) => a.slice().sort((x, y) => x - y);
export function variance(a, sample) {
  if (a.length < (sample ? 2 : 1)) bail(ERR.DIV0);
  const m = mean(a); let s = 0; for (const x of a) s += (x - m) ** 2;
  return s / (a.length - (sample ? 1 : 0));
}
export function median(a) { if (!a.length) bail(ERR.NUM); const s = sorted(a), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
export function percentileInc(a, p) { check(a.length && p >= 0 && p <= 1); const s = sorted(a), h = (s.length - 1) * p, lo = Math.floor(h); return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo]; }
export function percentileExc(a, p) { const s = sorted(a), n = s.length, h = (n + 1) * p; check(n && h >= 1 && h <= n); const lo = Math.floor(h); return lo < n ? s[lo - 1] + (h - lo) * (s[lo] - s[lo - 1]) : s[n - 1]; }

def('AVERAGE', (c, ...a) => fix15(mean(nums(c, a))), { min: 1, help: 'number1, [number2, …]|Arithmetic mean', ...S });
def('AVERAGEA', (c, ...a) => mean(nums(c, a, 'A')), { min: 1, ...S });
def('COUNT', (c, ...a) => {
  let n = 0;
  for (const x of a) { if (x instanceof Ref || x && x.refs || Array.isArray(x)) { for (const v of flat(c, x)) if (typeof v === 'number') n++; } else if (typeof x === 'number' || typeof x === 'boolean' || (typeof x === 'string' && /^\s*[-+]?[\d.]/.test(x) && !isNaN(parseFloat(x)))) n++; }
  return n;
}, { min: 1, help: 'value1, [value2, …]|Count numbers', ...S });
def('COUNTA', (c, ...a) => { let n = 0; for (const x of a) for (const v of flat(c, x)) if (v !== null && v !== undefined) n++; return n; }, { min: 1, help: 'value1, [value2, …]|Count non-empty values', ...S });
def('COUNTBLANK', (c, r) => { let n = 0; for (const v of flat(c, r)) if (v === null || v === '') n++; if (r instanceof Ref) { const lim = c.wb.limits(); const R = r.rows, C = r.cols, rr = Math.max(1, Math.min(r.r2, lim.r) - r.r1 + 1), cc = Math.max(1, Math.min(r.c2, lim.c) - r.c1 + 1); n += R * C - rr * cc; } return n; }, { min: 1, max: 1, ...S });
def('COUNTIF', (c, rng, cr) => { const p = criteria(cr); let n = 0; for (const v of flat(c, rng)) if (p(v)) n++; return n; }, { min: 2, max: 2, sc: [1], help: 'range, criterion|Count cells that match', ...S });
def('COUNTIFS', (c, ...p) => { if (p.length % 2) bail(ERR.VALUE); const pr = []; for (let i = 0; i < p.length; i += 2) pr.push([p[i], p[i + 1]]); return ifsMask(c, pr).mask.filter(Boolean).length; }, { min: 2, help: 'range1, criterion1, …|Count with several conditions', ...S });
function pickIf(c, rng, cr, sr) {
  const { mask, rows, cols } = ifsMask(c, [[rng, cr]]);
  const vals = sr === undefined || sr === null ? matrix(c, rng) : sized(c, sr, rows, cols);
  const o = []; for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (mask[r * cols + k]) { const v = vals[r] && vals[r][k]; if (isErr(v)) bail(v); if (typeof v === 'number') o.push(v); }
  return o;
}
function pickIfs(c, tr, p) {
  if (p.length % 2) bail(ERR.VALUE);
  const pr = []; for (let i = 0; i < p.length; i += 2) pr.push([p[i], p[i + 1]]);
  const vals = matrix(c, tr), { mask, rows, cols } = ifsMask(c, pr);
  if (vals.length !== rows || vals[0].length !== cols) bail(ERR.VALUE);
  const o = []; for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (mask[r * cols + k]) { const v = vals[r][k]; if (isErr(v)) bail(v); if (typeof v === 'number') o.push(v); }
  return o;
}
def('AVERAGEIF', (c, r, cr, ar) => mean(pickIf(c, r, cr, ar)), { min: 2, max: 3, sc: [1], help: 'range, criterion, [average_range]|Average cells that match', ...S });
def('AVERAGEIFS', (c, ar, ...p) => mean(pickIfs(c, ar, p)), { min: 3, ...S });
def('MAXIFS', (c, mr, ...p) => { const v = pickIfs(c, mr, p); return v.length ? Math.max(...v) : 0; }, { min: 3, ...S });
def('MINIFS', (c, mr, ...p) => { const v = pickIfs(c, mr, p); return v.length ? Math.min(...v) : 0; }, { min: 3, ...S });
const mx = (v) => { let m = -Infinity; for (const x of v) if (x > m) m = x; return v.length ? m : 0; };
const mn = (v) => { let m = Infinity; for (const x of v) if (x < m) m = x; return v.length ? m : 0; };
def('MAX', (c, ...a) => mx(nums(c, a)), { min: 1, help: 'number1, [number2, …]|Largest value', ...S });
def('MIN', (c, ...a) => mn(nums(c, a)), { min: 1, help: 'number1, [number2, …]|Smallest value', ...S });
def('MAXA', (c, ...a) => mx(nums(c, a, 'A')), { min: 1, ...S });
def('MINA', (c, ...a) => mn(nums(c, a, 'A')), { min: 1, ...S });
def('MEDIAN', (c, ...a) => median(nums(c, a)), { min: 1, help: 'number1, …|Middle value', ...S });
function modes(v) { const cnt = new Map(); let best = 1; for (const x of v) { const n = (cnt.get(x) || 0) + 1; cnt.set(x, n); if (n > best) best = n; } if (best < 2) bail(ERR.NA); return [...cnt].filter(([, n]) => n === best).map(([x]) => x); }
def(['MODE', 'MODE.SNGL'], (c, ...a) => modes(nums(c, a))[0], { min: 1, ...S });
def('MODE.MULT', (c, ...a) => modes(nums(c, a)).map((x) => [x]), { min: 1, ...S });
def(['STDEV', 'STDEV.S'], (c, ...a) => Math.sqrt(variance(nums(c, a), true)), { min: 1, help: 'number1, …|Sample standard deviation', ...S });
def(['STDEVP', 'STDEV.P'], (c, ...a) => Math.sqrt(variance(nums(c, a), false)), { min: 1, ...S });
def('STDEVA', (c, ...a) => Math.sqrt(variance(nums(c, a, 'A'), true)), { min: 1, ...S });
def('STDEVPA', (c, ...a) => Math.sqrt(variance(nums(c, a, 'A'), false)), { min: 1, ...S });
def(['VAR', 'VAR.S'], (c, ...a) => variance(nums(c, a), true), { min: 1, ...S });
def(['VARP', 'VAR.P'], (c, ...a) => variance(nums(c, a), false), { min: 1, ...S });
def('VARA', (c, ...a) => variance(nums(c, a, 'A'), true), { min: 1, ...S });
def('VARPA', (c, ...a) => variance(nums(c, a, 'A'), false), { min: 1, ...S });
def('AVEDEV', (c, ...a) => { const v = nums(c, a), m = mean(v); return sum(v.map((x) => Math.abs(x - m))) / v.length; }, { min: 1, ...S });
def('DEVSQ', (c, ...a) => { const v = nums(c, a), m = v.length ? mean(v) : 0; return sum(v.map((x) => (x - m) ** 2)); }, { min: 1, ...S });
def('GEOMEAN', (c, ...a) => { const v = nums(c, a); check(v.length && v.every((x) => x > 0)); return Math.exp(sum(v.map(Math.log)) / v.length); }, { min: 1, ...S });
def('HARMEAN', (c, ...a) => { const v = nums(c, a); check(v.length && v.every((x) => x > 0)); return v.length / sum(v.map((x) => 1 / x)); }, { min: 1, ...S });
def('KURT', (c, ...a) => { const v = nums(c, a), n = v.length; if (n < 4) bail(ERR.DIV0); const m = mean(v), s = Math.sqrt(variance(v, true)); if (!s) bail(ERR.DIV0); const k = sum(v.map((x) => ((x - m) / s) ** 4)); return (n * (n + 1) * k) / ((n - 1) * (n - 2) * (n - 3)) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)); }, { min: 1, ...S });
def('SKEW', (c, ...a) => { const v = nums(c, a), n = v.length; if (n < 3) bail(ERR.DIV0); const m = mean(v), s = Math.sqrt(variance(v, true)); if (!s) bail(ERR.DIV0); return (n / ((n - 1) * (n - 2))) * sum(v.map((x) => ((x - m) / s) ** 3)); }, { min: 1, ...S });
def('SKEW.P', (c, ...a) => { const v = nums(c, a), n = v.length; const m = mean(v), s = Math.sqrt(variance(v, false)); if (!s) bail(ERR.DIV0); return sum(v.map((x) => ((x - m) / s) ** 3)) / n; }, { min: 1, ...S });
def('TRIMMEAN', (c, a, p) => { const v = sorted(numsOnly(c, a)); p = num(p); check(p >= 0 && p < 1); const k = Math.floor((v.length * p) / 2); return mean(v.slice(k, v.length - k)); }, { min: 2, max: 2, ...S });
def(['PERCENTILE', 'PERCENTILE.INC'], (c, a, p) => percentileInc(numsOnly(c, a), num(p)), { min: 2, max: 2, sc: [1], help: 'array, k|k-th percentile (0–1)', ...S });
def('PERCENTILE.EXC', (c, a, p) => percentileExc(numsOnly(c, a), num(p)), { min: 2, max: 2, sc: [1], ...S });
def(['QUARTILE', 'QUARTILE.INC'], (c, a, q) => { q = int(q); check(q >= 0 && q <= 4); return percentileInc(numsOnly(c, a), q / 4); }, { min: 2, max: 2, sc: [1], ...S });
def('QUARTILE.EXC', (c, a, q) => { q = int(q); check(q >= 1 && q <= 3); return percentileExc(numsOnly(c, a), q / 4); }, { min: 2, max: 2, sc: [1], ...S });
def('LARGE', (c, a, k) => { const v = sorted(numsOnly(c, a)); k = Math.ceil(num(k)); check(k >= 1 && k <= v.length); return v[v.length - k]; }, { min: 2, max: 2, sc: [1], help: 'array, k|k-th largest', ...S });
def('SMALL', (c, a, k) => { const v = sorted(numsOnly(c, a)); k = Math.ceil(num(k)); check(k >= 1 && k <= v.length); return v[k - 1]; }, { min: 2, max: 2, sc: [1], help: 'array, k|k-th smallest', ...S });
function rank(c, x, ref, ord, avg) {
  x = num(x); const v = numsOnly(c, ref); ord = num(opt(ord, 0));
  const better = v.filter((y) => (ord ? y < x : y > x)).length, ties = v.filter((y) => fix15(y) === fix15(x)).length;
  if (!ties) bail(ERR.NA);
  return avg ? better + (ties + 1) / 2 : better + 1;
}
def(['RANK', 'RANK.EQ'], (c, x, r, o) => rank(c, x, r, o, false), { min: 2, max: 3, sc: [0], help: 'number, ref, [order]|Rank in a list', ...S });
def('RANK.AVG', (c, x, r, o) => rank(c, x, r, o, true), { min: 2, max: 3, sc: [0], ...S });
function prank(v, x, sig, exc) {
  v = sorted(v); const n = v.length; check(n);
  if (x < v[0] || x > v[n - 1]) bail(ERR.NA);
  let i = 0; while (i < n - 1 && v[i + 1] <= x) i++;
  let r;
  if (v[i] === x) { const lo = v.indexOf(x); r = exc ? (lo + 1) / (n + 1) : lo / (n - 1); }
  else { const a = exc ? (i + 1) / (n + 1) : i / (n - 1), b = exc ? (i + 2) / (n + 1) : (i + 1) / (n - 1); r = a + ((x - v[i]) / (v[i + 1] - v[i])) * (b - a); }
  const p = Math.pow(10, sig); return Math.floor(r * p + 1e-9) / p;
}
def(['PERCENTRANK', 'PERCENTRANK.INC'], (c, a, x, s) => prank(numsOnly(c, a), num(x), int(opt(s, 3)), false), { min: 2, max: 3, ...S });
def('PERCENTRANK.EXC', (c, a, x, s) => prank(numsOnly(c, a), num(x), int(opt(s, 3)), true), { min: 2, max: 3, ...S });
def('STANDARDIZE', (c, x, m, s) => { s = num(s); check(s > 0); return (num(x) - num(m)) / s; }, { min: 3, max: 3, sc: true, ...S });
def('FREQUENCY', (c, d, b) => {
  const v = numsOnly(c, d), bins = numsOnly(c, b), sb = sorted(bins), cnt = new Array(bins.length + 1).fill(0);
  for (const x of v) { let i = sb.findIndex((y) => x <= y); if (i < 0) i = bins.length; cnt[i]++; }
  const out = bins.map((y) => cnt[sb.indexOf(y)]); out.push(cnt[bins.length]);
  return out.map((x) => [x]);
}, { min: 2, max: 2, ...S });

/* SUBTOTAL / AGGREGATE */
const SUBF = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV', 8: 'STDEVP', 9: 'SUM', 10: 'VAR', 11: 'VARP' };
const AGGF = { ...SUBF, 12: 'MEDIAN', 13: 'MODE.SNGL', 14: 'LARGE', 15: 'SMALL', 16: 'PERCENTILE.INC', 17: 'QUARTILE.INC', 18: 'PERCENTILE.EXC', 19: 'QUARTILE.EXC' };
function visibleVals(c, refs, skipHidden, skipErr) {
  const out = [];
  for (const r of refs) {
    if (!(r instanceof Ref)) { for (const v of flat(c, r)) out.push(v); continue; }
    const m = matrix(c, r);
    for (let i = 0; i < m.length; i++) {
      if (skipHidden ? r.sheet.isRowHidden(r.r1 + i) : r.sheet.rows.get(r.r1 + i)?.filtered) continue;
      for (let j = 0; j < m[i].length; j++) {
        const cell = r.sheet.get(r.r1 + i, r.c1 + j);
        if (cell && cell.f && /^(SUBTOTAL|AGGREGATE)\(/i.test(cell.f)) continue;
        if (skipErr && isErr(m[i][j])) continue;
        out.push(m[i][j]);
      }
    }
  }
  return [out];
}
def('SUBTOTAL', (c, f, ...refs) => {
  f = int(f); const fn = SUBF[f % 100]; if (!fn) bail(ERR.VALUE);
  return FN[fn].f(c, visibleVals(c, refs, f > 100, false));
}, { min: 2, help: 'function_num, ref1, …|Subtotal ignoring other subtotals (101+ skips hidden rows)', cat: 'Math' });
def('AGGREGATE', (c, f, o, ...rest) => {
  f = int(f); o = int(o); const fn = AGGF[f]; if (!fn) bail(ERR.VALUE);
  const skipHidden = [1, 3, 5, 7].includes(o), skipErr = [2, 3, 6, 7].includes(o);
  if (f >= 14) return FN[fn].f(c, visibleVals(c, [rest[0]], skipHidden, skipErr), rest[1]);
  return FN[fn].f(c, visibleVals(c, rest, skipHidden, skipErr));
}, { min: 3, cat: 'Math' });
def('COUNTUNIQUE', (c, ...a) => { const s = new Set(); for (const x of a) for (const v of flat(c, x)) if (v !== null && v !== '') s.add(typeof v === 'string' ? 's' + v : typeof v + String(v)); return s.size; }, { min: 1, ...S });
