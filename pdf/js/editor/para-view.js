/* Slop PDF — a paragraph frame on screen (Edit text ▸ Paragraphs, para-fonts.js): each laid-out piece of a line is an SVG
   <text> at its own x, stretched to its saved width (textLength), so the screen shows the lines exactly as the saved file
   draws them. A piece in the document's own font shows in the face pdf.js loaded for it; the rest in the substitute font.
   With the select tool a frame has a left and a right handle: dragging one changes the frame's width and the text reflows
   (S.paraReflow, called from pointer.js). Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, V = SP.view, S = SP.editor._, P = S.para = S.para || {};
  function fmt(v) { return String(U.round(v, 3)); }

  /** The CSS font of a style: the document's face first (when pdf.js has it), then the substitute font. */
  P.cssOf = function (st, fb) {
    var face = !fb && st.ps ? P.faces.get(st.ps) : null;
    return (face ? '"' + face + '", ' : '') + E.cssFont(st.sub || {});
  };
  V.paraNode = function (a) {
    var op = 'opacity' in a ? a.opacity : 1;
    var g = U.s('g', { 'data-aid': a.id, class: 'an an-para', transform: 'translate(' + fmt(a.cx) + ' ' + fmt(a.cy) + ') rotate(' + fmt(-(a.rot || 0)) + ') translate(' + fmt(-a.w / 2) + ' ' + fmt(-a.h / 2) + ')' });
    g.appendChild(U.s('rect', { x: 0, y: 0, width: fmt(a.w), height: fmt(a.h), fill: 'transparent', class: 'an-hit' }));
    (a.lines || []).forEach(function (line) {
      line.segs.forEach(function (sg) {
        var st = a.styles[sg.s] || a.styles[0] || {}, sub = st.sub || {};
        var at = { x: fmt(sg.x), y: fmt(line.b), 'font-family': P.cssOf(st, sg.fb), 'font-size': fmt(a.fs), fill: a.color || '#000', 'fill-opacity': op,
          'font-weight': E.cssWeight(sub), 'font-style': sub.italic ? 'italic' : 'normal', 'xml:space': 'preserve', style: 'white-space:pre' };
        if (Array.from(sg.t).length > 1 && sg.w > 0) { at.textLength = fmt(sg.w); at.lengthAdjust = 'spacingAndGlyphs'; }
        g.appendChild(U.s('text', at, sg.t));
      });
    });
    return g;
  };

  /** A resize of a frame with the select tool (an unrotated page: view and page space are the same): its width follows the
   * handle and its text reflows, the top edge stays. n is the dragged rectangle; returns the rectangle the frame takes. */
  S.paraReflow = function (x, n, r, hh) {
    var w = Math.max(x.fs * 2, n.w), left = /w/.test(hh) ? r.x + r.w - w : r.x;
    x.w = w; P.relayout(x); x.cx = left + w / 2;
    return { x: left, y: r.y, w: w, h: x.h };
  };
})();
