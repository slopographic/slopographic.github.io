/* Slop Docs — io/pdf-text: one laid-out line as PDF text. Every font run of every frag (layout/runs.js, the same runs the
 * screen draws) becomes glyphs at the layout's own x:
 * - the document's faces: one glyph per character from the cmap, advanced by the same widths the layout measured;
 * - a language face: fontkit's shaped glyph run (joining forms, conjuncts, marks with their offsets), in visual order.
 * The glyphs are written by the shared run drawer (shared/fonts/pdf-runs.js, SlopPdfRuns), which Slop PDF uses too.
 * Highlight, underline, strike-through and link areas are added around the text.
 *   drawLine(ctx, page, it, pageH)   ctx: { PL, font(face) → PDFFont, links: [] } */
import { fragRuns } from '../layout/runs.js';
import { charWidth, vmetrics } from '../fonts/registry.js';

const rgbOf = (hex, PL) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '#000000')) || [0, '000000'], n = parseInt(m[1], 16);
  return PL.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
export { rgbOf };

const R = () => globalThis.SlopPdfRuns;
const hexRgb = (hex) => rgbOf(hex, { rgb: (r, g, b) => [r, g, b] });

/** One font run: the shared run drawer (shared/fonts/pdf-runs.js). A language face is shaped by fontkit with its
 * positions; the document's own faces go glyph by glyph at the widths the layout measured. */
function drawRun(ctx, page, r, x, y, size, m) {
  const fam = r.face.fam, user = !!(fam && fam.user);
  R().drawRun(ctx.PL, page, ctx.font(r.face), { text: r.text, x, y, size, rtl: r.rtl, shaped: !!r.face.lang, advance: r.face.lang ? null : (cp) => charWidth(r.face, cp, size) },
    { color: hexRgb(m.color), skew: user && m.i ? 0.2 : 0, bold: user && m.b });
}

/** A line item (layout/blocks.js emitLines) on a pdf-lib page. */
export function drawLine(ctx, page, it, H) {
  const { PL } = ctx;
  for (const f of it.line.frags) {
    const runs = fragRuns(f);
    if (!runs.length) continue;
    const st = f.st, m = st.m || {}, size = st.size;
    const base = it.y + it.line.baseline + (st.dy || 0), y = H - base, x0 = it.x + f.x;
    const vm = vmetrics(st.face, size);
    if (m.hl) page.drawRectangle({ x: x0, y: y - vm.desc, width: f.w, height: vm.asc + vm.desc, color: rgbOf(m.hl, PL) });
    for (const r of runs) if (r.face) drawRun(ctx, page, r, x0 + r.dx, y, size, m);
    const t = st.face && st.face.ttf, upm = t ? t.upm : 1000;
    const thick = Math.max(0.4, ((t ? t.ulThick : 50) / upm) * size);
    if (m.u && f.kind !== 'label') page.drawRectangle({ x: x0, y: y + ((t ? t.ulPos : -100) / upm) * size - thick / 2, width: f.w, height: thick, color: rgbOf(m.color, PL) });
    if (m.s) page.drawRectangle({ x: x0, y: y + ((t ? t.xH : 500) / upm) * size * 0.5 - thick / 2, width: f.w, height: thick, color: rgbOf(m.color, PL) });
    if (m.link && f.kind !== 'label') ctx.links.push({ link: m.link, rect: [x0, y - vm.desc, x0 + f.w, y + vm.asc] });
  }
}
