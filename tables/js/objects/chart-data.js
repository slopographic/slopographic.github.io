/* Slop Tables charts: the data of a chart, read live from its cells. No DOM.
 * A chart is { id, type: 'column' | 'bar' | 'line' | 'pie', range: 'A1:C6' (or 'Data!A1:C6'), by: 'cols' | 'rows',
 *   title, legend, x, y, w, h } (x, y: pixels from the top-left corner of A1 on the sheet that holds the chart).
 * With series in columns, the first row holds the series names when it has text, and the first column holds the
 * categories when it has text (or the top-left cell is blank). With series in rows, the same with rows and columns swapped.
 * chart.header and chart.catCol (booleans, optional) say so instead of the guess (an imported chart knows).
 *   seriesFrom(grid, { header?, catCol? }) → { cats, series: [{ name, values, j }], header, catCol }   grid: rows of { v, t } (value, shown text)
 *   chartData(wb, host, chart) → { cats, series, refs } or { error }             refs: the cells of each part (for XLSX) */
import { resolveRange, cellText } from './region.js';
import { FErr } from '../engine/values.js';
import { t } from '../i18n.js';

export const TYPES = [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie']];
export const MAX_SERIES = 8, MAX_POINTS = 500;

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isBlank = (v) => v === null || v === undefined || v === '';

/** Series and categories of a grid whose columns are the series. */
export function seriesFrom(grid, { header: forceHeader, catCol: forceCat } = {}) {
  const rows = grid.length, cols = rows ? grid[0].length : 0;
  if (!rows || !cols) return { cats: [], series: [], header: false, catCol: false };
  const topLeftBlank = isBlank(grid[0][0].v);
  let catCol = cols > 1 && (grid.some((row, i) => i > 0 && isText(row[0].v)) || (topLeftBlank && rows > 1));
  if (cols > 1 && rows === 1) catCol = isText(grid[0][0].v);
  if (typeof forceCat === 'boolean') catCol = forceCat && cols > 1;
  const first = catCol ? 1 : 0;
  const header = typeof forceHeader === 'boolean' ? forceHeader && rows > 1 : rows > 1 && grid[0].some((cell, j) => j >= first && isText(cell.v));
  const body = header ? 1 : 0;
  const cats = [];
  for (let i = body; i < rows; i++) cats.push(catCol ? grid[i][0].t : String(i - body + 1));
  const series = [];
  for (let j = first; j < cols; j++) {
    const values = [];
    for (let i = body; i < rows; i++) { const v = grid[i][j].v; values.push(typeof v === 'number' && isFinite(v) ? v : typeof v === 'boolean' ? Number(v) : null); }
    series.push({ name: header ? grid[0][j].t || `Series ${series.length + 1}` : `Series ${series.length + 1}`, values, j });
  }
  return { cats, series, header, catCol };
}

/** Reads the chart's range. by 'rows' reads the grid turned on its side, so the rows become the series. */
export function chartData(wb, host, chart) {
  const rg = resolveRange(wb, host, chart.range);
  if (rg.error) return { error: rg.error };
  const { sheet, r1, c1, r2, c2 } = rg, byRows = chart.by === 'rows';
  const nI = byRows ? c2 - c1 + 1 : r2 - r1 + 1, nJ = byRows ? r2 - r1 + 1 : c2 - c1 + 1;
  if (nI > MAX_POINTS + 1) return { error: t('tables.err.too_many_points', { n: MAX_POINTS }) };
  const at = (i, j) => (byRows ? { r: r1 + j, c: c1 + i } : { r: r1 + i, c: c1 + j });
  const grid = [];
  for (let i = 0; i < nI; i++) {
    const row = [];
    for (let j = 0; j < nJ; j++) {
      const { r, c } = at(i, j), v = sheet.value(r, c);
      row.push({ v: v instanceof FErr ? null : v, t: cellText(wb, sheet, r, c) });
    }
    grid.push(row);
  }
  const d = seriesFrom(grid, chart);
  if (!d.series.length || d.series.every((s) => s.values.every((v) => v === null))) return { error: t('tables.err.no_numbers') };
  const body = d.header ? 1 : 0, last = nI - 1;
  const span = (j) => { const a = at(body, j), b = at(last, j); return { r1: a.r, c1: a.c, r2: b.r, c2: b.c }; };
  const refs = {
    sheet,
    cats: d.catCol && last >= body ? span(0) : null,
    series: d.series.map((s) => ({ name: d.header ? at(0, s.j) : null, vals: span(s.j) })),
  };
  return { cats: d.cats, series: d.series, refs, more: Math.max(0, d.series.length - MAX_SERIES) };
}
