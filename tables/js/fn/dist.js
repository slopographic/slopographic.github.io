/* Slop Tables functions: probability distributions and regression. */
import { def, alias } from './registry.js';
import { num, int, bool, opt, check, ERR, bail, flat, isErr, numsOnly } from './helpers.js';
import { lgamma, combin, pairs } from './math.js';
import { mean, sum, variance } from './stats.js';
const S = { cat: 'Statistical' };

export function erf(x) {
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? y : -y;
}
// Higher-precision standard normal CDF (Cody / W. J. Cody's algorithm via erfc series).
export function normCdf(z) {
  const a = Math.abs(z);
  if (a > 37) return z > 0 ? 1 : 0;
  const e = Math.exp(-a * a / 2);
  let p;
  if (a < 7.07106781186547) {
    const n = ((((((0.0352624965998911 * a + 0.700383064443688) * a + 6.37396220353165) * a + 33.912866078383) * a + 112.079291497871) * a + 221.213596169931) * a + 220.206867912376);
    const d = (((((((0.0883883476483184 * a + 1.75566716318264) * a + 16.064177579207) * a + 86.7807322029461) * a + 296.564248779674) * a + 637.333633378831) * a + 793.826512519948) * a + 440.413735824752);
    p = e * n / d;
  } else p = e / (a + 1 / (a + 2 / (a + 3 / (a + 4 / (a + 0.65))))) / 2.506628274631;
  return z > 0 ? 1 - p : p;
}
export const normPdf = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
export function normInv(p) { // Acklam with one Newton refinement
  check(p > 0 && p < 1);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const cc = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((cc[0] * q + cc[1]) * q + cc[2]) * q + cc[3]) * q + cc[4]) * q + cc[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((cc[0] * q + cc[1]) * q + cc[2]) * q + cc[3]) * q + cc[4]) * q + cc[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  for (let i = 0; i < 2; i++) { const e = normCdf(x) - p; x -= e / normPdf(x); }
  return x;
}
/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) { let s = 1 / a, t = s; for (let n = 1; n < 500; n++) { t *= x / (a + n); s += t; if (Math.abs(t) < Math.abs(s) * 1e-15) break; } return s * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
function betacf(a, b, x) {
  let c = 1, d = 1 - ((a + b) * x) / (a + 1); if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
  for (let m = 1; m < 1000; m++) {
    const m2 = 2 * m; let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
/** Regularized incomplete beta I_x(a, b). */
export function betaI(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** Invert a monotone increasing CDF on [lo, hi] by bisection. */
export function invert(cdf, p, lo, hi) {
  check(p >= 0 && p <= 1);
  while (cdf(hi) < p && hi < 1e300) hi *= 2;
  for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (cdf(m) < p) lo = m; else hi = m; if (hi - lo < 1e-15 * Math.max(1, Math.abs(m))) break; }
  return (lo + hi) / 2;
}
const tCdf = (t, df) => { const x = df / (df + t * t), p = 0.5 * betaI(x, df / 2, 0.5); return t > 0 ? 1 - p : p; };
const tPdf = (t, df) => Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2)) / Math.sqrt(df * Math.PI) * Math.pow(1 + t * t / df, -(df + 1) / 2);
const fCdf = (x, a, b) => (x <= 0 ? 0 : betaI((a * x) / (a * x + b), a / 2, b / 2));
const fPdf = (x, a, b) => Math.exp(0.5 * (a * Math.log(a * x) + b * Math.log(b) - (a + b) * Math.log(a * x + b)) - Math.log(x) - (lgamma(a / 2) + lgamma(b / 2) - lgamma((a + b) / 2)));
const chiCdf = (x, k) => gammaP(k / 2, x / 2);
const chiPdf = (x, k) => (x <= 0 ? 0 : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lgamma(k / 2)));
const gamCdf = (x, a, b) => gammaP(a, x / b);
const gamPdf = (x, a, b) => (x < 0 ? 0 : Math.exp((a - 1) * Math.log(x) - x / b - a * Math.log(b) - lgamma(a)));
const o = { min: 2, sc: true, ...S };

def(['NORM.DIST'], (c, x, m, s, cu) => { x = num(x); m = num(m); s = num(s); check(s > 0); const z = (x - m) / s; return bool(cu) ? normCdf(z) : normPdf(z) / s; }, { ...o, min: 4, max: 4, help: 'x, mean, sd, cumulative|Normal distribution' });
alias('NORM.DIST', 'NORMDIST');
def(['NORM.INV', 'NORMINV'], (c, p, m, s) => { s = num(s); check(s > 0); return num(m) + s * normInv(num(p)); }, { ...o, min: 3, max: 3 });
def('NORM.S.DIST', (c, z, cu) => (bool(cu) ? normCdf(num(z)) : normPdf(num(z))), { ...o, min: 2, max: 2 });
def('NORMSDIST', (c, z) => normCdf(num(z)), { ...o, min: 1, max: 1 });
def(['NORM.S.INV', 'NORMSINV'], (c, p) => normInv(num(p)), { ...o, min: 1, max: 1 });
def('PHI', (c, z) => normPdf(num(z)), { ...o, min: 1, max: 1 });
def('GAUSS', (c, z) => normCdf(num(z)) - 0.5, { ...o, min: 1, max: 1 });
def(['LOGNORM.DIST'], (c, x, m, s, cu) => { x = num(x); m = num(m); s = num(s); check(x > 0 && s > 0); const z = (Math.log(x) - m) / s; return bool(opt(cu, true)) ? normCdf(z) : normPdf(z) / (x * s); }, { ...o, min: 3, max: 4 });
alias('LOGNORM.DIST', 'LOGNORMDIST');
def(['LOGNORM.INV', 'LOGINV'], (c, p, m, s) => { s = num(s); check(s > 0); return Math.exp(num(m) + s * normInv(num(p))); }, { ...o, min: 3, max: 3 });
def(['EXPON.DIST', 'EXPONDIST'], (c, x, l, cu) => { x = num(x); l = num(l); check(x >= 0 && l > 0); return bool(cu) ? 1 - Math.exp(-l * x) : l * Math.exp(-l * x); }, { ...o, min: 3, max: 3 });
def(['POISSON.DIST', 'POISSON'], (c, k, l, cu) => { k = Math.floor(num(k)); l = num(l); check(k >= 0 && l >= 0); const pmf = (i) => Math.exp(i * Math.log(l) - l - lgamma(i + 1)); if (!bool(cu)) return pmf(k); let s = 0; for (let i = 0; i <= k; i++) s += pmf(i); return Math.min(1, s); }, { ...o, min: 3, max: 3 });
const binPmf = (k, n, p) => combin(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
def(['BINOM.DIST', 'BINOMDIST'], (c, k, n, p, cu) => { k = Math.floor(num(k)); n = Math.floor(num(n)); p = num(p); check(k >= 0 && k <= n && p >= 0 && p <= 1); if (!bool(cu)) return binPmf(k, n, p); let s = 0; for (let i = 0; i <= k; i++) s += binPmf(i, n, p); return Math.min(1, s); }, { ...o, min: 4, max: 4 });
def(['BINOM.INV', 'CRITBINOM'], (c, n, p, a) => { n = Math.floor(num(n)); p = num(p); a = num(a); check(n >= 0 && p >= 0 && p <= 1 && a >= 0 && a <= 1); let s = 0; for (let i = 0; i <= n; i++) { s += binPmf(i, n, p); if (s >= a - 1e-12) return i; } return n; }, { ...o, min: 3, max: 3 });
def(['NEGBINOM.DIST'], (c, f, s, p, cu) => { f = Math.floor(num(f)); s = Math.floor(num(s)); p = num(p); check(f >= 0 && s >= 1 && p >= 0 && p <= 1); const pmf = (k) => combin(k + s - 1, s - 1) * Math.pow(p, s) * Math.pow(1 - p, k); if (!bool(opt(cu, false))) return pmf(f); let t = 0; for (let i = 0; i <= f; i++) t += pmf(i); return t; }, { ...o, min: 3, max: 4 });
alias('NEGBINOM.DIST', 'NEGBINOMDIST');
def(['HYPGEOM.DIST'], (c, k, n, K, N, cu) => { k = Math.floor(num(k)); n = Math.floor(num(n)); K = Math.floor(num(K)); N = Math.floor(num(N)); check(k >= 0 && n <= N && K <= N); const pmf = (i) => (combin(K, i) * combin(N - K, n - i)) / combin(N, n); if (!bool(opt(cu, false))) return pmf(k); let s = 0; for (let i = 0; i <= k; i++) s += pmf(i) || 0; return s; }, { ...o, min: 4, max: 5 });
alias('HYPGEOM.DIST', 'HYPGEOMDIST');
def(['GAMMA.DIST', 'GAMMADIST'], (c, x, a, b, cu) => { x = num(x); a = num(a); b = num(b); check(x >= 0 && a > 0 && b > 0); return bool(cu) ? gamCdf(x, a, b) : gamPdf(x, a, b); }, { ...o, min: 4, max: 4 });
def(['GAMMA.INV', 'GAMMAINV'], (c, p, a, b) => { a = num(a); b = num(b); check(a > 0 && b > 0); return invert((x) => gamCdf(x, a, b), num(p), 0, a * b * 10 + 10); }, { ...o, min: 3, max: 3 });
def(['BETA.DIST'], (c, x, a, b, cu, A, B) => { x = num(x); a = num(a); b = num(b); A = num(opt(A, 0)); B = num(opt(B, 1)); check(a > 0 && b > 0 && x >= A && x <= B && A < B); const t = (x - A) / (B - A); if (bool(cu)) return betaI(t, a, b); return Math.exp((a - 1) * Math.log(t) + (b - 1) * Math.log(1 - t) - (lgamma(a) + lgamma(b) - lgamma(a + b))) / (B - A); }, { ...o, min: 4, max: 6 });
def('BETADIST', (c, x, a, b, A, B) => { x = num(x); a = num(a); b = num(b); A = num(opt(A, 0)); B = num(opt(B, 1)); check(A < B && x >= A && x <= B); return betaI((x - A) / (B - A), a, b); }, { ...o, min: 3, max: 5 });
def(['BETA.INV', 'BETAINV'], (c, p, a, b, A, B) => { a = num(a); b = num(b); A = num(opt(A, 0)); B = num(opt(B, 1)); return A + (B - A) * invert((t) => betaI(t, a, b), num(p), 0, 1); }, { ...o, min: 3, max: 5 });
def('CHISQ.DIST', (c, x, k, cu) => { x = num(x); k = Math.floor(num(k)); check(x >= 0 && k >= 1); return bool(cu) ? chiCdf(x, k) : chiPdf(x, k); }, { ...o, min: 3, max: 3 });
def(['CHISQ.DIST.RT', 'CHIDIST'], (c, x, k) => { x = num(x); k = Math.floor(num(k)); check(x >= 0 && k >= 1); return 1 - chiCdf(x, k); }, { ...o, min: 2, max: 2 });
def('CHISQ.INV', (c, p, k) => { k = Math.floor(num(k)); check(k >= 1); return invert((x) => chiCdf(x, k), num(p), 0, k * 10 + 10); }, { ...o, min: 2, max: 2 });
def(['CHISQ.INV.RT', 'CHIINV'], (c, p, k) => { k = Math.floor(num(k)); check(k >= 1); return invert((x) => chiCdf(x, k), 1 - num(p), 0, k * 10 + 10); }, { ...o, min: 2, max: 2 });
def('T.DIST', (c, x, df, cu) => { x = num(x); df = Math.floor(num(df)); check(df >= 1); return bool(cu) ? tCdf(x, df) : tPdf(x, df); }, { ...o, min: 3, max: 3 });
def('T.DIST.RT', (c, x, df) => { df = Math.floor(num(df)); check(df >= 1); return 1 - tCdf(num(x), df); }, { ...o, min: 2, max: 2 });
def('T.DIST.2T', (c, x, df) => { x = num(x); df = Math.floor(num(df)); check(x >= 0 && df >= 1); return 2 * (1 - tCdf(x, df)); }, { ...o, min: 2, max: 2 });
def('TDIST', (c, x, df, t) => { x = num(x); df = Math.floor(num(df)); check(x >= 0 && df >= 1); return int(t) === 1 ? 1 - tCdf(x, df) : 2 * (1 - tCdf(x, df)); }, { ...o, min: 3, max: 3 });
def('T.INV', (c, p, df) => { df = Math.floor(num(df)); p = num(p); check(df >= 1 && p > 0 && p < 1); return invert((t) => tCdf(t, df), p, -1e3, 1e3); }, { ...o, min: 2, max: 2 });
def(['T.INV.2T', 'TINV'], (c, p, df) => { df = Math.floor(num(df)); p = num(p); check(df >= 1 && p > 0 && p <= 1); return invert((t) => tCdf(t, df), 1 - p / 2, -1e3, 1e3); }, { ...o, min: 2, max: 2 });
def('F.DIST', (c, x, a, b, cu) => { x = num(x); a = Math.floor(num(a)); b = Math.floor(num(b)); check(x >= 0 && a >= 1 && b >= 1); return bool(cu) ? fCdf(x, a, b) : fPdf(x, a, b); }, { ...o, min: 4, max: 4 });
def(['F.DIST.RT', 'FDIST'], (c, x, a, b) => { x = num(x); a = Math.floor(num(a)); b = Math.floor(num(b)); check(x >= 0 && a >= 1 && b >= 1); return 1 - fCdf(x, a, b); }, { ...o, min: 3, max: 3 });
def('F.INV', (c, p, a, b) => { a = Math.floor(num(a)); b = Math.floor(num(b)); return invert((x) => fCdf(x, a, b), num(p), 0, 100); }, { ...o, min: 3, max: 3 });
def(['F.INV.RT', 'FINV'], (c, p, a, b) => { a = Math.floor(num(a)); b = Math.floor(num(b)); return invert((x) => fCdf(x, a, b), 1 - num(p), 0, 100); }, { ...o, min: 3, max: 3 });
def(['WEIBULL.DIST', 'WEIBULL'], (c, x, a, b, cu) => { x = num(x); a = num(a); b = num(b); check(x >= 0 && a > 0 && b > 0); return bool(cu) ? 1 - Math.exp(-Math.pow(x / b, a)) : (a / Math.pow(b, a)) * Math.pow(x, a - 1) * Math.exp(-Math.pow(x / b, a)); }, { ...o, min: 4, max: 4 });
def(['CONFIDENCE.NORM', 'CONFIDENCE'], (c, a, s, n) => { a = num(a); s = num(s); n = Math.floor(num(n)); check(a > 0 && a < 1 && s > 0 && n >= 1); return -normInv(a / 2) * s / Math.sqrt(n); }, { ...o, min: 3, max: 3 });
def('CONFIDENCE.T', (c, a, s, n) => { a = num(a); s = num(s); n = Math.floor(num(n)); check(a > 0 && a < 1 && s > 0 && n > 1); return invert((t) => tCdf(t, n - 1), 1 - a / 2, -1e3, 1e3) * s / Math.sqrt(n); }, { ...o, min: 3, max: 3 });
def('FISHER', (c, x) => { x = num(x); check(Math.abs(x) < 1); return 0.5 * Math.log((1 + x) / (1 - x)); }, { ...o, min: 1, max: 1 });
def('FISHERINV', (c, y) => { y = num(y); return (Math.exp(2 * y) - 1) / (Math.exp(2 * y) + 1); }, { ...o, min: 1, max: 1 });
def(['Z.TEST', 'ZTEST'], (c, a, x, s) => { const v = numsOnly(c, a); x = num(x); s = s === undefined ? Math.sqrt(variance(v, true)) : num(s); return 1 - normCdf((mean(v) - x) / (s / Math.sqrt(v.length))); }, { min: 2, max: 3, ...S });

/* regression */
function lin(c, ys, xs) {
  const p = pairs(c, ys, xs); if (p.length < 2) bail(ERR.DIV0);
  const my = mean(p.map((q) => q[0])), mx = mean(p.map((q) => q[1]));
  let sxy = 0, sxx = 0, syy = 0; for (const [y, x] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return { n: p.length, mx, my, sxy, sxx, syy };
}
def(['CORREL', 'PEARSON'], (c, a, b) => { const L = lin(c, a, b); if (!L.sxx || !L.syy) bail(ERR.DIV0); return L.sxy / Math.sqrt(L.sxx * L.syy); }, { min: 2, max: 2, ...S });
def('RSQ', (c, a, b) => { const L = lin(c, a, b); if (!L.sxx || !L.syy) bail(ERR.DIV0); return (L.sxy * L.sxy) / (L.sxx * L.syy); }, { min: 2, max: 2, ...S });
def(['COVAR', 'COVARIANCE.P'], (c, a, b) => { const L = lin(c, a, b); return L.sxy / L.n; }, { min: 2, max: 2, ...S });
def('COVARIANCE.S', (c, a, b) => { const L = lin(c, a, b); return L.sxy / (L.n - 1); }, { min: 2, max: 2, ...S });
def('SLOPE', (c, y, x) => { const L = lin(c, y, x); if (!L.sxx) bail(ERR.DIV0); return L.sxy / L.sxx; }, { min: 2, max: 2, ...S });
def('INTERCEPT', (c, y, x) => { const L = lin(c, y, x); if (!L.sxx) bail(ERR.DIV0); return L.my - (L.sxy / L.sxx) * L.mx; }, { min: 2, max: 2, ...S });
def('STEYX', (c, y, x) => { const L = lin(c, y, x); if (L.n < 3) bail(ERR.DIV0); return Math.sqrt((L.syy - (L.sxy * L.sxy) / L.sxx) / (L.n - 2)); }, { min: 2, max: 2, ...S });
def(['FORECAST', 'FORECAST.LINEAR'], (c, x, y, xs) => { const L = lin(c, y, xs); if (!L.sxx) bail(ERR.DIV0); const b = L.sxy / L.sxx; return L.my - b * L.mx + b * num(x); }, { min: 3, max: 3, sc: [0], ...S });
function fitXY(c, y, x, logy) {
  const ys = flat(c, y).map(num).map((v) => (logy ? (v > 0 ? Math.log(v) : bail(ERR.NUM)) : v));
  const xs = x === undefined || x === null ? ys.map((_, i) => i + 1) : flat(c, x).map(num);
  if (xs.length !== ys.length) bail(ERR.REF);
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0; xs.forEach((v, i) => { sxy += (v - mx) * (ys[i] - my); sxx += (v - mx) ** 2; });
  const m = sxx ? sxy / sxx : 0; return { m, b: my - m * mx, n: xs.length, xs, ys };
}
const shape = (c, v, f) => { if (v === undefined || v === null) return null; const a = Array.isArray(v) || v && v.sheet ? null : v; if (a !== null) return f(num(a)); return c.deref(v, true).map((row) => row.map((q) => f(num(q)))); };
def('TREND', (c, y, x, nx) => { const F = fitXY(c, y, x, false), f = (q) => F.m * q + F.b; return shape(c, nx, f) ?? F.xs.map((q) => [f(q)]); }, { min: 1, max: 4, ...S });
def('GROWTH', (c, y, x, nx) => { const F = fitXY(c, y, x, true), f = (q) => Math.exp(F.m * q + F.b); return shape(c, nx, f) ?? F.xs.map((q) => [f(q)]); }, { min: 1, max: 4, ...S });
def('LINEST', (c, y, x) => { const F = fitXY(c, y, x, false); return [[F.m, F.b]]; }, { min: 1, max: 4, ...S });
def('LOGEST', (c, y, x) => { const F = fitXY(c, y, x, true); return [[Math.exp(F.m), Math.exp(F.b)]]; }, { min: 1, max: 4, ...S });
def(['T.TEST', 'TTEST'], (c, a, b, tails, type) => {
  const x = numsOnly(c, a), y = numsOnly(c, b); tails = int(tails); type = int(type); let t, df;
  if (type === 1) { check(x.length === y.length, ERR.NA); const d = x.map((v, i) => v - y[i]); t = mean(d) / Math.sqrt(variance(d, true) / d.length); df = d.length - 1; }
  else if (type === 2) { const n1 = x.length, n2 = y.length; df = n1 + n2 - 2; const sp = ((n1 - 1) * variance(x, true) + (n2 - 1) * variance(y, true)) / df; t = (mean(x) - mean(y)) / Math.sqrt(sp * (1 / n1 + 1 / n2)); }
  else { const v1 = variance(x, true) / x.length, v2 = variance(y, true) / y.length; t = (mean(x) - mean(y)) / Math.sqrt(v1 + v2); df = (v1 + v2) ** 2 / (v1 * v1 / (x.length - 1) + v2 * v2 / (y.length - 1)); }
  const p = 1 - tCdf(Math.abs(t), df); return tails === 1 ? p : 2 * p;
}, { min: 4, max: 4, ...S });
export { sum, isErr };
