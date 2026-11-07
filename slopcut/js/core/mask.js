/* SlopCut: clip masks, pure geometry (no DOM, so Node tests can load it).
   A mask belongs to a clip and lives in clip space: project pixels relative to the clip's own centre at scale 1,
   so it moves, scales and rotates with the clip.
   Mask { shape: 'rect'|'ellipse'|'rrect'|'path', x, y (centre), w, h, r (corner radius, rrect),
          pts: [{ x, y, ix, iy, ox, oy }] (path anchors; ix,iy / ox,oy are handle offsets from the anchor),
          feather (px, soft edge, raster only), expand (px: + grows, − shrinks), invert (bool) }
   covered(m, x, y) is the coverage used by hit tests and tests: expansion is applied geometrically (distance to the
   outline) and invert flips the result. The compositor (render/mask-draw.js) rasterises the same shape with canvas
   paths, the same expansion and a blur for feather, so the preview and the export match. */
(function () {
  'use strict';
  const SE = (window.SE = window.SE || {});
  const MK = (SE.mask = SE.mask || {});
  const KAPPA = 0.5522847498; // cubic Bézier approximation of a quarter circle
  const SHAPES = [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['rrect', 'Rounded rectangle'], ['path', 'Path']];
  MK.SHAPES = SHAPES;

  const num = (v, d, lo, hi) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  /** A sanitised copy of a mask (unknown or broken values fall back to safe defaults). */
  MK.clean = function (m) {
    if (!m || typeof m !== 'object') return null;
    const shape = SHAPES.some(([s]) => s === m.shape) ? m.shape : 'rect';
    const pts = Array.isArray(m.pts) ? m.pts.filter((p) => p && typeof p === 'object').map((p) => ({
      x: num(p.x, 0, -1e5, 1e5), y: num(p.y, 0, -1e5, 1e5),
      ix: num(p.ix, 0, -1e5, 1e5), iy: num(p.iy, 0, -1e5, 1e5), ox: num(p.ox, 0, -1e5, 1e5), oy: num(p.oy, 0, -1e5, 1e5)
    })) : [];
    return {
      shape, x: num(m.x, 0, -1e5, 1e5), y: num(m.y, 0, -1e5, 1e5),
      w: num(m.w, 100, 0, 1e5), h: num(m.h, 100, 0, 1e5), r: num(m.r, 0, 0, 1e5),
      feather: num(m.feather, 0, 0, 500), expand: num(m.expand, 0, -500, 500), invert: !!m.invert, pts
    };
  };
  /** A new mask. p is the project (its size sets the default box: half the frame, centred on the clip). */
  MK.make = function (shape, p, o = {}) {
    const W = p ? p.w : 1920, H = p ? p.h : 1080;
    const m = MK.clean(Object.assign({ shape, x: 0, y: 0, w: W * 0.5, h: H * 0.5, pts: [] }, o, { shape }));
    if (shape === 'rrect' && o.r == null) m.r = Math.min(m.w, m.h) * 0.2;
    return m;
  };
  /** A path mask from anchor points (no handles: straight edges). */
  MK.path = (points) => MK.make('path', null, { pts: points.map((p) => ({ x: p.x, y: p.y, ix: 0, iy: 0, ox: 0, oy: 0 })) });

  /** Outline as drawing operations in clip space: ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Z']. */
  MK.ops = function (m) {
    const out = [], M = (x, y) => out.push(['M', x, y]), L = (x, y) => out.push(['L', x, y]);
    const C = (a, b, c, d, e, f) => out.push(['C', a, b, c, d, e, f]), Z = () => out.push(['Z']);
    if (m.shape === 'path') {
      const P = m.pts;
      if (P.length < 2) return out;
      M(P[0].x, P[0].y);
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        C(a.x + a.ox, a.y + a.oy, b.x + b.ix, b.y + b.iy, b.x, b.y);
      }
      Z();
      return out;
    }
    const x0 = m.x - m.w / 2, x1 = m.x + m.w / 2, y0 = m.y - m.h / 2, y1 = m.y + m.h / 2;
    if (m.shape === 'ellipse') {
      const cx = m.x, cy = m.y, rx = m.w / 2, ry = m.h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
      M(cx + rx, cy);
      C(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
      C(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
      C(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
      C(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
      Z();
      return out;
    }
    const r = m.shape === 'rrect' ? Math.max(0, Math.min(m.r, m.w / 2, m.h / 2)) : 0;
    if (r <= 0) { M(x0, y0); L(x1, y0); L(x1, y1); L(x0, y1); Z(); return out; }
    const k = KAPPA * r;
    M(x0 + r, y0); L(x1 - r, y0); C(x1 - r + k, y0, x1, y0 + r - k, x1, y0 + r);
    L(x1, y1 - r); C(x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1);
    L(x0 + r, y1); C(x0 + r - k, y1, x0, y1 - r + k, x0, y1 - r);
    L(x0, y0 + r); C(x0, y0 + r - k, x0 + r - k, y0, x0 + r, y0);
    Z();
    return out;
  };
  /** Outline as polylines: [[[x,y], …], …], one per subpath (closed implicitly). steps: samples per curve. */
  MK.flatten = function (m, steps = 12) {
    const polys = [];
    let cur = null, px = 0, py = 0;
    for (const op of MK.ops(m)) {
      if (op[0] === 'M') { cur = [[op[1], op[2]]]; polys.push(cur); px = op[1]; py = op[2]; }
      else if (op[0] === 'L' && cur) { cur.push([op[1], op[2]]); px = op[1]; py = op[2]; }
      else if (op[0] === 'C' && cur) {
        for (let i = 1; i <= steps; i++) {
          const t = i / steps, u = 1 - t;
          cur.push([u * u * u * px + 3 * u * u * t * op[1] + 3 * u * t * t * op[3] + t * t * t * op[5],
            u * u * u * py + 3 * u * u * t * op[2] + 3 * u * t * t * op[4] + t * t * t * op[6]]);
        }
        px = op[5]; py = op[6];
      }
    }
    return polys;
  };
  /** Even-odd point test on the raw outline (no expansion, no invert). */
  MK.inside = function (m, x, y) {
    let ins = false;
    for (const poly of MK.flatten(m)) {
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
      }
    }
    return ins;
  };
  /** Distance from a point to the outline (a segment list of all subpaths). */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  MK.dist = function (m, x, y) {
    let best = Infinity;
    for (const poly of MK.flatten(m)) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        best = Math.min(best, segDist(x, y, a[0], a[1], b[0], b[1]));
      }
    }
    return best;
  };
  /** Coverage of a point in clip space, with expansion and invert (feather is not part of the geometry). */
  MK.covered = function (m, x, y) {
    const e = m.expand || 0;
    let c = MK.inside(m, x, y);
    if (e > 0) c = c || MK.dist(m, x, y) <= e;
    else if (e < 0) c = c && MK.dist(m, x, y) >= -e;
    return m.invert ? !c : c;
  };
  /** Bounding box of the outline including the expansion: { x0, y0, x1, y1 }. */
  MK.bounds = function (m) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const poly of MK.flatten(m, 16)) for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    const e = Math.max(0, m.expand || 0);
    return { x0: x0 - e, y0: y0 - e, x1: x1 + e, y1: y1 + e };
  };
  /** Ramer–Douglas–Peucker on {x, y} points (open polyline; the closing edge is implicit). */
  MK.simplify = function (pts, tol) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let far = 0, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = segDist(pts[i].x, pts[i].y, pts[a].x, pts[a].y, pts[b].x, pts[b].y);
        if (d > far) { far = d; idx = i; }
      }
      if (idx >= 0 && far > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
})();
