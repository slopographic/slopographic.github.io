/* SlopVector — geometry: flattening, winding, hit testing, nearest point, segment split */
(function () {
  'use strict';
  var G = window.SVGeom = window.SVGeom || {};
  var abs = Math.abs, sqrt = Math.sqrt, min = Math.min, max = Math.max, PI = Math.PI;
  var KAPPA = 0.5522847498;
  var $ = G._p = G._p || {};
  function P() { return $.P.apply(this, arguments); }
  function cross() { return $.cross.apply(this, arguments); }
  function dist() { return $.dist.apply(this, arguments); }
  function lerp() { return $.lerp.apply(this, arguments); }
  function segPts() { return $.segPts.apply(this, arguments); }
  function sub() { return $.sub.apply(this, arguments); }

  /* ---------- flattening ---------- */
  G.flattenSeg = function (a, b, tol, out) {
    if (G.isLineSeg(a, b)) { out.push(P(b.x, b.y)); return; }
    var s = segPts(a, b);
    var L = dist(s[0], s[1]) + dist(s[1], s[2]) + dist(s[2], s[3]);
    var nseg = max(6, min(256, Math.ceil(L / (3 * (tol || 1)))));
    for (var i = 1; i <= nseg; i++) out.push(G.bez(s[0], s[1], s[2], s[3], i / nseg));
  };
  // returns [{pts:[...], closed}] in same coordinates
  G.flatten = function (subs, tol) {
    return subs.map(function (sp) {
      var pts = sp.pts.length ? [P(sp.pts[0].x, sp.pts[0].y)] : [];
      G.eachSeg(sp, function (a, b) { G.flattenSeg(a, b, tol, pts); });
      if (sp.closed && pts.length > 1) { var f = pts[0], l = pts[pts.length - 1]; if (abs(f.x - l.x) < 1e-9 && abs(f.y - l.y) < 1e-9) pts.pop(); }
      return { pts: pts, closed: sp.closed };
    });
  };
  G.polyArea = function (pts) {
    var a = 0; for (var i = 0, n = pts.length; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p.x * q.y - q.x * p.y; }
    return a / 2;
  };
  G.polyLength = function (pts, closed) {
    var L = 0; for (var i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    if (closed && pts.length > 1) L += dist(pts[pts.length - 1], pts[0]);
    return L;
  };

  /* ---------- hit testing ---------- */
  G.winding = function (pts, p) {
    var w = 0, n = pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      if (a.y <= p.y) { if (b.y > p.y && ((b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y)) > 0) w++; }
      else if (b.y <= p.y && ((b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y)) < 0) w--;
    }
    return w;
  };
  // polys: [{pts, closed}] — fill treats open polys as closed (as SVG does)
  G.pointInPolys = function (polys, p, rule) {
    var w = 0;
    polys.forEach(function (pl) { if (pl.pts.length > 2) w += G.winding(pl.pts, p); });
    return rule === 'evenodd' ? (abs(w) % 2) === 1 : w !== 0;
  };
  G.distToSeg = function (p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    var t = l2 ? max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    var x = a.x + t * dx - p.x, y = a.y + t * dy - p.y;
    return sqrt(x * x + y * y);
  };
  G.distToPolys = function (polys, p) {
    var best = Infinity;
    polys.forEach(function (pl) {
      var pts = pl.pts, n = pts.length;
      if (n === 1) best = min(best, dist(p, pts[0]));
      var last = pl.closed ? n : n - 1;
      for (var i = 0; i < last; i++) { var d = G.distToSeg(p, pts[i], pts[(i + 1) % n]); if (d < best) best = d; }
    });
    return best;
  };
  function segIntersects(a, b, c, d) {
    var d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a));
    var d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c));
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  G.polysTouchRect = function (polys, r, filled) {
    var corners = [P(r.x, r.y), P(r.x + r.w, r.y), P(r.x + r.w, r.y + r.h), P(r.x, r.y + r.h)];
    for (var k = 0; k < polys.length; k++) {
      var pts = polys[k].pts, n = pts.length;
      for (var i = 0; i < n; i++) {
        var p = pts[i];
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return true;
      }
      var last = polys[k].closed ? n : n - 1;
      for (i = 0; i < last; i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        for (var c = 0; c < 4; c++) if (segIntersects(a, b, corners[c], corners[(c + 1) % 4])) return true;
      }
    }
    if (filled) { var mid = P(r.x + r.w / 2, r.y + r.h / 2); if (G.pointInPolys(polys, mid, 'nonzero')) return true; }
    return false;
  };
  // nearest point on a subpath's segments → {i (segment start index), t, d, p}
  G.nearestOnSub = function (sp, p) {
    var best = null;
    G.eachSeg(sp, function (a, b, i) {
      var s = segPts(a, b), N = G.isLineSeg(a, b) ? 1 : 40, prev = s[0];
      for (var k = 1; k <= N; k++) {
        var t = k / N, q = N === 1 ? s[3] : G.bez(s[0], s[1], s[2], s[3], t);
        var dx = q.x - prev.x, dy = q.y - prev.y, l2 = dx * dx + dy * dy;
        var u = l2 ? max(0, min(1, ((p.x - prev.x) * dx + (p.y - prev.y) * dy) / l2)) : 0;
        var px = prev.x + u * dx, py = prev.y + u * dy, dd = sqrt((px - p.x) * (px - p.x) + (py - p.y) * (py - p.y));
        if (!best || dd < best.d) best = { i: i, t: (k - 1 + u) / N, d: dd, p: P(px, py) };
        prev = q;
      }
    });
    if (best && !G.isLineSeg(sp.pts[best.i], sp.pts[(best.i + 1) % sp.pts.length])) {
      // refine t with a few Newton-ish bisection steps
      var a = sp.pts[best.i], b = sp.pts[(best.i + 1) % sp.pts.length], s = segPts(a, b), t = best.t, step = 1 / 80;
      for (var it = 0; it < 12; it++) {
        var t0 = max(0, t - step), t1 = min(1, t + step);
        var d0 = dist(G.bez(s[0], s[1], s[2], s[3], t0), p), d1 = dist(G.bez(s[0], s[1], s[2], s[3], t1), p), dm = dist(G.bez(s[0], s[1], s[2], s[3], t), p);
        if (d0 < dm && d0 <= d1) t = t0; else if (d1 < dm) t = t1;
        step /= 2;
      }
      best.t = t; best.p = G.bez(s[0], s[1], s[2], s[3], t); best.d = dist(best.p, p);
    }
    return best;
  };
  // split segment i of subpath at t; returns index of new anchor
  G.splitSegAt = function (sp, i, t) {
    var n = sp.pts.length, a = sp.pts[i], b = sp.pts[(i + 1) % n];
    var na;
    if (G.isLineSeg(a, b)) {
      var p = lerp(a, b, t); na = G.A(p.x, p.y);
    } else {
      var s = segPts(a, b), parts = G.splitBez(s[0], s[1], s[2], s[3], t);
      a.ox = parts[0][1].x; a.oy = parts[0][1].y;
      na = { x: parts[0][3].x, y: parts[0][3].y, ix: parts[0][2].x, iy: parts[0][2].y, ox: parts[1][1].x, oy: parts[1][1].y, s: true };
      b.ix = parts[1][2].x; b.iy = parts[1][2].y;
    }
    sp.pts.splice(i + 1, 0, na);
    return i + 1;
  };
})();
