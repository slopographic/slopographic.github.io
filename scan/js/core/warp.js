/* Slop Scan: the page cut out of the photo and made flat (a perspective warp). Pure (no DOM); a page gets
 * window.SlopScan.warp, Node tests load it.
 *   warp(src, quad, w, h) → { data, width, height }   src is { data (RGBA), width, height }; quad the page's corners in
 *       src pixels (top-left, top-right, bottom-right, bottom-left). Each pixel of the w × h result is read back through
 *       the homography from the result's corners to the quad, with bilinear sampling; outside the photo reads white. */
(function (root, factory) {
  const geom = typeof module === 'object' && module.exports ? require('./geom.js') : (root.SlopScan || {}).geom;
  const api = factory(geom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopScan = root.SlopScan || {}).warp = api;
})(typeof window !== 'undefined' ? window : globalThis, function (G) {
  'use strict';
  function warp(src, quad, w, h) {
    const H = G.homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], quad);
    if (!H) throw new Error('The corners do not make a page');
    const sw = src.width, sh = src.height, s = src.data, out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const cy = y + 0.5;
      // along a row the three projective sums change by a constant step: one multiply-add each per pixel
      let X = H[0] * 0.5 + H[1] * cy + H[2], Y = H[3] * 0.5 + H[4] * cy + H[5], Z = H[6] * 0.5 + H[7] * cy + H[8];
      for (let x = 0, o = y * w * 4; x < w; x++, o += 4, X += H[0], Y += H[3], Z += H[6]) {
        const u = X / Z - 0.5, v = Y / Z - 0.5;
        if (u < -0.5 || v < -0.5 || u > sw - 0.5 || v > sh - 0.5) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255; continue; }
        const x0 = u < 0 ? 0 : u | 0, y0 = v < 0 ? 0 : v | 0, x1 = x0 + 1 < sw ? x0 + 1 : x0, y1 = y0 + 1 < sh ? y0 + 1 : y0;
        const fx = u < 0 ? 0 : u - x0, fy = v < 0 ? 0 : v - y0;
        const a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, d = (y1 * sw + x1) * 4;
        for (let k = 0; k < 3; k++) {
          const top = s[a + k] + (s[b + k] - s[a + k]) * fx, bot = s[c + k] + (s[d + k] - s[c + k]) * fx;
          out[o + k] = top + (bot - top) * fy;
        }
        out[o + 3] = 255;
      }
    }
    return { data: out, width: w, height: h };
  }
  return { warp };
});
