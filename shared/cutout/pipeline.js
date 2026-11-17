/* SlopCutout pipeline, part 1: pure image math (no DOM, no ONNX). Classic script that runs in a page
 * (<script>) or in a worker (importScripts). Sets self.SlopCutoutPipeline; refine.js adds the
 * edge-aware parts. Conventions: RGBA images are Uint8ClampedArray (w*h*4); masks are Uint8ClampedArray
 * (w*h, 0..255) or Float32Array (w*h, 0..1) where noted. Every resize is pixel-centre aligned. */
(function (root) {
  'use strict';
  const P = root.SlopCutoutPipeline = root.SlopCutoutPipeline || {};
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  P.clamp = clamp;

  /** Resample one axis of an n-channel float image. Area average when shrinking, linear when growing. */
  function axis(src, sw, sh, n, dw, horizontal) {
    const len = horizontal ? sw : sh, other = horizontal ? sh : sw, out = new Float32Array((horizontal ? dw * sh : sw * dw) * n);
    const scale = len / dw;
    // Precompute taps for each output index along the axis.
    const taps = new Array(dw);
    for (let i = 0; i < dw; i++) {
      const t = [];
      if (scale > 1) {
        const a = i * scale, b = a + scale;
        for (let k = Math.floor(a); k < Math.ceil(b) && k < len; k++) { const w = Math.min(b, k + 1) - Math.max(a, k); if (w > 1e-6) t.push(k, w / scale); }
      } else {
        const x = clamp((i + 0.5) * scale - 0.5, 0, len - 1), k0 = Math.floor(x), k1 = Math.min(k0 + 1, len - 1), f = x - k0;
        t.push(k0, 1 - f); if (f > 0) t.push(k1, f);
      }
      taps[i] = t;
    }
    for (let o = 0; o < other; o++) {
      for (let i = 0; i < dw; i++) {
        const t = taps[i], di = (horizontal ? o * dw + i : i * sw + o) * n;
        for (let c = 0; c < n; c++) {
          let s = 0;
          for (let j = 0; j < t.length; j += 2) s += src[(horizontal ? o * sw + t[j] : t[j] * sw + o) * n + c] * t[j + 1];
          out[di + c] = s;
        }
      }
    }
    return out;
  }
  /** Resize an n-channel image (any typed array) to dw×dh. Returns Float32Array. */
  P.resample = function (src, sw, sh, n, dw, dh) {
    dw = Math.max(1, Math.round(dw)); dh = Math.max(1, Math.round(dh));
    const h = sw === dw ? Float32Array.from(src) : axis(src, sw, sh, n, dw, true);
    return sh === dh ? h : axis(h, dw, sh, n, dh, false);
  };
  /** RGBA (Uint8ClampedArray) → RGBA dw×dh (Uint8ClampedArray). */
  P.resizeRGBA = (src, sw, sh, dw, dh) => new Uint8ClampedArray(P.resample(src, sw, sh, 4, dw, dh));
  /** Single-channel bilinear resize (Float32Array in, Float32Array out). Used to upscale masks. */
  P.resize1 = function (src, sw, sh, dw, dh) {
    const out = new Float32Array(dw * dh), sx = sw / dw, sy = sh / dh;
    const x0 = new Int32Array(dw), x1 = new Int32Array(dw), fx = new Float32Array(dw);
    for (let x = 0; x < dw; x++) { const u = clamp((x + 0.5) * sx - 0.5, 0, sw - 1); x0[x] = Math.floor(u); x1[x] = Math.min(x0[x] + 1, sw - 1); fx[x] = u - x0[x]; }
    for (let y = 0; y < dh; y++) {
      const v = clamp((y + 0.5) * sy - 0.5, 0, sh - 1), y0 = Math.floor(v), y1 = Math.min(y0 + 1, sh - 1), fy = v - y0;
      const r0 = y0 * sw, r1 = y1 * sw, o = y * dw;
      for (let x = 0; x < dw; x++) {
        const a = src[r0 + x0[x]] + (src[r0 + x1[x]] - src[r0 + x0[x]]) * fx[x];
        const b = src[r1 + x0[x]] + (src[r1 + x1[x]] - src[r1 + x0[x]]) * fx[x];
        out[o + x] = a + (b - a) * fy;
      }
    }
    return out;
  };

  /** RGBA → planar NCHW float tensor: ((v / div) - mean) / std. maxNorm divides by the image's
   *  brightest channel value (what U²-Net/IS-Net were trained with) instead of 255. */
  P.toTensor = function (rgba, w, h, { mean = [0, 0, 0], std = [1, 1, 1], maxNorm = false } = {}) {
    const n = w * h, out = new Float32Array(3 * n);
    let div = 255;
    if (maxNorm) { let m = 0; for (let i = 0; i < n * 4; i += 4) { if (rgba[i] > m) m = rgba[i]; if (rgba[i + 1] > m) m = rgba[i + 1]; if (rgba[i + 2] > m) m = rgba[i + 2]; } div = Math.max(m, 1e-6); }
    for (let c = 0; c < 3; c++) {
      const k = 1 / (div * std[c]), b = mean[c] / std[c], o = c * n;
      for (let i = 0; i < n; i++) out[o + i] = rgba[i * 4 + c] * k - b;
    }
    return out;
  };
  /** Stretch values to 0..1 in place (the U²-Net/IS-Net output convention). */
  P.minMax = function (a) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    const k = hi - lo > 1e-8 ? 1 / (hi - lo) : 0;
    for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * k;
    return a;
  };
  /** Float 0..1 → Uint8ClampedArray 0..255 (and back). */
  P.toU8 = (f) => { const o = new Uint8ClampedArray(f.length); for (let i = 0; i < f.length; i++) o[i] = f[i] * 255 + 0.5; return o; };
  P.toF32 = (u) => { const o = new Float32Array(u.length); for (let i = 0; i < u.length; i++) o[i] = u[i] / 255; return o; };

  /** Separable box mean of radius r (window 2r+1), edges use the pixels that exist. Float32 in/out. */
  P.boxBlur = function (src, w, h, r) {
    if (r < 1) return Float32Array.from(src);
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0, c = 0;
      for (let x = 0; x <= Math.min(r, w - 1); x++) { s += src[o + x]; c++; }
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s / c;
        const add = x + r + 1, sub = x - r;
        if (add < w) { s += src[o + add]; c++; }
        if (sub >= 0) { s -= src[o + sub]; c--; }
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let y = 0; y <= Math.min(r, h - 1); y++) { s += tmp[y * w + x]; c++; }
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / c;
        const add = y + r + 1, sub = y - r;
        if (add < h) { s += tmp[add * w + x]; c++; }
        if (sub >= 0) { s -= tmp[sub * w + x]; c--; }
      }
    }
    return out;
  };

  /** Threshold / matte levels on a 0..255 mask: values below threshold - softness/2 become 0, above
   *  threshold + softness/2 become 255, linear in between. threshold .5 + softness 1 = unchanged. */
  P.matte = function (mask, threshold = 0.5, softness = 1) {
    const out = new Uint8ClampedArray(mask.length);
    const lo = (threshold - softness / 2) * 255, hi = (threshold + softness / 2) * 255;
    if (hi - lo < 1) { const t = threshold * 255; for (let i = 0; i < mask.length; i++) out[i] = mask[i] >= t ? 255 : 0; return out; }
    const k = 255 / (hi - lo);
    for (let i = 0; i < mask.length; i++) out[i] = (mask[i] - lo) * k;
    return out;
  };
  /** Refine-brush edits: edit 128 = untouched, 255 = fully keep, 0 = fully remove. In place. */
  P.applyEdit = function (alpha, edit) {
    for (let i = 0; i < alpha.length; i++) {
      const e = edit[i];
      if (e > 128) alpha[i] = alpha[i] + (255 - alpha[i]) * (e - 128) / 127;
      else if (e < 128) alpha[i] = alpha[i] * e / 128;
    }
    return alpha;
  };
  /** Feather (soften) a 0..255 mask by about `radius` px: three box passes ≈ a Gaussian. */
  P.feather = function (mask, w, h, radius) {
    if (!(radius > 0)) return Uint8ClampedArray.from(mask);
    const r = Math.max(1, Math.round(radius / 1.7));
    let f = P.toF32(mask);
    for (let i = 0; i < 3; i++) f = P.boxBlur(f, w, h, r);
    return P.toU8(f);
  };
  /** Bounding box of mask > thr: {x, y, w, h} or null when empty. */
  P.bbox = function (mask, w, h, thr = 8) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) if (mask[o + x] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  /** Copy of rgba with its alpha channel set from mask (multiplied with the existing alpha). */
  P.compose = function (rgba, mask) {
    const out = new Uint8ClampedArray(rgba);
    for (let i = 0, j = 3; i < mask.length; i++, j += 4) out[j] = rgba[j] * mask[i] / 255;
    return out;
  };
})(typeof self !== 'undefined' ? self : globalThis);
