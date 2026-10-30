/* SlopVector — geometry: SVG path data serialiser and full parser (incl. arcs) */
(function () {
  'use strict';
  var G = window.SVGeom = window.SVGeom || {};
  var abs = Math.abs, sqrt = Math.sqrt, min = Math.min, max = Math.max, PI = Math.PI;
  var KAPPA = 0.5522847498;
  var $ = G._p = G._p || {};
  function P() { return $.P.apply(this, arguments); }
  function cross() { return $.cross.apply(this, arguments); }
  function dot() { return $.dot.apply(this, arguments); }
  function norm() { return $.norm.apply(this, arguments); }

  /* ---------- path data ---------- */
  function fmt(n) { var v = Math.round(n * 1000) / 1000; if (v === 0) v = 0; return String(v); }
  G.fmt = fmt;
  G.toD = function (subs, m) {
    var out = [];
    subs.forEach(function (sp) {
      if (!sp.pts.length) return;
      var pts = sp.pts;
      if (m && !G.isIdentity(m)) pts = G.transformSubs([sp], m)[0].pts;
      out.push('M' + fmt(pts[0].x) + ' ' + fmt(pts[0].y));
      G.eachSeg({ closed: sp.closed, pts: pts }, function (a, b, i, j) {
        if (sp.closed && j === 0 && G.isLineSeg(a, b)) return; // Z closes with a line
        if (G.isLineSeg(a, b)) out.push('L' + fmt(b.x) + ' ' + fmt(b.y));
        else out.push('C' + fmt(a.ox) + ' ' + fmt(a.oy) + ' ' + fmt(b.ix) + ' ' + fmt(b.iy) + ' ' + fmt(b.x) + ' ' + fmt(b.y));
      });
      if (sp.closed) out.push('Z');
    });
    return out.join('');
  };

  // Full SVG path data parser (all commands incl. arcs) → subpaths
  G.parseD = function (d) {
    var i = 0, n = d.length, subs = [], cur = null, cx = 0, cy = 0, sx = 0, sy = 0, cmd = '', lastC = null, lastQ = null;
    function skip() { while (i < n && /[\s,]/.test(d[i])) i++; }
    function num() {
      skip();
      var m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i, i + 40));
      if (!m) throw new Error('bad number');
      i += m[0].length; return parseFloat(m[0]);
    }
    function flag() { skip(); var c = d[i]; if (c !== '0' && c !== '1') throw new Error('bad flag'); i++; return c === '1' ? 1 : 0; }
    function hasNum() { skip(); return i < n && /[-+.\d]/.test(d[i]); }
    function ensure() { if (!cur) { cur = { closed: false, pts: [G.A(cx, cy)] }; subs.push(cur); } }
    function lineTo(x, y) { ensure(); cur.pts.push(G.A(x, y)); cx = x; cy = y; }
    function cubicTo(x1, y1, x2, y2, x, y) {
      ensure(); var l = cur.pts[cur.pts.length - 1]; l.ox = x1; l.oy = y1;
      cur.pts.push({ x: x, y: y, ix: x2, iy: y2, ox: x, oy: y, s: false }); cx = x; cy = y;
    }
    function arcTo(rx, ry, rot, large, sweep, x, y) {
      if (rx === 0 || ry === 0) { lineTo(x, y); return; }
      G.arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y).forEach(function (c) { cubicTo(c[0], c[1], c[2], c[3], c[4], c[5]); });
      cx = x; cy = y;
    }
    try {
      while (i < n) {
        skip(); if (i >= n) break;
        var ch = d[i];
        if (/[a-zA-Z]/.test(ch)) { cmd = ch; i++; }
        else if (!cmd) break;
        var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), x, y, x1, y1, x2, y2;
        if (C === 'Z') {
          if (cur) {
            cur.closed = true;
            var f = cur.pts[0], l = cur.pts[cur.pts.length - 1];
            if (cur.pts.length > 1 && abs(f.x - l.x) < 1e-6 && abs(f.y - l.y) < 1e-6) { f.ix = l.ix; f.iy = l.iy; cur.pts.pop(); }
          }
          cx = sx; cy = sy; cur = null; lastC = lastQ = null;
          if (!hasNum()) { cmd = ''; } // allow next command
          continue;
        }
        do {
          switch (C) {
            case 'M':
              x = num(); y = num(); if (rel) { x += cx; y += cy; }
              cur = { closed: false, pts: [G.A(x, y)] }; subs.push(cur);
              cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; C = 'L'; rel = cmd === 'l'; lastC = lastQ = null;
              break;
            case 'L': x = num(); y = num(); if (rel) { x += cx; y += cy; } lineTo(x, y); lastC = lastQ = null; break;
            case 'H': x = num(); if (rel) x += cx; lineTo(x, cy); lastC = lastQ = null; break;
            case 'V': y = num(); if (rel) y += cy; lineTo(cx, y); lastC = lastQ = null; break;
            case 'C':
              x1 = num(); y1 = num(); x2 = num(); y2 = num(); x = num(); y = num();
              if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
              cubicTo(x1, y1, x2, y2, x, y); lastC = P(x2, y2); lastQ = null; break;
            case 'S':
              x2 = num(); y2 = num(); x = num(); y = num();
              if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
              x1 = lastC ? 2 * cx - lastC.x : cx; y1 = lastC ? 2 * cy - lastC.y : cy;
              cubicTo(x1, y1, x2, y2, x, y); lastC = P(x2, y2); lastQ = null; break;
            case 'Q':
              x1 = num(); y1 = num(); x = num(); y = num();
              if (rel) { x1 += cx; y1 += cy; x += cx; y += cy; }
              cubicTo(cx + 2 / 3 * (x1 - cx), cy + 2 / 3 * (y1 - cy), x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y), x, y);
              lastQ = P(x1, y1); lastC = null; break;
            case 'T':
              x = num(); y = num(); if (rel) { x += cx; y += cy; }
              x1 = lastQ ? 2 * cx - lastQ.x : cx; y1 = lastQ ? 2 * cy - lastQ.y : cy;
              cubicTo(cx + 2 / 3 * (x1 - cx), cy + 2 / 3 * (y1 - cy), x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y), x, y);
              lastQ = P(x1, y1); lastC = null; break;
            case 'A':
              var rx = num(), ry = num(), rot = num(), la = flag(), sw = flag(); x = num(); y = num();
              if (rel) { x += cx; y += cy; }
              arcTo(abs(rx), abs(ry), rot, la, sw, x, y); lastC = lastQ = null; break;
            default: i = n;
          }
        } while (hasNum());
      }
    } catch (e) { /* keep what parsed so far */ }
    subs.forEach(function (sp) { sp.pts.forEach(function (a) { a.s = G.isSmooth(a); }); });
    return subs.filter(function (sp) { return sp.pts.length > 0; });
  };
  G.isSmooth = function (a) {
    if (!G.hasIn(a) || !G.hasOut(a)) return false;
    var u = norm(P(a.x - a.ix, a.y - a.iy)), v = norm(P(a.ox - a.x, a.oy - a.y));
    return abs(cross(u, v)) < 0.02 && dot(u, v) > 0;
  };
  // SVG arc (endpoint parameterisation) → array of cubic [x1,y1,x2,y2,x,y]
  G.arcToCubics = function (x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
    var phi = phiDeg * PI / 180, cosp = Math.cos(phi), sinp = Math.sin(phi);
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var x1p = cosp * dx + sinp * dy, y1p = -sinp * dx + cosp * dy;
    var lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { var s = sqrt(lam); rx *= s; ry *= s; }
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    var den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = sqrt(max(0, num / den)) * (fa === fs ? -1 : 1);
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = cosp * cxp - sinp * cyp + (x1 + x2) / 2, cy = sinp * cxp + cosp * cyp + (y1 + y2) / 2;
    function ang(ux, uy, vx, vy) { var a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; }
    var t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    var dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * PI; else if (fs && dt < 0) dt += 2 * PI;
    var segs = Math.ceil(abs(dt) / (PI / 2) - 1e-9), out = [];
    var delta = dt / segs, k = 4 / 3 * Math.tan(delta / 4);
    for (var i = 0; i < segs; i++) {
      var a1 = t1 + i * delta, a2 = a1 + delta;
      var c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
      var e1 = [c1 - k * s1, s1 + k * c1], e2 = [c2 + k * s2, s2 - k * c2], e3 = [c2, s2];
      var pts = [e1, e2, e3].map(function (e) {
        var X = rx * e[0], Y = ry * e[1];
        return [cosp * X - sinp * Y + cx, sinp * X + cosp * Y + cy];
      });
      out.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1]]);
    }
    return out;
  };
})();
