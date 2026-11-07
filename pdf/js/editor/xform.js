/* Slop PDF — transform math for a selected box (a paragraph frame, an annotation): a box is { cx, cy, w, h, ang } in a
   y-down space (the page layer or the view), turned clockwise by ang degrees about its centre. Corners, a point in it,
   resizing from a handle (the opposite side or corner stays where it is, in the box's own axes, so a turned box resizes
   along its own edges), turning about the centre (Shift snaps to 15°), and the box's axis-aligned bounds. Pure: no DOM.
   Used by editor/para-xform.js and editor/annot-xform.js; tests/node/pdf-xform.test.mjs. */
(function (root, factory) {
  var X = factory();
  if (typeof module === 'object' && module.exports) module.exports = X;
  else root.SlopPdfXform = X;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var RAD = Math.PI / 180;
  function norm(d) { d = d % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return Math.abs(d) < 1e-9 ? 0 : d; }
  /** A local point (from the centre, in the box's axes) in the space. */
  function toSpace(b, lx, ly) {
    var c = Math.cos(b.ang * RAD), s = Math.sin(b.ang * RAD);
    return [b.cx + lx * c - ly * s, b.cy + lx * s + ly * c];
  }
  /** A vector of the space in the box's axes. */
  function toLocal(ang, dx, dy) {
    var c = Math.cos(ang * RAD), s = Math.sin(ang * RAD);
    return [dx * c + dy * s, -dx * s + dy * c];
  }
  /** The four corners: nw, ne, se, sw. */
  function corners(b) {
    var w = b.w / 2, h = b.h / 2;
    return [toSpace(b, -w, -h), toSpace(b, w, -h), toSpace(b, w, h), toSpace(b, -w, h)];
  }
  /** Where a handle sits ('nw', 'n', ... 'w', or 'rot' a little above the top edge, `gap` space units). */
  function handleAt(b, h, gap) {
    if (h === 'rot') return toSpace(b, 0, -b.h / 2 - (gap || 0));
    var lx = /w/.test(h) ? -b.w / 2 : /e/.test(h) ? b.w / 2 : 0, ly = /n/.test(h) ? -b.h / 2 : /s/.test(h) ? b.h / 2 : 0;
    return toSpace(b, lx, ly);
  }
  function inside(b, x, y, pad) {
    var l = toLocal(b.ang, x - b.cx, y - b.cy), p = pad || 0;
    return Math.abs(l[0]) <= b.w / 2 + p && Math.abs(l[1]) <= b.h / 2 + p;
  }
  function bounds(b) {
    var q = corners(b), xs = q.map(function (v) { return v[0]; }), ys = q.map(function (v) { return v[1]; });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
  }
  /** The box after dragging handle h by (dx, dy) of the space. opts.keep: a corner keeps the aspect (k: the scale);
   * opts.min: the smallest side. Returns { cx, cy, w, h, ang, k } (k: the corner's scale, 1 for a side). */
  function resize(b, h, dx, dy, opts) {
    var o = opts || {}, min = o.min == null ? 2 : o.min, d = toLocal(b.ang, dx, dy);
    var x0 = -b.w / 2, x1 = b.w / 2, y0 = -b.h / 2, y1 = b.h / 2;
    if (/w/.test(h)) x0 += d[0]; if (/e/.test(h)) x1 += d[0];
    if (/n/.test(h)) y0 += d[1]; if (/s/.test(h)) y1 += d[1];
    var k = 1;
    if (o.keep && h.length === 2) {
      k = Math.max((x1 - x0) / b.w, (y1 - y0) / b.h, min / Math.max(b.w, b.h, 1e-9));
      var nw = b.w * k, nh = b.h * k;
      if (/w/.test(h)) x0 = x1 - nw; else x1 = x0 + nw;
      if (/n/.test(h)) y0 = y1 - nh; else y1 = y0 + nh;
    } else {
      if (x1 - x0 < min) { if (/w/.test(h)) x0 = x1 - min; else x1 = x0 + min; }
      if (y1 - y0 < min) { if (/n/.test(h)) y0 = y1 - min; else y1 = y0 + min; }
    }
    var c = toSpace(b, (x0 + x1) / 2, (y0 + y1) / 2);
    return { cx: c[0], cy: c[1], w: x1 - x0, h: y1 - y0, ang: b.ang, k: k };
  }
  /** The angle after turning from the press at (sx, sy) to (x, y) about the box's centre; snap: to 15°. */
  function turn(b, sx, sy, x, y, snap) {
    var d = (Math.atan2(y - b.cy, x - b.cx) - Math.atan2(sy - b.cy, sx - b.cx)) / RAD, a = b.ang + d;
    if (snap) a = Math.round(a / 15) * 15;
    return norm(a);
  }
  /** The centre that keeps a local anchor (ax, ay of the old box, from its centre) in place when the box becomes w × h,
   * the anchor being the same relative point (signs) of the new box. */
  function keepAnchor(b, sx, sy, w, h) {
    var a = toSpace(b, sx * b.w / 2, sy * b.h / 2), c = Math.cos(b.ang * RAD), s = Math.sin(b.ang * RAD), lx = -sx * w / 2, ly = -sy * h / 2;
    return [a[0] + lx * c - ly * s, a[1] + lx * s + ly * c];
  }
  return { norm: norm, toSpace: toSpace, toLocal: toLocal, corners: corners, handleAt: handleAt, inside: inside, bounds: bounds,
    resize: resize, turn: turn, keepAnchor: keepAnchor, HANDLES: ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] };
});
