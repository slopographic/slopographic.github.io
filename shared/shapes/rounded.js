/* Slop shapes: one rounded-rectangle geometry for SlopVector (SVG) and PhotoSlop (canvas).
 * Corner radii are [tl, tr, br, bl]. Radii are clamped so corners never overlap: when the radii on one
 * side add up to more than that side, every radius scales down by the same factor. Arcs are circular.
 * window.SlopShapes = { radii, clampRadii, segments, svgPath, canvasPath }. See shared/shapes/HANDOFF.md. */
(function (root) {
  'use strict';

  function num(v) { v = +v; return isFinite(v) && v > 0 ? v : 0; }
  function side(v) { v = +v; return isFinite(v) && v > 0 ? v : 0; }

  /** Four radii [tl, tr, br, bl] from one number, a { tl, tr, br, bl } object or a 4-array. Missing or invalid values are 0. */
  function radii(r) {
    if (Array.isArray(r)) return [num(r[0]), num(r[1]), num(r[2]), num(r[3])];
    if (r && typeof r === 'object') return [num(r.tl), num(r.tr), num(r.br), num(r.bl)];
    var v = num(r);
    return [v, v, v, v];
  }

  /** The radii scaled down (all by one factor) so that no side of a w x h box is shorter than its two corner radii. */
  function clampRadii(w, h, r) {
    var q = radii(r), tl = q[0], tr = q[1], br = q[2], bl = q[3];
    w = side(w); h = side(h);
    var f = 1, sides = [[tl + tr, w], [br + bl, w], [tr + br, h], [bl + tl, h]];
    for (var i = 0; i < sides.length; i++) {
      var sum = sides[i][0], len = sides[i][1];
      if (sum > len && sum > 0) f = Math.min(f, len / sum);
    }
    return [tl * f, tr * f, br * f, bl * f];
  }

  /**
   * Path segments for { x, y, w, h, radius } in clockwise order (screen coordinates):
   *   { c: 'M', x, y } | { c: 'L', x, y } | { c: 'A', r, via: { x, y }, x, y } | { c: 'Z' }
   * An 'A' is a circular arc of radius r from the previous point to (x, y), turning at the corner `via`.
   * A corner with radius 0 is a plain vertex, so a zero-radius rectangle has no arcs.
   */
  function segments(rect) {
    var x = +rect.x || 0, y = +rect.y || 0, w = side(rect.w), h = side(rect.h);
    var c = clampRadii(w, h, rect.radius), tl = c[0], tr = c[1], br = c[2], bl = c[3], s = [];
    s.push({ c: 'M', x: x + tl, y: y });
    s.push({ c: 'L', x: x + w - tr, y: y });
    if (tr > 0) s.push({ c: 'A', r: tr, via: { x: x + w, y: y }, x: x + w, y: y + tr });
    s.push({ c: 'L', x: x + w, y: y + h - br });
    if (br > 0) s.push({ c: 'A', r: br, via: { x: x + w, y: y + h }, x: x + w - br, y: y + h });
    s.push({ c: 'L', x: x + bl, y: y + h });
    if (bl > 0) s.push({ c: 'A', r: bl, via: { x: x, y: y + h }, x: x, y: y + h - bl });
    if (tl > 0) {
      s.push({ c: 'L', x: x, y: y + tl });
      s.push({ c: 'A', r: tl, via: { x: x, y: y }, x: x + tl, y: y });
    }
    s.push({ c: 'Z' });
    return s;
  }

  function n(v) { return String(Math.round(v * 1000) / 1000); }

  /** SVG path data (M, L, circular A, Z) for the rounded rectangle. */
  function svgPath(rect) {
    return segments(rect).map(function (g) {
      if (g.c === 'M' || g.c === 'L') return g.c + n(g.x) + ' ' + n(g.y);
      if (g.c === 'A') return 'A' + n(g.r) + ' ' + n(g.r) + ' 0 0 1 ' + n(g.x) + ' ' + n(g.y);
      return 'Z';
    }).join('');
  }

  /** Draws the rounded rectangle on a 2D canvas context (begins a new path, does not fill or stroke). Returns g. */
  function canvasPath(g, rect) {
    g.beginPath();
    segments(rect).forEach(function (s) {
      if (s.c === 'M') g.moveTo(s.x, s.y);
      else if (s.c === 'L') g.lineTo(s.x, s.y);
      else if (s.c === 'A') g.arcTo(s.via.x, s.via.y, s.x, s.y, s.r);
      else g.closePath();
    });
    return g;
  }

  root.SlopShapes = { radii: radii, clampRadii: clampRadii, segments: segments, svgPath: svgPath, canvasPath: canvasPath };
})(typeof window !== 'undefined' ? window : globalThis);
