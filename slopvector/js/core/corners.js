/* SlopVector — core: rounded rectangle corners.
 * A rect keeps rx (its single radius, or the largest corner when the corners differ) so older code still works.
 * When the corners were set one by one, rc = [tl, tr, br, bl] holds all four. The geometry (clamping, arcs)
 * is shared with PhotoSlop in shared/shapes/rounded.js (window.SlopShapes). */
(function () {
  'use strict';
  var SV = window.SV = window.SV || {};

  /** The four corner radii of a rect object, [tl, tr, br, bl]. */
  SV.rectRadii = function (o) { return window.SlopShapes.radii(o.rc || o.rx || 0); };

  /** Store four radii on a rect: rc only when they differ, rx = the largest. */
  function store(l, r) {
    var same = r[0] === r[1] && r[1] === r[2] && r[2] === r[3];
    if (same) delete l.rc; else l.rc = r.slice();
    l.rx = Math.max(r[0], r[1], r[2], r[3]);
  }

  /** Set one corner (0 tl, 1 tr, 2 br, 3 bl) on every selected rect. One undo step. */
  SV.applyCorner = function (i, value) {
    var v = Math.max(0, +value || 0), n = 0;
    SV.selObjs().forEach(function (o) {
      SV.leaves(o).forEach(function (l) {
        if (l.type !== 'rect' || !SV.isEditable(l)) return;
        var r = SV.rectRadii(l); r[i] = v; store(l, r); n++;
      });
    });
    if (n) SV.commit('corner radius'); else SV.applyShapeOpt('radius', v);
  };

  /** True when the control bar and Properties show one radius for all corners (the default). */
  SV.cornerLink = function () { return SV.state.shape.cornerLink !== false; };
})();
