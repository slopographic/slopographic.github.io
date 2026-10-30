/* Slop Tables objects: ranges for charts and pivot tables. No DOM.
 *   resolveRange(wb, host, text) → { sheet, r1, c1, r2, c2 } or { error }   a range text, on host unless it names a sheet;
 *                                                                          whole columns and rows are cut to the used range
 *   currentRegion(sheet, r, c) → { r1, c1, r2, c2 }   the block of filled cells around a cell (Excel's Ctrl+A region)
 *   regionText(host, sheet, rg) → 'A1:C6' or 'Data!A1:C6'                  (with the sheet only when it is not host)
 *   cellText(wb, sheet, r, c) → the text a cell shows (its number format applied) */
import { parseRange, rangeText, quoteSheet, MAX_ROWS, MAX_COLS } from '../engine/refs.js';
import { format } from '../engine/index.js';
import { FErr } from '../engine/values.js';
import { t } from '../i18n.js';

const filled = (sh, r, c) => { const v = sh.value(r, c); return v !== null && v !== undefined && v !== ''; };

export function resolveRange(wb, host, text) {
  const p = parseRange(String(text || '').replace(/^=/, ''));
  if (!p) return { error: t('tables.err.not_range') };
  const sheet = p.sheet ? wb.sheetByName(p.sheet) : host;
  if (!sheet) return { error: t('tables.err.no_sheet', { name: p.sheet }) };
  let { r1, c1, r2, c2 } = p;
  if (r2 === MAX_ROWS - 1 || c2 === MAX_COLS - 1) {
    const u = sheet.usedRange(false);
    if (!u) return { error: t('tables.err.range_empty') };
    if (r2 === MAX_ROWS - 1) { r1 = Math.max(r1, u.r1); r2 = u.r2; }
    if (c2 === MAX_COLS - 1) { c1 = Math.max(c1, u.c1); c2 = u.c2; }
    if (r1 > r2 || c1 > c2) return { error: t('tables.err.range_empty') };
  }
  if ((r2 - r1 + 1) * (c2 - c1 + 1) > 200000) return { error: t('tables.err.range_too_large') };
  return { sheet, r1, c1, r2, c2 };
}

/** Grows a rectangle while a filled cell touches any side (diagonals too), like Excel's current region. */
export function currentRegion(sh, r, c) {
  let r1 = r, c1 = c, r2 = r, c2 = c, grew = true, guard = 0;
  const lineFilled = (ra, ca, rb, cb) => { for (let i = ra; i <= rb; i++) for (let j = ca; j <= cb; j++) if (filled(sh, i, j)) return true; return false; };
  while (grew && guard++ < 10000) {
    grew = false;
    const top = Math.max(0, r1 - 1), left = Math.max(0, c1 - 1), bottom = Math.min(MAX_ROWS - 1, r2 + 1), right = Math.min(MAX_COLS - 1, c2 + 1);
    if (r1 > 0 && lineFilled(top, left, top, right)) { r1--; grew = true; }
    if (r2 < sh.maxR + 1 && r2 < MAX_ROWS - 1 && lineFilled(bottom, left, bottom, right)) { r2++; grew = true; }
    if (c1 > 0 && lineFilled(top, left, bottom, left)) { c1--; grew = true; }
    if (c2 < sh.maxC + 1 && c2 < MAX_COLS - 1 && lineFilled(top, right, bottom, right)) { c2++; grew = true; }
  }
  return { r1, c1, r2, c2 };
}

export const regionText = (host, sheet, rg) => (sheet && sheet !== host ? quoteSheet(sheet.name) + '!' : '') + rangeText(rg.r1, rg.c1, rg.r2, rg.c2);

/** Number format of a cell: its own style over its row and column styles, then the format hint of a formula. */
export function cellFormat(wb, sh, r, c) {
  const cell = sh.get(r, c);
  return wb.style(cell && cell.s).nf || wb.style(sh.rows.get(r)?.s).nf || wb.style(sh.cols.get(c)?.s).nf || (cell && cell.fh) || undefined;
}

export function cellText(wb, sh, r, c) {
  const v = sh.value(r, c);
  if (v === null || v === undefined) return '';
  if (v instanceof FErr) return v.code;
  return format(v, cellFormat(wb, sh, r, c)).text;
}
