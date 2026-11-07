/* Slop Docs — layout/table: column widths, merged cells (span and vertical merge), cell padding,
 * vertical alignment, shading and borders. Rows are returned with their own items (relative to the
 * table's top-left) so the paginator can place them row by row and repeat header rows. */
import { flowStatic, shift } from './blocks.js';

export const PAD = { l: 5.4, r: 5.4, t: 2, b: 2 };

/** Grid columns of each cell: [[{ c, gc, span }]] per row. */
export function gridOf(t) {
  return t.rows.map((row) => { let gc = 0; return row.cells.map((cell, c) => { const g = { c, gc, span: Math.max(1, cell.span || 1) }; gc += g.span; return g; }); });
}

export function layoutTable(L, t, width, story, path) {
  const ncols = t.cols.length;
  let cols = t.cols.slice();
  const total = cols.reduce((a, b) => a + b, 0) || 1;
  if (total > width + 0.5) cols = cols.map((c) => (c * width) / total);
  const tw = cols.reduce((a, b) => a + b, 0);
  const x0 = t.align === 'center' ? (width - tw) / 2 : t.align === 'right' ? width - tw : 0;
  const xs = [x0]; for (const c of cols) xs.push(xs[xs.length - 1] + c);
  const grid = gridOf(t);
  // vertical merges: for each cell that restarts, how many rows it spans
  const rowspan = t.rows.map((row) => row.cells.map(() => 1));
  grid.forEach((cells, r) => cells.forEach((g) => {
    const cell = t.rows[r].cells[g.c];
    if (cell.vmerge !== 'restart') return;
    let k = r + 1;
    while (k < t.rows.length) { const below = grid[k].find((x) => x.gc === g.gc); if (!below || t.rows[k].cells[below.c].vmerge !== 'continue') break; k++; }
    rowspan[r][g.c] = k - r;
  }));
  const B = t.border === undefined ? { w: 0.5, color: '#000000' } : t.border;
  // lay out cell contents
  const laid = t.rows.map((row, r) => grid[r].map((g) => {
    const cell = row.cells[g.c];
    if (cell.vmerge === 'continue') return null;
    const x = xs[Math.min(g.gc, ncols)], w = xs[Math.min(g.gc + g.span, ncols)] - x;
    const inner = Math.max(4, w - PAD.l - PAD.r);
    const f = flowStatic(L, cell.blocks || [], inner, story, [...path, r, g.c]);
    return { x, w, f, cell, g, span: rowspan[r][g.c] };
  }));
  const hs = t.rows.map((row, r) => Math.max(row.h || 0, ...laid[r].filter((c) => c && c.span === 1).map((c) => c.f.h + PAD.t + PAD.b), 8));
  laid.forEach((cells, r) => cells.forEach((c) => {
    if (!c || c.span === 1) return;
    const have = hs.slice(r, r + c.span).reduce((a, b) => a + b, 0), need = c.f.h + PAD.t + PAD.b;
    if (need > have) hs[r + c.span - 1] += need - have;
  }));
  const rows = [];
  let y = 0;
  t.rows.forEach((row, r) => {
    const items = [];
    for (const c of laid[r]) {
      if (!c) continue;
      const h = hs.slice(r, r + c.span).reduce((a, b) => a + b, 0);
      if (c.cell.shade) items.push({ kind: 'rect', x: c.x, y: 0, w: c.w, h, fill: c.cell.shade, deco: true });
      const free = h - (c.f.h + PAD.t + PAD.b);
      const dy = PAD.t + (c.cell.valign === 'center' ? free / 2 : c.cell.valign === 'bottom' ? free : 0);
      for (const it of c.f.items) items.push(shift(it, c.x + PAD.l, dy));
      items.push({ kind: 'cell', x: c.x, y: 0, w: c.w, h, story, path: [...path, r, c.g.c], pad: PAD });
      const bd = c.cell.borders || {};
      const edge = (k) => (bd[k] !== undefined ? bd[k] : B);
      const e = { top: edge('top'), bottom: edge('bottom'), left: edge('left'), right: edge('right') };
      if (e.top) items.push({ kind: 'rule', x1: c.x, y1: 0, x2: c.x + c.w, y2: 0, w: e.top.w, color: e.top.color, border: 'top' });
      if (e.bottom) items.push({ kind: 'rule', x1: c.x, y1: h, x2: c.x + c.w, y2: h, w: e.bottom.w, color: e.bottom.color, border: 'bottom' });
      if (e.left) items.push({ kind: 'rule', x1: c.x, y1: 0, x2: c.x, y2: h, w: e.left.w, color: e.left.color });
      if (e.right) items.push({ kind: 'rule', x1: c.x + c.w, y1: 0, x2: c.x + c.w, y2: h, w: e.right.w, color: e.right.color });
    }
    const keep = laid[r].some((c) => c && c.span > 1) || (r + 1 < t.rows.length && t.rows[r + 1].cells.some((c) => c.vmerge === 'continue'));
    rows.push({ y, h: hs[r], items, header: !!row.header, keepNext: keep, cantSplit: true });
    y += hs[r];
  });
  // header rows: the leading run of rows marked header
  let nh = 0; while (nh < rows.length && rows[nh].header) nh++;
  return { rows, h: y, xs, headerRows: nh, width: tw };
}
