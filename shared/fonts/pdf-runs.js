/* SlopPdfRuns: one run of text written into a pdf-lib page as positioned glyphs, for every app that saves text in any writing
 * system (Slop Docs, Slop PDF). pdf-lib's drawText re-shapes the text and drops the shaper's positions (Arabic marks, Indic
 * signs and kerning land in the wrong place); this writes the glyphs where the shaper put them, in Tm/Tj chunks.
 * It also fixes two pdf-lib/fontkit problems for every caller:
 *   - fontkit 1.1.1 writes a CFF subset (Noto Sans CJK and other OpenType/CFF fonts) whose header offSize is 24, which PDF
 *     readers refuse ("Bad offSize"); embed()/fixCff() set it to 4 (the rest of the subset is sound);
 *   - a glyph with no character of its own (the dots Noto Sans Arabic draws as separate marks) would map to nothing in the
 *     ToUnicode table, and readers show a control code there; it maps to U+034F (combining grapheme joiner: invisible,
 *     ignored by search). A shaped run whose glyphs do not spell it in order also carries its text as ActualText.
 * Classic script with no DOM use: window.SlopPdfRuns, and module.exports for Node.
 *   embed(pdfDoc, bytes) → Promise<PDFFont>         a subset font, CFF-fixed (pdfDoc needs registerFontkit first)
 *   fixCff(pdfFont) → pdfFont
 *   glyphs(pdfFont, run) → [{ g, x, y, adv }]       run: { text, x, y, size, rtl, shaped, advance(cp) }
 *       shaped: fontkit layout with its positions, in the run's direction (right-to-left comes out in visual order);
 *       else one glyph per character from the cmap (reversed and brackets mirrored when rtl), advanced by advance(cp)
 *       in points (default: the glyph's own width) — for faces measured that way by the app's layout
 *   drawRun(PL, page, pdfFont, run, { color: [r, g, b], opacity, skew, bold }) → number of glyphs drawn
 *   visualChars(text, rtl) → the characters of an unshaped run in drawing order */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopPdfRuns = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const CGJ = [0x34f];
  const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«', '‹': '›', '›': '‹' };
  const fontNames = new WeakMap();

  function visualChars(text, rtl) {
    const chars = Array.from(String(text || ''));
    return rtl ? chars.reverse().map((c) => MIRROR[c] || c) : chars;
  }

  function fixCff(pf) {
    const e = pf && pf.embedder;
    if (!e || !e.serializeFont || !e.isCFF || e.__cffFixed) return pf;
    const serialize = e.serializeFont.bind(e);
    e.serializeFont = async () => { const b = await serialize(); if (e.isCFF() && b[3] > 4) b[3] = 4; return b; };
    e.__cffFixed = true;
    return pf;
  }
  async function embed(pdfDoc, bytes) { return fixCff(await pdfDoc.embedFont(bytes, { subset: true })); }

  /** The subset glyph id as four hex digits (what pdf-lib's subset embedder does for each glyph of encodeText). */
  function gidHex(pf, g) {
    const e = pf.embedder;
    let id = e.glyphIdMap.get(g.id);
    if (id === undefined) {
      id = e.subset.includeGlyph(g);
      e.glyphs[id - 1] = g.codePoints && g.codePoints.length ? g : Object.create(g, { codePoints: { value: CGJ } });
      e.glyphIdMap.set(g.id, id);
      e.glyphCache.invalidate();
    }
    pf.modified = true;
    return id.toString(16).padStart(4, '0');
  }

  function glyphs(pf, run) {
    const font = pf.embedder.font, sc = run.size / font.unitsPerEm, out = [];
    if (run.shaped) {
      const r = font.layout(String(run.text), undefined, undefined, undefined, run.rtl ? 'rtl' : 'ltr');
      let pen = 0;
      r.glyphs.forEach((g, i) => {
        const p = r.positions[i];
        out.push({ g, x: run.x + (pen + p.xOffset) * sc, y: run.y + p.yOffset * sc, adv: g.advanceWidth * sc });
        pen += p.xAdvance;
      });
      return out;
    }
    let pen = run.x;
    for (const ch of visualChars(run.text, run.rtl)) {
      const cp = ch.codePointAt(0), g = font.glyphForCodePoint(cp), w = g ? g.advanceWidth * sc : 0;
      if (g && g.id) out.push({ g, x: pen, y: run.y, adv: w });
      pen += run.advance ? run.advance(cp) : w;
    }
    return out;
  }

  /** The page's resource name for a font (one per page and font). */
  function fontName(page, pf) {
    let m = fontNames.get(page);
    if (!m) fontNames.set(page, (m = new Map()));
    if (!m.has(pf)) m.set(pf, page.node.newFontDictionary(pf.name, pf.ref));
    return m.get(pf);
  }

  function drawRun(PL, page, pf, run, opts) {
    const o = opts || {}, list = glyphs(pf, run);
    if (!list.length) return 0;
    const c = o.color || [0, 0, 0], size = run.size, ops = [];
    const spelled = list.map((q) => String.fromCodePoint(...(q.g.codePoints || [])));
    const actual = run.shaped && (run.rtl ? spelled.reverse() : spelled).join('') !== run.text;
    const gs = o.opacity != null && o.opacity < 1 && page.maybeEmbedGraphicsState ? page.maybeEmbedGraphicsState({ opacity: o.opacity }) : null;
    if (gs) ops.push(PL.pushGraphicsState(), PL.setGraphicsState(gs));
    if (actual) ops.push(PL.PDFOperator.of(PL.PDFOperatorNames.BeginMarkedContentSequence, [PL.PDFName.of('Span'), page.doc.context.obj({ ActualText: PL.PDFHexString.fromText(run.text) })]));
    ops.push(PL.beginText(), PL.setFontAndSize(fontName(page, pf), size), PL.setFillingRgbColor(c[0], c[1], c[2]));
    if (o.bold) ops.push(PL.setTextRenderingMode(PL.TextRenderingMode.FillAndOutline), PL.setStrokingRgbColor(c[0], c[1], c[2]), PL.setLineWidth(size * 0.03));
    let cur = null;
    const flush = () => { if (cur) ops.push(PL.setTextMatrix(1, 0, o.skew || 0, 1, cur.x, cur.y), PL.showText(PL.PDFHexString.of(cur.hex))); };
    for (const q of list) {
      if (cur && Math.abs(q.x - cur.next) < 0.01 && Math.abs(q.y - cur.y) < 0.001) { cur.hex += gidHex(pf, q.g); cur.next += q.adv; continue; }
      flush();
      cur = { x: q.x, y: q.y, hex: gidHex(pf, q.g), next: q.x + q.adv };
    }
    flush();
    ops.push(PL.endText());
    if (actual) ops.push(PL.endMarkedContent());
    if (gs) ops.push(PL.popGraphicsState());
    page.pushOperators(...ops);
    return list.length;
  }

  return { embed, fixCff, glyphs, drawRun, visualChars, fontName, CGJ, MIRROR };
});
