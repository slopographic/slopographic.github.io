/* Slop Slides: text in the PDF. Each text node of the display list is drawn as real (selectable, vector) text in the
   same face file the canvas and the layout use (render/fonts.js), embedded as a subset by pdf-lib with fontkit.
   Characters that face cannot set (Arabic, Hebrew, Chinese, Devanagari, …) are set in the Noto language font for their
   script: SlopFontJIT (shared/fonts/jit.js) downloads it just in time, asking first unless the person chose automatic
   downloads. A line is cut into runs by SlopBidi (one font and one direction each, SS.pdfMath.runs), fontkit shapes each
   run (Arabic joining, Indic syllables, marks) and the glyphs are placed where fontkit put them (SS.pdfMath.glyphPlan).
   The slide faces are laid out without kerning and ligatures, as the canvas measures them, so lines keep their length.
   A CFF subset gets its header fixed (cffHeader) so browsers accept it.
   Exposes SS.pdfText: prepare(doc, scenes, opts) → Promise<fonts>, draw(env, node, alpha). */
(function () {
  'use strict';
  var SS = window.SS, F = SS.fonts, PM = SS.pdfMath;
  var T = SS.pdfText = {};
  var NO_KERN = { kern: false, liga: false, clig: false, calt: false };

  function scripts() { return window.SlopScripts; }
  function isCommon(cp) { var S = scripts(); return S ? S.scriptOf(cp) === 'common' : cp < 0x41; }
  /** Every text node of the scenes, with its face. */
  T.nodes = function (scenes) {
    var out = [];
    function walk(n) { if (n.k === 'group') n.children.forEach(walk); else if (n.k === 'text' && n.text) out.push(n); }
    scenes.forEach(function (s) { s.items.forEach(walk); });
    return out;
  };
  function faceHas(key, cp) { var f = F.parsed(key); return !!(f && f.cmap.get(cp)); }

  /** fontkit 1.1's CFF subset (OpenType fonts with PostScript outlines, such as Noto Sans SC) writes a header offSize that
   * is not 1 to 4, and browsers' font checkers refuse the font. The field is only a size hint: 4 is valid for any font. */
  function cffHeader(em) {
    if (!em || !em.serializeFont || !em.isCFF || !em.isCFF()) return;
    var orig = em.serializeFont.bind(em);
    em.serializeFont = function () {
      return orig().then(function (b) { if (b && b[0] === 1 && (b[3] < 1 || b[3] > 4)) { b = b.slice(); b[3] = 4; } return b; });
    };
  }
  /** The language font is now on this device: the editor's canvas uses it too for the characters its faces lack. */
  function screenFace(J, id) {
    if (J.face) J.face(id).then(function (ff) { if (ff && F.addFallback) F.addFallback(ff.family); }, function () { /* the screen keeps the system font */ });
  }
  /**
   * Embeds the faces the scenes use and the language fonts their text needs. Resolves with
   * { get(key), has(key, cp), packOf(cp, text), missing: [pack labels], bold(key) }. opts.ask: false never asks (tests).
   */
  T.prepare = async function (doc, scenes, opts) {
    opts = opts || {};
    var nodes = T.nodes(scenes), embedded = {}, kits = {}, missing = [];
    var J = window.SlopFontJIT, S = scripts();
    async function embed(key, bytes) {
      var font = await doc.embedFont(bytes, { subset: true });
      cffHeader(font.embedder);
      embedded[key] = font;
      kits[key] = font.embedder.font;
    }
    var faceKeys = {};
    nodes.forEach(function (n) { faceKeys[n.face.key] = true; });
    for (var k in faceKeys) { var b = F.bytes(k); if (b) await embed(k, b); }
    // the language fonts: one per pack (and weight) that some character beyond its face needs
    var need = {}, extra = '';
    nodes.forEach(function (n) {
      for (var ch of n.text) {
        var cp = ch.codePointAt(0);
        if (isCommon(cp) || faceHas(n.face.key, cp)) continue;
        var pack = J ? J.packFor(cp, n.text) : null;
        if (!pack) continue;
        need[pack + (n.face.synthBold || /Bold/.test(n.face.key) ? '|b' : '')] = pack;
        if (extra.indexOf(ch) < 0) extra += ch;
      }
    });
    var packs = Object.keys(need);
    if (packs.length && J) {
      var ok = false;
      try { ok = await J.ready(extra, null, { ask: opts.ask !== false }); } catch (e) { console.warn('Slop Slides: language fonts', e); }
      for (var i = 0; i < packs.length; i++) {
        var id = need[packs[i]], bold = /\|b$/.test(packs[i]), bytes = ok ? await J.bytes(id, { bold: bold }) : null;
        var label = S && S.PACKS[id] ? S.PACKS[id].label : id;
        if (bytes) { await embed(packs[i], new Uint8Array(bytes)); if (!bold) screenFace(J, id); }
        else if (missing.indexOf(label) < 0) missing.push(label);
      }
    }
    return {
      get: function (key) { return embedded[key] || null; },
      kit: function (key) { return kits[key] || null; },
      has: function (key, cp) { var f = kits[key]; return !!f && f.hasGlyphForCodePoint(cp); },
      /** The embedded language font for cp next to this text (bold when the face is bold and a bold file came). */
      packOf: function (cp, text, bold) {
        var id = J ? J.packFor(cp, text) : null;
        if (!id) return null;
        return bold && embedded[id + '|b'] ? id + '|b' : embedded[id] ? id : null;
      },
      missing: missing
    };
  };

  /** Glyph ids for pdf-lib, the way its own encodeText does it (a subset font renumbers the glyphs it keeps). A glyph the
   * shaper made with no character of its own (part of a joined form) maps to U+200D in the ToUnicode map, which pdf-lib
   * would otherwise write as an empty, invalid entry. */
  function encode(pdfFont, glyphs) {
    var em = pdfFont.embedder, hex = glyphs.map(function (g) {
      var id = g.id, rec = g.codePoints && g.codePoints.length ? g : Object.create(g, { codePoints: { value: [0x200D] } });
      if (em.subset) { id = em.subset.includeGlyph(g); if (!em.glyphs[id - 1] || rec === g) em.glyphs[id - 1] = rec; em.glyphIdMap.set(g.id, id); }
      return ('0000' + id.toString(16)).slice(-4).toUpperCase();
    });
    pdfFont.modified = true;
    if (em.glyphCache) em.glyphCache.invalidate();
    return hex;
  }

  /** Draws one text node at its baseline (object-local, y down), in the current transform. alpha: inherited opacity. */
  T.draw = function (env, n, alpha) {
    var L = window.PDFLib, fonts = env.fonts, face = n.face, key = face.key, bold = face.synthBold || /Bold/.test(key);
    if (!fonts.get(key)) return;
    var runs = PM.runs(n.text, { face: key, bidi: window.SlopBidi, has: fonts.has,
      packOf: function (cp) { return fonts.packOf(cp, n.text, bold); } });
    var ops = env.ops, rgb = PM.rgb(n.color), ls = n.ls || 0, x = n.x, a = (n.alpha == null ? 1 : n.alpha) * alpha;
    ops.push(L.pushGraphicsState());
    if (a < 1) ops.push(L.setGraphicsState(env.alpha(a)));
    ops.push(L.setFillingRgbColor(rgb[0], rgb[1], rgb[2]));
    if (face.synthBold) ops.push(L.setStrokingRgbColor(rgb[0], rgb[1], rgb[2]), L.setLineWidth(n.size * 0.035), L.setTextRenderingMode(L.TextRenderingMode.FillAndOutline));
    ops.push(L.beginText());
    runs.forEach(function (r) {
      var font = fonts.get(r.font) || fonts.get(key), kit = fonts.kit(r.font) || fonts.kit(key);
      var lay = kit.layout(r.text, r.font === key ? NO_KERN : undefined);
      var glyphs = lay.glyphs.slice(), pos = lay.positions.slice();
      if (r.rtl && lay.direction !== 'rtl') { glyphs.reverse(); pos.reverse(); }   // neutrals inside right-to-left text
      var plan = PM.glyphPlan(glyphs, pos, kit.unitsPerEm, n.size), hex = encode(font, glyphs);
      var m = PM.textMatrix(x, n.y, face.synthItalic ? 0.2 : 0);
      ops.push(L.setFontAndSize(env.fontName(font), n.size), L.setCharacterSpacing(ls), L.setTextMatrix(m[0], m[1], m[2], m[3], m[4], m[5]));
      plan.groups.forEach(function (g) {
        if (g.rise) ops.push(L.setTextRise(g.rise));
        var arr = L.PDFArray.withContext(env.doc.context);
        g.parts.forEach(function (p) { arr.push(typeof p === 'number' ? L.PDFNumber.of(Math.round(p * 100) / 100) : L.PDFHexString.of(hex[p.g])); });
        ops.push(L.PDFOperator.of('TJ', [arr]));
        if (g.rise) ops.push(L.setTextRise(0));
      });
      x += plan.width + ls * glyphs.length;
    });
    ops.push(L.endText(), L.popGraphicsState());
    if (n.link && n.w) env.link(n.x, n.y - n.size * 0.9, n.w, n.size * 1.2, n.link);
  };
})();
