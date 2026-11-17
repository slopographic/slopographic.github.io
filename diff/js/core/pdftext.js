/* Slop Compare: pdf.js text items (page.getTextContent().items) as lines of text, in the order the page gives them. Pure.
 *   linesOf(items) → [text]   a line ends at an item with hasEOL or where the baseline moves; words on one line that the
 *   PDF placed apart (no space item between them) get a space when the gap is wider than a fifth of the text height */
export function linesOf(items) {
  const out = [];
  let cur = '', y = null, end = null;
  const push = () => { const s = cur.replace(/\s+/g, ' ').trim(); if (s) out.push(s); cur = ''; end = null; };
  for (const it of items) {
    if (!it || typeof it.str !== 'string') continue;
    const t = it.transform || [1, 0, 0, 1, 0, y || 0], iy = Math.round(t[5]), x = t[4], size = Math.abs(t[3]) || Math.abs(t[0]) || 10;
    if (y !== null && Math.abs(iy - y) > 2 && cur) push();
    if (it.str) {
      if (cur && end !== null && x - end > size / 5 && !/\s$/.test(cur) && !/^\s/.test(it.str)) cur += ' ';
      cur += it.str;
      end = x + (Number(it.width) || 0);
    }
    y = iy;
    if (it.hasEOL) { push(); y = null; }
  }
  push();
  return out;
}
