/* Slop retouch: the tilt of a picture, from its dominant straight lines (a horizon, or the verticals of a building).
 * Pure, no DOM; Node tests load it (module.exports).
 *   detectTilt(L, w, h, { maxAngle = 15 })  L: luma (Float32Array, w × h; the caller scales the picture to about 400 px)
 *       → { angle, confidence, kind: 'horizon' | 'verticals', lines } or null when there are no strong edges.
 *       angle is in degrees in picture space (y down): a horizon that falls to the right is positive. Rotating the
 *       picture by −angle straightens it.
 *   straightenBox(w, h, angle)  { w, h, scale }: the largest box of the picture's own proportions inside it after the
 *       rotation (the crop that leaves no empty corners).
 * Method: a light blur, then Sobel gradients; the strong edges (the top 8 %, or all within 35 % of the strongest) that run
 * within maxAngle of horizontal (or of vertical, at 0.6 weight) are projected Hough-style at each candidate angle, and the
 * angle with the sharpest projection wins (0.25° steps, then 0.05°): the edge points of a straight line pile into one
 * bin only at its true angle, so stair-stepped pixels and noisy gradient directions do not bias it. confidence is 0 to 1:
 * how much of the edge weight lies on the three strongest lines. */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./core.js') : root.SlopRetouchCore);
  if (req) module.exports = api;
  root.SlopRetouchHorizon = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const DEG = Math.PI / 180;

  function detectTilt(L0, w, h, o = {}) {
    const max = o.maxAngle || 15, pts = [];
    if (w < 8 || h < 8) return null;
    const L = C.boxBlur(Float32Array.from(L0), w, h, 1, 2);   // a light blur: stair-stepped (aliased) edges vote true
    const mags = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1];
      const gy = L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1];
      const m = Math.hypot(gx, gy);
      if (m < 16) continue;
      let th = Math.atan2(gy, gx) / DEG + 90;           // the line's own direction
      th = ((th + 90) % 180 + 180) % 180 - 90;           // into [-90, 90)
      let dev, vert = false;
      if (Math.abs(th) <= max) dev = th;
      else if (Math.abs(th) >= 90 - max) { dev = th > 0 ? th - 90 : th + 90; vert = true; } else continue;
      pts.push({ x, y, m, dev, vert });
      mags.push(m);
    }
    if (pts.length < 12) return null;
    mags.sort((a, b) => b - a);
    const cut = Math.min(mags[Math.min(mags.length - 1, Math.max(11, Math.floor(mags.length * 0.08)))], mags[0] * 0.35);
    const strong = pts.filter((p) => p.m >= cut);
    const BIN = 0.25;
    let total = 0, hMass = 0, vMass = 0;
    for (const p of strong) {
      const wt = p.m * (p.vert ? 0.6 : 1);
      total += wt;
      if (p.vert) vMass += wt; else hMass += wt;
    }
    // the angle at which the edge points line up best: the sharpest projection (sum of squared 1 px bins), first over the
    // whole range in 0.25° steps, then ±0.3° around the best in 0.05° steps
    const score = (a, keep) => {
      const s = Math.sin(a * DEG), c = Math.cos(a * DEG), bins = new Map();
      for (const p of strong) {
        const rho = Math.round(p.vert ? p.x * c + p.y * s : -p.x * s + p.y * c) * 2 + (p.vert ? 1 : 0);
        bins.set(rho, (bins.get(rho) || 0) + p.m * (p.vert ? 0.6 : 1));
      }
      let sc = 0; for (const v of bins.values()) sc += v * v;
      return keep ? bins : sc;
    };
    let angle = 0, top = -1;
    for (let a = -max; a <= max + 1e-9; a += BIN) { const sc = score(a); if (sc > top) { top = sc; angle = a; } }
    for (let a = angle - 0.3, c0 = angle; a <= c0 + 0.3 + 1e-9; a += 0.05) { const sc = score(a); if (sc > top) { top = sc; angle = a; } }
    // confidence: how much of the edge weight lies on the three strongest lines at that angle
    const bins = [...score(angle, true).entries()].sort((x, y) => y[1] - x[1]), used = new Set();
    let onLines = 0;
    for (const [rho] of bins.slice(0, 12)) {
      if (used.size >= 3) break;
      if ([...used].some((u) => Math.abs(u - rho) <= 6)) continue;
      used.add(rho);
      for (const [r2, v] of bins) if (Math.abs(r2 - rho) <= 4) onLines += v;
    }
    const confidence = Math.min(1, (onLines / total) * 1.5);
    return { angle: Math.round(angle * 100) / 100, confidence: Math.round(confidence * 100) / 100, kind: hMass >= vMass ? 'horizon' : 'verticals', lines: strong.length };
  }

  function straightenBox(w, h, angle) {
    const a = Math.abs(angle) * DEG, c = Math.cos(a), s = Math.sin(a);
    const scale = Math.min(w / (w * c + h * s), h / (w * s + h * c));
    return { w: Math.max(1, Math.floor(w * scale)), h: Math.max(1, Math.floor(h * scale)), scale };
  }

  return { detectTilt, straightenBox };
});
