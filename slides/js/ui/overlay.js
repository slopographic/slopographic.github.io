/* Slop Slides: the selection overlay and hit testing. Outlines follow each object's rotation. Resize handles show for
   one unrotated object (rotate it from the inspector). Handles and tolerances are in screen pixels, so they keep
   their size at any zoom. Smart-guide lines from snap.js are drawn here too. Exposes window.SS.overlay. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, U = SS.util, St = SS.stage;
  var OV = SS.overlay = {};
  var ACC = '#5ad1ff', GUIDE = '#ff4f9a';
  OV.HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  OV.MIN = 6;

  OV.resizable = function (objs) { return objs.length === 1 && !objs[0].rot; };
  /** Handle centres (slide points) of an unrotated object. */
  OV.handlePoints = function (o) {
    var x = o.x, y = o.y, w = o.w, h = o.h;
    return { nw: [x, y], n: [x + w / 2, y], ne: [x + w, y], e: [x + w, y + h / 2], se: [x + w, y + h], s: [x + w / 2, y + h], sw: [x, y + h], w: [x, y + h / 2] };
  };
  /** The handle under point p (slide points) for the selection, or null. */
  OV.handleAt = function (p, objs, px) {
    if (!OV.resizable(objs)) return null;
    var pts = OV.handlePoints(objs[0]), r = (px || 8) / St.k, hit = null; // px: the reach in screen pixels (more for a finger)
    OV.HANDLES.forEach(function (h) {
      if (!hit && Math.abs(p.x - pts[h][0]) <= r && Math.abs(p.y - pts[h][1]) <= r) hit = h;
    });
    return hit;
  };
  /** New box for dragging handle h of box b0 by (dx, dy); the opposite edge stays put, sizes never go below MIN. */
  OV.resizeBox = function (b0, h, dx, dy) {
    var x = b0.x, y = b0.y, w = b0.w, hh = b0.h;
    if (h.indexOf('e') >= 0) w = Math.max(OV.MIN, b0.w + dx);
    if (h.indexOf('s') >= 0) hh = Math.max(OV.MIN, b0.h + dy);
    if (h.indexOf('w') >= 0) { w = Math.max(OV.MIN, b0.w - dx); x = b0.x + b0.w - w; }
    if (h.indexOf('n') >= 0) { hh = Math.max(OV.MIN, b0.h - dy); y = b0.y + b0.h - hh; }
    return { x: x, y: y, w: w, h: hh };
  };
  /** Topmost object under point p, with a few screen pixels of slack for thin lines. */
  OV.hit = function (slide, p) {
    var pad = 4 / St.k;
    for (var i = slide.objects.length - 1; i >= 0; i--) {
      var o = slide.objects[i], q = U.mat.apply(U.mat.invert(U.mat.forObject(o)), p.x, p.y);
      if (q[0] >= -pad && q[1] >= -pad && q[0] <= o.w + pad && q[1] <= o.h + pad) return o;
    }
    return null;
  };
  OV.draw = function (ctx) {
    var objs = A.selObjs(), hs = 8 / St.k, guides = (SS.snap && SS.snap.guides) || [];
    ctx.save();
    ctx.lineWidth = 1.5 / St.k;
    ctx.strokeStyle = ACC;
    objs.forEach(function (o) {
      ctx.save();
      var m = U.mat.forObject(o);
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.strokeRect(0, 0, o.w, o.h);
      ctx.restore();
    });
    if (OV.resizable(objs)) {
      var pts = OV.handlePoints(objs[0]);
      ctx.fillStyle = '#0e0e10';
      OV.HANDLES.forEach(function (h) {
        ctx.fillRect(pts[h][0] - hs / 2, pts[h][1] - hs / 2, hs, hs);
        ctx.strokeRect(pts[h][0] - hs / 2, pts[h][1] - hs / 2, hs, hs);
      });
    }
    if (guides.length) {
      ctx.strokeStyle = GUIDE;
      ctx.setLineDash([4 / St.k, 3 / St.k]);
      guides.forEach(function (g) { ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke(); });
    }
    ctx.restore();
  };
})();
