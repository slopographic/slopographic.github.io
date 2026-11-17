/* SlopVector — core: object geometry, text layout, bounds, transforms */
(function () {
  'use strict';
  var G = window.SVGeom;
  var SV = window.SV = window.SV || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round;
  var fmt = G.fmt;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var $ = SV._core = SV._core || {};
  function getObj() { return $.getObj.apply(this, arguments); }
  var S = $.S;

  /* ================= geometry of objects ================= */
  var mctx = document.createElement('canvas').getContext('2d');
  var textCache = new Map();
  function fontCSS(f, size) { return (f.style || 'normal') + ' ' + (f.weight || 400) + ' ' + (size || f.size) + 'px ' + SV.fontStack(f.family); }
  SV.fontCSS = fontCSS;
  function textLayout(o) {
    var f = o.font, sig = JSON.stringify([o.text, f, o.x, o.y]);
    var c = textCache.get(o.id);
    if (c && c.sig === sig) return c.lay;
    mctx.font = fontCSS(f);
    var lines = String(o.text).split('\n');
    var mm = mctx.measureText('Hgjy');
    var asc = mm.fontBoundingBoxAscent || f.size * 0.8, desc = mm.fontBoundingBoxDescent || f.size * 0.22;
    var L = f.size * (f.lh || 1.2), tr = (f.tracking || 0) / 1000 * f.size;
    var widths = lines.map(function (l) { return mctx.measureText(l).width + tr * l.length; });
    var W = max.apply(null, widths.concat([0]));
    var x0 = f.align === 'center' ? o.x - W / 2 : f.align === 'right' ? o.x - W : o.x;
    var lay = { lines: lines, widths: widths, asc: asc, desc: desc, L: L, tr: tr, W: W, box: { x: x0, y: o.y - asc, w: max(W, 1), h: (lines.length - 1) * L + asc + desc } };
    textCache.set(o.id, { sig: sig, lay: lay });
    return lay;
  }
  SV.textLayout = textLayout;
  SV.clearTextCache = function () { textCache.clear(); flatCache.clear(); };
  function localBox(o) {
    if (o.type === 'text') return textLayout(o).box;
    if (o.type === 'image' || o.type === 'rect') return { x: o.x, y: o.y, w: o.w, h: o.h };
    return G.subsBBox(localSubs(o));
  }
  SV.localBox = localBox;
  function localSubs(o) {
    switch (o.type) {
      case 'path': return o.subpaths;
      case 'rect': return G.rectSubs(o.x, o.y, o.w, o.h, o.rx);
      case 'ellipse': return G.ellipseSubs(o.cx, o.cy, o.rx, o.ry);
      case 'polygon': return G.polygonSubs(o.cx, o.cy, o.r, o.sides);
      case 'star': return G.starSubs(o.cx, o.cy, o.r1, o.r2, o.points);
      case 'text': case 'image':
        var b = localBox(o); return G.rectSubs(b.x, b.y, b.w, b.h, 0);
    }
    return [];
  }
  SV.localSubs = localSubs;
  function docSubs(o) {
    if (o.type === 'group' && o.clip && o.children.length) return docSubs(o.children[o.children.length - 1]); // a clipping mask: its clip shape's area
    if (o.type === 'group') { var out = []; o.children.forEach(function (c) { if (!c.hidden) out = out.concat(docSubs(c)); }); return out; }
    return G.transformSubs(localSubs(o), o.m);
  }
  SV.docSubs = docSubs;
  function objBBox(o) {
    if (o.type === 'group' && o.clip && o.children.length) return objBBox(o.children[o.children.length - 1]);
    if (o.type === 'group') {
      var b = null; o.children.forEach(function (c) { if (!c.hidden) b = G.unionBox(b, objBBox(c)); }); return b;
    }
    if (o.type === 'text' || o.type === 'image') {
      var lb = localBox(o), pts = [G.ap(o.m, lb.x, lb.y), G.ap(o.m, lb.x + lb.w, lb.y), G.ap(o.m, lb.x + lb.w, lb.y + lb.h), G.ap(o.m, lb.x, lb.y + lb.h)];
      return G.boxOfPoints(pts);
    }
    return G.subsBBox(docSubs(o));
  }
  SV.objBBox = objBBox;
  function selBBox(ids) {
    var b = null; (ids || S.sel).forEach(function (id) { var o = getObj(id); if (o) b = G.unionBox(b, objBBox(o)); }); return b;
  }
  SV.selBBox = selBBox;
  var flatCache = new Map();
  function flatPolys(o) {
    var sig = JSON.stringify([o.type, o.subpaths, o.x, o.y, o.w, o.h, o.rx, o.rc, o.cx, o.cy, o.r, o.r1, o.r2, o.sides, o.points, o.m, o.text, o.font]);
    var c = flatCache.get(o.id);
    if (c && c.sig === sig) return c.polys;
    var polys = G.flatten(docSubs(o), 0.7);
    flatCache.set(o.id, { sig: sig, polys: polys });
    return polys;
  }
  SV.flatPolys = flatPolys;
  SV.objRot = function (o) {
    if (o.type === 'path' || o.type === 'group') return o.rot || 0;
    var a = Math.atan2(o.m[1], o.m[0]) * 180 / PI; return Math.round(a * 100) / 100;
  };

  /* ================= transforms ================= */
  function scaleStroke(o, M) {
    if (!S.prefs.scaleStrokes || !o.style) return;
    o.style.sw = o.style.sw * Math.sqrt(abs(G.det(M)));
  }
  function toPath(o) {
    if (o.type === 'path' || o.type === 'group' || o.type === 'text' || o.type === 'image') return o;
    var subs = G.transformSubs(localSubs(o), o.m);
    ['x', 'y', 'w', 'h', 'rx', 'cx', 'cy', 'r', 'r1', 'r2', 'sides', 'points', 'ry'].forEach(function (k) { delete o[k]; });
    o.type = 'path'; o.subpaths = subs; o.m = G.I();
    return o;
  }
  SV.toPath = toPath;
  function transformObj(o, M) {
    var N, sx, sy, dotp;
    switch (o.type) {
      case 'group': o.children.forEach(function (c) { transformObj(c, M); }); break;
      case 'path':
        if (!G.isIdentity(o.m)) { o.subpaths = G.transformSubs(o.subpaths, o.m); o.m = G.I(); }
        o.subpaths = G.transformSubs(o.subpaths, M); scaleStroke(o, M); break;
      case 'rect': case 'ellipse': case 'image':
        N = G.mul(M, o.m); sx = Math.hypot(N[0], N[1]); sy = Math.hypot(N[2], N[3]); dotp = N[0] * N[2] + N[1] * N[3];
        if (sx > 1e-9 && sy > 1e-9 && abs(dotp) < 1e-6 * sx * sy) {
          if (o.type === 'ellipse') { o.cx *= sx; o.cy *= sy; o.rx *= sx; o.ry *= sy; }
          else { o.x *= sx; o.y *= sy; o.w *= sx; o.h *= sy; }
          o.m = [N[0] / sx, N[1] / sx, N[2] / sy, N[3] / sy, N[4], N[5]];
          if (o.type !== 'image') scaleStroke(o, M);
        } else if (o.type === 'image') { o.m = N; }
        else { toPath(o); transformObj(o, M); }
        break;
      case 'polygon': case 'star':
        N = G.mul(M, o.m); sx = Math.hypot(N[0], N[1]); sy = Math.hypot(N[2], N[3]); dotp = N[0] * N[2] + N[1] * N[3];
        if (sx > 1e-9 && abs(dotp) < 1e-6 * sx * sy && abs(sx - sy) < 1e-6 * sx) {
          o.cx *= sx; o.cy *= sx;
          if (o.type === 'polygon') o.r *= sx; else { o.r1 *= sx; o.r2 *= sx; }
          o.m = [N[0] / sx, N[1] / sx, N[2] / sy, N[3] / sy, N[4], N[5]];
          scaleStroke(o, M);
        } else { toPath(o); transformObj(o, M); }
        break;
      case 'text':
        o.m = G.mul(M, o.m); break;
    }
    // clean numeric noise in matrices; fold pure translations into the shape parameters
    if (o.m) o.m = o.m.map(function (v) { return abs(v) < 1e-12 ? 0 : v; });
    if (o.m && o.type !== 'group' && o.type !== 'path' && abs(o.m[0] - 1) < 1e-9 && abs(o.m[1]) < 1e-9 && abs(o.m[2]) < 1e-9 && abs(o.m[3] - 1) < 1e-9 && (o.m[4] || o.m[5])) {
      var tx = o.m[4], ty = o.m[5];
      if (o.type === 'ellipse' || o.type === 'polygon' || o.type === 'star') { o.cx += tx; o.cy += ty; }
      else { o.x += tx; o.y += ty; }
      o.m = [1, 0, 0, 1, 0, 0];
    }
  }
  SV.transformObj = transformObj;
  SV.transformIds = function (ids, M) { ids.forEach(function (id) { var o = getObj(id); if (o) transformObj(o, M); }); };

  $.docSubs = docSubs; $.flatPolys = flatPolys; $.localBox = localBox; $.localSubs = localSubs; $.objBBox = objBBox; $.selBBox = selBBox; $.textLayout = textLayout;
})();
