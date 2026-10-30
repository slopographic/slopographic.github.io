/* Slop Docs — fonts/lang: language fonts for the characters the document's own font cannot set (Arabic, Hebrew,
 * Devanagari, Chinese, Japanese…). They are the Noto packs of the shared font layer: SlopScripts picks the pack for a
 * character, SlopFontJIT downloads it just in time (after asking) and hands over its bytes. A loaded pack becomes a
 * "language face": the bytes parsed by fontkit, which shapes the text (Arabic joining, Indic syllables), registered as a
 * FontFace for the screen, and embedded in the PDF. Measuring, the screen and the PDF all use the same shaped glyphs.
 *   langFace(cp, bold, han) → face | null      the loaded face that sets cp (bold when loaded, else regular)
 *   addLangFace(pack, bold, bytes) → face      parse and register one face (used by lang-doc.js and the tests)
 *   shape(face, text) → { glyphs, positions, adv }   fontkit's glyph run, cached (adv in font units)
 *   shapedWidth(face, text, size), langVersion(), onLangLoad(fn)
 * face = { key, lang: true, pack, b, fk, bytes, css, upm, asc, desc, gap, has(cp) } */
import { fontkit } from '../io/vendor.js';

const faces = new Map();      // `${pack}|${bold}` → face
const listeners = new Set();
let version = 0;
const SC = () => globalThis.SlopScripts;

export const langKey = (pack, bold) => `${pack}|${bold ? 700 : 400}`;
export const langVersion = () => version;
export const hasLangFaces = () => faces.size > 0;
export const langFaces = () => [...faces.values()];
export function onLangLoad(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** The pack that sets a code point (han: 'sc' | 'tc' | 'jp' | 'kr' for Chinese characters), or null. */
export function packOf(cp, han) { const S = SC(); return S ? S.packOf(cp, { han: han || 'sc' }) : null; }

export function langFace(cp, bold, han) {
  if (!faces.size) return null;
  const pack = packOf(cp, han);
  if (!pack) return null;
  const f = (bold && faces.get(langKey(pack, true))) || faces.get(langKey(pack, false));
  return f && f.has(cp) ? f : null;
}
export const hasPack = (pack, bold) => faces.has(langKey(pack, bold));

/** Parses a language font and adds it. The FontFace is registered under its own CSS name, so a screen run uses exactly it. */
export async function addLangFace(pack, bold, bytes) {
  const key = langKey(pack, bold);
  if (faces.has(key)) return faces.get(key);
  const fk = await fontkit(), u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let font = fk.create(u8);
  if (font.fonts) font = font.fonts[0];
  const css = `SDL ${pack} ${bold ? 700 : 400}`;
  if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
    try { const ff = new FontFace(css, u8.slice().buffer); await ff.load(); document.fonts.add(ff); } catch (e) { console.warn('Slop Docs: ' + pack + ' not shown on screen: ' + e.message); }
  }
  const hh = font.hhea || {};
  const face = {
    key: 'lang:' + key, lang: true, pack, b: !!bold, i: false, fk: font, bytes: u8, css, upm: font.unitsPerEm,
    asc: hh.ascent ?? font.ascent, desc: -(hh.descent ?? font.descent), gap: hh.lineGap ?? font.lineGap ?? 0,
    has: (cp) => font.hasGlyphForCodePoint(cp), shapes: new Map(),
  };
  faces.set(key, face);
  version++;
  for (const fn of listeners) try { fn(face); } catch (e) { console.error(e); }
  return face;
}

/** fontkit's glyph run for a text in a language face (visual order: right-to-left scripts come reversed). */
export function shape(f, text) {
  let r = f.shapes.get(text);
  if (!r) {
    if (f.shapes.size > 4000) f.shapes.clear();
    const run = f.fk.layout(text);
    r = { glyphs: run.glyphs, positions: run.positions, adv: run.positions.reduce((n, p) => n + p.xAdvance, 0) };
    f.shapes.set(text, r);
  }
  return r;
}
export const shapedWidth = (f, text, size) => (shape(f, text).adv / f.upm) * size;

/** Forget every language face (tests). */
export function resetLangFaces() { faces.clear(); version++; }
