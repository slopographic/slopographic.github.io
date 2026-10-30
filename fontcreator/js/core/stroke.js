/* Slop Font: strokes made into outlines. A skeleton (the centre line of a letter, as points or SVG path data) drawn
 * with a pen of a given width becomes filled contours. The pen is laid down on a fine grid (every point within half the
 * width of a centre line is ink: round joins, and round, square or flat ends), and the ink is outlined by the tracer
 * (core/trace.js fromBits: boundary loops, smoothed, curves fitted), so any number of crossing and overlapping strokes
 * merge into one clean outline with no polygon booleans. The grid is fine enough (at most 2 units a pixel for a usual
 * pen) that the outline is within about a unit of the exact one. This is how a monoline font is drawn quickly, by hand
 * (the Stroke tool) or by the assistant ("a rounded monospace font for the digits"). Pure; needs the paths and trace
 * modules and SVGeom (in Node, pass them). Font units, y up.
 *   outline(strokes, opts) → contours
 *     strokes: [{ points: [[x, y], …], closed? } | { d: 'M… C…' }]   (d is flattened; open or closed subpaths)
 *     opts: { width (default 80), cap: round | square | butt }
 *   polylines(strokes) → [{ pts, closed }] */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else { const F = root.SlopFont; F.stroke = factory(F.paths, root.SVGeom, F.trace); }
})(typeof window !== 'undefined' ? window : globalThis, function (P, G, TR) {
  'use strict';
  const MAX_PX = 1200000;
  function polylines(strokes) {
    const out = [];
    for (const s of strokes || []) {
      if (s && typeof s.d === 'string') {
        let subs;
        try { subs = G.parseD(s.d.slice(0, 100000)); } catch (e) { throw new Error('The stroke path could not be read: ' + e.message); }
        for (const f of G.flatten(subs, 1)) if (f.pts.length) out.push({ pts: f.pts, closed: f.closed });
        continue;
      }
      const pts = (s && Array.isArray(s.points) ? s.points : []).slice(0, 4000).map((p) => (Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p.x), y: Number(p.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e5 && Math.abs(p.y) < 1e5);
      if (pts.length) out.push({ pts, closed: !!(s && s.closed) });
    }
    return out;
  }
  /** The segments to ink: [ax, ay, bx, by, startOpen, endOpen] (open: a flat end there, no round cap). */
  function segments(lines, r, cap) {
    const segs = [];
    for (const { pts, closed } of lines) {
      if (pts.length === 1) { segs.push([pts[0].x, pts[0].y, pts[0].x, pts[0].y, false, false]); continue; }
      const n = pts.length, count = closed ? n : n - 1;
      for (let i = 0; i < count; i++) {
        let a = pts[i], b = pts[(i + 1) % n];
        const first = !closed && i === 0, last = !closed && i === count - 1;
        if (cap === 'square' && (first || last)) {
          const d = G.norm(G.sub(b, a));
          if (first) a = G.sub(a, G.scl(d, r));
          if (last) b = G.add(b, G.scl(d, r));
        }
        segs.push([a.x, a.y, b.x, b.y, cap !== 'round' && first, cap !== 'round' && last]);
      }
    }
    return segs;
  }
  function outline(strokes, opts = {}) {
    const w = Math.max(1, Math.min(2000, Number(opts.width) || 80)), r = w / 2, cap = opts.cap === 'square' || opts.cap === 'butt' ? opts.cap : 'round';
    const lines = polylines(strokes);
    if (!lines.length) return [];
    const segs = segments(lines, r, cap);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [ax, ay, bx, by] of segs) { x0 = Math.min(x0, ax, bx); y0 = Math.min(y0, ay, by); x1 = Math.max(x1, ax, bx); y1 = Math.max(y1, ay, by); }
    x0 -= r + 4; y0 -= r + 4; x1 += r + 4; y1 += r + 4;
    let res = Math.max(0.5, Math.min(2, w / 24));   // font units a pixel
    while (((x1 - x0) / res) * ((y1 - y0) / res) > MAX_PX) res *= 1.25;
    const W = Math.ceil((x1 - x0) / res), H = Math.ceil((y1 - y0) / res), bits = new Uint8Array(W * H), r2 = r * r;
    for (const [ax, ay, bx, by, open0, open1] of segs) {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const px0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - x0) / res)), px1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + r - x0) / res));
      const py0 = Math.max(0, Math.floor((y1 - Math.max(ay, by) - r) / res)), py1 = Math.min(H - 1, Math.ceil((y1 - Math.min(ay, by) + r) / res));
      for (let py = py0; py <= py1; py++) {
        const y = y1 - (py + 0.5) * res;
        for (let px = px0; px <= px1; px++) {
          const k = py * W + px;
          if (bits[k]) continue;
          const x = x0 + (px + 0.5) * res;
          let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
          if ((open0 && t < 0) || (open1 && t > 1)) continue;   // a flat end
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + t * dx - x, ey = ay + t * dy - y;
          if (ex * ex + ey * ey <= r2) bits[k] = 1;
        }
      }
    }
    const fitted = TR.fromBits(bits, W, H, { minArea: 2, smooth: 0.9, cornerAngle: 40 });
    return P.orient(P.clean(P.transform(fitted, [res, 0, 0, -res, x0, y1])));
  }
  return { outline, polylines };
});
