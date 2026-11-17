/* Slop PDF — block copy: the text inside a box, one line per row of text. Pure (no DOM), so it can be tested alone.
   spans: [{ text, rect: { left, top, right, bottom } }] in one coordinate space; box: the same space.
   A span counts when its centre is inside the box, so a word cut by the edge of the box is left out rather than half-copied.
   Words on a line are joined with a space unless they touch (a gap under an eighth of the line height joins them).
   units / toPx: a box is kept in layout units, the page's own size, and drawn at the zoom on screen. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SPBlockText = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function extract(spans, box) {
    const b = { left: Math.min(box.left, box.right), right: Math.max(box.left, box.right), top: Math.min(box.top, box.bottom), bottom: Math.max(box.top, box.bottom) };
    const inside = (spans || []).filter((s) => {
      const t = String(s.text || '').trim();
      if (!t) return false;
      const cx = (s.rect.left + s.rect.right) / 2, cy = (s.rect.top + s.rect.bottom) / 2;
      return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
    });
    inside.sort((a, c) => a.rect.top - c.rect.top || a.rect.left - c.rect.left);
    const rows = [];
    for (const s of inside) {
      const h = s.rect.bottom - s.rect.top;
      const row = rows.find((r) => Math.abs(r.top - s.rect.top) < h * 0.5);
      if (row) row.items.push(s); else rows.push({ top: s.rect.top, items: [s] });
    }
    return rows.map((row) => {
      const items = row.items.sort((a, c) => a.rect.left - c.rect.left);
      let line = '';
      for (let i = 0; i < items.length; i++) {
        const s = items[i], t = String(s.text).trim();
        if (i) {
          const prev = items[i - 1], h = s.rect.bottom - s.rect.top;
          const gap = s.rect.left - prev.rect.right;
          line += gap < h * 0.125 ? '' : ' ';
        }
        line += t;
      }
      return line;
    }).join('\n');
  }

  /** A drag's box in layout units (the page's own units, which zoom scales): the two corners in any order, as min and max. */
  function units(a, b) {
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  }

  /** The same box in the page's pixels at a zoom: left, top, width and height. The box keeps its place on the page at any zoom. */
  function toPx(u, zoom) {
    return { left: u.x0 * zoom, top: u.y0 * zoom, width: (u.x1 - u.x0) * zoom, height: (u.y1 - u.y0) * zoom };
  }

  return { extract, units, toPx };
});
