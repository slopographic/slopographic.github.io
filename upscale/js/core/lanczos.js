/* Slop Upscale: Lanczos resampling of RGBA pixels. Pure functions (no DOM): used by the worker for the fallback
 * when no model is installed, and for the colour of the FSRCNN result. Works on Uint8ClampedArray RGBA.
 * Lanczos with a = 3 lobes, separable (horizontal, then vertical), weights normalised per output pixel.
 * Classic script for the page or a worker; module.exports in Node; sets SlopUpscaleLanczos. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopUpscaleLanczos = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function kernel(x, a) {
    if (x === 0) return 1;
    if (Math.abs(x) >= a) return 0;
    const px = Math.PI * x;
    return a * Math.sin(px) * Math.sin(px / a) / (px * px);
  }

  /** For each destination index: the first source index and the weights (sum 1), over source length srcLen. */
  function weights(srcLen, dstLen, a = 3) {
    const scale = srcLen / dstLen;
    const s = Math.max(1, scale); // downscaling widens the kernel so it averages instead of skipping pixels
    const out = [];
    for (let i = 0; i < dstLen; i++) {
      const centre = (i + 0.5) * scale - 0.5;
      const lo = Math.max(0, Math.ceil(centre - a * s));
      const hi = Math.min(srcLen - 1, Math.floor(centre + a * s));
      const w = new Float32Array(hi - lo + 1);
      let sum = 0;
      for (let j = lo; j <= hi; j++) { const v = kernel((j - centre) / s, a); w[j - lo] = v; sum += v; }
      for (let k = 0; k < w.length; k++) w[k] /= sum;
      out.push({ start: lo, w });
    }
    return out;
  }

  /** Resamples an RGBA buffer sw×sh to dw×dh. Returns a new Uint8ClampedArray of dw*dh*4 bytes. */
  function resizeRGBA(src, sw, sh, dw, dh, a = 3) {
    const wx = weights(sw, dw, a), wy = weights(sh, dh, a);
    const tmp = new Float32Array(dw * sh * 4);
    for (let y = 0; y < sh; y++) {
      const row = y * sw * 4;
      for (let x = 0; x < dw; x++) {
        const { start, w } = wx[x];
        let r = 0, g = 0, b = 0, al = 0;
        for (let k = 0; k < w.length; k++) {
          const p = row + (start + k) * 4, v = w[k];
          r += src[p] * v; g += src[p + 1] * v; b += src[p + 2] * v; al += src[p + 3] * v;
        }
        const t = (y * dw + x) * 4;
        tmp[t] = r; tmp[t + 1] = g; tmp[t + 2] = b; tmp[t + 3] = al;
      }
    }
    const out = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      const { start, w } = wy[y];
      for (let x = 0; x < dw; x++) {
        let r = 0, g = 0, b = 0, al = 0;
        for (let k = 0; k < w.length; k++) {
          const p = ((start + k) * dw + x) * 4, v = w[k];
          r += tmp[p] * v; g += tmp[p + 1] * v; b += tmp[p + 2] * v; al += tmp[p + 3] * v;
        }
        const o = (y * dw + x) * 4;
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = al;
      }
    }
    return out;
  }

  return { resizeRGBA, weights };
});
