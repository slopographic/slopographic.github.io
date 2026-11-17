/* Slop PDF macros — text positions from pdf.js, and the match locator used by Replace text.
   A match is "located" only when its position is known exactly: a whole text item, or part of one whose width
   agrees with the standard font metrics. Anything else is reported, not guessed. Classic script. */
(function () {
  'use strict';
  var M = window.SlopPdfMacro = window.SlopPdfMacro || {};
  var T = M.text = {};
  var SCRIPT_SRC = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  var override = null, libP = null, base = null;

  /** Use a pdf.js build that is already loaded (tests, or a page that set window.pdfjsLib). */
  T.setLib = function (lib, vendorBase) { override = lib; base = vendorBase || null; };
  /** The pdf.js module: the injected one, window.pdfjsLib, or vendor/pdfjs loaded once from this script's folder. */
  T.lib = function () {
    if (override) return Promise.resolve(override);
    if (typeof window !== 'undefined' && window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!libP) {
      var b = base || new URL(SCRIPT_SRC ? '../../../vendor/pdfjs/' : '../vendor/pdfjs/', SCRIPT_SRC || document.baseURI).href;
      libP = import(new URL('../../shared/compat/pdfjs.js', b).href).then(function (m) { return m.loadPdfjs(b); }).then(function (lib) {
        window.pdfjsLib = lib;
        return lib;
      });
      libP.catch(function () { libP = null; });
    }
    return libP;
  };
  /** Opens bytes with pdf.js (a copy, so the caller's bytes stay usable). Caller destroys the document. */
  T.open = async function (bytes) {
    var lib = await T.lib(), params = { data: bytes.slice(), isEvalSupported: false, verbosity: 0 };
    var b = base || (SCRIPT_SRC ? new URL('../../../vendor/pdfjs/', SCRIPT_SRC).href : null);
    if (b && !override) { params.cMapUrl = b + 'cmaps/'; params.cMapPacked = true; params.standardFontDataUrl = b + 'standard_fonts/'; }
    return lib.getDocument(params).promise;
  };

  /** Standard family from the font description pdf.js gives, or null when the font is not a standard one. */
  T.family = function (style) {
    var f = String((style && style.fontFamily) || '').toLowerCase();
    if (!f) return null;
    if (/mono|courier/.test(f)) return 'Courier'; // i18n-ignore: PDF names / font names / producer, not UI
    if (/sans|helvet|arial/.test(f)) return 'Helvetica'; // i18n-ignore: PDF names / font names / producer, not UI
    if (/times|serif/.test(f)) return 'Times'; // i18n-ignore: PDF names / font names / producer, not UI
    return null;
  };
  function fontSize(it) { var t = it.transform; return Math.abs(t[3]) || Math.hypot(t[2], t[3]) || 0; }
  /** Whether a gap or a new line separates two items (so a space goes between them in the search text). */
  function separated(prev, it) {
    var fs = fontSize(prev) || 1, a = prev.transform, b = it.transform;
    if (Math.abs(b[5] - a[5]) > fs * 0.5) return true;
    return b[4] - (a[4] + prev.width) > fs * 0.2;
  }
  /** Search text for one page: items joined, with a space where the text breaks. owner/off map each character
   *  back to its item and offset (-1 for a space that is not in any item). */
  T.index = function (tc) {
    var items = (tc && tc.items) || [], text = '', owner = [], off = [], prev = null;
    function space() { if (text && text[text.length - 1] !== ' ') { text += ' '; owner.push(-1); off.push(-1); } }
    items.forEach(function (it, idx) {
      var str = it.str || '';
      if (!str) { if (it.hasEOL) space(); return; }
      if (prev && separated(prev, it)) space();
      for (var k = 0; k < str.length; k++) { text += str[k]; owner.push(idx); off.push(k); }
      prev = it;
    });
    return { text: text, owner: owner, off: off, items: items, styles: (tc && tc.styles) || {} };
  };

  /** Regular expression for a find string. Literal text is escaped. wholeWord (literal text only) needs a letter,
   *  digit or underscore on neither side of the match, in any script. */
  T.regex = function (find, opts, global) {
    opts = opts || {};
    var src = opts.regex ? String(find) : String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var flags = (global ? 'g' : '') + (opts.caseSensitive ? '' : 'i');
    if (opts.wholeWord && !opts.regex) { src = '(?<![\\p{L}\\p{N}_])' + src + '(?![\\p{L}\\p{N}_])'; flags += 'u'; }
    return new RegExp(src, flags);
  };

  /** Where one piece of an item sits. Returns { x0, x1, y, fs, located }. measure(family, str, size) gives widths. */
  function segment(ix, o, a, b, measure) {
    var it = ix.items[o], str = it.str, fs = fontSize(it), x0 = it.transform[4], y = it.transform[5];
    var w = it.width || 0;
    if (a === 0 && b === str.length) return { x0: x0, x1: x0 + w, y: y, fs: fs, located: true };
    var fam = T.family(ix.styles[it.fontName]), ok = false, pa = 0, pb = 0;
    if (fam && fs > 0 && measure) {
      var tot = measure(fam, str, fs);
      if (isFinite(tot) && Math.abs(tot - w) <= Math.max(0.5, w * 0.01)) {
        pa = measure(fam, str.slice(0, a), fs); pb = measure(fam, str.slice(0, b), fs);
        ok = isFinite(pa) && isFinite(pb);
      }
    }
    if (!ok) return { x0: x0, x1: x0, y: y, fs: fs, located: false };
    return { x0: x0 + pa, x1: x0 + pb, y: y, fs: fs, located: true };
  }
  function segmentsFor(ix, from, to, measure) {
    var groups = [], cur = null;
    for (var i = from; i < to; i++) {
      var o = ix.owner[i];
      if (o < 0) continue;
      if (!cur || cur.o !== o) { cur = { o: o, a: ix.off[i], b: ix.off[i] + 1 }; groups.push(cur); }
      else cur.b = ix.off[i] + 1;
    }
    return groups.map(function (g) { return segment(ix, g.o, g.a, g.b, measure); });
  }
  /** All matches of find in the index. Each: { text, index, segs, precise }. precise is true only when every
   *  piece of the match is located. */
  T.find = function (ix, find, opts, measure) {
    var re = T.regex(find, opts, true), out = [], m;
    if (!find) return out;
    while ((m = re.exec(ix.text))) {
      if (!m[0]) { re.lastIndex++; continue; }
      var segs = segmentsFor(ix, m.index, m.index + m[0].length, measure);
      out.push({ text: m[0], index: m.index, segs: segs, precise: segs.length > 0 && segs.every(function (s) { return s.located; }) });
    }
    return out;
  };
})();
