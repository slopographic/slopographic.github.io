/* SlopVector — ui: Restore original aspect ratio for the selected image (box handles, selection box, Object > Transform,
 * the command palette). The ratio comes from the shared helper (shared/transform/aspect.js): an image keeps its
 * natural proportions in o.src, set when it is placed. The restore is one undo step. */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state, D = SV.dom, G = window.SVGeom;
  var Aspect = window.SlopAspect;

  /** The one selected image with a source ratio, or null. */
  SV.aspectTarget = function () {
    if (S.sel.length !== 1) return null;
    var o = SV.getObj(S.sel[0]);
    return o && o.type === 'image' && SV.isEditable(o) && Aspect.ratio(o) !== null ? o : null;
  };
  /** 'h' when the pointer (client x, y) is on the top or bottom handle of the selection box, else 'w'. */
  SV.aspectKeepAt = function (x, y) {
    var b = SV.selBBox(); if (!b) return 'w';
    var r = D.stage.getBoundingClientRect(), hp = SV.handlePositions(SV.screenBox(b)), sx = x - r.left, sy = y - r.top;
    return ['n', 's'].some(function (n) { return Math.hypot(hp[n][0] - sx, hp[n][1] - sy) <= 8; }) ? 'h' : 'w';
  };
  /** Sets the image back to its source ratio. The width stays (keep 'h' keeps the height); the top-left corner stays put.
      The local frame of the object's matrix is used, so a turned image is restored along its own sides. */
  SV.restoreAspect = function (keep) {
    var o = SV.aspectTarget(); if (!o) return false;
    var m = o.m, W = o.w * Math.hypot(m[0], m[1]), H = o.h * Math.hypot(m[2], m[3]);
    if (!(W > 0) || !(H > 0)) return false;
    var want = Aspect.restore({ w: W, h: H }, o, keep === 'h' ? 'h' : 'w');
    var kx = want.w / W, ky = want.h / H, a = G.ap(m, o.x, o.y), th = Math.atan2(m[1], m[0]);
    // rotate to the object's frame, scale its sides (one of the two factors is 1), rotate back; all about the top-left corner
    var M = G.mul(G.rotate(th, a.x, a.y), G.mul(G.scale(kx, ky, a.x, a.y), G.rotate(-th, a.x, a.y)));
    SV.transformObj(o, M);
    SV.commit('Restore aspect ratio');
    return true;
  };
})();
