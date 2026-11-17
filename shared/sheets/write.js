/* Slop Sheets: XLSX export. Builds a Slop Tables workbook from the sheets and writes it with the existing XLSX writer
 * (tables/js/io/xlsx.js, toXlsx). Values, bold and number formats are kept; dates go out as Excel serials with a date
 * format. CSV and TSV are written by csvBlob in ./csv.js.
 *   exportSheet(sheet, order?) → { name, rows, fmt, bold }   rows in the given order (default: every row)
 *   toXlsxBlob(exportSheets) → Promise<Blob>                 one worksheet per entry                              */
import { Workbook } from '../../tables/js/engine/workbook.js';
import { toXlsx } from '../../tables/js/io/xlsx.js';
import { KEY } from './csv.js';
import { serialOf } from './numfmt.js';

/** A copy of a sheet's rows in a new order, with the number formats and bold keys moved to match. */
export function exportSheet(sheet, order = null) {
  const idx = order || Array.from({ length: sheet.height }, (_, i) => i);
  const pos = new Map(idx.map((r, i) => [r, i]));
  const rows = idx.map((r) => sheet.rows[r]);
  const fmt = new Map(), bold = new Set();
  for (const [k, code] of sheet.fmt) {
    const p = pos.get(Math.floor(k / 16384));
    if (p !== undefined) fmt.set(KEY(p, k % 16384), code);
  }
  for (const k of sheet.bold) {
    const p = pos.get(Math.floor(k / 16384));
    if (p !== undefined) bold.add(KEY(p, k % 16384));
  }
  return { name: sheet.name, rows, fmt, bold };
}

/** A worksheet name Excel accepts: no []:*?/\ characters, at most 31, not empty, unique in the book. */
export function sheetName(name, used) {
  let base = String(name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let out = base;
  for (let n = 2; used.has(out.toLowerCase()); n++) out = base.slice(0, 31 - String(n).length - 3) + ` (${n})`;
  used.add(out.toLowerCase());
  return out;
}

const DEFAULT_DATE = 'yyyy-mm-dd';
export async function toXlsxBlob(sheets) {
  const wb = new Workbook({ sheets: 0 });
  const used = new Set();
  for (const s of sheets) {
    const sh = wb.addSheet(sheetName(s.name, used));
    s.rows.forEach((row, r) => row.forEach((v, c) => {
      const k = KEY(r, c), code = s.fmt.get(k), b = s.bold.has(k);
      if ((v === null || v === undefined) && !b) return;
      const cell = sh.ensure(r, c);
      let nf = code && code !== 'General' ? code : '';
      if (v instanceof Date) { cell.v = serialOf(v); nf = nf || DEFAULT_DATE; }
      else if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') cell.v = v;
      else cell.v = null;
      cell.s = wb.styleId({ b, nf: nf || undefined });
    }));
  }
  return toXlsx(wb);
}
