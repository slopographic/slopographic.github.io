/* Slop PDF — export of step markers: the filled circle, its number and the comment (if any) are drawn into the page
   content, so they print and show in every viewer. The same geometry as the on-screen marker (editor/step.js). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;
  function rgb(hex) { var c = U.hexToRgb(hex); return PDFLib.rgb(c.r, c.g, c.b); }
  E.drawStep = async function (out, page, a, g, ctx) {
    var op = 'opacity' in a ? a.opacity : 1, r = a.w / 2, size = r * 0.9;
    var x = g.x0 + a.cx, y = g.y0 + g.H - a.cy;
    var font = await E.embedTextFont(out, 'Helvetica', ctx.fonts), label = String(a.n); // i18n-ignore: PDF names / font names / producer, not UI
    page.drawCircle({ x: x, y: y, size: r, color: rgb(a.fill || '#e0245e'), opacity: op });
    page.drawText(label, { x: x - font.widthOfTextAtSize(label, size) / 2, y: y - size * 0.35, size: size, font: font, color: rgb('#ffffff'), opacity: op });
    if (a.text) page.drawText(a.text, { x: x + r + 6, y: y - 4, size: 12, font: font, color: rgb(a.color || '#111111'), opacity: op });
  };
})();
