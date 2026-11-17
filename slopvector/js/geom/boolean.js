/* SlopVector — geometry: arrangement-based polygon booleans and bezier refitting */
(function () {
  'use strict';
  var G = window.SVGeom = window.SVGeom || {};
  var abs = Math.abs, sqrt = Math.sqrt, min = Math.min, max = Math.max, PI = Math.PI;
  var KAPPA = 0.5522847498;
  var $ = G._p = G._p || {};
  function P() { return $.P.apply(this, arguments); }
  function add() { return $.add.apply(this, arguments); }
  function cross() { return $.cross.apply(this, arguments); }
  function dist() { return $.dist.apply(this, arguments); }
  function dot() { return $.dot.apply(this, arguments); }
  function len() { return $.len.apply(this, arguments); }
  function lerp() { return $.lerp.apply(this, arguments); }
  function norm() { return $.norm.apply(this, arguments); }
  function scl() { return $.scl.apply(this, arguments); }
  function sub() { return $.sub.apply(this, arguments); }

  /* ---------- polygon boolean operations ----------
     Robust arrangement-based approach: split all edges of all operands at every
     intersection (incl. collinear overlaps), classify each unique edge by sampling
     the region on both sides against every operand (winding rule aware), keep
     edges where the boolean result changes, orient them with the result on the
     left and chain them into rings. Works for N operands, holes, touching and
     coincident edges. */
  var QG = 1024;
  function qv(v) { return Math.round(v * QG) / QG; }
  function key(p) { return p.x + ',' + p.y; }
  G.qkey = function (p) { return qv(p.x) + ',' + qv(p.y); };

  G.boolean = function (operands, op, cornerKeys) {
    cornerKeys = cornerKeys || new Set();
    var opData = operands.map(function (o) {
      var rings = o.rings.map(function (r) {
        var q = []; r.forEach(function (p) { var v = P(qv(p.x), qv(p.y)); if (!q.length || v.x !== q[q.length - 1].x || v.y !== q[q.length - 1].y) q.push(v); });
        if (q.length > 1 && q[0].x === q[q.length - 1].x && q[0].y === q[q.length - 1].y) q.pop();
        return q;
      }).filter(function (r) { return r.length >= 3; });
      return { rule: o.rule || 'nonzero', rings: rings.map(function (r) { return { pts: r, box: G.boxOfPoints(r) }; }) };
    });
    var edges = [];
    opData.forEach(function (o, k) {
      o.rings.forEach(function (r) {
        var pts = r.pts, n = pts.length;
        for (var i = 0; i < n; i++) {
          var a = pts[i], b = pts[(i + 1) % n];
          if (a.x === b.x && a.y === b.y) continue;
          edges.push({ a: a, b: b, k: k, sp: [], x0: min(a.x, b.x), x1: max(a.x, b.x), y0: min(a.y, b.y), y1: max(a.y, b.y) });
        }
      });
    });
    edges.sort(function (e, f) { return e.x0 - f.x0; });
    var TINY = 1e-10;
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      for (var j = i + 1; j < edges.length && edges[j].x0 <= e.x1; j++) {
        var f = edges[j];
        if (f.y0 > e.y1 || f.y1 < e.y0) continue;
        var r = sub(e.b, e.a), s = sub(f.b, f.a), den = cross(r, s), qp = sub(f.a, e.a);
        var lr = len(r), ls = len(s);
        if (abs(den) > 1e-12 * lr * ls) {
          var t = cross(qp, s) / den, u = cross(qp, r) / den;
          if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
          var X;
          if (t <= TINY) X = e.a; else if (t >= 1 - TINY) X = e.b;
          else if (u <= TINY) X = f.a; else if (u >= 1 - TINY) X = f.b;
          else X = P(qv(e.a.x + t * r.x), qv(e.a.y + t * r.y));
          var ti = t > TINY && t < 1 - TINY, ui = u > TINY && u < 1 - TINY;
          if (ti) e.sp.push(X);
          if (ui) f.sp.push(X);
          if ((ti || ui) && e.k !== f.k) cornerKeys.add(key(X));
        } else {
          // parallel: collinear?
          if (abs(cross(qp, r)) / (lr || 1) > 1e-6) continue;
          var rr = dot(r, r), ss = dot(s, s);
          [f.a, f.b].forEach(function (p) { var tt = dot(sub(p, e.a), r) / rr; if (tt > TINY && tt < 1 - TINY) e.sp.push(p); });
          [e.a, e.b].forEach(function (p) { var tt = dot(sub(p, f.a), s) / ss; if (tt > TINY && tt < 1 - TINY) f.sp.push(p); });
        }
      }
    }
    // split edges & dedupe
    var segs = new Map();
    edges.forEach(function (e) {
      var pts = [e.a].concat(e.sp.sort(function (p, q) { return dot(sub(p, e.a), sub(e.b, e.a)) - dot(sub(q, e.a), sub(e.b, e.a)); }), [e.b]);
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        if (a.x === b.x && a.y === b.y) continue;
        var ka = key(a), kb = key(b), kk = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if (!segs.has(kk)) segs.set(kk, { a: a, b: b });
      }
    });
    function inside(k, p) {
      var o = opData[k], w = 0;
      for (var i = 0; i < o.rings.length; i++) {
        var rg = o.rings[i], bx = rg.box;
        if (p.x < bx.x || p.x > bx.x + bx.w || p.y < bx.y || p.y > bx.y + bx.h) continue;
        w += G.winding(rg.pts, p);
      }
      return o.rule === 'evenodd' ? (abs(w) % 2) === 1 : w !== 0;
    }
    function evalOp(ins) {
      var c = 0, i;
      switch (op) {
        case 'union': return ins.some(Boolean);
        case 'intersect': return ins.every(Boolean);
        case 'xor': for (i = 0; i < ins.length; i++) if (ins[i]) c++; return c % 2 === 1;
        case 'minus': if (!ins[0]) return false; for (i = 1; i < ins.length; i++) if (ins[i]) return false; return true;
      }
      return false;
    }
    var EPSO = 1 / 256, directed = [];
    segs.forEach(function (sg) {
      var d = sub(sg.b, sg.a), l = len(d), nrm = P(-d.y / l, d.x / l), m = lerp(sg.a, sg.b, 0.5);
      var L = add(m, scl(nrm, EPSO)), R = sub(m, scl(nrm, EPSO));
      var insL = [], insR = [];
      for (var k = 0; k < opData.length; k++) { insL.push(inside(k, L)); insR.push(inside(k, R)); }
      var rl = evalOp(insL), rr = evalOp(insR);
      if (rl === rr) return;
      directed.push(rl ? { a: sg.a, b: sg.b } : { a: sg.b, b: sg.a });
    });
    // chain
    var out = new Map();
    directed.forEach(function (e, idx) { e.used = false; var k = key(e.a); if (!out.has(k)) out.set(k, []); out.get(k).push(e); });
    var rings = [];
    directed.forEach(function (e0) {
      if (e0.used) return;
      var ring = [e0.a], cur = e0, startK = key(e0.a), guard = 0;
      e0.used = true;
      while (guard++ < 1e6) {
        var endK = key(cur.b);
        if (endK === startK) break;
        ring.push(cur.b);
        var cands = (out.get(endK) || []).filter(function (c) { return !c.used; });
        if (!cands.length) break;
        var din = sub(cur.b, cur.a), best = null, bestA = -Infinity;
        cands.forEach(function (c) {
          var dout = sub(c.b, c.a), a = Math.atan2(cross(din, dout), dot(din, dout));
          if (a > bestA) { bestA = a; best = c; }
        });
        best.used = true; cur = best;
      }
      if (ring.length >= 3) rings.push(ring);
    });
    // clean: remove collinear points & tiny rings
    return rings.map(function (r) {
      var changed = true;
      while (changed && r.length > 3) {
        changed = false;
        for (var i = 0; i < r.length && r.length > 3; i++) {
          var a = r[(i + r.length - 1) % r.length], b = r[i], c = r[(i + 1) % r.length];
          var u = sub(b, a), v = sub(c, b);
          if (abs(cross(u, v)) < 1e-9 * (len(u) * len(v) + 1e-12) && dot(u, v) > 0 && !cornerKeys.has(key(b))) { r.splice(i, 1); changed = true; i--; }
        }
      }
      return r;
    }).filter(function (r) { return r.length >= 3 && abs(G.polyArea(r)) > 0.01; });
  };

  // collect corner keys from (doc-space) subpaths: anchors whose in/out tangents differ
  G.cornerKeysOf = function (subs, set) {
    subs.forEach(function (sp) {
      var n = sp.pts.length;
      sp.pts.forEach(function (a, i) {
        var prev = sp.pts[(i - 1 + n) % n], next = sp.pts[(i + 1) % n];
        if (!sp.closed && (i === 0 || i === n - 1)) { set.add(G.qkey(a)); return; }
        var tin = G.hasIn(a) ? P(a.x - a.ix, a.y - a.iy) : (G.hasOut(prev) ? P(a.x - prev.ox, a.y - prev.oy) : P(a.x - prev.x, a.y - prev.y));
        var tout = G.hasOut(a) ? P(a.ox - a.x, a.oy - a.y) : (G.hasIn(next) ? P(next.ix - a.x, next.iy - a.y) : P(next.x - a.x, next.y - a.y));
        var u = norm(tin), v = norm(tout);
        if (len(u) < 0.5 || len(v) < 0.5) return;
        var ang = abs(Math.atan2(cross(u, v), dot(u, v)));
        if (ang > 3 * PI / 180) set.add(G.qkey(a));
      });
    });
    return set;
  };

  // polygon rings → bezier subpaths: corners kept, smooth runs curve-fitted
  G.fitRings = function (rings, cornerKeys, opts) {
    opts = opts || {};
    var err = opts.err || 0.35, angT = (opts.cornerAngle || 32) * PI / 180;
    return rings.map(function (r) {
      var n = r.length, isC = r.map(function (p, i) {
        if (cornerKeys && cornerKeys.has(key(p))) return true;
        var a = r[(i - 1 + n) % n], c = r[(i + 1) % n];
        var u = sub(p, a), v = sub(c, p);
        return abs(Math.atan2(cross(u, v), dot(u, v))) > angT;
      });
      var cIdx = []; isC.forEach(function (c, i) { if (c) cIdx.push(i); });
      var cubics = [];
      function runFrom(i0, i1) { // inclusive indices, cyclic
        var pts = [], i = i0; pts.push(r[i]);
        do { i = (i + 1) % n; pts.push(r[i]); } while (i !== i1);
        return pts;
      }
      function addRun(pts, t1, t2) {
        if (pts.length === 2) { cubics.push([pts[0], pts[0], pts[1], pts[1]]); return; }
        var a = pts[0], b = pts[pts.length - 1], chord = sub(b, a), cl = len(chord), straight = true;
        for (var k = 1; k < pts.length - 1 && straight; k++) {
          var dd = cl > 1e-9 ? abs(cross(chord, sub(pts[k], a))) / cl : dist(pts[k], a);
          if (dd > 0.02) straight = false;
        }
        if (straight && cl > 1e-9) { cubics.push([a, a, b, b]); return; }
        G.fitRun(pts, err, t1, t2).forEach(function (c) { cubics.push(c); });
      }
      if (!cIdx.length) {
        var pts = r.slice(); pts.push(r[0]);
        var t = norm(sub(r[1], r[n - 1]));
        addRun(pts, t, scl(t, -1));
      } else {
        for (var k = 0; k < cIdx.length; k++) {
          var i0 = cIdx[k], i1 = cIdx[(k + 1) % cIdx.length];
          if (cIdx.length === 1) i1 = i0;
          addRun(runFrom(i0, i1));
        }
      }
      // line cubics → anchors w/o handles
      var sp = G.cubicsToSub(cubics.map(function (c) {
        if (c[1] === c[0] && c[2] === c[3]) return [c[0], P(c[0].x, c[0].y), P(c[3].x, c[3].y), c[3]];
        return c;
      }), true);
      return sp;
    }).filter(Boolean);
  };
})();
