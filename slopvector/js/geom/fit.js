/* SlopVector — geometry: Schneider curve fitting (pencil, booleans, slopify) */
(function () {
  'use strict';
  var G = window.SVGeom = window.SVGeom || {};
  var abs = Math.abs, sqrt = Math.sqrt, min = Math.min, max = Math.max, PI = Math.PI;
  var KAPPA = 0.5522847498;
  var $ = G._p = G._p || {};
  function P() { return $.P.apply(this, arguments); }
  function add() { return $.add.apply(this, arguments); }
  function dist() { return $.dist.apply(this, arguments); }
  function dot() { return $.dot.apply(this, arguments); }
  function len() { return $.len.apply(this, arguments); }
  function norm() { return $.norm.apply(this, arguments); }
  function scl() { return $.scl.apply(this, arguments); }
  function sub() { return $.sub.apply(this, arguments); }

  /* ---------- Schneider curve fitting ---------- */
  function B0(u) { var t = 1 - u; return t * t * t; }
  function B1(u) { var t = 1 - u; return 3 * u * t * t; }
  function B2(u) { var t = 1 - u; return 3 * u * u * t; }
  function B3(u) { return u * u * u; }
  function chordParam(d, first, last) {
    var u = [0];
    for (var i = first + 1; i <= last; i++) u.push(u[i - first - 1] + dist(d[i], d[i - 1]));
    var tot = u[u.length - 1] || 1;
    return u.map(function (v) { return v / tot; });
  }
  function genBez(d, first, last, u, t1, t2) {
    var p0 = d[first], p3 = d[last], C00 = 0, C01 = 0, C11 = 0, X0 = 0, X1 = 0;
    for (var i = 0; i < u.length; i++) {
      var a0 = scl(t1, B1(u[i])), a1 = scl(t2, B2(u[i]));
      C00 += dot(a0, a0); C01 += dot(a0, a1); C11 += dot(a1, a1);
      var tmp = sub(d[first + i], add(scl(p0, B0(u[i]) + B1(u[i])), scl(p3, B2(u[i]) + B3(u[i]))));
      X0 += dot(a0, tmp); X1 += dot(a1, tmp);
    }
    var det = C00 * C11 - C01 * C01, al = 0, ar = 0;
    if (abs(det) > 1e-12) { al = (X0 * C11 - X1 * C01) / det; ar = (C00 * X1 - C01 * X0) / det; }
    var segL = dist(p0, p3), eps = 1e-6 * segL;
    if (al < eps || ar < eps) { al = ar = segL / 3; }
    return [p0, add(p0, scl(t1, al)), add(p3, scl(t2, ar)), p3];
  }
  function maxError(d, first, last, bez, u) {
    var maxD = 0, split = Math.floor((last - first + 1) / 2) + first;
    for (var i = first + 1; i < last; i++) {
      var p = G.bez(bez[0], bez[1], bez[2], bez[3], u[i - first]), dd = dist(p, d[i]);
      if (dd >= maxD) { maxD = dd; split = i; }
    }
    if (split <= first) split = first + 1; if (split >= last) split = last - 1;
    return [maxD, split];
  }
  function reparam(d, first, last, u, bez) {
    return u.map(function (uu, k) {
      var p = d[first + k];
      var q = G.bez(bez[0], bez[1], bez[2], bez[3], uu);
      var q1 = [scl(sub(bez[1], bez[0]), 3), scl(sub(bez[2], bez[1]), 3), scl(sub(bez[3], bez[2]), 3)];
      var q2 = [scl(sub(q1[1], q1[0]), 2), scl(sub(q1[2], q1[1]), 2)];
      var mt = 1 - uu;
      var d1 = add(add(scl(q1[0], mt * mt), scl(q1[1], 2 * mt * uu)), scl(q1[2], uu * uu));
      var d2 = add(scl(q2[0], mt), scl(q2[1], uu));
      var numr = dot(sub(q, p), d1), den = dot(d1, d1) + dot(sub(q, p), d2);
      if (abs(den) < 1e-12) return uu;
      var r = uu - numr / den;
      return max(0, min(1, r));
    });
  }
  function fitCubic(d, first, last, t1, t2, err, out, depth) {
    if (last - first === 1) {
      var dd = dist(d[first], d[last]) / 3;
      out.push([d[first], add(d[first], scl(t1, dd)), add(d[last], scl(t2, dd)), d[last]]);
      return;
    }
    var u = chordParam(d, first, last), bez = genBez(d, first, last, u, t1, t2);
    var me = maxError(d, first, last, bez, u);
    if (me[0] < err) { out.push(bez); return; }
    if (me[0] < err * 4) {
      for (var i = 0; i < 16; i++) {
        var up = reparam(d, first, last, u, bez);
        bez = genBez(d, first, last, up, t1, t2);
        me = maxError(d, first, last, bez, up);
        if (me[0] < err) { out.push(bez); return; }
        u = up;
      }
    }
    if (depth > 30) { out.push(bez); return; }
    var split = me[1];
    var tc = norm(sub(d[split - 1], d[split + 1]));
    if (len(tc) < 0.5) tc = norm(sub(d[split - 1], d[split]));
    fitCubic(d, first, split, t1, tc, err, out, depth + 1);
    fitCubic(d, split, last, scl(tc, -1), t2, err, out, depth + 1);
  }
  // fit a polyline run (array of points) → list of cubics [p0,c1,c2,p3]; t1/t2 optional tangents
  G.fitRun = function (pts, err, t1, t2) {
    var d = [pts[0]];
    for (var i = 1; i < pts.length; i++) if (dist(pts[i], d[d.length - 1]) > 1e-6) d.push(pts[i]);
    if (d.length < 2) return [];
    if (d.length === 2) return [[d[0], d[0], d[1], d[1]]];
    t1 = t1 || norm(sub(d[1], d[0])); t2 = t2 || norm(sub(d[d.length - 2], d[d.length - 1]));
    var out = []; fitCubic(d, 0, d.length - 1, t1, t2, err, out, 0);
    return out;
  };
  // cubic list → anchors
  G.cubicsToSub = function (cubics, closed) {
    if (!cubics.length) return null;
    var pts = [{ x: cubics[0][0].x, y: cubics[0][0].y, ix: cubics[0][0].x, iy: cubics[0][0].y, ox: cubics[0][1].x, oy: cubics[0][1].y }];
    for (var i = 0; i < cubics.length; i++) {
      var c = cubics[i], prev = pts[pts.length - 1];
      prev.ox = c[1].x; prev.oy = c[1].y;
      pts.push({ x: c[3].x, y: c[3].y, ix: c[2].x, iy: c[2].y, ox: c[3].x, oy: c[3].y });
    }
    if (closed && pts.length > 2) { var l = pts.pop(); pts[0].ix = l.ix; pts[0].iy = l.iy; }
    pts.forEach(function (a) {
      // snap degenerate handles
      if (dist(a, P(a.ix, a.iy)) < 1e-4) { a.ix = a.x; a.iy = a.y; }
      if (dist(a, P(a.ox, a.oy)) < 1e-4) { a.ox = a.x; a.oy = a.y; }
      a.s = G.isSmooth(a);
    });
    return { closed: !!closed, pts: pts };
  };
  // freehand points → subpath (pencil)
  G.fitFreehand = function (raw, err, closed) {
    var pts = [raw[0]];
    for (var i = 1; i < raw.length; i++) if (dist(raw[i], pts[pts.length - 1]) > err * 0.25) pts.push(raw[i]);
    if (pts.length < 2) pts.push(raw[raw.length - 1]);
    // light smoothing (keeps ends)
    if (pts.length > 4) {
      var sm = pts.map(function (p, k) {
        if (k === 0 || k === pts.length - 1) return p;
        var a = pts[k - 1], b = pts[k + 1];
        return P((a.x + 2 * p.x + b.x) / 4, (a.y + 2 * p.y + b.y) / 4);
      });
      pts = sm;
    }
    if (closed) {
      pts.push(P(pts[0].x, pts[0].y));
      var t = norm(sub(pts[1], pts[pts.length - 2]));
      var cub = G.fitRun(pts, err, t, scl(t, -1));
      return G.cubicsToSub(cub, true);
    }
    return G.cubicsToSub(G.fitRun(pts, err), false);
  };
})();
