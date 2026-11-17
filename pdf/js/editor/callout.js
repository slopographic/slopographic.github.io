/* Slop PDF — callouts: a text box with a leader line. Drag to place the box; the next click sets where the line ends
   (the tip). The line starts on the box's edge, towards the tip, so it always leaves the box. Downloads draw the box and
   the line into the page content (io/export-callout.js), so every viewer shows them. Text, font, size, colour and
   border are set in the Edit page panel. Placement is one undo step (E.commit through Ed.addAnnot). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, V = SP.view;
  function fmt(v) { return String(U.round(v, 3)); }
  /** The leader line in page space: from the box edge towards the tip, to the tip. Null until the tip is set or when it is inside the box. */
  E.calloutLine = function (a) {
    if (!a.tip) return null;
    var dx = a.tip[0] - a.cx, dy = a.tip[1] - a.cy, hw = a.w / 2, hh = a.h / 2;
    if (Math.abs(dx) <= hw && Math.abs(dy) <= hh) return null;
    var t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { from: [a.cx + dx * t, a.cy + dy * t], to: [a.tip[0], a.tip[1]] };
  };
  /** The box is drawn: the next click on the same page sets the tip. Escape (Ed.setTool) cancels it. */
  S.calloutPlaced = function (a) {
    S.callDraft = a; S.callPid = Ed.pid; S.draft = a;
    Ed.paint();
    SlopUI.toast(U.t('pdf.ed.callout_tip'), 4200);
  };
  S.calloutClick = function (e) {
    var a = S.callDraft;
    S.callDraft = null; S.draft = null;
    if (Ed.pid !== S.callPid || !Ed.page()) { Ed.paint(); return; }
    a.tip = [U.round(S.pagePt(e)[0], 2), U.round(S.pagePt(e)[1], 2)];
    a.id = U.uid('a');
    Ed.addAnnot(a, U.t('pdf.ed.undo_add_callout'));
    Ed.tool = 'select'; S.pageEl.dataset.tool = 'select';
    if (SP.app) SP.app.toolChanged();
  };
  S.callCancel = function () { if (S.callDraft) { S.callDraft = null; S.draft = null; Ed.paint(); } };

  /** SVG for a callout: the leader line (page space, under the box), then the box with its border and text. */
  V.calloutNode = function (a) {
    var g = U.s('g', { 'data-aid': a.id, class: 'an an-callout' }), bw = a.borderW == null ? 1.2 : a.borderW, bc = a.borderC && a.borderC !== 'none' ? a.borderC : '#e0245e';
    var ln = E.calloutLine(a);
    if (ln) {
      var x1 = fmt(ln.from[0]), y1 = fmt(ln.from[1]), x2 = fmt(ln.to[0]), y2 = fmt(ln.to[1]);
      g.appendChild(U.s('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: 'transparent', 'stroke-width': Math.max(10, bw + 8), class: 'an-hit', 'stroke-linecap': 'round' }));
      g.appendChild(U.s('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: bc, 'stroke-width': bw, 'stroke-linecap': 'round' }));
    }
    var box = U.s('g', { transform: V.boxTransform(a) });
    box.appendChild(U.s('rect', { x: 0, y: 0, width: fmt(a.w), height: fmt(a.h), fill: 'transparent', class: 'an-hit' }));
    if (bw > 0) box.appendChild(U.s('rect', { x: fmt(bw / 2), y: fmt(bw / 2), width: fmt(Math.max(0.1, a.w - bw)), height: fmt(Math.max(0.1, a.h - bw)), fill: 'none', stroke: bc, 'stroke-width': bw }));
    var t = E.textLayout(a), txt = U.s('text', { 'font-family': E.cssFont(a), 'font-size': fmt(t.size), fill: a.color || '#000', 'font-weight': E.cssWeight(a), 'font-style': a.italic ? 'italic' : 'normal', 'xml:space': 'preserve', style: 'white-space:pre' });
    t.lines.forEach(function (line, i) { txt.appendChild(U.s('tspan', { x: fmt(t.pad), y: fmt(t.base(i)) }, line || ' ')); });
    box.appendChild(txt);
    g.appendChild(box);
    return g;
  };
})();
