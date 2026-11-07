/* SlopVector — geometry: vector helpers, affine matrices, anchors and subpaths */
(function () {
  'use strict';
  var G = window.SVGeom = window.SVGeom || {};
  var abs = Math.abs, sqrt = Math.sqrt, min = Math.min, max = Math.max, PI = Math.PI;
  var KAPPA = 0.5522847498;
  var $ = G._p = G._p || {};

  /* ---------- small vector helpers ---------- */
  function P(x, y) { return { x: x, y: y }; }
  function sub(a, b) { return P(a.x - b.x, a.y - b.y); }
  function add(a, b) { return P(a.x + b.x, a.y + b.y); }
  function scl(a, s) { return P(a.x * s, a.y * s); }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function cross(a, b) { return a.x * b.y - a.y * b.x; }
  function len(a) { return sqrt(a.x * a.x + a.y * a.y); }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return sqrt(dx * dx + dy * dy); }
  function norm(a) { var l = len(a); return l > 1e-12 ? P(a.x / l, a.y / l) : P(0, 0); }
  function lerp(a, b, t) { return P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
  G.P = P; G.sub = sub; G.add = add; G.scl = scl; G.dot = dot; G.cross = cross; G.len = len; G.dist = dist; G.norm = norm; G.lerp = lerp;

  /* ---------- affine matrices [a b c d e f] ---------- */
  G.I = function () { return [1, 0, 0, 1, 0, 0]; };
  G.mul = function (m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  };
  G.inv = function (m) {
    var d = m[0] * m[3] - m[1] * m[2];
    if (abs(d) < 1e-14) return G.I();
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
  };
  G.ap = function (m, x, y) { return P(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]); };
  G.translate = function (x, y) { return [1, 0, 0, 1, x, y]; };
  G.scale = function (sx, sy, cx, cy) { cx = cx || 0; cy = cy || 0; return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy]; };
  G.rotate = function (rad, cx, cy) {
    cx = cx || 0; cy = cy || 0;
    var c = Math.cos(rad), s = Math.sin(rad);
    return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
  };
  G.isIdentity = function (m) {
    return !m || (abs(m[0] - 1) < 1e-9 && abs(m[1]) < 1e-9 && abs(m[2]) < 1e-9 && abs(m[3] - 1) < 1e-9 && abs(m[4]) < 1e-9 && abs(m[5]) < 1e-9);
  };
  G.det = function (m) { return m[0] * m[3] - m[1] * m[2]; };

  /* ---------- anchors / subpaths ---------- */
  // anchor: {x,y, ix,iy (in handle), ox,oy (out handle), s (smooth)}
  G.A = function (x, y) { return { x: x, y: y, ix: x, iy: y, ox: x, oy: y, s: false }; };
  G.cloneSubs = function (subs) {
    return subs.map(function (sp) { return { closed: !!sp.closed, pts: sp.pts.map(function (a) { return { x: a.x, y: a.y, ix: a.ix, iy: a.iy, ox: a.ox, oy: a.oy, s: !!a.s }; }) }; });
  };
  G.hasIn = function (a) { return abs(a.ix - a.x) > 1e-9 || abs(a.iy - a.y) > 1e-9; };
  G.hasOut = function (a) { return abs(a.ox - a.x) > 1e-9 || abs(a.oy - a.y) > 1e-9; };
  G.isLineSeg = function (a, b) { return !G.hasOut(a) && !G.hasIn(b); };
  // iterate segments of a subpath: cb(a, b, i, j)
  G.eachSeg = function (sp, cb) {
    var n = sp.pts.length;
    if (n < 2) return;
    var last = sp.closed ? n : n - 1;
    for (var i = 0; i < last; i++) { var j = (i + 1) % n; cb(sp.pts[i], sp.pts[j], i, j); }
  };
  G.transformSubs = function (subs, m) {
    if (G.isIdentity(m)) return G.cloneSubs(subs);
    return subs.map(function (sp) {
      return {
        closed: sp.closed, pts: sp.pts.map(function (a) {
          var p = G.ap(m, a.x, a.y), i = G.ap(m, a.ix, a.iy), o = G.ap(m, a.ox, a.oy);
          return { x: p.x, y: p.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y, s: !!a.s };
        })
      };
    });
  };
  G.reverseSub = function (sp) {
    var pts = sp.pts.slice().reverse().map(function (a) { return { x: a.x, y: a.y, ix: a.ox, iy: a.oy, ox: a.ix, oy: a.iy, s: a.s }; });
    return { closed: sp.closed, pts: pts };
  };

  $.P = P; $.add = add; $.cross = cross; $.dist = dist; $.dot = dot; $.len = len; $.lerp = lerp; $.norm = norm; $.scl = scl; $.sub = sub;
})();
