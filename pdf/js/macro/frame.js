/* Slop PDF macros — shared pdf-lib helpers: loading and saving, standard-font metrics, colours, text the standard
   fonts can draw, and the page frame that maps the displayed (rotated) page to PDF user space. Uses window.PDFLib. */
(function () {
  'use strict';
  var M = window.SlopPdfMacro = window.SlopPdfMacro || {};
  var P = M.pdf = {};
  var FAMILY = { Helvetica: 'Helvetica', Times: 'TimesRoman', Courier: 'Courier' }; // i18n-ignore: PDF names / font names / producer, not UI
  var metrics = {}, charsets = {};

  P.lib = function () {
    var L = window.PDFLib;
    if (!L) throw new Error('The PDF library (pdf-lib) is not loaded.');
    return L;
  };
  /** Creates the standard-font metric fonts. Call once before measure(). */
  P.initMetrics = async function () {
    if (metrics.Helvetica) return;
    var L = P.lib(), doc = await L.PDFDocument.create();
    for (var fam in FAMILY) {
      metrics[fam] = await doc.embedFont(L.StandardFonts[FAMILY[fam]]);
      charsets[metrics[fam].name] = new Set(metrics[fam].getCharacterSet());
    }
  };
  /** Width of str at size fs in a standard family ('Helvetica', 'Times' or 'Courier'). NaN when unknown. */
  P.measure = function (fam, str, fs) {
    var f = metrics[fam];
    if (!f) return NaN;
    try { return f.widthOfTextAtSize(String(str), fs); } catch (e) { return NaN; }
  };
  /** Loads a PDF for editing. The input bytes are not changed. */
  P.load = function (bytes) {
    return P.lib().PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  };
  P.rgb = function (hex) {
    var h = /^#([0-9a-f]{6})$/i.exec(String(hex || '#000000'));
    var n = h ? parseInt(h[1], 16) : 0;
    return P.lib().rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  /** Text the font can draw: line breaks and tabs become spaces, other unsupported characters become '?'. */
  P.safeText = function (font, text) {
    var cs = charsets[font.name] || charsets.Helvetica || new Set(), out = '';
    text = String(text == null ? '' : text).replace(/[\r\n\t]+/g, ' ');
    for (var ch of text) out += cs.has(ch.codePointAt(0)) ? ch : '?';
    return out;
  };
  P.hasUnsupported = function (font, text) { return P.safeText(font, text) !== String(text == null ? '' : text).replace(/[\r\n\t]+/g, ' '); };
  P.font = function (doc, fam) {
    return doc.embedFont(P.lib().StandardFonts[FAMILY[fam || 'Helvetica']]); // i18n-ignore: PDF names / font names / producer, not UI
  };

  /** The displayed page: VW and VH are its visible size, rot is the display rotation (0, 90, 180 or 270), and
   *  pt(vx, vy) maps a point measured from the displayed top-left corner (y down) to PDF user space. */
  P.frame = function (page) {
    var mb = page.getMediaBox(), w = mb.width, h = mb.height, ox = mb.x, oy = mb.y;
    var rot = ((Math.round((page.getRotation().angle || 0) / 90) * 90) % 360 + 360) % 360;
    var sideways = rot === 90 || rot === 270;
    var fr = {
      rot: rot, VW: sideways ? h : w, VH: sideways ? w : h,
      pt: function (vx, vy) {
        switch (rot) {
          case 90: return [ox + vy, oy + vx];
          case 180: return [ox + w - vx, oy + h - vy];
          case 270: return [ox + w - vy, oy + h - vx];
          default: return [ox + vx, oy + h - vy];
        }
      }
    };
    return fr;
  };
})();
