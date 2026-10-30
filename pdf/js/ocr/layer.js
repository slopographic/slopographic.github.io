/* Slop PDF — the OCR text layer. The engine returns one box per text line (canvas pixels, top-left origin). Each line is
   split into words and every word is written as an invisible run (text render mode 3, Helvetica) at its place on the
   page, so pdf.js reads the words as text and the editor's text editing, find and copy work on them. Word positions are
   estimated from Helvetica's advance widths: the line is stretched (horizontal scale) to the width of its box.
   Pure geometry in placements(); writer in write(). The page's own content is left as it is. */
(function () {
  'use strict';
  var SP = window.SP;
  var OL = SP.ocrLayer = {};
  var CAP_CENTRE = 0.2555; // Helvetica: baseline to the middle of the ink (ascender 0.718, descender 0.207), in em
  var SX_MIN = 0.25, SX_MAX = 4;

  /** Text that Helvetica (WinAnsi) can draw. Other characters are left out of the layer, not guessed. */
  function drawable(font, text) {
    return Array.from(text).filter(function (ch) {
      try { font.encodeText(ch); return true; } catch (e) { return false; }
    }).join('');
  }

  /**
   * Words of OCR lines with their page-space boxes (points, PDF user space, unrotated).
   * lines: engine lines ({ text, box: { x, y, w, h } } in canvas pixels); g: E.geom(page) (view box in points);
   * px: { w, h } canvas size; font: a pdf-lib font. Returns [{ str, x, y, size, sx }]: x, y is the word's baseline start,
   * size its font size and sx the horizontal scale that makes the line as wide as its box.
   */
  OL.placements = function (lines, g, px, font) {
    var kx = px.w / g.W, ky = px.h / g.H, out = [];
    lines.forEach(function (l) {
      var text = drawable(font, String(l.text || '')).replace(/\s+/g, ' ').trim();
      if (!text) return;
      var b = l.box, hPt = b.h / ky, size = Math.max(4, hPt * 0.75);
      var natural = font.widthOfTextAtSize(text, size);
      if (!(natural > 0)) return;
      var sx = Math.min(SX_MAX, Math.max(SX_MIN, (b.w / kx) / natural));
      var left = g.x0 + b.x / kx;
      var baselineFromTop = b.y / ky + hPt / 2 + CAP_CENTRE * size;
      var y = g.y0 + g.H - baselineFromTop;
      var re = /\S+/g, m;
      while ((m = re.exec(text))) {
        out.push({
          str: m[0],
          x: left + font.widthOfTextAtSize(text.slice(0, m.index), size) * sx,
          y: y, size: size, sx: sx
        });
      }
    });
    return out;
  };

  /**
   * Writes the text layer into a copy of a PDF. bytes: the source file; pages: [{ index, lines, g, px }] (index is the
   * page in this file; lines, g and px as for placements()). Every other page and all document data are kept.
   * Resolves to the new bytes.
   */
  OL.write = async function (bytes, pages) {
    var L = window.PDFLib;
    var doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    var font = await doc.embedFont(L.StandardFonts.Helvetica);
    pages.forEach(function (pp) {
      var page = doc.getPage(pp.index);
      var name = page.node.newFontDictionary('SlopOCR', font.ref); // i18n-ignore: PDF names / font names / producer, not UI
      var ops = [L.pushGraphicsState(), L.beginText(), L.setTextRenderingMode(3)];
      OL.placements(pp.lines, pp.g, pp.px, font).forEach(function (w) {
        ops.push(L.setFontAndSize(name, w.size), L.setTextMatrix(w.sx, 0, 0, 1, w.x, w.y), L.showText(font.encodeText(w.str)));
      });
      ops.push(L.endText(), L.popGraphicsState());
      page.pushOperators.apply(page, ops);
    });
    return doc.save({ useObjectStreams: true });
  };
  /* Reading and replacing the layer's words. The writer above draws each word as `/SlopOCR<suffix> size Tf`, then the text
     matrix `sx 0 0 1 x y Tm`, then `<hex> Tj`, so the words are found in the page's decoded content by that pattern. */
  var WORD = /\/SlopOCR[-\w]*\s+[-+.\w]+\s+Tf\s+((?:[-+.\w]+\s+){5}[-+.\w]+)\s+Tm\s+<([0-9A-Fa-f]*)>\s*Tj/g;

  /** A number as content-stream text (fixed point, so no exponent form). */
  function num(v) { return (+v).toFixed(3); }
  function latin1(b) {
    var s = '';
    for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return s;
  }
  function bytesOf(s) {
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
    return u;
  }
  /** The content streams of a page (refs) and their decoded text, streams joined by a newline. */
  function contentOf(doc, page) {
    var L = window.PDFLib, c = page.node.Contents(), refs = !c ? [] : c instanceof L.PDFArray ? c.asArray() : [c];
    var text = refs.map(function (r) {
      var s = doc.context.lookup(r);
      return latin1(s instanceof L.PDFRawStream ? L.decodePDFRawStream(s).decode() : s.getUnencodedContents());
    }).join('\n');
    return { refs: refs, text: text };
  }
  /** The layer's words in a decoded content: [{ str, x, y, start, end }], start and end bounding the hex string. */
  function wordsIn(content) {
    var out = [], re = new RegExp(WORD.source, 'g'), m;
    while ((m = re.exec(content))) {
      var t = m[1].trim().split(/\s+/), hexAt = m.index + m[0].indexOf('<', m[0].indexOf('Tm')) + 1, str = ''; // i18n-ignore: PDF names / font names / producer, not UI
      for (var i = 0; i + 1 < m[2].length; i += 2) str += String.fromCharCode(parseInt(m[2].substr(i, 2), 16));
      out.push({ str: str, x: parseFloat(t[4]), y: parseFloat(t[5]), start: hexAt, end: hexAt + m[2].length });
    }
    return out;
  }
  function load(bytes) {
    return window.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  }

  /** The layer's words of every page of a file's bytes: an array per page index, of { str, x0, y } (the editor's run
   * fields: text, origin x and baseline y in points). */
  OL.wordsAll = async function (bytes) {
    var doc = await load(bytes), out = [];
    for (var i = 0; i < doc.getPageCount(); i++) {
      out.push(wordsIn(contentOf(doc, doc.getPage(i)).text).map(function (w) { return { str: w.str, x0: w.x, y: w.y }; }));
    }
    return out;
  };

  /**
   * Replaces the text of an invisible OCR run in a copy of the file. index: the page (0-based); at: the run as the editor
   * lists it ({ str, x0, y, width, fs }); bg: [r, g, b] in 0..1, the paper colour round the word (the editor samples it).
   * pdf.js can join several layer words into one run (a line, or a few words on it): the run's old words are emptied in
   * place, so the old characters leave the file. The picture under the run is painted over with the paper colour, and
   * the new text is drawn in Helvetica at the run's baseline, size and left edge, as visible text (the new words stay
   * recognised: they are found by wordsAll, so a later edit replaces them too). Both are appended to the page's content.
   * Resolves to the new bytes, or null when the run's words are not found as listed.
   */
  OL.replaceWord = async function (bytes, index, at, text, bg) {
    var L = window.PDFLib, doc = await load(bytes), page = doc.getPage(index), c = contentOf(doc, page);
    var words = wordsIn(c.text).filter(function (w) {
      return w.str !== '' && Math.abs(w.y - at.y) < 0.05 && w.x > at.x0 - 0.05 && w.x < at.x0 + at.width + 0.05;
    });
    if (!words.length || Math.abs(words[0].x - at.x0) > 0.05 || words.map(function (w) { return w.str; }).join(' ') !== at.str) return null;
    var font = await doc.embedFont(L.StandardFonts.Helvetica), name = page.node.newFontDictionary('SlopOCR', font.ref).toString(); // i18n-ignore: PDF names / font names / producer, not UI
    var hex = font.encodeText(drawable(font, text)).toString().slice(1, -1), out = c.text, fs = at.fs, col = bg || [1, 1, 1];
    for (var i = words.length - 1; i >= 0; i--) out = out.slice(0, words[i].start) + out.slice(words[i].end);
    // the paint: from the descender to above the capitals (a little more than the glyphs, not reaching the next line)
    var box = [at.x0 - 0.5, at.y - 0.25 * fs, at.width + 1, 1.2 * fs].map(num);
    out += '\nq ' + col.map(num).join(' ') + ' rg ' + box.join(' ') + ' re f Q\n' +
      'q BT 0 Tr 0 g ' + name + ' ' + num(fs) + ' Tf 1 0 0 1 ' + num(at.x0) + ' ' + num(at.y) + ' Tm <' + hex + '> Tj ET Q\n'; // i18n-ignore: PDF names / font names / producer, not UI
    // one content stream replaces the old ones, which are deleted so the old characters are not left in the file
    var ref = doc.context.register(doc.context.flateStream(bytesOf(out)));
    c.refs.forEach(function (r) { doc.context.delete(r); });
    page.node.set(L.PDFName.of('Contents'), ref); // i18n-ignore: PDF names / font names / producer, not UI
    return doc.save({ useObjectStreams: true });
  };
})();
