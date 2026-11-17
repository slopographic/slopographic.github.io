/* SlopVector — tools: the eyedropper. A click samples the colour of the object under the pointer and sets the fill of
 * the selection (Alt: the stroke). Shift copies the whole appearance of that object (the old behaviour).
 * Limit: the colour comes from the object's solid fill or stroke (a gradient gives its first stop), not from the rendered
 * pixels, because the artwork is SVG and reading pixels for every pointer move would be too slow. */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state, $ = SV._tools;
  var TOOLS = $.TOOLS, CURSORS = $.CURSORS;

  /** The solid colour of a paint value (a hex string, or a gradient's first stop), with its alpha; null for none. */
  function solidOf(paint) {
    if (!paint) return null;
    if (typeof paint === 'string') return paint === 'none' ? null : paint;
    if (paint.stops && paint.stops.length) { var s = paint.stops[0]; return SlopColor.withAlpha(s.c, s.a == null ? 1 : s.a); }
    return null;
  }
  /** The colour under a document point: the object's fill, else its stroke. Null when nothing solid is there. */
  function sampleAt(p) {
    var hit = SV.hitTest(p); if (!hit || !hit.obj) return null;
    var o = hit.obj;
    var leaf = o.style ? o : SV.leaves(o).filter(function (l) { return l.style && l.type !== 'image'; })[0];
    if (!leaf || !leaf.style) return null;
    var fill = solidOf(leaf.style.fill);
    if (fill) return { hex: fill, which: 'fill' };
    var stroke = solidOf(leaf.style.stroke);
    return stroke ? { hex: stroke, which: 'stroke' } : null;
  }
  /** Copies every appearance attribute of the object under the pointer onto the selection (Shift-click). */
  function copyAppearance(ev) {
    var hit = SV.hitTest(ev.p); if (!hit) return;
    var src = hit.obj; if (!src.style) return;
    var keys = ['fill', 'stroke', 'sw', 'cap', 'join', 'miter', 'dash', 'opacity', 'blend'];
    var targets = [];
    SV.selObjs().forEach(function (o) { SV.leaves(o).forEach(function (l) { if (l.id !== src.id && SV.isEditable(l)) targets.push(l); }); });
    targets.forEach(function (t) {
      keys.forEach(function (k) { if (t.type === 'image' && k !== 'opacity' && k !== 'blend') return; t.style[k] = SV.clone(src.style[k]); });
      if (t.type === 'text' && src.type === 'text') t.font = SV.clone(src.font);
    });
    if (src.type !== 'image') keys.forEach(function (k) { S.style[k] = SV.clone(src.style[k]); });
    if (src.type === 'text') S.font = SV.clone(src.font);
    if (targets.length) SV.commit('eyedropper'); else SV.requestRender(true);
    SV.toast(targets.length ? SV.t('vector.msg.eyedrop_applied') : SV.t('vector.msg.eyedrop_sampled'));
  }

  TOOLS.eyedropper = {
    down: function (ev) {
      if (ev.shift) { copyAppearance(ev); return; }
      var s = sampleAt(ev.p);
      if (!s) { SV.toast(SV.t('vector.msg.eyedrop_nothing')); return; }
      var which = ev.alt ? 'stroke' : 'fill';
      var n = SV.applyStyle(which, s.hex);
      SV.ui.noteRecent(s.hex); // SV.ui is created by ui/color.js, which loads after this file
      SV.toast(n ? (which === 'fill' ? SV.t('vector.msg.eyedrop_set_fill', { hex: s.hex.toUpperCase() }) : SV.t('vector.msg.eyedrop_set_stroke', { hex: s.hex.toUpperCase() })) : SV.t('vector.msg.eyedrop_color', { hex: s.hex.toUpperCase() }));
    },
    hover: function (ev) { var h = SV.hitTest(ev.p); S.hover = h ? h.obj.id : null; $.setCursor(CURSORS.eyedropper); },
  };
  SV.eyedropSample = sampleAt;
})();
