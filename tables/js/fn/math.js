/* Slop Tables functions: math and trigonometry. */
import { def, alias } from './registry.js';
import { num, int, nums, bool, opt, check, ERR, bail, matrix, flat, ifsMask, sized, isErr, fix15 } from './helpers.js';
const M = { cat: 'Math' };
const one = (name, f, help) => def(name, (c, x) => { const r = f(num(x)); check(isFinite(r)); return r; }, { min: 1, max: 1, sc: true, help, ...M });

one('ABS', Math.abs, 'number|Absolute value');
one('SQRT', (x) => (x < 0 ? NaN : Math.sqrt(x)), 'number|Square root');
one('SQRTPI', (x) => (x < 0 ? NaN : Math.sqrt(x * Math.PI)));
one('EXP', Math.exp, 'number|e raised to a power');
one('LN', (x) => (x <= 0 ? NaN : Math.log(x)), 'number|Natural logarithm');
one('LOG10', (x) => (x <= 0 ? NaN : Math.log10(x)));
one('SIN', Math.sin); one('COS', Math.cos); one('TAN', Math.tan);
one('ASIN', (x) => (Math.abs(x) > 1 ? NaN : Math.asin(x))); one('ACOS', (x) => (Math.abs(x) > 1 ? NaN : Math.acos(x))); one('ATAN', Math.atan);
one('SINH', Math.sinh); one('COSH', Math.cosh); one('TANH', Math.tanh);
one('ASINH', Math.asinh); one('ACOSH', (x) => (x < 1 ? NaN : Math.acosh(x))); one('ATANH', (x) => (Math.abs(x) >= 1 ? NaN : Math.atanh(x)));
one('COT', (x) => (x === 0 ? bail(ERR.DIV0) : 1 / Math.tan(x))); one('COTH', (x) => (x === 0 ? bail(ERR.DIV0) : 1 / Math.tanh(x)));
one('CSC', (x) => (x === 0 ? bail(ERR.DIV0) : 1 / Math.sin(x))); one('CSCH', (x) => (x === 0 ? bail(ERR.DIV0) : 1 / Math.sinh(x)));
one('SEC', (x) => 1 / Math.cos(x)); one('SECH', (x) => 1 / Math.cosh(x));
one('ACOT', (x) => Math.PI / 2 - Math.atan(x)); one('ACOTH', (x) => (Math.abs(x) <= 1 ? NaN : 0.5 * Math.log((x + 1) / (x - 1))));
one('DEGREES', (x) => (x * 180) / Math.PI); one('RADIANS', (x) => (x * Math.PI) / 180);
one('SIGN', Math.sign, 'number|-1, 0 or 1');
one('INT', Math.floor, 'number|Round down to an integer');
one('FACT', (x) => { x = Math.floor(x); if (x < 0) return NaN; let r = 1; for (let i = 2; i <= x; i++) r *= i; return r; });
one('FACTDOUBLE', (x) => { x = Math.floor(x); if (x < -1) return NaN; let r = 1; for (let i = x; i > 1; i -= 2) r *= i; return r; });
one('EVEN', (x) => { const s = x < 0 ? -1 : 1, a = Math.ceil(Math.abs(x)); return s * (a % 2 ? a + 1 : a); });
one('ODD', (x) => { const s = x < 0 ? -1 : 1; let a = Math.ceil(Math.abs(x)); if (a % 2 === 0) a += 1; return s * a; });
one('GAMMA', (x) => (x <= 0 && Number.isInteger(x) ? NaN : gamma(x)));
one('GAMMALN', (x) => (x <= 0 ? NaN : lgamma(x))); alias('GAMMALN', 'GAMMALN.PRECISE');
def('PI', () => Math.PI, { max: 0, help: '|The number π', ...M });
def('ATAN2', (c, x, y) => { x = num(x); y = num(y); if (!x && !y) bail(ERR.DIV0); return Math.atan2(y, x); }, { min: 2, max: 2, sc: true, ...M });
def('LOG', (c, x, b) => { x = num(x); b = opt(b, 10) === null ? 10 : num(opt(b, 10)); check(x > 0 && b > 0); if (b === 1) bail(ERR.DIV0); return Math.log(x) / Math.log(b); }, { min: 1, max: 2, sc: true, help: 'number, [base]|Logarithm', ...M });
def('POWER', (c, x, y) => { x = num(x); y = num(y); if (!x && !y) bail(ERR.NUM); if (!x && y < 0) bail(ERR.DIV0); const r = Math.pow(x, y); check(isFinite(r)); return r; }, { min: 2, max: 2, sc: true, help: 'number, power|Raise to a power', ...M });
def('MOD', (c, a, b) => { a = num(a); b = num(b); if (!b) bail(ERR.DIV0); return fix15(a - b * Math.floor(a / b)); }, { min: 2, max: 2, sc: true, help: 'number, divisor|Remainder', ...M });
def('QUOTIENT', (c, a, b) => { a = num(a); b = num(b); if (!b) bail(ERR.DIV0); return Math.trunc(a / b); }, { min: 2, max: 2, sc: true, ...M });

/* rounding */
const rnd = (x, d) => { const p = Math.pow(10, d); const v = Math.abs(x) * p; const r = Math.round(fix15(v)); return Math.sign(x) * r / p; };
export const round = (x, d = 0) => { d = Math.trunc(d); return d >= 0 ? fix15(rnd(x, d)) : fix15(Math.sign(x) * Math.round(Math.abs(x) / Math.pow(10, -d)) * Math.pow(10, -d)); };
const dir = (f) => (x, d) => { d = Math.trunc(d); const p = Math.pow(10, d); return fix15(Math.sign(x) * f(fix15(Math.abs(x) * p)) / p); };
def('ROUND', (c, x, d) => round(num(x), num(opt(d, 0))), { min: 1, max: 2, sc: true, help: 'number, digits|Round to digits', ...M });
def('ROUNDUP', (c, x, d) => dir(Math.ceil)(num(x), num(opt(d, 0))), { min: 1, max: 2, sc: true, help: 'number, digits|Round away from zero', ...M });
def('ROUNDDOWN', (c, x, d) => dir(Math.floor)(num(x), num(opt(d, 0))), { min: 1, max: 2, sc: true, help: 'number, digits|Round toward zero', ...M });
def('TRUNC', (c, x, d) => dir(Math.floor)(num(x), num(opt(d, 0))), { min: 1, max: 2, sc: true, ...M });
def('MROUND', (c, x, m) => { x = num(x); m = num(m); if (!m) return 0; check(Math.sign(x) * Math.sign(m) >= 0); return fix15(Math.round(fix15(x / m)) * m); }, { min: 2, max: 2, sc: true, ...M });
def('CEILING', (c, x, s) => { x = num(x); s = num(opt(s, 1)); if (!s) return 0; check(!(x > 0 && s < 0)); return fix15(Math.ceil(fix15(x / s)) * s); }, { min: 1, max: 2, sc: true, ...M });
def('FLOOR', (c, x, s) => { x = num(x); s = num(opt(s, 1)); if (!s) { if (!x) return 0; bail(ERR.DIV0); } check(!(x > 0 && s < 0)); return fix15(Math.floor(fix15(x / s)) * s); }, { min: 1, max: 2, sc: true, ...M });
def(['CEILING.MATH', 'CEILING.PRECISE', 'ISO.CEILING'], (c, x, s, mode) => {
  x = num(x); s = Math.abs(num(opt(s, 1))); if (!s) return 0;
  if (x < 0 && mode && num(mode)) return -fix15(Math.ceil(fix15(-x / s)) * s);
  return fix15(Math.ceil(fix15(x / s)) * s);
}, { min: 1, max: 3, sc: true, ...M });
def(['FLOOR.MATH', 'FLOOR.PRECISE'], (c, x, s, mode) => {
  x = num(x); s = Math.abs(num(opt(s, 1))); if (!s) return 0;
  if (x < 0 && mode && num(mode)) return -fix15(Math.floor(fix15(-x / s)) * s);
  return fix15(Math.floor(fix15(x / s)) * s);
}, { min: 1, max: 3, sc: true, ...M });

/* aggregates */
const sum = (a) => { let s = 0; for (const x of a) s += x; return s; };
def('SUM', (c, ...a) => fix15(sum(nums(c, a))), { min: 1, help: 'number1, [number2, …]|Add numbers', ...M });
def('PRODUCT', (c, ...a) => { const v = nums(c, a); return v.length ? v.reduce((x, y) => x * y, 1) : 0; }, { min: 1, ...M });
def('SUMSQ', (c, ...a) => sum(nums(c, a).map((x) => x * x)), { min: 1, ...M });
def('SUMIF', (c, rng, cr, sr) => {
  const { mask, rows, cols } = ifsMask(c, [[rng, cr]]);
  const vals = sr === undefined || sr === null ? matrix(c, rng) : sized(c, sr, rows, cols);
  let s = 0; for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (mask[r * cols + k]) { const v = vals[r] && vals[r][k]; if (isErr(v)) bail(v); if (typeof v === 'number') s += v; }
  return fix15(s);
}, { min: 2, max: 3, sc: [1], help: 'range, criterion, [sum_range]|Sum cells that match', ...M });
def('SUMIFS', (c, sr, ...p) => {
  if (p.length % 2) bail(ERR.VALUE);
  const pairs = []; for (let i = 0; i < p.length; i += 2) pairs.push([p[i], p[i + 1]]);
  const vals = matrix(c, sr);
  const { mask, rows, cols } = ifsMask(c, pairs);
  if (vals.length !== rows || vals[0].length !== cols) bail(ERR.VALUE);
  let s = 0; for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (mask[r * cols + k]) { const v = vals[r][k]; if (isErr(v)) bail(v); if (typeof v === 'number') s += v; }
  return fix15(s);
}, { min: 3, help: 'sum_range, range1, criterion1, …|Sum with several conditions', ...M });
def('SUMPRODUCT', (c, ...a) => {
  const ms = a.map((x) => matrix(c, x));
  const R = ms[0].length, C = ms[0][0].length;
  for (const m of ms) if (m.length !== R || m[0].length !== C) bail(ERR.VALUE);
  let s = 0;
  for (let r = 0; r < R; r++) for (let k = 0; k < C; k++) {
    let p = 1;
    for (const m of ms) { const v = m[r][k]; if (isErr(v)) bail(v); p *= typeof v === 'number' ? v : 0; }
    s += p;
  }
  return fix15(s);
}, { min: 1, help: 'array1, [array2, …]|Sum of products', ...M });
const pairs = (c, a, b) => { const x = flat(c, a), y = flat(c, b); if (x.length !== y.length) bail(ERR.NA); const o = []; for (let i = 0; i < x.length; i++) { if (isErr(x[i])) bail(x[i]); if (isErr(y[i])) bail(y[i]); if (typeof x[i] === 'number' && typeof y[i] === 'number') o.push([x[i], y[i]]); } return o; };
def('SUMX2MY2', (c, a, b) => sum(pairs(c, a, b).map(([x, y]) => x * x - y * y)), { min: 2, max: 2, ...M });
def('SUMX2PY2', (c, a, b) => sum(pairs(c, a, b).map(([x, y]) => x * x + y * y)), { min: 2, max: 2, ...M });
def('SUMXMY2', (c, a, b) => sum(pairs(c, a, b).map(([x, y]) => (x - y) ** 2)), { min: 2, max: 2, ...M });
export { pairs };

/* integers */
const gcd2 = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
def('GCD', (c, ...a) => { const v = nums(c, a).map(Math.floor); check(v.every((x) => x >= 0)); return v.reduce(gcd2, 0); }, { min: 1, ...M });
def('LCM', (c, ...a) => { const v = nums(c, a).map(Math.floor); check(v.every((x) => x >= 0)); return v.reduce((x, y) => (x && y ? (x / gcd2(x, y)) * y : 0), 1); }, { min: 1, ...M });
export function combin(n, k) { if (k < 0 || k > n) return NaN; k = Math.min(k, n - k); let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); }
def('COMBIN', (c, n, k) => { n = Math.floor(num(n)); k = Math.floor(num(k)); check(n >= 0 && k >= 0 && k <= n); return combin(n, k); }, { min: 2, max: 2, sc: true, ...M });
def('COMBINA', (c, n, k) => { n = Math.floor(num(n)); k = Math.floor(num(k)); check(n >= 0 && k >= 0); return n === 0 && k === 0 ? 1 : combin(n + k - 1, k); }, { min: 2, max: 2, sc: true, ...M });
def('PERMUT', (c, n, k) => { n = Math.floor(num(n)); k = Math.floor(num(k)); check(n >= 0 && k >= 0 && k <= n); let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r; }, { min: 2, max: 2, sc: true, cat: 'Statistical' });
def('PERMUTATIONA', (c, n, k) => { n = Math.floor(num(n)); k = Math.floor(num(k)); check(n >= 0 && k >= 0); return Math.pow(n, k); }, { min: 2, max: 2, sc: true, cat: 'Statistical' });
def('MULTINOMIAL', (c, ...a) => { const v = nums(c, a).map(Math.floor); check(v.every((x) => x >= 0)); let s = 0, r = 1; for (const x of v) { for (let i = 1; i <= x; i++) r = (r * (s + i)) / i; s += x; } return Math.round(r); }, { min: 1, ...M });
def('SERIESSUM', (c, x, n, m, coef) => { x = num(x); n = num(n); m = num(m); return flat(c, coef).reduce((s, a, i) => s + num(a) * Math.pow(x, n + i * m), 0); }, { min: 4, max: 4, ...M });

/* random (volatile) */
def('RAND', () => Math.random(), { max: 0, vol: true, help: '|Random number 0–1', ...M });
def('RANDBETWEEN', (c, a, b) => { a = Math.ceil(num(a)); b = Math.floor(num(b)); check(a <= b); return a + Math.floor(Math.random() * (b - a + 1)); }, { min: 2, max: 2, vol: true, ...M });
def('RANDARRAY', (c, r, k, lo, hi, whole) => {
  r = int(opt(r, 1)); k = int(opt(k, 1)); lo = num(opt(lo, 0)); hi = num(opt(hi, 1)); whole = bool(opt(whole, false));
  check(r > 0 && k > 0 && hi >= lo, ERR.VALUE);
  const o = []; for (let i = 0; i < r; i++) { const row = []; for (let j = 0; j < k; j++) row.push(whole ? lo + Math.floor(Math.random() * (hi - lo + 1)) : lo + Math.random() * (hi - lo)); o.push(row); }
  return o;
}, { max: 5, vol: true, ...M });

/* gamma */
const LG = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015; for (const c of LG) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
export function gamma(x) {
  if (Number.isInteger(x) && x > 0 && x < 171) { let r = 1; for (let i = 2; i < x; i++) r *= i; return r; }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  return Math.exp(lgamma(x));
}
