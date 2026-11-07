/* Slop Scan: find the page in a photo. Pure (no DOM): Node tests run it on drawn pictures; a page gets
 * window.SlopScan.detect. Works on a small copy of the photo (about 400 px on the long side; the app makes it).
 *   gray(rgba, w, h) → Float32Array     luma 0..255
 *   blur(g, w, h, r) → Float32Array     two box passes of radius r (close to a Gaussian), from an integral image
 *   sobel(g, w, h) → Float32Array       the gradient's size at each pixel
 *   otsu(values, max) → threshold       the split that best separates two groups (Otsu's method, 256 bins)
 *   find({ data, width, height }) → { quad, found, score, how }
 * The steps: grayscale → blur → Sobel edges → the edge pixels in connected pieces → the convex hull of each large piece
 * → the largest quadrilateral in that hull (geom.maxQuad). A second candidate is the largest bright region (paper is
 * usually lighter than the desk). A candidate counts only when edges run along its four sides (support); the one with
 * the largest area wins. Sides that run along the photo's own border count as supported (a page cut off by the frame).
 * Nothing found: the whole photo less a small margin, found false. */
(function (root, factory) {
  const geom = typeof module === 'object' && module.exports ? require('./geom.js') : (root.SlopScan || {}).geom;
  const api = factory(geom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopScan = root.SlopScan || {}).detect = api;
})(typeof window !== 'undefined' ? window : globalThis, function (G) {
  'use strict';
  const MIN_AREA = 0.12, MAX_AREA = 0.985, MIN_SIDE = 0.4, MIN_MEAN = 0.6, MIN_CONTRAST = 18;

  function gray(d, w, h) {
    const g = new Float32Array(w * h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    return g;
  }
  function boxPass(src, w, h, r) {
    const I = new Float64Array((w + 1) * (h + 1)), out = new Float32Array(w * h), W = w + 1;
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; }
    }
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        out[y * w + x] = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
      }
    }
    return out;
  }
  const blur = (g, w, h, r) => (r < 1 ? g : boxPass(boxPass(g, w, h, r), w, h, r));
  function sobel(g, w, h) {
    const m = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      m[i] = Math.hypot(gx, gy);
    }
    return m;
  }
  function otsu(v, max) {
    const hist = new Float64Array(256), k = 255 / (max || 1);
    for (let i = 0; i < v.length; i++) hist[Math.min(255, Math.max(0, Math.round(v[i] * k)))]++;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let wB = 0, sB = 0, best = 0, at = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = v.length - wB; if (!wF) break;
      sB += t * hist[t];
      const d = sB / wB - (sum - sB) / wF, between = wB * wF * d * d;
      if (between > best) { best = between; at = t; }
    }
    return at / k;
  }
  /** Connected pieces of the marked pixels (8 neighbours), each as its pixel list (y·w + x); pieces under min pixels are left out. */
  function pieces(mask, w, h, min) {
    const seen = new Uint8Array(w * h), out = [], stack = new Int32Array(w * h);
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      let top = 0; const list = [];
      stack[top++] = s; seen[s] = 1;
      while (top) {
        const i = stack[--top], x = i % w, y = (i - x) / w;
        list.push(i);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (mask[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
        }
      }
      if (list.length >= min) out.push(list);
    }
    return out;
  }
  function dilate(mask, w, h) {
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
      }
    }
    return out;
  }
  /** The share of points along each side that lie on an edge (or on the photo's border): [4 numbers 0..1]. */
  function support(q, near, w, h) {
    return [0, 1, 2, 3].map((s) => {
      const a = q[s], b = q[(s + 1) % 4], n = 48;
      let hit = 0;
      for (let k = 1; k < n; k++) {
        const x = Math.round(a.x + ((b.x - a.x) * k) / n), y = Math.round(a.y + ((b.y - a.y) * k) / n);
        if (x <= 2 || y <= 2 || x >= w - 3 || y >= h - 3 || near[y * w + x]) hit++;
      }
      return hit / (n - 1);
    });
  }
  /** How much lighter (or darker) the quad is just inside each side than just outside: the mean difference of the blurred
   *  picture 4 px either side, over the sides that have an outside in the photo. A page differs from its desk; noise does not. */
  function contrast(q, g, w, h) {
    const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4, off = 4, out = [];
    const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= w || y >= h ? null : g[y * w + x]; };
    for (let s = 0; s < 4; s++) {
      const a = q[s], b = q[(s + 1) % 4], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      if (nx * (cx - a.x) + ny * (cy - a.y) < 0) { nx = -nx; ny = -ny; }   // the normal pointing into the quad
      let sum = 0, n = 0;
      for (let k = 2; k < 30; k++) {
        const x = a.x + ((b.x - a.x) * k) / 31, y = a.y + ((b.y - a.y) * k) / 31, i = at(x + nx * off, y + ny * off), o = at(x - nx * off, y - ny * off);
        if (i != null && o != null) { sum += Math.abs(i - o); n++; }
      }
      if (n >= 8) out.push(sum / n);
    }
    return out;
  }
  function quadOf(list, w) {
    const pts = new Array(list.length);
    for (let i = 0; i < list.length; i++) { const x = list[i] % w; pts[i] = { x, y: (list[i] - x) / w }; }
    const hl = G.hull(pts);
    return hl.length < 4 ? null : G.maxQuad(hl.length > 40 ? G.simplify(hl, 40) : hl);
  }

  function find(img) {
    const w = img.width, h = img.height, total = w * h;
    const g = blur(gray(img.data, w, h), w, h, Math.max(1, Math.round(Math.max(w, h) / 200)));
    const mag = sobel(g, w, h);
    let max = 0;
    for (let i = 0; i < mag.length; i++) if (mag[i] > max) max = mag[i];
    const t = Math.max(otsu(mag, max), max * 0.12);
    const edges = new Uint8Array(total);
    for (let i = 0; i < total; i++) edges[i] = mag[i] > t ? 1 : 0;
    const near = dilate(edges, w, h);
    const cands = [];
    for (const list of pieces(edges, w, h, Math.max(20, (w + h) / 8))) cands.push({ q: quadOf(list, w), how: 'edges' });
    // the paper: the largest region brighter than Otsu's split of the blurred picture
    let gmax = 0;
    for (let i = 0; i < g.length; i++) if (g[i] > gmax) gmax = g[i];
    const tb = otsu(g, gmax), bright = new Uint8Array(total);
    for (let i = 0; i < total; i++) bright[i] = g[i] > tb ? 1 : 0;
    const regions = pieces(bright, w, h, total * MIN_AREA).sort((a, b) => b.length - a.length);
    if (regions.length) cands.push({ q: quadOf(regions[0], w), how: 'paper' });
    let best = null;
    for (const c of cands) {
      if (!c.q || !G.convex(c.q)) continue;
      const a = G.area(c.q) / total;
      if (a < MIN_AREA || a > MAX_AREA) continue;
      const s = support(c.q, near, w, h), mean = (s[0] + s[1] + s[2] + s[3]) / 4;
      if (Math.min(...s) < MIN_SIDE || mean < MIN_MEAN) continue;
      const diff = contrast(c.q, g, w, h);
      if (diff.length < 2 || diff.reduce((x, y) => x + y, 0) / diff.length < MIN_CONTRAST) continue;
      const score = a * mean;
      if (!best || score > best.score) best = { quad: c.q, found: true, score, how: c.how };
    }
    return best || { quad: G.inset(w, h), found: false, score: 0, how: 'none' };
  }
  return { gray, blur, sobel, otsu, pieces, support, contrast, find };
});
