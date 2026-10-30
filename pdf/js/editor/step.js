/* Slop PDF — step markers: a numbered circle placed with one click (1, 2, 3…). Each click takes the next number for the
   whole document, so the steps read in order across pages. The tool stays on after a click, so a run of steps is quick to
   place. An optional comment is typed with Edit text (double-click, or the Edit panel) and is drawn beside the circle.
   Each placement is one undo step (Ed.addAnnot). Downloads draw the markers into the page (io/export-step.js). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, V = SP.view;
  var D = 28; // default circle diameter in page points (the tool settings can change it)
  function fmt(v) { return String(U.round(v, 3)); }

  /** One more than the highest step number in the document, so the numbers run on across pages. */
  E.nextStepNumber = function () {
    var n = 0;
    E.state.pages.forEach(function (p) { (p.annots || []).forEach(function (a) { if (a.type === 'step' && a.n > n) n = a.n; }); });
    return n + 1;
  };
  /** A step at page point pt (unrotated page space), its circle centred on the point. */
  E.newStep = function (pt) {
    var d = Ed.defaults.step || {}, size = d.size || D;
    return { id: U.uid('a'), type: 'step', n: E.nextStepNumber(), cx: U.round(pt[0], 2), cy: U.round(pt[1], 2), w: size, h: size, rot: 0,
      text: '', color: d.color || '#111111', fill: d.fill || '#e0245e', opacity: d.opacity == null ? 1 : d.opacity };
  };
  /** A click with the step tool: place the next step. The tool stays on for the next one. */
  S.stepDown = function (e, p, pt) {
    var a = E.newStep(pt);
    Ed.addAnnot(a, U.t('pdf.ed.undo_add_step', { n: String(a.n) }));
  };

  /** SVG for a step: the filled circle, its number, and the comment (if any) to the right. Page space, as the other annotations. */
  V.stepNode = function (a) {
    var g = U.s('g', { 'data-aid': a.id, class: 'an an-step' }), r = a.w / 2, op = 'opacity' in a ? a.opacity : 1;
    g.appendChild(U.s('circle', { cx: fmt(a.cx), cy: fmt(a.cy), r: fmt(r), fill: a.fill || '#e0245e', opacity: op, class: 'an-hit' }));
    g.appendChild(U.s('text', { x: fmt(a.cx), y: fmt(a.cy), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'Helvetica, Arial, sans-serif',
      'font-size': fmt(r * 0.9), 'font-weight': '700', fill: '#ffffff', 'pointer-events': 'none' }, String(a.n)));
    if (a.text) g.appendChild(U.s('text', { x: fmt(a.cx + r + 6), y: fmt(a.cy), 'dominant-baseline': 'central', 'font-family': 'Helvetica, Arial, sans-serif',
      'font-size': '12', fill: a.color || '#111111', opacity: op, 'pointer-events': 'none', 'xml:space': 'preserve' }, a.text));
    return g;
  };
})();
