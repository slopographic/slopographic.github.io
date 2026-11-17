/* Slop retouch: portrait maths (PhotoSlop's Auto retouch ▸ Portrait). Pure, no DOM; Node tests load it (module.exports).
 *   smoothSkin(d, w, h, mask, { strength, radius })  frequency separation inside the mask (Uint8Array 0..255):
 *       fine = picture − blur(r/4)   pores and fine texture, kept (lightly softened at full strength)
 *       mid  = blur(r/4) − blur(r)   blotches, uneven tone and small marks: reduced by the strength
 *       base = blur(r)               the colour and light of the skin, kept
 *     The blurs are normalised by the mask, so the background never bleeds into the skin, and a mid-band step stronger
 *     than about 18 levels (an edge: a nostril, the jaw line) is kept. strength 0–100; radius in px (the blotch size).
 *   whiten(d, w, h, region, amount, kind)  teeth ('teeth') or the whites of the eyes ('eyes'): inside region (Float32Array
 *     0..1) the bright, low-saturation pixels lose their yellow and get a little lighter; lips and skin are left alone.
 *     → { data, mask }: the whitened picture and where it changed (Uint8Array 0..255).
 *   regionMap(w, h, ellipses)  Float32Array 0..1 of the soft ellipses ({ x, y, rx, ry }). */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./core.js') : root.SlopRetouchCore, req ? require('./skin.js') : root.SlopRetouchSkin);
  if (req) module.exports = api;
  root.SlopRetouchPortrait = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, S) {
  'use strict';
  const { clamp, smoothstep, luma } = C;

  function smoothSkin(d, w, h, mask, o = {}) {
    const n = w * h, k0 = clamp((o.strength ?? 50) / 100, 0, 1), r2 = Math.max(2, Math.round(o.radius || Math.min(w, h) / 100));
    const r1 = Math.max(1, Math.round(r2 / 4)), m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = mask[i] / 255;
    const ch = C.channels(d, w, h), low = C.normBlur(ch, m, w, h, r1), base = C.normBlur(ch, m, w, h, r2);
    const out = new Uint8ClampedArray(d);
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      const midL = luma(low[0][i] - base[0][i], low[1][i] - base[1][i], low[2][i] - base[2][i]);
      const k = k0 * (1 - smoothstep(18, 40, Math.abs(midL)));
      for (let c = 0; c < 3; c++) {
        const x = ch[c][i], fine = x - low[c][i], mid = low[c][i] - base[c][i];
        out[i * 4 + c] = base[c][i] + mid * (1 - k) + fine * (1 - 0.25 * k);
      }
    }
    return out;
  }

  function regionMap(w, h, ellipses) {
    const out = new Float32Array(w * h);
    for (const e of ellipses) {
      const x0 = Math.max(0, Math.floor(e.x - e.rx * 1.1)), x1 = Math.min(w, Math.ceil(e.x + e.rx * 1.1));
      const y0 = Math.max(0, Math.floor(e.y - e.ry * 1.1)), y1 = Math.min(h, Math.ceil(e.y + e.ry * 1.1));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[y * w + x] = Math.max(out[y * w + x], S.inEllipse(e, x + 0.5, y + 0.5));
    }
    return out;
  }

  function whiten(d, w, h, region, amount, kind = 'teeth') {
    const n = w * h, a = clamp(amount / 100, 0, 1), out = new Uint8ClampedArray(d), mask = new Uint8Array(n);
    const minY = kind === 'eyes' ? 110 : 80;
    for (let i = 0; i < n; i++) {
      if (!region[i]) continue;
      const q = i * 4, r = d[q], g = d[q + 1], b = d[q + 2], Y = luma(r, g, b), mx = Math.max(r, g, b);
      const sat = mx ? (mx - Math.min(r, g, b)) / mx : 0, Cb = S.cb(r, g, b), Cr = S.cr(r, g, b);
      // bright, not very colourful, and not red (lips, skin, the iris and the pupil are left alone)
      const wt = region[i] * smoothstep(minY - 30, minY, Y) * (1 - smoothstep(0.35, 0.6, sat)) * (1 - smoothstep(146, 160, Cr));
      if (wt < 0.02) continue;
      const k = a * wt;
      const nY = Y + (255 - Y) * 0.16 * k, nCb = Cb + (128 - Cb) * 0.75 * k, nCr = Cr + (128 - Cr) * 0.4 * k;
      out[q] = nY + 1.402 * (nCr - 128);
      out[q + 1] = nY - 0.344136 * (nCb - 128) - 0.714136 * (nCr - 128);
      out[q + 2] = nY + 1.772 * (nCb - 128);
      mask[i] = Math.round(wt * 255);
    }
    return { data: out, mask };
  }

  return { smoothSkin, whiten, regionMap };
});
