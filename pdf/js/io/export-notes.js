/* Slop PDF — export of comments as PDF text annotations (/Subtype /Text): the text (/Contents), the author (/T), the
   time (/M), the icon's rectangle, and the review state of a resolved comment (/State Completed, /StateModel Review).
   Each reply is a text annotation of its own, pointing at its comment with /IRT and /RT /R, which is how PDF viewers
   show a thread. The annotations stay editable in other viewers (they are not flattened into the page). */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine;
  function N(k) { return PDFLib.PDFName.of(k); }
  function pad(n) { return ('0' + n).slice(-2); }
  /** PDF date (D:YYYYMMDDHHmmSSZ, UTC) for an ISO time. */
  function pdfDate(iso) {
    var d = new Date(iso || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    return 'D:' + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }
  /** One text annotation dictionary, registered in the output. irt: the comment it answers (a reply) or null. */
  function annotRef(out, data, rect, irt) {
    var L = PDFLib, d = L.PDFDict.withContext(out.context);
    d.set(N('Type'), N('Annot')); // i18n-ignore: PDF names / font names / producer, not UI
    d.set(N('Subtype'), N('Text')); // i18n-ignore: PDF names / font names / producer, not UI
    d.set(N('Rect'), rect); // i18n-ignore: PDF names / font names / producer, not UI
    d.set(N('Contents'), L.PDFHexString.fromText(String(data.text || ''))); // i18n-ignore: PDF names / font names / producer, not UI
    d.set(N('T'), L.PDFHexString.fromText(String(data.author || '')));
    d.set(N('M'), L.PDFString.of(pdfDate(data.date)));
    d.set(N('Name'), N('Comment')); // i18n-ignore: PDF names / font names / producer, not UI
    d.set(N('C'), out.context.obj([1, 0.82, 0.25]));
    d.set(N('F'), L.PDFNumber.of(4)); // print
    d.set(N('Open'), L.PDFBool.False); // i18n-ignore: PDF names / font names / producer, not UI
    if (irt) { d.set(N('IRT'), irt); d.set(N('RT'), N('R')); }
    else if (data.resolved) { d.set(N('State'), L.PDFString.of('Completed')); d.set(N('StateModel'), L.PDFString.of('Review')); } // i18n-ignore: PDF names / font names / producer, not UI
    return out.context.register(d);
  }
  /** Writes a comment and its replies onto the page's annotations. g: the page geometry (E.geom). */
  E.noteAnnot = function (out, page, a, g) {
    var xc = g.x0 + a.cx, yc = g.y0 + g.H - a.cy, w = a.w, h = a.h;
    var rect = out.context.obj([xc - w / 2, yc - h / 2, xc + w / 2, yc + h / 2]);
    var parent = annotRef(out, a, rect, null);
    page.node.addAnnot(parent);
    (a.replies || []).forEach(function (r) { page.node.addAnnot(annotRef(out, r, rect, parent)); });
  };
})();
