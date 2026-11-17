/* Slop PDF — export of callouts: the text box (its border and text) and the leader line are drawn into the page
   content, so they print and show in every viewer. The same geometry as editor/callout.js (E.calloutLine). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;
  function rgb(hex) { var c = U.hexToRgb(hex); return PDFLib.rgb(c.r, c.g, c.b); }
  E.drawCallout = async function (out, page, a, g, ctx) {
    var L = PDFLib, op = 'opacity' in a ? a.opacity : 1, bw = a.borderW == null ? 1.2 : a.borderW;
    var bc = a.borderC && a.borderC !== 'none' ? a.borderC : '#e0245e', w = a.w, h = a.h;
    var phi = -(a.rot || 0) * Math.PI / 180, cs = Math.cos(phi), sn = Math.sin(phi);
    if (Math.abs(cs) < 1e-9) cs = 0; if (Math.abs(sn) < 1e-9) sn = 0;
    var e = g.x0 + a.cx - (w / 2) * cs - (h / 2) * sn, f = g.y0 + g.H - a.cy + (w / 2) * sn - (h / 2) * cs;
    page.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(cs, -sn, sn, cs, e, f));
    if (bw > 0) page.drawRectangle({ x: bw / 2, y: bw / 2, width: Math.max(0.1, w - bw), height: Math.max(0.1, h - bw), borderColor: rgb(bc), borderWidth: bw, borderOpacity: op });
    var t = E.textLayout(a), font = await E.embedTextFont(out, t.font, ctx.fonts);
    t.lines.forEach(function (line, i) {
      if (!line) return;
      page.drawText(line, { x: t.pad, y: h - t.base(i), size: t.size, font: font, color: rgb(a.color || '#000'), opacity: op });
    });
    page.pushOperators(L.popGraphicsState());
    var ln = E.calloutLine(a);
    if (ln) page.drawLine({
      start: { x: g.x0 + ln.from[0], y: g.y0 + g.H - ln.from[1] }, end: { x: g.x0 + ln.to[0], y: g.y0 + g.H - ln.to[1] },
      thickness: bw, color: rgb(bc), opacity: op
    });
  };
})();
