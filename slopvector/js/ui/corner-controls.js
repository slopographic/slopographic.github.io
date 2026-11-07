/* SlopVector — ui: corner radius controls, shared by the control bar and the Properties panel.
 * Linked (default): one field sets every corner. Unlinked: four fields (TL, TR, BR, BL), one per corner.
 * The link button switches between them. Both panels use the same state (S.shape.cornerLink). */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state;
  var UI = SV.ui = SV.ui || {};
  var $ = UI._p = UI._p || {};
  // [short label key, corner radius key] per corner, in the order of SV.rectRadii.
  var CORNERS = [['vector.corner.tl', 'vector.corner.tl_radius'], ['vector.corner.tr', 'vector.corner.tr_radius'], ['vector.corner.br', 'vector.corner.br_radius'], ['vector.corner.bl', 'vector.corner.bl_radius']];

  function cornerInput(g, i, cls) {
    return $.numIn(g, {
      label: CORNERS[i][1], min: 0, max: 5000, cls: cls,
      get: function () { var r = $.firstOfType('rect'); return r ? SV.rectRadii(r)[i] : S.shape.radius; },
      set: function (v) { SV.applyCorner(i, v); }
    });
  }

  /**
   * Returns { one, four, link }: append them where needed. show() says whether a rect is in play (null = always).
   * The caller binds nothing else to these elements; visibility is handled here.
   */
  $.cornerControls = function (g, cls, show) {
    var one = $.field('vector.corner.corners', $.numIn(g, {
      label: 'vector.corner.radius', min: 0, max: 5000, cls: cls,
      get: function () { var r = $.firstOfType('rect'); return r ? r.rx : S.shape.radius; },
      set: function (v) { SV.applyShapeOpt('radius', v); }
    }), 'px');
    var four = $.h('div', { class: 'corner-four' }, CORNERS.map(function (c, i) {
      return $.field(c[0], cornerInput(g, i, cls), 'px', c[1]);
    }));
    var link = $.ibtn($.I.link, 'vector.corner.link', function () {
      S.shape.cornerLink = !SV.cornerLink();
      $.runBinds('cb'); $.runBinds('props');
    }, 'corner-link');
    $.bind(g, function () {
      var on = show ? show() : true, linked = SV.cornerLink();
      one.hidden = !on || !linked;
      four.hidden = !on || linked;
      link.hidden = !on;
      link.classList.toggle('on', linked);
    });
    return { one: one, four: four, link: link };
  };
})();
