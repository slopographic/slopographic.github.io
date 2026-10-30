/* Slop retouch: automatic tone and colour (PhotoSlop's Filter ▸ Auto Enhance… and Auto retouch's "Auto enhance").
 * Pure, no DOM; Node tests load it (module.exports). analyse() looks at a small copy of the picture (the caller scales it
 * to about 256 px) and returns the values; apply() renders them at any size. In this order:
 *   1. white balance: grey-world (strongly coloured and clipped pixels count less or not at all) blended with
 *      white-patch (the brightest 2 %), gains kept at 0.6–1.6 and luminance kept; the clipping guard scales them down so
 *      no channel's 99.5th percentile is pushed past white
 *   2. levels: black and white points from the 0.5 and 99.5 percentiles of the balanced luma, at least 16 levels apart
 *   3. exposure: a midtone (gamma) lift (up to 0.6 EV) or a gentler cut (0.3 EV), about half the way from the median to
 *      mid-grey; black and white stay where they are, so it cannot clip
 *   4. shadows and highlights: lift dark areas and pull bright areas, by the local (blurred) brightness
 *   5. vibrance: more colour where there is little, less on skin (shared/retouch/skin.js) unless skin is false
 *   6. gentle sharpening: unsharp mask on luma, radius 1, details below 2 levels left alone (noise)
 *   strength (0–100) blends the result with the original.
 * The values (all optional; a missing one is neutral): { wr, wg, wb, inB, inW, ev, shadows, highlights, sat, skin,
 * sharpen, strength }. */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./core.js') : root.SlopRetouchCore, req ? require('./skin.js') : root.SlopRetouchSkin);
  if (req) module.exports = api;
  root.SlopRetouchTone = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, S) {
  'use strict';
  const { clamp, luma, boxBlur } = C;
  const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

  function percentile(hist, p) {
    let tot = 0; for (const v of hist) tot += v;
    let acc = 0; for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= tot * p) return i; }
    return hist.length - 1;
  }
  /** Black and white points of the luma (after gains g, when given). */
  function levelsOf(d, g = [1, 1, 1]) {
    const hl = new Uint32Array(256);
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) { hl[clamp(Math.round(luma(d[i] * g[0], d[i + 1] * g[1], d[i + 2] * g[2])), 0, 255)]++; n++; }
    if (!n) return null;
    let lo = percentile(hl, 0.005), hi = percentile(hl, 0.995);
    if (hi - lo < 16) { lo = clamp(Math.round((lo + hi) / 2 - 8), 0, 239); hi = lo + 16; }
    return { lo, hi };
  }
  const levelsLut = (lo, hi) => { const l = new Float32Array(256), s = Math.max(1, hi - lo); for (let v = 0; v < 256; v++) l[v] = clamp((v - lo) / s, 0, 1) * 255; return l; };
  /** The tone curve of one channel: gain, then levels, then the exposure (gamma), as a 256-entry table. */
  function channelLut(gain, lo, hi, ev) {
    const l = new Float32Array(256), s = Math.max(1, hi - lo), inv = 1 / Math.pow(2, ev || 0);
    for (let v = 0; v < 256; v++) l[v] = Math.pow(clamp((Math.min(255, v * gain) - lo) / s, 0, 1), inv) * 255;
    return l;
  }

  /** White balance gains { wr, wg, wb } of the picture's own pixels. The grey-world estimate is refined three times: each
   *  pass looks at the colours as the last gains would make them, and counts the nearly grey ones most, so a few bright
   *  objects do not pull the balance. */
  function whiteBalance(d) {
    const ls = [], hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 8) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      hr[r]++; hg[g]++; hb[b]++;
      if (mx < 250 && mn > 4) ls.push(luma(r, g, b), r, g, b);   // clipped pixels say nothing about the light
    }
    if (ls.length < 16) return { wr: 1, wg: 1, wb: 1 };
    let g1 = [1, 1, 1];
    for (let pass = 0; pass < 4; pass++) {
      const [a0, a1] = pass ? [0.12, 0.4] : [0.45, 0.8];
      let gw = 0, gR = 0, gG = 0, gB = 0;
      for (let i = 0; i < ls.length; i += 4) {
        const r = ls[i + 1], g = ls[i + 2], b = ls[i + 3], R = r * g1[0], G = g * g1[1], B = b * g1[2], mx = Math.max(R, G, B);
        const k = 1 - C.smoothstep(a0, a1, mx ? (mx - Math.min(R, G, B)) / mx : 0);
        gw += k; gR += r * k; gG += g * k; gB += b * k;
      }
      if (gw < 4) break;
      const gm = (gR + gG + gB) / 3;
      g1 = [gm / Math.max(gR, 1), gm / Math.max(gG, 1), gm / Math.max(gB, 1)];
    }
    const idx = []; for (let i = 0; i < ls.length; i += 4) idx.push(i);
    idx.sort((a, b) => ls[b] - ls[a]);
    const top = idx.slice(0, Math.max(3, Math.round(idx.length * 0.02)));
    let tR = 0, tG = 0, tB = 0; for (const i of top) { tR += ls[i + 1]; tG += ls[i + 2]; tB += ls[i + 3]; }
    const tm = (tR + tG + tB) / 3, g2 = [tm / Math.max(tR, 1), tm / Math.max(tG, 1), tm / Math.max(tB, 1)];
    let g = g1.map((v, c) => clamp(Math.pow(v, 0.7) * Math.pow(g2[c], 0.3), 0.6, 1.6));
    const k = 1 / luma(g[0], g[1], g[2]);
    g = g.map((v) => v * k);
    const p = [percentile(hr, 0.995), percentile(hg, 0.995), percentile(hb, 0.995)];
    const over = Math.max(...g.map((v, c) => (v * Math.max(p[c], 1)) / 255));
    if (over > 1.02) g = g.map((v) => v / (over / 1.02));   // the guard
    return { wr: round(g[0], 3), wg: round(g[1], 3), wb: round(g[2], 3) };
  }

  function analyse(d) {
    const neutral = { inB: 0, inW: 255, wr: 1, wg: 1, wb: 1, ev: 0, shadows: 0, highlights: 0, sat: 0, sharpen: 0 };
    const wb = whiteBalance(d), G = [wb.wr, wb.wg, wb.wb], L = levelsOf(d, G);
    if (!L) return neutral;
    const lv = levelsLut(L.lo, L.hi), hm = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) hm[Math.round(lv[clamp(Math.round(luma(d[i] * G[0], d[i + 1] * G[1], d[i + 2] * G[2])), 0, 255)])]++;
    const med = clamp(percentile(hm, 0.5), 4, 251) / 255;
    const ev = round(clamp(0.45 * Math.log2(Math.log(med) / Math.log(124 / 255)), -0.3, 0.6), 2);
    const R = channelLut(G[0], L.lo, L.hi, ev), Gl = channelLut(G[1], L.lo, L.hi, ev), B = channelLut(G[2], L.lo, L.hi, ev);
    let dark = 0, bright = 0, sat = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 8) continue;
      const r = R[d[i]], g = Gl[d[i + 1]], b = B[d[i + 2]], l = luma(r, g, b), mx = Math.max(r, g, b);
      n++; if (l < 30) dark++; else if (l > 250) bright++;
      sat += mx ? (mx - Math.min(r, g, b)) / mx : 0;
    }
    return {
      inB: L.lo, inW: L.hi, wr: wb.wr, wg: wb.wg, wb: wb.wb, ev,
      shadows: Math.round(clamp((dark / n - 0.05) * 200, 0, 40)), highlights: Math.round(clamp((bright / n - 0.01) * 300, 0, 35)),
      sat: Math.round(clamp((0.24 - sat / n) * 80, 0, 18)), sharpen: 25,
    };
  }

  function apply(d, w, h, p) {
    const n = w * h, lo = p.inB ?? 0, hi = p.inW ?? 255;
    const lr = channelLut(p.wr ?? 1, lo, hi, p.ev), lg = channelLut(p.wg ?? 1, lo, hi, p.ev), lb = channelLut(p.wb ?? 1, lo, hi, p.ev);
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) { R[i] = lr[d[i * 4]]; G[i] = lg[d[i * 4 + 1]]; B[i] = lb[d[i * 4 + 2]]; }
    const sh = (p.shadows || 0) / 100, hl = (p.highlights || 0) / 100;
    if (sh || hl) {
      const Lb = new Float32Array(n);
      for (let i = 0; i < n; i++) Lb[i] = luma(R[i], G[i], B[i]);
      boxBlur(Lb, w, h, Math.max(2, Math.round(Math.max(w, h) / 40)));
      for (let i = 0; i < n; i++) {
        const b = Lb[i], k = b < 128 ? 1 + sh * 1.5 * (1 - b / 128) ** 2 : 1 - hl * 0.4 * ((b - 128) / 127) ** 2;
        R[i] = Math.min(255, R[i] * k); G[i] = Math.min(255, G[i] * k); B[i] = Math.min(255, B[i] * k);
      }
    }
    const vib = (p.sat || 0) / 100;
    if (vib) for (let i = 0; i < n; i++) {
      const r = R[i], g = G[i], b = B[i], l = luma(r, g, b), mx = Math.max(r, g, b), s = mx ? (mx - Math.min(r, g, b)) / mx : 0;
      const f = 1 + vib * 1.4 * (1 - s) * (p.skin === false ? 1 : 1 - 0.75 * S.skinWeight(r, g, b));
      R[i] = clamp(l + (r - l) * f, 0, 255); G[i] = clamp(l + (g - l) * f, 0, 255); B[i] = clamp(l + (b - l) * f, 0, 255);
    }
    const amt = (p.sharpen || 0) / 100;
    if (amt) {
      const Ls = new Float32Array(n);
      for (let i = 0; i < n; i++) Ls[i] = luma(R[i], G[i], B[i]);
      const bl = boxBlur(Float32Array.from(Ls), w, h, 1, 2);
      for (let i = 0; i < n; i++) {
        let det = Ls[i] - bl[i];
        if (Math.abs(det) < 2) continue;
        det *= amt;
        R[i] = clamp(R[i] + det, 0, 255); G[i] = clamp(G[i] + det, 0, 255); B[i] = clamp(B[i] + det, 0, 255);
      }
    }
    const t = clamp((p.strength ?? 100) / 100, 0, 1), out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const q = i * 4;
      out[q] = d[q] + (R[i] - d[q]) * t; out[q + 1] = d[q + 1] + (G[i] - d[q + 1]) * t; out[q + 2] = d[q + 2] + (B[i] - d[q + 2]) * t; out[q + 3] = d[q + 3];
    }
    return out;
  }

  return { analyse, apply, whiteBalance, levelsOf, levelsLut, channelLut, percentile };
});
