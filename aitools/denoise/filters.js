/* Slop AI Tools denoise filters: classic, no model. A median filter removes speckle and salt-and-pepper noise;
 * a bilateral filter smooths grain while keeping edges (weights fall with distance and with colour difference).
 * Pure functions over RGBA Uint8ClampedArray pixels, so a Node test can load them (module.exports). Alpha is kept. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopAIFilters = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Median over a (2r+1)² window, per colour channel. Returns a new array of the same size. */
  function median(src, w, h, r) {
    const out = new Uint8ClampedArray(src.length), win = new Uint8Array((2 * r + 1) * (2 * r + 1)), mid = (win.length - 1) >> 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let n = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = -r; dx <= r; dx++) win[n++] = src[(yy * w + Math.min(w - 1, Math.max(0, x + dx))) * 4 + c];
        }
        win.sort();
        out[p + c] = win[mid];
      }
      out[p + 3] = src[p + 3];
    }
    return out;
  }

  /** Bilateral filter: spatial radius r, colour sigma sr (0..255). Returns a new array. */
  function bilateral(src, w, h, r, sr) {
    const out = new Uint8ClampedArray(src.length), inv = 1 / (2 * sr * sr), side = 2 * r + 1;
    const space = new Float32Array(side * side);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) space[(dy + r) * side + dx + r] = Math.exp(-(dx * dx + dy * dy) / (2 * r * r + 1e-9));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4, cr = src[p], cg = src[p + 1], cb = src[p + 2];
      let sr0 = 0, sg = 0, sb = 0, sw = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const q = (yy * w + xx) * 4;
          const dr = src[q] - cr, dg = src[q + 1] - cg, db = src[q + 2] - cb;
          const wgt = space[(dy + r) * side + dx + r] * Math.exp(-(dr * dr + dg * dg + db * db) * inv);
          sr0 += wgt * src[q]; sg += wgt * src[q + 1]; sb += wgt * src[q + 2]; sw += wgt;
        }
      }
      out[p] = sr0 / sw; out[p + 1] = sg / sw; out[p + 2] = sb / sw; out[p + 3] = src[p + 3];
    }
    return out;
  }

  /**
   * One denoise call from a single strength 0..100. Median radius 1..3 and colour sigma 8..48 grow with strength.
   * mode: 'median' | 'bilateral' | 'both'. Returns the filtered RGBA array.
   */
  function denoise(src, w, h, { mode = 'both', strength = 50 } = {}) {
    const s = Math.max(0, Math.min(100, strength));
    const r = 1 + Math.round(s / 50), sigma = 8 + (s / 100) * 40;
    let out = src;
    if (mode === 'median' || mode === 'both') out = median(out, w, h, r);
    if (mode === 'bilateral' || mode === 'both') out = bilateral(out, w, h, Math.max(1, r), sigma);
    return out;
  }

  return { median, bilateral, denoise };
});
