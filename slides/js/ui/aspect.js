/* Slop Slides: Restore original aspect ratio for the one selected object (the object menu and the command palette).
   The source ratio comes from the shared helper (shared/transform/aspect.js): a picture keeps its natural size in
   o.src, set when it is inserted. The width stays (a top or bottom handle keeps the height), and the top-left corner
   stays put; a turned object keeps its centre. One undo step. Exposes window.SS.aspect. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, A = SS.app, OV = SS.overlay, Aspect = window.SlopAspect;

  /** The one selected object with a source ratio, or null. */
  function target() {
    var objs = A.selObjs();
    return objs.length === 1 && Aspect.ratio(objs[0]) !== null ? objs[0] : null;
  }
  /** 'h' when slide point p is on the top or bottom handle of the selected object, else 'w'. */
  function keepAt(p) {
    var objs = A.selObjs(), h = p && objs.length === 1 ? OV.handleAt(p, objs) : null;
    return h === 'n' || h === 's' ? 'h' : 'w';
  }
  function restore(keep) {
    var o = target(); if (!o) return false;
    var b = Aspect.restore({ w: o.w, h: o.h }, o, keep === 'h' ? 'h' : 'w');
    A.change(SU.t('slides.op.restore_aspect_ratio'), function () {
      var cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      o.w = b.w; o.h = b.h;
      if (o.rot) { o.x = cx - o.w / 2; o.y = cy - o.h / 2; }
    });
    return true;
  }
  SS.aspect = { target: target, keepAt: keepAt, restore: restore };
})();
