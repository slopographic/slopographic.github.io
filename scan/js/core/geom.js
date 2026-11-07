/* Slop Scan: the geometry of a page in a photo. Pure (no DOM), so Node tests load it (module.exports); a page gets
 * window.SlopScan.geom. A quad is four points [{ x, y }] in the order top-left, top-right, bottom-right, bottom-left.
 *   homography(from, to) → H            the 3 × 3 projective map (9 numbers, row by row) taking 4 points onto 4 points
 *   apply(H, x, y) → { x, y }           a point through H;  invert(H) → H⁻¹
 *   order(points) → quad                four points in any order as top-left, top-right, bottom-right, bottom-left
 *   area(poly), convex(quad)            the shoelace area (always ≥ 0); true when the quad is convex and not folded
 *   outSize(quad, maxSide) → { w, h }   the flat page's pixels: the mean of opposite sides, scaled so the long side ≤ maxSide
 *   hull(points) → poly                 the convex hull, counter-clockwise in y-down pixels (monotone chain)
 *   simplify(poly, n) → poly            the hull cut to n points, each time dropping the point that adds the least area
 *   maxQuad(poly) → quad | null         the four points of a convex polygon that enclose the most area
 *   inset(w, h, k) → quad               the whole picture less a margin of k of each side (when no page is found)
 *   norm(quad, w, h), denorm(quad, w, h)  pixels ↔ 0..1, so a quad holds for every size of the same photo
 *   turn(quad, q)                       a 0..1 quad turned q quarter turns clockwise with its picture */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopScan = root.SlopScan || {}).geom = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Solves A·x = b (n × n, row-major arrays) by Gaussian elimination with partial pivoting. Null when singular. */
  function solve(A, b) {
    const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }
  function homography(from, to) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = from[i], u = to[i].x, v = to[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solve(A, b);
    return h ? h.concat([1]) : null;
  }
  function apply(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
  }
  function invert(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-15) return null;
    const m = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
    return m.map((v) => v / det);
  }

  function order(pts) {
    const p = pts.map((q) => ({ x: q.x, y: q.y }));
    const cx = p.reduce((s, q) => s + q.x, 0) / 4, cy = p.reduce((s, q) => s + q.y, 0) / 4;
    // by the angle around the centre, clockwise on screen (y down) starting from the top-left quarter
    p.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    let start = 0, best = Infinity;
    p.forEach((q, i) => { const s = q.x + q.y; if (s < best) { best = s; start = i; } });
    return [0, 1, 2, 3].map((k) => p[(start + k) % 4]);
  }
  function area(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.y - b.x * a.y; }
    return Math.abs(s) / 2;
  }
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  function convex(q) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
      if (Math.abs(c) < 1e-9) return false;
      if (!sign) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
    }
    return true;
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function outSize(q, maxSide) {
    let w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
    const k = maxSide ? Math.min(1, maxSide / Math.max(w, h)) : 1;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  function hull(points) {
    const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const lo = [], hi = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }
  function simplify(poly, n) {
    const p = poly.slice();
    const tri = (i) => Math.abs(cross(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]));
    while (p.length > n) {
      let k = 0, least = Infinity;
      for (let i = 0; i < p.length; i++) { const a = tri(i); if (a < least) { least = a; k = i; } }
      p.splice(k, 1);
    }
    return p;
  }
  function maxQuad(poly) {
    const n = poly.length;
    if (n < 4) return null;
    const t = (a, b, c) => Math.abs(cross(poly[a], poly[b], poly[c])) / 2;
    let best = -1, out = null;
    // a diagonal (i, k) splits the quad into two triangles; each takes the best apex on its side of the polygon
    for (let i = 0; i < n; i++) for (let k = i + 2; k < n; k++) {
      if (i === 0 && k === n - 1) continue;
      let a1 = -1, j1 = -1, a2 = -1, j2 = -1;
      for (let j = i + 1; j < k; j++) { const a = t(i, j, k); if (a > a1) { a1 = a; j1 = j; } }
      for (let j = k + 1; j < n + i; j++) { const jj = j % n, a = t(k, jj, i); if (a > a2) { a2 = a; j2 = jj; } }
      if (j1 < 0 || j2 < 0) continue;
      if (a1 + a2 > best) { best = a1 + a2; out = [poly[i], poly[j1], poly[k], poly[j2]]; }
    }
    return out ? order(out) : null;
  }
  const inset = (w, h, k = 0.04) => [{ x: w * k, y: h * k }, { x: w * (1 - k), y: h * k }, { x: w * (1 - k), y: h * (1 - k) }, { x: w * k, y: h * (1 - k) }];
  const norm = (q, w, h) => q.map((p) => ({ x: p.x / w, y: p.y / h }));
  const denorm = (q, w, h) => q.map((p) => ({ x: p.x * w, y: p.y * h }));
  /** A 0..1 quad turned with its picture: a point (x, y) of the old picture is (1 - y, x) in one turned a quarter clockwise. */
  function turn(q, n) {
    let out = q.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 0; i < ((n % 4) + 4) % 4; i++) out = out.map((p) => ({ x: 1 - p.y, y: p.x }));
    return order(out);
  }
  return { solve, homography, apply, invert, order, area, convex, outSize, hull, simplify, maxQuad, inset, norm, denorm, turn, dist };
});
