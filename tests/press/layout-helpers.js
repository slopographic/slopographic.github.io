/* Shared helpers for the Slop Press layout tests (scripts loaded directly, no app UI). */
/* exported LOREM, fixedGlyphs, textDoc, fontsReady */
var LOREM = 'Typography is the craft of endowing human language with a durable visual form. Every line of this paragraph is broken by the composer, justified when asked, and hyphenated with English patterns where the measure demands it, so that the column keeps an even colour from top to bottom.';
/** Monospaced glyphs (10pt each, space 5pt) for deterministic breaker tests. */
function fixedGlyphs(text) {
  return [...text].map((c, i) => ({ o: i, c, w: c === ' ' ? 5 : 10, s: { leadingPt: 12, size: 10 }, fk: 'x', size: 10 }));
}
async function fontsReady() { await PR.fonts.loadBundled(); PR.fonts.clear(); }
/** A one-page document with one text frame at (40, 40). */
async function textDoc(o) {
  await fontsReady();
  const M = PR.model, doc = M.create({ pages: 1, facing: false });
  doc.styles.para.Test = { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', size: 10, leading: 13, align: o.align || 'left', hyphenate: o.hyphenate !== false, composer: o.composer || 'kp' };
  PR.setDoc(doc);
  const d = PR.state.doc, page = d.pages[0];
  const frame = M.item('text', 40, 40, o.w || 200, o.h || 200, { cols: o.cols || 1, gutter: o.gutter || 12 });
  PR.items.add(d, page.items, frame, { text: o.text, ps: 'Test' });
  PR.touch();
  return { doc: d, frame, page };
}
