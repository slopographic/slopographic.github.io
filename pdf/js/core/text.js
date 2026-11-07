/* Slop PDF — standard-14 fonts, text sanitising/measuring, the shared text layout, page-number stamps (watermark layers: core/watermark*.js). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;

  /* ------------------------------------------------------------- fonts */
  var FONTMAP = {
    Helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'], // i18n-ignore: PDF names / font names / producer, not UI
    Times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'], // i18n-ignore: PDF names / font names / producer, not UI
    Courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'] // i18n-ignore: PDF names / font names / producer, not UI
  };
  E.CSSFONT = {
    Helvetica: 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif', // i18n-ignore: PDF names / font names / producer, not UI
    Times: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif',
    Courier: '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", monospace'
  };
  E.stdFontName = function (a) { var fam = FONTMAP[a.font] ? a.font : 'Helvetica'; return FONTMAP[fam][(a.bold ? 1 : 0) + (a.italic ? 2 : 0)]; }; // i18n-ignore: PDF names / font names / producer, not UI
  var mdoc = null, mfonts = {}, charsets = {};
  E.initFonts = async function () {
    if (mdoc) return;
    var L = await E.pdflib(); // core/pdfjs.js: loaded on first use
    if (mdoc) return;
    mdoc = await L.PDFDocument.create();
    Object.keys(FONTMAP).forEach(function (fam) {
      FONTMAP[fam].forEach(function (nm) { mfonts[nm] = mdoc.embedStandardFont(nm); charsets[nm] = new Set(mfonts[nm].getCharacterSet()); });
    });
  };
  /** The code points a font key can set: a prepared face's, else a standard font's. */
  E.charsetOf = function (key) { var face = E.face(key); return face ? face.cs : (charsets[key] || charsets.Helvetica || new Set()); };
  /** The text a font key can set: a character beyond it stays when a language font for its script is ready
   *  (text-intl.js), else it becomes "?" (a non-breaking hyphen becomes "-"). */
  E.sanitize = function (text, fontName) {
    var cs = E.charsetOf(fontName), out = '';
    text = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    for (var ch of text) {
      var cp = ch.codePointAt(0);
      out += (ch === '\n' || !cs || cs.has(cp) || (E.langFaceFor && E.langFaceFor(cp, false, text))) ? ch : (cp === 0x2011 ? '-' : '?');
    }
    return out;
  };
  /** The width of one run in one font (no language fallback): a prepared face's shaped advance, or a standard font's. */
  E.measureRun = function (text, fontName, size) {
    var face = E.face(fontName);
    if (face) return E.faceWidth(face, text, size);
    var f = mfonts[fontName] || mfonts.Helvetica;
    try { return f.widthOfTextAtSize(text, size); } catch (e) { return text.length * size * 0.55; }
  };
  /** The width of a line as drawn: its runs (one font each, text-intl.js) added up. */
  E.measure = function (text, fontName, size) {
    var clean = E.sanitize(text, fontName);
    if (!E.runsOf) return E.measureRun(clean, fontName, size);
    return E.runsOf(clean, fontName).reduce(function (w, r) { return w + E.measureRun(r.text, r.font, size); }, 0);
  };
  /** Text layout shared by the on-screen SVG and the pdf-lib export. Its font is E.fontKey(a) (fonts-custom.js). */
  E.textLayout = function (a) {
    var fn = E.fontKey(a), s = a.size || 14, lines = E.sanitize(a.text || '', fn).split('\n');
    var pad = s * 0.2, lh = s * 1.2, maxW = 0;
    lines.forEach(function (l) { maxW = Math.max(maxW, E.measure(l, fn, s)); });
    return { lines: lines, font: fn, size: s, pad: pad, lh: lh, w: Math.max(maxW, s * 0.5) + pad * 2, h: lines.length * lh + pad * 2, base: function (i) { return pad + i * lh + s * 0.9; } };
  };

  /* ------------------------------------------------------------- stamps */
  E.pageNumberText = function (pn, n, total) {
    switch (pn.format) {
      case 'page': return 'Page ' + n; // i18n-ignore: stamped into the document
      case 'n-of': return n + ' / ' + total;
      case 'page-of': return 'Page ' + n + ' of ' + total; // i18n-ignore: stamped into the document
      case 'dash': return '– ' + n + ' –';
      default: return String(n);
    }
  };
  /** Synthetic annotations for page numbers and watermark (same renderer + exporter as user annotations). */
  E.stampAnnots = function (p, index, total, stamps) {
    stamps = stamps || E.state.stamps;
    var out = [], g = E.geom(p), R = E.rotation(p), vs = E.viewSize(p);
    var pn = stamps && stamps.pageNumbers;
    if (pn && !(pn.skipFirst && index === 0)) {
      var n = (pn.start || 1) + index - (pn.skipFirst ? 1 : 0);
      var last = (pn.start || 1) + total - 1 - (pn.skipFirst ? 1 : 0);
      var a = { id: 'pn', type: 'text', text: E.pageNumberText(pn, n, last), font: pn.font || 'Helvetica', bold: !!pn.bold, size: pn.size || 11, color: pn.color || '#000000', opacity: 1, rot: R }; // i18n-ignore: PDF names / font names / producer, not UI
      var t = E.textLayout(a), m = pn.margin == null ? 28 : pn.margin;
      var pos = pn.position || 'bottom-center', vx, vy;
      vx = /left/.test(pos) ? m + t.w / 2 - t.pad : /right/.test(pos) ? vs.w - m - t.w / 2 + t.pad : vs.w / 2;
      vy = /top/.test(pos) ? m + t.h / 2 - t.pad : vs.h - m - t.h / 2 + t.pad;
      var c = E.toPage(R, g.W, g.H, vx, vy);
      a.cx = c[0]; a.cy = c[1]; a.w = t.w; a.h = t.h;
      out.push(a);
    }
    return out.concat(E.watermarkAnnots(p, index, total, stamps));
  };
})();
