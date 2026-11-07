/* Slop Docs — layout/runs: what to draw for one laid-out fragment, in one place for the screen (ui/render.js) and the PDF
 * (io/pdf-text.js), so they set the same text in the same faces at the same x.
 *   fragRuns(frag) → [{ face, text, dx, w, rtl }] in visual order, left to right; dx from the frag's x.
 * A right-to-left frag (bidi.js) draws its font runs from right to left; inside a run the text stays in logical order
 * (dir="rtl" on screen; fontkit or reversed characters in the PDF). */
import { fontRuns, runWidth } from '../fonts/registry.js';

const DRAWN = new Set(['text', 'space', 'label']);
const cache = new WeakMap();

export function fragRuns(f) {
  if (!DRAWN.has(f.kind) || !f.text) return [];
  const hit = cache.get(f);
  if (hit && hit.face === f.st.face) return hit.runs;
  const size = f.st.size;
  const list = fontRuns(f.st.face, f.text).map((r) => ({ face: r.f, text: r.text, w: runWidth(r.f, r.text, size), rtl: !!f.rtl }));
  if (f.rtl) list.reverse();
  let dx = 0;
  for (const r of list) { r.dx = dx; dx += r.w; }
  // justified spaces are wider than their glyphs: the extra goes to the last run
  if (list.length && f.w > dx + 0.01) list[list.length - 1].w += f.w - dx;
  cache.set(f, { face: f.st.face, runs: list });
  return list;
}

/** The characters of a right-to-left run in a face without shaping, in drawing order (reversed, brackets mirrored): the
 * shared rule (shared/fonts/pdf-runs.js), so the screen and the PDF put them the same way. */
export const visualChars = (text, rtl) => globalThis.SlopPdfRuns.visualChars(text, rtl);
