/* Slop Scan: the looks that make a flat photo of a page read like a scan. Pure (no DOM): pictures are { data (RGBA,
 * Uint8ClampedArray), width, height }; Node tests run them, a page gets window.SlopScan.filters.
 *   STYLES                                   the ids, in the panel's order: original, color, gray, bw, photo
 *   integral(v, w, h, sq?) → { s, q }        summed-area tables of v (and of v², for Sauvola), (w + 1) × (h + 1)
 *   paper(img) → [R, G, B] Float32Array     the light falling on the paper: each block's brightest value (the text left
 *                                            out), smoothed, then spread back over the picture
 *   flatten(img, strength) → img             each channel divided by that light: shadows and a colour cast go, paper turns white
 *   levels(img, lo, hi) → img                the darkest lo and the lightest hi share of pixels set to black and white
 *   sauvola(g, w, h, { r, k }) → Uint8Array  1 where a pixel is ink: T = m · (1 + k · (s / 128 − 1)) over a (2r + 1)² window
 *   bradley(g, w, h, { r, t }) → Uint8Array  1 where a pixel is t below its window's mean (Bradley and Roth)
 *   adjust(img, brightness, contrast)        −100..100 each, in place
 *   rotate(img, q) → img                     q quarter turns clockwise
 *   orient(ink, w, h) → 0 | 1                1 when the lines of text run up and down (the picture needs a quarter turn)
 *   style(img, id, { brightness, contrast }) → img   the whole look */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopScan = root.SlopScan || {}).filters = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const STYLES = ['original', 'color', 'gray', 'bw', 'photo'];
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const make = (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  const copy = (img) => ({ data: new Uint8ClampedArray(img.data), width: img.width, height: img.height });

  function integral(v, w, h, sq) {
    const W = w + 1, s = new Float64Array(W * (h + 1)), q = sq ? new Float64Array(W * (h + 1)) : null;
    for (let y = 0; y < h; y++) {
      let rs = 0, rq = 0;
      for (let x = 0; x < w; x++) {
        const a = v[y * w + x], i = (y + 1) * W + x + 1;
        rs += a; s[i] = s[i - W] + rs;
        if (q) { rq += a * a; q[i] = q[i - W] + rq; }
      }
    }
    return { s, q, W };
  }
  /** The sum over the window around (x, y) with radius r, clipped to the picture, and its pixel count. */
  function windowSum(T, w, h, x, y, r, which) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1), W = T.W, a = T[which];
    return [a[y1 * W + x1] - a[y0 * W + x1] - a[y1 * W + x0] + a[y0 * W + x0], (x1 - x0) * (y1 - y0)];
  }
  const luma = (img) => {
    const d = img.data, g = new Float32Array(img.width * img.height);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    return g;
  };

  function paper(img) {
    const w = img.width, h = img.height, d = img.data;
    const B = Math.max(4, Math.round(Math.max(w, h) / 48)), bw = Math.ceil(w / B), bh = Math.ceil(h / B);
    const out = [0, 1, 2].map(() => new Float32Array(w * h));
    for (let c = 0; c < 3; c++) {
      let m = new Float32Array(bw * bh);
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        // the 95th percentile of the block, not its maximum: one glint or speck does not set the paper's light
        const vals = [];
        for (let y = by * B; y < Math.min(h, by * B + B); y += 2) for (let x = bx * B; x < Math.min(w, bx * B + B); x += 2) vals.push(d[(y * w + x) * 4 + c]);
        vals.sort((a, b) => a - b);
        m[by * bw + bx] = vals[Math.floor(vals.length * 0.95)] || 1;
      }
      // the brightest of each 3 × 3 neighbourhood (a block that is all text borrows its neighbour's paper), then two smoothings
      const grow = new Float32Array(m.length);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        let v = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) v = Math.max(v, m[yy * bw + xx]); }
        grow[y * bw + x] = v;
      }
      m = grow;
      for (let pass = 0; pass < 2; pass++) {
        const T = integral(m, bw, bh), sm = new Float32Array(m.length);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const [s, n] = windowSum(T, bw, bh, x, y, 1, 's'); sm[y * bw + x] = s / n; }
        m = sm;
      }
      const o = out[c];
      for (let y = 0; y < h; y++) {
        const fy = Math.min(bh - 1, Math.max(0, (y + 0.5) / B - 0.5)), y0 = Math.floor(fy), y1 = Math.min(bh - 1, y0 + 1), ty = fy - y0;
        for (let x = 0; x < w; x++) {
          const fx = Math.min(bw - 1, Math.max(0, (x + 0.5) / B - 0.5)), x0 = Math.floor(fx), x1 = Math.min(bw - 1, x0 + 1), tx = fx - x0;
          const top = m[y0 * bw + x0] * (1 - tx) + m[y0 * bw + x1] * tx, bot = m[y1 * bw + x0] * (1 - tx) + m[y1 * bw + x1] * tx;
          o[y * w + x] = Math.max(1, top * (1 - ty) + bot * ty);
        }
      }
    }
    return out;
  }
  function flatten(img, strength = 1) {
    const out = copy(img), d = out.data, L = paper(img), n = img.width * img.height;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      const v = d[i * 4 + c], f = clamp((v / L[c][i]) * 255);
      d[i * 4 + c] = v + (f - v) * strength;
    }
    return out;
  }
  function levels(img, lo = 0.01, hi = 0.01) {
    const g = luma(img), hist = new Uint32Array(256), n = g.length;
    for (let i = 0; i < n; i++) hist[g[i] | 0]++;
    let a = 0, b = 255, cum = 0;
    for (let v = 0; v < 256; v++) { cum += hist[v]; if (cum >= n * lo) { a = v; break; } }
    cum = 0;
    for (let v = 255; v >= 0; v--) { cum += hist[v]; if (cum >= n * hi) { b = v; break; } }
    if (b - a < 16) return img;
    const k = 255 / (b - a), d = img.data;
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp((d[i + c] - a) * k);
    return img;
  }
  /** Each pixel's window mean (and spread, with sq) from the summed-area tables: calls fn(i, mean, sd). */
  function windows(g, w, h, r, sq, fn) {
    const T = integral(g, w, h, sq), W = T.W, s = T.s, q = T.q;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r) * W, y1 = Math.min(h, y + r + 1) * W, rows = Math.min(h, y + r + 1) - Math.max(0, y - r);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (x1 - x0) * rows;
        const m = (s[y1 + x1] - s[y0 + x1] - s[y1 + x0] + s[y0 + x0]) / n;
        const sd = q ? Math.sqrt(Math.max(0, (q[y1 + x1] - q[y0 + x1] - q[y1 + x0] + q[y0 + x0]) / n - m * m)) : 0;
        fn(y * w + x, m, sd);
      }
    }
  }
  function sauvola(g, w, h, o = {}) {
    const r = o.r || Math.max(7, Math.round(Math.max(w, h) / 60)), k = o.k == null ? 0.2 : o.k, out = new Uint8Array(w * h);
    windows(g, w, h, r, true, (i, m, sd) => { out[i] = g[i] < m * (1 + k * (sd / 128 - 1)) ? 1 : 0; });
    return out;
  }
  function bradley(g, w, h, o = {}) {
    const r = o.r || Math.max(7, Math.round(Math.max(w, h) / 16)), t = o.t == null ? 0.15 : o.t, out = new Uint8Array(w * h);
    windows(g, w, h, r, false, (i, m) => { out[i] = g[i] < m * (1 - t) ? 1 : 0; });
    return out;
  }
  function adjust(img, brightness = 0, contrast = 0) {
    if (!brightness && !contrast) return img;
    const c = Math.max(-99, Math.min(99, contrast)) * 2.55, f = (259 * (c + 255)) / (255 * (259 - c)), b = brightness * 1.28, d = img.data;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = clamp(f * (v + b - 128) + 128);
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    return img;
  }
  function rotate(img, q) {
    q = ((q % 4) + 4) % 4;
    if (!q) return img;
    const w = img.width, h = img.height, out = make(q === 2 ? w : h, q === 2 ? h : w), s = new Uint32Array(img.data.buffer, img.data.byteOffset, w * h), o = new Uint32Array(out.data.buffer);
    const W = out.width;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = s[y * w + x];
      if (q === 1) o[x * W + (h - 1 - y)] = v; else if (q === 2) o[(h - 1 - y) * W + (w - 1 - x)] = v; else o[(w - 1 - x) * W + y] = v;
    }
    return out;
  }
  /** Quarter turn wanted when the ink's column profile varies much more than its row profile (lines run up and down). */
  function orient(ink, w, h) {
    const rows = new Float64Array(h), cols = new Float64Array(w);
    let n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) { rows[y]++; cols[x]++; n++; }
    if (n < w * h * 0.005) return 0;
    const spread = (a, len) => { let m = 0, v = 0; for (const x of a) m += x / len / a.length; for (const x of a) v += (x / len - m) ** 2; return v / a.length; };
    const vr = spread(rows, w), vc = spread(cols, h);
    return vc > vr * 1.8 ? 1 : 0;
  }
  function inkTo(img, ink) {
    const d = img.data;
    for (let i = 0; i < ink.length; i++) { const v = ink[i] ? 0 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    return img;
  }
  function toGray(img) {
    const g = luma(img), d = img.data;
    for (let i = 0; i < g.length; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g[i];
    return img;
  }
  function saturate(img, k) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      for (let c = 0; c < 3; c++) d[i + c] = clamp(l + (d[i + c] - l) * k);
    }
    return img;
  }
  function style(img, id, o = {}) {
    let out;
    if (id === 'color') out = saturate(levels(flatten(img), 0.02, 0.002), 1.15);
    else if (id === 'gray') out = levels(toGray(flatten(img)), 0.02, 0.002);
    else if (id === 'bw') { const f = adjust(flatten(img), o.brightness || 0, o.contrast || 0); return inkTo(f, sauvola(luma(f), img.width, img.height, { k: 0.25 })); }
    else if (id === 'photo') out = saturate(levels(flatten(img, 0.5), 0.005, 0.005), 1.08);
    else out = copy(img);
    return adjust(out, o.brightness || 0, o.contrast || 0);   // B&W takes them before its threshold (lighter: less ink)
  }
  return { STYLES, integral, luma, paper, flatten, levels, sauvola, bradley, adjust, rotate, orient, toGray, saturate, style, copy, make };
});
