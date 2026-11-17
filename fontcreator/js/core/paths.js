/* Slop Font: glyph outlines. A glyph's outline is a list of contours in font units (y up, the baseline at 0), the same
 * shape SlopVector's geometry uses (slopvector/js/geom, window.SVGeom): { closed, pts: [{ x, y, ix, iy, ox, oy }] }, each
 * point with its in and out handles (a handle on the point is a corner). Pure; needs SVGeom (in Node, pass it).
 *   clean(contours) → contours      numbers checked and rounded to 1/100 unit, empty contours dropped
 *   bbox(contours) → { x, y, w, h } | null (exact, curve extremes included)
 *   transform(contours, [a b c d e f]), move(contours, dx, dy), scaleAt(contours, sx, sy, cx, cy)
 *   fromSvg(d, opts) → contours     SVG path data. opts.coords: 'font' (y up, as stored), 'svg' (y down, y 0 at the
 *                                   ascender, one unit per font unit) or 'fit' (the path's own box scaled to opts.height
 *                                   and stood on the baseline at x = opts.left); opts.ascender for 'svg'
 *   toSvg(contours) → d             in font units, y up
 *   toCommands(contours) → [{ type: M|L|C|Z, … }]  for opentype.js;   fromCommands(cmds) → contours (Q made cubic, exact)
 *   rect(x, y, w, h, r), ellipse(cx, cy, rx, ry)  shapes as contours
 *   orient(contours) → contours     outer contours counter-clockwise, holes (contours wholly inside an odd number of
 *                                   others) clockwise, so a non-zero fill shows holes as drawn. TrueType wants the
 *                                   reverse: reverse(contours)
 *   boolean(a, b, op) → contours    op: union | minus | intersect | exclude (SVGeom.boolean, then curves refitted)
 *   merge(contours) → contours      every overlap removed (a union of the glyph's own contours)
 *   area(contour) → signed area of the flattened contour (> 0: counter-clockwise, y up) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else (root.SlopFont = root.SlopFont || {}).paths = factory(root.SVGeom);
})(typeof window !== 'undefined' ? window : globalThis, function (G) {
  'use strict';
  const r2 = (v) => Math.round(v * 100) / 100;
  const num = (v, what) => { const n = Number(v); if (!Number.isFinite(n) || Math.abs(n) > 1e5) throw new Error(`${what} is not a number in range`); return n; };
  const pt = (x, y) => ({ x, y, ix: x, iy: y, ox: x, oy: y });

  function clean(contours) {
    if (!Array.isArray(contours)) throw new Error('An outline is a list of contours');
    return contours.map((c) => {
      const pts = (c && Array.isArray(c.pts) ? c.pts : []).slice(0, 4000).map((p) => {
        const x = r2(num(p.x, 'x')), y = r2(num(p.y, 'y'));
        return { x, y, ix: p.ix == null ? x : r2(num(p.ix, 'ix')), iy: p.iy == null ? y : r2(num(p.iy, 'iy')), ox: p.ox == null ? x : r2(num(p.ox, 'ox')), oy: p.oy == null ? y : r2(num(p.oy, 'oy')) };
      });
      return { closed: c.closed !== false, pts };
    }).filter((c) => c.pts.length >= (c.closed ? 2 : 2)).slice(0, 500);
  }
  const strip = (subs) => subs.map((s) => ({ closed: s.closed !== false, pts: s.pts.map((p) => ({ x: p.x, y: p.y, ix: p.ix, iy: p.iy, ox: p.ox, oy: p.oy })) }));
  function bbox(contours) { return contours && contours.length ? G.subsBBox(contours) : null; }
  const transform = (contours, m) => strip(G.transformSubs(contours, m));
  const move = (contours, dx, dy) => transform(contours, [1, 0, 0, 1, dx, dy]);
  const scaleAt = (contours, sx, sy, cx, cy) => transform(contours, G.scale(sx, sy, cx || 0, cy || 0));

  function fromSvg(d, opts = {}) {
    if (typeof d !== 'string' || !d.trim()) throw new Error('No path data');
    if (d.length > 200000) throw new Error('The path data is too long');
    let subs;
    try { subs = G.parseD(d); } catch (e) { throw new Error('The path data could not be read: ' + e.message); }
    subs = (subs || []).filter((s) => s.pts.length > 1);
    if (!subs.length) throw new Error('The path data has no shapes');
    for (const s of subs) if (!s.closed) s.closed = true;   // a glyph is filled: an open path closes
    const mode = opts.coords || 'font';
    if (mode === 'font') return clean(strip(subs));
    if (mode === 'svg') return clean(transform(subs, [1, 0, 0, -1, 0, Number(opts.ascender) || 800]));
    const flipped = transform(subs, [1, 0, 0, -1, 0, 0]), b = bbox(flipped);
    if (!b || b.h <= 0 && b.w <= 0) throw new Error('The path has no size');
    const height = Number(opts.height) || 700, s = height / (b.h || b.w);
    const left = opts.left == null ? 50 : Number(opts.left), bottom = opts.bottom == null ? 0 : Number(opts.bottom);
    return clean(transform(flipped, [s, 0, 0, s, left - b.x * s, bottom - b.y * s]));
  }
  const toSvg = (contours) => G.toD(contours);

  function toCommands(contours) {
    const out = [], R = (v) => Math.round(v);
    for (const c of contours) {
      const p = c.pts;
      if (p.length < 2) continue;
      out.push({ type: 'M', x: R(p[0].x), y: R(p[0].y) });
      G.eachSeg({ closed: c.closed !== false, pts: p }, (a, b) => {
        if (G.isLineSeg(a, b)) out.push({ type: 'L', x: R(b.x), y: R(b.y) });
        else out.push({ type: 'C', x1: R(a.ox), y1: R(a.oy), x2: R(b.ix), y2: R(b.iy), x: R(b.x), y: R(b.y) });
      });
      // a closing line back onto the first point is implied by Z
      const last = out[out.length - 1];
      if (last.type === 'L' && last.x === R(p[0].x) && last.y === R(p[0].y)) out.pop();
      out.push({ type: 'Z' });
    }
    return out;
  }
  function fromCommands(cmds) {
    const out = [];
    let cur = null, x = 0, y = 0;
    const close = () => {
      if (!cur) return;
      const p = cur.pts, f = p[0], l = p[p.length - 1];
      if (p.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) { f.ix = l.ix; f.iy = l.iy; p.pop(); }
      if (p.length > 1) out.push(cur);
      cur = null;
    };
    for (const c of cmds || []) {
      if (c.type === 'M') { close(); cur = { closed: true, pts: [pt(c.x, c.y)] }; x = c.x; y = c.y; continue; }
      if (c.type === 'Z') { close(); continue; }
      if (!cur) cur = { closed: true, pts: [pt(x, y)] };
      const prev = cur.pts[cur.pts.length - 1];
      if (c.type === 'L') cur.pts.push(pt(c.x, c.y));
      else if (c.type === 'C') { prev.ox = c.x1; prev.oy = c.y1; cur.pts.push({ x: c.x, y: c.y, ix: c.x2, iy: c.y2, ox: c.x, oy: c.y }); }
      else if (c.type === 'Q') {   // a quadratic is a cubic with handles at 2/3 towards its control point
        prev.ox = x + (2 / 3) * (c.x1 - x); prev.oy = y + (2 / 3) * (c.y1 - y);
        cur.pts.push({ x: c.x, y: c.y, ix: c.x + (2 / 3) * (c.x1 - c.x), iy: c.y + (2 / 3) * (c.y1 - c.y), ox: c.x, oy: c.y });
      }
      x = c.x; y = c.y;
    }
    close();
    return clean(out);
  }
  const rect = (x, y, w, h, r) => strip(G.rectSubs(x, y, w, h, r || 0));
  const ellipse = (cx, cy, rx, ry) => strip(G.ellipseSubs(cx, cy, rx, ry == null ? rx : ry));

  const flat = (c) => G.flatten([c], 2)[0].pts;
  const area = (c) => G.polyArea(flat(c));
  function inside(inner, outer) {
    const poly = flat(outer), pts = flat(inner);
    const step = Math.max(1, Math.floor(pts.length / 12));
    for (let i = 0; i < pts.length; i += step) if (G.winding(poly, pts[i]) === 0) return false;
    return true;
  }
  const reverse = (contours) => contours.map((c) => strip([G.reverseSub(c)])[0]);
  function orient(contours) {
    const cs = contours.filter((c) => c.closed !== false && c.pts.length > 1);
    return cs.map((c, i) => {
      let depth = 0;
      for (let j = 0; j < cs.length; j++) if (j !== i && Math.abs(area(cs[j])) > Math.abs(area(c)) && inside(c, cs[j])) depth++;
      const ccw = area(c) > 0, want = depth % 2 === 0;
      return ccw === want ? strip([c])[0] : reverse([c])[0];
    });
  }
  const OPS = { union: 'union', minus: 'minus', subtract: 'minus', intersect: 'intersect', exclude: 'xor' };
  function boolean(a, b, op) {
    const o = OPS[op];
    if (!o) throw new Error(`Unknown operation “${op}”: union, minus, intersect or exclude`);
    const corners = new Set();
    G.cornerKeysOf(a, corners); G.cornerKeysOf(b, corners);
    const operand = (cs) => ({ rings: G.flatten(orient(cs), 1).map((p) => p.pts), rule: 'nonzero' });
    const rings = G.boolean([operand(a), operand(b)], o, corners);
    return clean(strip(G.fitRings(rings, corners, { err: 1.2 })));
  }
  function merge(contours) {
    if (contours.length < 2) return clean(contours);
    const corners = new Set();
    G.cornerKeysOf(contours, corners);
    const rings = G.boolean([{ rings: G.flatten(orient(contours), 1).map((p) => p.pts), rule: 'nonzero' }], 'union', corners);
    return clean(strip(G.fitRings(rings, corners, { err: 1.2 })));
  }
  return { clean, bbox, transform, move, scaleAt, fromSvg, toSvg, toCommands, fromCommands, rect, ellipse, orient, reverse, boolean, merge, area };
});
