/* SlopVector — geometry: cubic beziers, exact bounds, primitive shapes as subpaths */
(function () {
  'use strict';
  var G = window.SVGeom = window.SVGeom || {};
  var abs = Math.abs, sqrt = Math.sqrt, min = Math.min, max = Math.max, PI = Math.PI;
  var KAPPA = 0.5522847498;
  var $ = G._p = G._p || {};
  function P() { return $.P.apply(this, arguments); }
  function lerp() { return $.lerp.apply(this, arguments); }

  /* ---------- bezier math ---------- */
  G.bez = function (p0, p1, p2, p3, t) {
    var mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return P(a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y);
  };
  G.splitBez = function (p0, p1, p2, p3, t) {
    var a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t);
    var d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t);
    return [[p0, a, d, f], [f, e, c, p3]];
  };
  function segPts(a, b) { return [P(a.x, a.y), P(a.ox, a.oy), P(b.ix, b.iy), P(b.x, b.y)]; }
  G.segPts = segPts;
  function cubicExtrema(p0, p1, p2, p3) {
    // roots of derivative per axis
    var ts = [];
    ['x', 'y'].forEach(function (k) {
      var a = -p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k];
      var b = 2 * (p0[k] - 2 * p1[k] + p2[k]);
      var c = p1[k] - p0[k];
      // derivative/3 = a t^2 + b t + c
      if (abs(a) < 1e-12) { if (abs(b) > 1e-12) ts.push(-c / b); }
      else {
        var disc = b * b - 4 * a * c;
        if (disc >= 0) { var sq = sqrt(disc); ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a)); }
      }
    });
    return ts.filter(function (t) { return t > 0 && t < 1; });
  }
  G.subsBBox = function (subs) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    function inc(p) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
    subs.forEach(function (sp) {
      sp.pts.forEach(function (a) { inc(a); });
      G.eachSeg(sp, function (a, b) {
        if (G.isLineSeg(a, b)) return;
        var s = segPts(a, b);
        cubicExtrema(s[0], s[1], s[2], s[3]).forEach(function (t) { inc(G.bez(s[0], s[1], s[2], s[3], t)); });
      });
    });
    if (x0 === Infinity) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  G.unionBox = function (a, b) {
    if (!a) return b; if (!b) return a;
    var x0 = min(a.x, b.x), y0 = min(a.y, b.y), x1 = max(a.x + a.w, b.x + b.w), y1 = max(a.y + a.h, b.y + b.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  G.boxOfPoints = function (pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(function (p) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; });
    return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  G.boxesTouch = function (a, b) { return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h; };

  /* ---------- primitive shapes → subpaths (local coords) ---------- */
  G.rectSubs = function (x, y, w, h, r) {
    r = max(0, min(r || 0, abs(w) / 2, abs(h) / 2));
    if (r < 1e-6) {
      return [{ closed: true, pts: [G.A(x, y), G.A(x + w, y), G.A(x + w, y + h), G.A(x, y + h)] }];
    }
    var k = KAPPA * r, pts = [];
    function an(px, py, ix, iy, ox, oy) { return { x: px, y: py, ix: ix, iy: iy, ox: ox, oy: oy, s: false }; }
    pts.push(an(x + r, y, x + r - k, y, x + r, y));
    pts.push(an(x + w - r, y, x + w - r, y, x + w - r + k, y));
    pts.push(an(x + w, y + r, x + w, y + r - k, x + w, y + r));
    pts.push(an(x + w, y + h - r, x + w, y + h - r, x + w, y + h - r + k));
    pts.push(an(x + w - r, y + h, x + w - r + k, y + h, x + w - r, y + h));
    pts.push(an(x + r, y + h, x + r, y + h, x + r - k, y + h));
    pts.push(an(x, y + h - r, x, y + h - r + k, x, y + h - r));
    pts.push(an(x, y + r, x, y + r, x, y + r - k));
    return [{ closed: true, pts: pts }];
  };
  G.ellipseSubs = function (cx, cy, rx, ry) {
    var kx = KAPPA * rx, ky = KAPPA * ry;
    return [{
      closed: true, pts: [
        { x: cx, y: cy - ry, ix: cx - kx, iy: cy - ry, ox: cx + kx, oy: cy - ry, s: true },
        { x: cx + rx, y: cy, ix: cx + rx, iy: cy - ky, ox: cx + rx, oy: cy + ky, s: true },
        { x: cx, y: cy + ry, ix: cx + kx, iy: cy + ry, ox: cx - kx, oy: cy + ry, s: true },
        { x: cx - rx, y: cy, ix: cx - rx, iy: cy + ky, ox: cx - rx, oy: cy - ky, s: true }
      ]
    }];
  };
  G.polygonSubs = function (cx, cy, r, n) {
    n = max(3, Math.round(n)); var pts = [];
    for (var k = 0; k < n; k++) { var a = -PI / 2 + 2 * PI * k / n; pts.push(G.A(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
    return [{ closed: true, pts: pts }];
  };
  G.starSubs = function (cx, cy, r1, r2, n) {
    n = max(2, Math.round(n)); var pts = [];
    for (var k = 0; k < 2 * n; k++) { var a = -PI / 2 + PI * k / n, r = k % 2 ? r2 : r1; pts.push(G.A(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
    return [{ closed: true, pts: pts }];
  };

  $.segPts = segPts;
})();
