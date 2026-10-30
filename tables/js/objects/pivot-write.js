/* Slop Tables pivot tables: reading the source range and writing the summary into a sheet. No DOM.
 *   readSource(wb, host, source) → { headers, records, formats, sheet, rg }   (throws an Error saying what is wrong)
 *   pivotSize(wb, host, pv) → { rows, cols }                                   the size the summary will take
 *   overlaps(sheet, pv, at, size) → true when the area holds cells that are not this pivot table's own
 *   writePivot(wb, sheet, pv) → pv.extent                                      clears the old area, writes the new one
 * The written cells are plain values (bold header and totals, the source's number formats), so formulas can use them and
 * they export to CSV and XLSX like any cell. Refresh is writePivot again. */
import { resolveRange, cellFormat } from './region.js';
import { fieldNames, pivotGrid } from './pivot.js';
import { FErr } from '../engine/values.js';
import { t } from '../i18n.js';

export const MAX_SOURCE_ROWS = 100000;

export function readSource(wb, host, source) {
  const ref = (source.sheet ? `'${source.sheet.replace(/'/g, "''")}'!` : '') + source.ref;
  const rg = resolveRange(wb, host, ref);
  if (rg.error) throw new Error(t('tables.err.source_range', { error: rg.error }));
  const { sheet, r1, c1, r2, c2 } = rg;
  if (r2 <= r1) throw new Error(t('tables.err.source_rows'));
  if (r2 - r1 > MAX_SOURCE_ROWS) throw new Error(t('tables.err.source_too_big', { n: MAX_SOURCE_ROWS }));
  const val = (r, c) => { const v = sheet.value(r, c); return v instanceof FErr ? null : v; };
  const headers = fieldNames(Array.from({ length: c2 - c1 + 1 }, (_, j) => val(r1, c1 + j)));
  const records = [];
  for (let r = r1 + 1; r <= r2; r++) {
    const rec = headers.map((_, j) => val(r, c1 + j));
    if (rec.some((v) => v !== null && v !== undefined && v !== '')) records.push(rec);
  }
  const formats = headers.map((_, j) => { for (let r = r1 + 1; r <= r2; r++) if (val(r, c1 + j) !== null) return cellFormat(wb, sheet, r, c1 + j) || null; return null; });
  return { headers, records, formats, sheet, rg };
}

function compute(wb, host, pv) {
  const src = readSource(wb, host, pv.source);
  return { src, grid: pivotGrid(src.headers, src.records, pv) };
}

export function pivotSize(wb, host, pv) {
  const { grid } = compute(wb, host, pv);
  return { rows: grid.cells.length, cols: Math.max(...grid.cells.map((row) => row.length)) };
}

const inside = (r, c, at, size) => size && r >= at.r && r < at.r + size.rows && c >= at.c && c < at.c + size.cols;

export function overlaps(sheet, pv, at, size) {
  let hit = false;
  sheet.eachIn(at.r, at.c, at.r + size.rows - 1, at.c + size.cols - 1, (r, c, cell) => {
    if (hit || (cell.f === undefined && (cell.v === null || cell.v === undefined))) return;
    if (!inside(r, c, pv.at, pv.extent)) hit = true;
  });
  return hit;
}

/** Writes pv onto sheet at pv.at (clearing its previous area first). host: where the source range is read from when it
 * names no sheet (the sheet that shows the pivot table). */
export function writePivot(wb, sheet, pv, host = sheet) {
  const { src, grid } = compute(wb, host, pv);
  const { r, c } = pv.at;
  wb.batch(() => {
    if (pv.extent) wb.clear(sheet, r, c, r + pv.extent.rows - 1, c + pv.extent.cols - 1, 'all');
    grid.cells.forEach((row, i) => row.forEach((cell, j) => {
      if (cell.v === null || cell.v === undefined) { if (cell.b) { const x = sheet.ensure(r + i, c + j); x.s = wb.styleId({ b: true }); } return; }
      wb.setValue(sheet, r + i, c + j, cell.v);
      let nf;
      if (cell.key !== undefined) nf = src.formats[cell.key] || undefined;
      else if (cell.nf !== undefined && cell.nf !== null) nf = src.formats[cell.nf] || (cell.fn === 'average' ? '#,##0.00' : undefined);
      const x = sheet.get(r + i, c + j);
      if (x && (cell.b || nf)) x.s = wb.styleId({ b: cell.b || undefined, nf });
    }));
  });
  pv.extent = { rows: grid.cells.length, cols: Math.max(...grid.cells.map((row) => row.length)) };
  return pv.extent;
}

/** The pivot table whose area holds (r, c) on sheet, or null. */
export const pivotAt = (sheet, r, c) => (sheet.pivots || []).find((p) => inside(r, c, p.at, p.extent)) || null;
