/* SlopVector — geometry: Slopify (wobble + drips + gloss) */
(function () {
  'use strict';
  var G = window.SVGeom = window.SVGeom || {};
  var abs = Math.abs, sqrt = Math.sqrt, min = Math.min, max = Math.max, PI = Math.PI;
  var KAPPA = 0.5522847498;
  var $ = G._p = G._p || {};
  function P() { return $.P.apply(this, arguments); }
  function add() { return $.add.apply(this, arguments); }
  function dist() { return $.dist.apply(this, arguments); }
  function lerp() { return $.lerp.apply(this, arguments); }
  function norm() { return $.norm.apply(this, arguments); }
  function scl() { return $.scl.apply(this, arguments); }
  function sub() { return $.sub.apply(this, arguments); }

  /* ---------- Slopify ---------- */
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  function resample(pts, closed, spacing) {
    var ring = pts.slice(); if (closed) ring.push(pts[0]);
    var out = [ring[0]], acc = 0;
    for (var i = 1; i < ring.length; i++) {
      var a = ring[i - 1], b = ring[i], d = dist(a, b), pos = spacing - acc;
      while (pos <= d) { out.push(lerp(a, b, pos / d)); pos += spacing; }
      acc = d - (pos - spacing);
    }
    if (closed && out.length > 2 && dist(out[out.length - 1], out[0]) < spacing * 0.5) out.pop();
    return out;
  }
  G.slopify = function (subs, opts) {
    opts = opts || {};
    var rand = rng(opts.seed || (Math.random() * 1e9) | 0);
    var polys = G.flatten(subs, 0.5).filter(function (p) { return p.pts.length >= 3; });
    if (!polys.length) return null;
    var all = []; polys.forEach(function (p) { all = all.concat(p.pts); });
    var bb = G.boxOfPoints(all), w = max(bb.w, 1), h = max(bb.h, 1), S = min(w, h), cy = bb.y + h / 2;
    var amp = max(1.2, S * 0.028);
    var waves = [3, 5, 8, 13].map(function (k, i) { return { k: k, a: [1, 0.55, 0.32, 0.18][i] * (0.7 + rand() * 0.6), ph: rand() * PI * 2 }; });
    var wob = polys.map(function (pl) {
      var perim = G.polyLength(pl.pts, true), sp = max(1.5, perim / 220);
      var pts = resample(pl.pts, true, sp), n = pts.length, area = G.polyArea(pts), sgn = area > 0 ? 1 : -1;
      var res = [];
      for (var i = 0; i < n; i++) {
        var a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n], t = norm(sub(c, a));
        var nrm = sgn > 0 ? P(t.y, -t.x) : P(-t.y, t.x), u = i / n, nz = 0;
        waves.forEach(function (wv) { nz += wv.a * Math.sin(2 * PI * wv.k * u + wv.ph); });
        res.push({ p: add(pts[i], scl(nrm, amp * nz * 0.6)), n: nrm });
      }
      return res;
    });
    // drips from the biggest ring
    var big = wob.reduce(function (a, b) { return b.length > a.length ? b : a; });
    var cands = big.filter(function (o) { return o.n.y > 0.55 && o.p.y > cy; });
    var drips = [], count = 2 + Math.floor(rand() * 3), tries = 0, chosen = [];
    while (cands.length && chosen.length < count && tries++ < 60) {
      var c = cands[Math.floor(rand() * cands.length)];
      if (chosen.every(function (q) { return abs(q.p.x - c.p.x) > w * 0.16; })) chosen.push(c);
    }
    chosen.forEach(function (c) {
      var x = c.p.x, y = c.p.y, wn = max(1.6, w * (0.028 + rand() * 0.03)), L = h * (0.1 + rand() * 0.22) + wn * 2;
      var rb = wn * (1.3 + rand() * 0.35), y0 = y - wn * 2.2, yb = y + L - rb, left = [], right = [];
      for (var k = 0; k <= 10; k++) {
        var s = k / 10, yy = y0 + s * (yb - y0), ww = wn * (0.82 + 1.25 * Math.pow(1 - s, 3));
        left.push(P(x - ww, yy)); right.unshift(P(x + ww, yy));
      }
      drips.push(left.concat(right));
      var circ = []; for (k = 0; k < 28; k++) { var an = 2 * PI * k / 28; circ.push(P(x + rb * Math.cos(an), yb + rb * Math.sin(an))); }
      drips.push(circ);
    });
    var operands = [{ rings: wob.map(function (r) { return r.map(function (o) { return o.p; }); }), rule: opts.rule || 'nonzero' }];
    drips.forEach(function (d) { operands.push({ rings: [d], rule: 'nonzero' }); });
    var rings = G.boolean(operands, 'union', new Set());
    var bigA = 0; rings.forEach(function (r) { bigA = max(bigA, abs(G.polyArea(r))); });
    rings = rings.filter(function (r) { return abs(G.polyArea(r)) > max(4, bigA * 0.003); });
    var body = G.fitRings(rings, null, { err: max(0.4, S * 0.004), cornerAngle: 70 });
    // gloss highlight
    var gloss = null;
    if (S > 24) {
      var gx = bb.x + w * 0.3, gy = bb.y + h * 0.27;
      var testPolys = rings.map(function (r) { return { pts: r, closed: true }; });
      if (G.pointInPolys(testPolys, P(gx, gy), 'nonzero')) {
        gloss = G.transformSubs(G.ellipseSubs(gx, gy, w * 0.1, h * 0.055), G.rotate(-35 * PI / 180, gx, gy));
      }
    }
    return { body: body, gloss: gloss, box: bb };
  };
})();
