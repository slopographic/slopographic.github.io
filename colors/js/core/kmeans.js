/* Slop Colors: the dominant colours of a picture, by k-means in OKLab (distances there match what eyes see), seeded so
 * the same picture and settings give the same colours every time. Pure; the factory takes the convert module.
 *   rng(seed) → () → [0, 1)            mulberry32, a small seeded generator
 *   dominant(rgba, { k = 6, seed = 1, samples = 20000, iterations = 24 }) → [{ hex, share (0-1), count }]
 *       rgba: the picture's RGBA bytes (ImageData.data). Pixels under half opacity are skipped. A large picture is
 *       sampled (every n-th pixel, with a seeded offset). Starts with k-means++, then moves the centres until they settle.
 *       Each colour is the mean of its pixels in RGB (so a flat block gives its exact colour), largest share first;
 *       clusters left empty are dropped, and colours that round to the same hex are merged. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else (root.SlopColors = root.SlopColors || {}).kmeans = factory(root.SlopColors.convert);
})(typeof window !== 'undefined' ? window : globalThis, function (C) {
  'use strict';
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

  function samplePixels(rgba, max, rand) {
    const n = Math.floor(rgba.length / 4), step = Math.max(1, Math.floor(n / max)), out = [];
    for (let i = Math.floor(rand() * step); i < n; i += step) {
      const o = i * 4;
      if (rgba[o + 3] < 128) continue;
      out.push([rgba[o], rgba[o + 1], rgba[o + 2]]);
    }
    return out;
  }

  function dominant(rgba, o = {}) {
    const k = Math.max(1, Math.min(32, Math.round(o.k || 6))), rand = rng(o.seed == null ? 1 : o.seed);
    const px = samplePixels(rgba, o.samples || 20000, rand);
    if (!px.length) return [];
    // unique colours first: a picture with few colours needs no clustering, and the lab maths runs once per colour
    const uniq = new Map();
    for (const p of px) { const key = (p[0] << 16) | (p[1] << 8) | p[2]; const u = uniq.get(key); if (u) u.n++; else uniq.set(key, { rgb: p, n: 1 }); }
    const pts = [...uniq.values()].map((u) => ({ rgb: u.rgb, n: u.n, lab: C.rgbToOklab(...u.rgb) }));
    let centres;
    if (pts.length <= k) centres = pts.map((p) => p.lab.slice());
    else {
      // k-means++: the first centre at random (weighted by pixel count), each next one far from those chosen
      const pick = (weights) => { const sum = weights.reduce((s, w) => s + w, 0); let t = rand() * sum; for (let i = 0; i < weights.length; i++) { t -= weights[i]; if (t <= 0) return i; } return weights.length - 1; };
      centres = [pts[pick(pts.map((p) => p.n))].lab.slice()];
      const near = pts.map((p) => d2(p.lab, centres[0]));
      while (centres.length < k) {
        const i = pick(near.map((d, j) => d * pts[j].n));
        centres.push(pts[i].lab.slice());
        pts.forEach((p, j) => { near[j] = Math.min(near[j], d2(p.lab, centres[centres.length - 1])); });
      }
    }
    const of = new Array(pts.length).fill(0);
    for (let it = 0; it < (o.iterations || 24); it++) {
      let moved = false;
      pts.forEach((p, j) => {
        let best = 0, bd = Infinity;
        centres.forEach((c, i) => { const d = d2(p.lab, c); if (d < bd) { bd = d; best = i; } });
        if (of[j] !== best) { of[j] = best; moved = true; }
      });
      const sum = centres.map(() => [0, 0, 0, 0]);
      pts.forEach((p, j) => { const s = sum[of[j]]; s[0] += p.lab[0] * p.n; s[1] += p.lab[1] * p.n; s[2] += p.lab[2] * p.n; s[3] += p.n; });
      centres = centres.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c));
      if (!moved && it) break;
    }
    const groups = centres.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    pts.forEach((p, j) => { const g = groups[of[j]]; g.r += p.rgb[0] * p.n; g.g += p.rgb[1] * p.n; g.b += p.rgb[2] * p.n; g.n += p.n; });
    const total = px.length, merged = new Map();
    for (const g of groups) {
      if (!g.n) continue;
      const hex = C.hexOf([g.r / g.n, g.g / g.n, g.b / g.n]);
      merged.set(hex, (merged.get(hex) || 0) + g.n);
    }
    return [...merged].map(([hex, count]) => ({ hex, count, share: count / total })).sort((a, b) => b.count - a.count || (a.hex < b.hex ? -1 : 1));
  }
  return { rng, dominant };
});
