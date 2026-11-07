/* Slop retouch: the small maths the retouch modules share (shared/retouch/*.js). Pure functions over plain arrays, no DOM,
 * so they run on a page, in a Worker (shared/retouch/inpaint-worker.js) and in Node tests (module.exports).
 * Pixels are RGBA Uint8ClampedArray (w × h × 4); single-channel images are Float32Array (w × h).
 *   clamp(v, a, b), smoothstep(a, b, x), luma(r, g, b)
 *   lumaOf(d, w, h)                    → Float32Array of luma (Rec. 601)
 *   boxBlur(a, w, h, r, passes = 3)    blurs a Float32Array in place (running sums, edges clamped; 3 passes ≈ gaussian)
 *   normBlur(chans, weight, w, h, r)   weighted (normalised) blur: each channel·weight blurred, divided by the blurred weight
 *   channels(d, w, h)                  → [R, G, B] Float32Arrays;  pack(R, G, B, alphaFrom) → RGBA
 *   rng(seed)                          seeded xorshift → () => [0, 1) */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopRetouchCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function lumaOf(d, w, h) {
    const n = w * h, out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    return out;
  }

  /** One horizontal then one vertical running-sum box pass of radius r (window 2r+1), edges clamped. */
  function boxPass(a, tmp, w, h, r) {
    const win = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s / win;
        s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / win;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
  function boxBlur(a, w, h, r, passes = 3) {
    r = Math.max(0, Math.round(r));
    if (!r) return a;
    const tmp = new Float32Array(w * h);
    for (let p = 0; p < passes; p++) boxPass(a, tmp, w, h, r);
    return a;
  }

  /** Normalised convolution: values outside the weight (0) do not bleed in. Returns new arrays; the weight is unchanged. */
  function normBlur(chans, weight, w, h, r) {
    const n = w * h, wb = Float32Array.from(weight);
    boxBlur(wb, w, h, r);
    return chans.map((c) => {
      const o = new Float32Array(n);
      for (let i = 0; i < n; i++) o[i] = c[i] * weight[i];
      boxBlur(o, w, h, r);
      for (let i = 0; i < n; i++) o[i] = wb[i] > 1e-4 ? o[i] / wb[i] : c[i];
      return o;
    });
  }

  function channels(d, w, h) {
    const n = w * h, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) { R[i] = d[i * 4]; G[i] = d[i * 4 + 1]; B[i] = d[i * 4 + 2]; }
    return [R, G, B];
  }
  function pack(R, G, B, alphaFrom) {
    const n = R.length, out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      out[i * 4] = R[i]; out[i * 4 + 1] = G[i]; out[i * 4 + 2] = B[i];
      out[i * 4 + 3] = alphaFrom ? alphaFrom[i * 4 + 3] : 255;
    }
    return out;
  }

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  return { clamp, smoothstep, luma, lumaOf, boxBlur, normBlur, channels, pack, rng };
});
