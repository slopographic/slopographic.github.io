/* Slop Press — Create Guides: the shared GuideGuide-style panel (shared/guides, SlopGuides) on the current
   page or master, with page / margins / selection targets; falls back to the simple rows × columns dialog. */
(function () {
  'use strict';
  var PR = window.PR, S = PR.state, P = PR.pages, H = PR.history, V = PR.view;
  var UI = PR.ui = PR.ui || {};
  var simple = UI.createGuides;
  var preview = null;

  function side() { var s = V.active(); return s ? s.side : P.side(S.doc, S.page); }
  UI.createGuides = function () {
    if (!window.SlopGuides || !window.SlopGuides.openPanel) return simple();
    var d = S.doc;
    window.SlopGuides.openPanel({
      title: PR.util.t('press.guide.title'), stateKey: 'slopguides.state.press',
      targets: [
        { id: 'margins', label: PR.util.t('press.guide.margins'), rect: function () { var m = P.marginsSide(d, side()); return { x: m.left, y: m.top, w: d.size.w - m.left - m.right, h: d.size.h - m.top - m.bottom }; } },
        { id: 'canvas', label: PR.util.t('press.guide.page'), rect: function () { return { x: 0, y: 0, w: d.size.w, h: d.size.h }; } },
        { id: 'selection', label: PR.util.t('press.guide.selection'), rect: function () { var b = PR.items.unionBounds(PR.selected()); return b && b.w > 0 ? b : null; } }
      ],
      dpi: function () { return 72; }, // 1 pt = 1 px: guides arrive in points
      preview: function (g) { preview = g; V.request(); },
      apply: function (guides, o) {
        var list = PR.layers.guideList(d, S);
        if (o && o.mode === 'replace') list.length = 0;
        guides.forEach(function (g) { list.push({ axis: g.o === 'v' ? 'x' : 'y', pos: PR.util.round(g.pos, 3) }); });
        H.commit(PR.util.t('press.guide.undo_create'));
      },
      clear: function () { PR.layers.guideList(d, S).length = 0; H.commit(PR.util.t('press.guide.undo_clear')); },
      toast: PR.util.toast,
      onClose: function () { preview = null; V.request(); }
    });
  };
  // live preview on the active page
  PR.on('drawn', function () {
    if (!preview || !preview.length || !V.ctx) return;
    var s = V.active(); if (!s) return;
    var ctx = V.ctx;
    ctx.save(); ctx.setTransform(V.dpr * V.zoom, 0, 0, V.dpr * V.zoom, V.dpr * V.px, V.dpr * V.py);
    ctx.translate(s.x, s.y); ctx.strokeStyle = 'rgba(6,182,212,.9)'; ctx.setLineDash([4 / V.zoom, 3 / V.zoom]); ctx.lineWidth = 1 / V.zoom;
    ctx.beginPath();
    preview.forEach(function (g) { if (g.o === 'v') { ctx.moveTo(g.pos, -20); ctx.lineTo(g.pos, s.h + 20); } else { ctx.moveTo(-20, g.pos); ctx.lineTo(s.w + 20, g.pos); } });
    ctx.stroke(); ctx.restore();
  });
})();
