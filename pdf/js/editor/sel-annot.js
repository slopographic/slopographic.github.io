/* Slop PDF — the actions of a selected annotation, for the selection bar (sel-bar.js): Edit (its text, for text boxes,
   callouts, steps and paragraph frames), Colour (the colour that annotation type has: a highlight's or a text's colour, a
   shape's outline, a box's fill), Opacity, Comment (a comment beside it), Duplicate and Delete. Each is one undo step
   through the editor's own commands (annots.js Ed.setProp, Ed.duplicateSelected, Ed.deleteSelected), the same ones the
   Edit panel, the menus and the keys use. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._;
  var N = S.annotAct = {};
  var EDITABLE = { text: 1, callout: 1, step: 1, para: 1 };
  // the property the bar's Colour sets, per annotation type (none: an image, a signature, a comment, a redaction mark)
  var COLOUR = { text: 'color', callout: 'color', texthl: 'color', para: 'color', pen: 'color', marker: 'color', line: 'color', arrow: 'color',
    rect: 'color', ellipse: 'color', hlbox: 'fill', whiteout: 'fill', step: 'fill' };
  // the annotation's kind as read inside a sentence ('Selected text box')
  var NAMES = { text: 'pdf.ed.an_text', callout: 'pdf.ed.an_callout', step: 'pdf.ed.an_step', para: 'pdf.ed.an_para', texthl: 'pdf.ed.an_texthl', pen: 'pdf.ed.an_pen',
    marker: 'pdf.ed.an_marker', line: 'pdf.ed.an_line', arrow: 'pdf.ed.an_arrow', rect: 'pdf.ed.an_rect', ellipse: 'pdf.ed.an_ellipse', hlbox: 'pdf.ed.an_hlbox',
    whiteout: 'pdf.ed.an_whiteout', image: 'pdf.ed.an_image', redact: 'pdf.ed.an_redact' };

  /** The selected annotation the bar acts on: selected, shown, unlocked and not being typed in; else null. */
  N.target = function () {
    var a = Ed.getSelected ? Ed.getSelected() : null;
    if (!a || a.hidden || a.type === 'note' || (SP.layers && SP.layers.isLocked(a)) || (S.editing && S.editing.id === a.id)) return null;
    return a;
  };
  N.name = function (a) { return U.t(a.sig ? 'pdf.ed.an_signature' : a.stamp ? 'pdf.ed.an_stamp' : NAMES[a.type] || 'pdf.ed.an_annotation'); };
  N.canEdit = function (a) { return !!a && EDITABLE[a.type] === 1; };
  N.colourKey = function (a) { return a ? COLOUR[a.type] || null : null; };
  N.colour = function (a) { var k = N.colourKey(a); return k && a[k] && a[k] !== 'none' ? a[k] : '#ffe14d'; };
  N.canOpacity = function (a) { return !!a && a.type !== 'whiteout' && a.type !== 'redact'; };
  N.opacity = function (a) { return a.opacity == null ? 1 : a.opacity; };

  N.edit = function () { return Ed.editSelectedText(); };
  N.setColour = function (col) { var a = N.target(), k = N.colourKey(a); if (k) Ed.setProp(k, col); };
  N.setOpacity = function (v) { if (N.canOpacity(N.target())) Ed.setProp('opacity', v); };
  N.duplicate = function () { if (N.target()) Ed.duplicateSelected(); };
  N.remove = function () { if (N.target()) Ed.deleteSelected(); };
  /** A comment beside the annotation: the comment composer at its top-right corner. */
  N.comment = function () {
    var a = N.target(), p = Ed.page();
    if (!a || !p) return;
    var c = S.ctx(), r = E.annotViewRect(a, c.R, c.W, c.H), pt = E.toPage(c.R, c.W, c.H, r.x + r.w, r.y);
    Ed.select(null);
    Ed.setTool('note');
    Ed.noteUI.compose(p, pt);
  };
  /** The annotation's box on screen (client px), from its selection box on the overlay. */
  N.box = function () {
    var el = S.overlay && S.overlay.querySelector('.sel-box');
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
})();
