/* The invisible text of a searchable PDF: the words OCR read, laid over the picture of the page so a PDF reader can
 * select, search and copy them. Slop OCR (ocr/js/export.js) and Slop Scan (scan/js/pdf.js) write it the same way.
 * ES module; needs a pdf-lib page and an embedded standard font (Helvetica).
 *   drawable(font) → (ch) → boolean      whether the font can draw a character (WinAnsi); others are left out
 *   drawTextLayer(page, font, items, { k, x, top })   items: [{ text, box: { x, y, w, h } }] in the picture's pixels; k: PDF
 *       points per pixel; x: the picture's left edge on the page and top: its top edge, in points from the page's bottom.
 *       Each line is sized to its box (at most 85% of its height) and drawn with opacity 0. Returns the lines written. */
export function drawable(font) {
  const seen = new Map();
  return (ch) => {
    if (!seen.has(ch)) {
      let ok = true;
      try { font.widthOfTextAtSize(ch, 10); } catch (e) { ok = false; }
      seen.set(ch, ok);
    }
    return seen.get(ch);
  };
}

export function drawTextLayer(page, font, items, { k, x = 0, top }) {
  const ok = drawable(font);
  let n = 0;
  for (const { text, box } of items) {
    if (!box || !text) continue;
    const t = [...String(text).replace(/\s/g, ' ')].filter(ok).join('').replace(/ +/g, ' ').trim();
    if (!t) continue;
    const bh = box.h * k, bw = box.w * k;
    const size = Math.min(bh * 0.85, bw / font.widthOfTextAtSize(t, 1));
    if (!(size > 0.5)) continue;
    page.drawText(t, { x: x + box.x * k, y: top - (box.y + box.h * 0.8) * k, size, font, opacity: 0 });
    n++;
  }
  return n;
}
