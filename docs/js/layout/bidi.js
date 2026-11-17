/* Slop Docs — layout/bidi: right-to-left and mixed-direction lines. Lines are broken in logical order (lines.js); this
 * pass then puts each line's pieces where they show. A paragraph's direction is its first strong character (as HTML's
 * dir="auto"): an Arabic or Hebrew paragraph is laid out from the right, so its start alignment, indents and list label
 * are mirrored. Inside a line, the levels (with the bracket-pair rule N0) and the reordering (L2) are SlopBidi's
 * (shared/fonts/bidi.js, UAX #9); text frags are cut where the level changes and the pieces are put in that order.
 * A piece at an odd level is right-to-left (frag.rtl): its text stays in logical order, and the screen (dir="rtl") and the PDF (fontkit, or reversed characters) draw it
 * reversed. Tabs, labels and objects keep the paragraph level and split the line into separately ordered segments.
 *   paraRtl(text) → true for a right-to-left paragraph · bidiLine(line, rtl, width) rewrites line.frags in visual order */
import { textWidth } from '../fonts/registry.js';

const RTL_CHARS = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;
const SEG = new Set(['text', 'space']);
const B = () => globalThis.SlopBidi || null;
export const hasRtl = (s) => RTL_CHARS.test(s || '');
export function paraRtl(text) { const b = B(); return !!b && hasRtl(text) && b.baseOf(text) === 'rtl'; }

/** One segment (consecutive text and space frags): cut at level changes, reorder, and place from its visual left edge. */
function segment(frs, base, width, rtl, bidi) {
  const cps = [];
  for (const f of frs) for (const ch of f.atomic ? [f.text[0] || ' '] : f.text) cps.push(ch.codePointAt(0));
  const lv = bidi.levels(cps, base);
  const pieces = [];
  let k = 0;
  for (const f of frs) {
    if (f.atomic) { pieces.push({ f, level: lv[k++], whole: true }); continue; }
    if (!f.text) { pieces.push({ f, level: base, whole: true }); continue; }
    let cur = null, off = f.start;
    for (const ch of f.text) {
      const l = lv[k++];
      if (!cur || cur.level !== l) pieces.push((cur = { f, level: l, text: '', start: off }));
      cur.text += ch; off += ch.length; cur.end = off;
    }
    if (cur && pieces.filter((p) => p.f === f).length === 1) { cur.whole = true; }
  }
  if (!rtl && pieces.every((p) => p.level === 0)) return frs;
  const last = frs[frs.length - 1], x0 = frs[0].x, x1 = last.x + last.w;
  let x = rtl ? width - x1 : x0;
  return bidi.reorder(pieces).map((p) => {
    const f = p.f, w = p.whole ? f.w : textWidth(f.st.face, p.text, f.st.size);
    const out = p.whole ? { ...f, x, rtl: p.level % 2 === 1 } : { ...f, text: p.text, start: p.start, end: p.end, w, x, rtl: p.level % 2 === 1 };
    x += w;
    return out;
  });
}

export function bidiLine(line, rtl, width) {
  const bidi = B(), fr = line.frags;
  line.startX = rtl ? width - line.left - (line.shift || 0) : line.left + (line.shift || 0);
  if (!bidi || (!rtl && !fr.some((f) => SEG.has(f.kind) && hasRtl(f.text)))) return line;
  const base = rtl ? 1 : 0, out = [];
  for (let i = 0; i < fr.length;) {
    if (!SEG.has(fr[i].kind)) { const f = fr[i++]; out.push(rtl ? { ...f, x: width - f.x - f.w } : f); continue; }
    let j = i;
    while (j < fr.length && SEG.has(fr[j].kind)) j++;
    out.push(...segment(fr.slice(i, j), base, width, rtl, bidi));
    i = j;
  }
  line.frags = out;
  line.rtl = rtl;
  return line;
}
