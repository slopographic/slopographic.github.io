/* Slop Docs — model/table-ops: row, column and table edits on top-level tables, as pure functions over the
 * blocks list (they return a new list, or null when the edit does not apply). Only plain grids are handled:
 * no spanned or vertically merged cells, so every row has one cell per column. */
import { para } from './doc.js';

const setAt = (list, i, v) => list.map((x, j) => (j === i ? v : x));
const newCell = () => ({ blocks: [para()] });

/** True when the table at blocks[bi] is a plain grid the row and column edits can handle. */
export function isPlain(blocks, bi) {
  const t = blocks[bi];
  return !!t && t.type === 'table' && t.rows.every((r) => r.cells.length === t.cols.length && r.cells.every((c) => !(c.span > 1) && !c.vmerge));
}

/** A row above (after = false) or below (after = true) row r. */
export function insertRow(blocks, bi, r, after) {
  if (!isPlain(blocks, bi)) return null;
  const t = blocks[bi], at = after ? r + 1 : r;
  const row = { header: false, cells: t.cols.map(newCell) };
  return setAt(blocks, bi, { ...t, rows: [...t.rows.slice(0, at), row, ...t.rows.slice(at)] });
}

export function deleteRow(blocks, bi, r) {
  if (!isPlain(blocks, bi) || blocks[bi].rows.length < 2) return null;
  const t = blocks[bi];
  return setAt(blocks, bi, { ...t, rows: t.rows.filter((_, i) => i !== r) });
}

/** A column left (after = false) or right (after = true) of column c; the new column takes c's width. */
export function insertCol(blocks, bi, c, after) {
  if (!isPlain(blocks, bi)) return null;
  const t = blocks[bi], at = after ? c + 1 : c;
  const cols = [...t.cols.slice(0, at), t.cols[c], ...t.cols.slice(at)];
  const rows = t.rows.map((r) => ({ ...r, cells: [...r.cells.slice(0, at), newCell(), ...r.cells.slice(at)] }));
  return setAt(blocks, bi, { ...t, cols, rows });
}

export function deleteCol(blocks, bi, c) {
  if (!isPlain(blocks, bi) || blocks[bi].cols.length < 2) return null;
  const t = blocks[bi];
  return setAt(blocks, bi, {
    ...t,
    cols: t.cols.filter((_, i) => i !== c),
    rows: t.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== c) })),
  });
}

/** Removes the table; a paragraph takes its place when it was the only block, so the document keeps a caret. */
export function deleteTable(blocks, bi) {
  if (!blocks[bi] || blocks[bi].type !== 'table') return null;
  const out = blocks.filter((_, i) => i !== bi);
  return out.length ? out : [para()];
}
