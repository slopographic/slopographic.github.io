/* Slop PDF — fonts for new text beyond the standard 14. A text annotation whose font is a family from the font catalogue
   (shared/fonts/catalog.js) is set in that family's face. The face is read and parsed once with fontkit: its glyphs give the
   widths and the characters it can set, and the saved file embeds it as a new subset. The document's own subset fonts are
   never written into (they hold only the old text's glyphs). Classic script. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine;
  var faces = new Map(), kitted = new WeakSet();
  var GENERIC = { serif: 'serif', mono: 'monospace', sans: 'sans-serif' };

  /** Whether a family name is one of the standard 14 families (Helvetica, Times, Courier). */
  E.isStdFamily = function (f) { return Object.prototype.hasOwnProperty.call(E.CSSFONT, f); };
  /** The CSS weight of a text annotation: its weight, else 700 when bold and 400 otherwise. */
  E.fontWeight = function (a) { return Number(a.weight) || (a.bold ? 700 : 400); };
  /** The key of a text annotation's font: a standard font name (Helvetica-Bold ...) or "family|weight|n-or-i". */
  E.fontKey = function (a) {
    if (!a.font || E.isStdFamily(a.font)) return E.stdFontName(a);
    return a.font + '|' + E.fontWeight(a) + '|' + (a.italic ? 'i' : 'n');
  };
  /** The CSS font stack and weight an annotation is drawn with on screen. */
  E.cssFont = function (a) {
    // the language fonts downloaded for other scripts go before the generic family, so screen text matches the saved file
    var lang = (E.langFamilies ? E.langFamilies() : []).map(function (f) { return '"' + f + '", '; }).join('');
    if (!a.font || E.isStdFamily(a.font)) { var std = E.CSSFONT[a.font] || E.CSSFONT.Helvetica, i = std.lastIndexOf(','); return std.slice(0, i + 1) + ' ' + lang + std.slice(i + 1).trim(); }
    var C = window.SlopFontCatalog, g = (C && GENERIC[C.guessCategory(a.font)]) || 'sans-serif';
    return '"' + String(a.font).replace(/"/g, '') + '", ' + lang + g;
  };
  E.cssWeight = function (a) { return String(E.fontWeight(a)); };

  /** The prepared face of a key (parsed, with its glyph set), or null when it is not ready. */
  E.face = function (key) { return faces.get(key) || null; };
  /** Parses font bytes (TTF, OTF, WOFF or WOFF2) with fontkit and keeps the face under a key. Rejects when they are not a font. */
  E.prepareFace = async function (key, bytes) {
    if (faces.has(key)) return faces.get(key);
    var kit = await window.SlopFontCatalog.fontkit(), f = kit.create(bytes);
    if (f.fonts) f = f.fonts[0];
    var face = { key: key, kit: kit, font: f, cs: new Set(f.characterSet), upm: f.unitsPerEm || 1000, bytes: bytes };
    faces.set(key, face);
    return face;
  };
  /** Readies the installed face of a family for a weight and style (the nearest one the family has). Rejects when the family
   * is not installed. Resolves the face. */
  E.prepareFont = async function (family, weight, italic) {
    var key = E.fontKey({ font: family, weight: weight, italic: italic });
    if (faces.has(key)) return faces.get(key);
    var C = window.SlopFontCatalog, face = await C.pickFace(family, weight, italic);
    if (!face) throw new Error(SP.util.t('pdf.core.font_missing', { family: family }));
    return E.prepareFace(key, await C.bytesOf(face));
  };
  /** Readies every non-standard font the pages' text annotations use, so that measuring and saving them is exact. A font that
   * is not installed any more keeps the standard metrics and is saved in Helvetica. */
  E.prepareAnnotFonts = async function (pages, opts) {
    var want = new Map(), texts = [];
    pages.forEach(function (p) {
      (p.annots || []).forEach(function (a) {
        if (a.type === 'para' && E.paraFontNeeds) { E.paraFontNeeds(a).forEach(function (t) { texts.push(t); if (t.font && !E.isStdFamily(t.font) && !faces.has(E.fontKey(t))) want.set(E.fontKey(t), t); }); return; }
        if (a.text == null) return;
        texts.push(a);
        if (a.font && !E.isStdFamily(a.font) && !faces.has(E.fontKey(a))) want.set(E.fontKey(a), a);
      });
    });
    for (var a of want.values()) await E.prepareFont(a.font, E.fontWeight(a), a.italic).catch(function () { /* not installed */ });
    // other scripts: the language fonts (text-intl.js); opts.ask false uses only the ones already downloaded
    for (var t of texts) if (E.ensureScripts) await E.ensureScripts(t.text, E.fontKey(t), t.bold, opts).catch(function () { /* set as "?" */ });
  };
  /** Width of a text in a prepared face at a size (points), from the face's own advance widths. */
  E.faceWidth = function (face, text, size) {
    var w = 0;
    try { w = face.font.layout(String(text)).advanceWidth; } catch (e) {   // shaped (Arabic joining, ligatures), as pdf-lib draws it
      face.font.glyphsForString(String(text)).forEach(function (g) { w += g.advanceWidth; });
    }
    return w * size / face.upm;
  };
  /** The pdf-lib font for a text key, embedded once per output file: a standard font, or a prepared face as a subset. */
  E.embedTextFont = async function (out, key, cache) {
    if (cache[key]) return cache[key];
    var face = faces.get(key);
    if (!face) return (cache[key] = out.embedStandardFont(key.indexOf('|') < 0 ? key : 'Helvetica')); // i18n-ignore: PDF names / font names / producer, not UI
    if (!kitted.has(out)) { out.registerFontkit(face.kit); kitted.add(out); }
    // a subset through the shared run drawer: CFF fonts (Noto Sans CJK) get a header PDF readers accept (shared/fonts/pdf-runs.js)
    return (cache[key] = await window.SlopPdfRuns.embed(out, face.bytes));
  };
})();
