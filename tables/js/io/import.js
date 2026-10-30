/* Slop Tables: XLSX and ODS import. The shared reader (shared/sheets/read.js) reads the file; this turns what it read
 * into a workbook: values, formulas (recalculated here; shared formulas are filled in from their first cell), number
 * formats and dates, bold and italic, column widths, row heights, merged cells, frozen panes and charts.
 *   importSheets(doc) → { wb, notes }   doc: read() output. notes: plain sentences about what was left out.
 *   readWorkbook(blob, name) → Promise<{ wb, notes }> */
import { read } from '../../../shared/sheets/read.js';
import { serialOf } from '../../../shared/sheets/numfmt.js';
import { Workbook } from '../engine/index.js';
import { errFrom, FErr, ERR } from '../engine/values.js';
import { MAX_COLS } from '../engine/refs.js';
import { importCharts } from './import-charts.js';
import { t } from '../i18n.js';

const cleanFormula = (f) => String(f).replace(/_xlfn\.|_xlws\.|_xludf\./g, '');

function uniqueName(wb, name, i) {
  let base = String(name || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet' + (i + 1), out = base;
  for (let n = 2; wb.sheetByName(out); n++) out = base.slice(0, 31 - String(n).length - 3) + ` (${n})`;
  return out;
}

/** One sheet read by the shared reader → cells on sh. Returns { formulas, unknown } counts. */
function fillSheet(wb, sh, s) {
  const formulas = s.formulas || new Map(), masters = new Map();
  for (const [k, rec] of formulas) if (rec.shared !== null && rec.shared !== undefined && rec.f) masters.set(rec.shared, { k, f: rec.f });
  for (let r = 0; r < s.height; r++) {
    const row = s.rows[r];
    for (let c = 0; c < s.width; c++) {
      const k = r * 16384 + c, v = row[c], fr = formulas.get(k);
      const nf = s.fmt.get(k), b = s.bold.has(k), it = s.italic ? s.italic.has(k) : false;
      if ((v === null || v === undefined) && !fr && !b && !it) continue;
      const cell = sh.ensure(r, c);
      if (nf || b || it) cell.s = wb.styleId({ nf: nf && nf !== 'General' ? nf : undefined, b: b || undefined, i: it || undefined });
      let cached = v instanceof Date ? serialOf(v) : typeof v === 'string' && /^#[A-Z0-9/!?]+$/.test(v) ? (errFrom(v) || v) : v;
      let f = fr && fr.f;
      if (fr && !f && masters.has(fr.shared)) {
        const m = masters.get(fr.shared);
        try { f = wb.shiftFormula(cleanFormula(m.f), r - Math.floor(m.k / 16384), c - m.k % 16384); } catch (e) { f = null; }
      }
      if (f) wb.setFormula(sh, r, c, cleanFormula(f), { lenient: true, cached: cached ?? null });
      else if (cached !== null && cached !== undefined) cell.v = cached;
      else sh.prune(r, c);
    }
  }
  for (const col of s.cols || []) {
    if (col.c2 - col.c1 > 1000 || col.c2 >= MAX_COLS - 1) { if (col.w && col.c1 === 0) sh.defW = col.w; continue; }
    for (let c = col.c1; c <= col.c2; c++) {
      if (col.w) sh.colProp(c).w = col.w;
      if (col.hidden) sh.colProp(c).hidden = true;
    }
  }
  for (const [r, h] of s.heights || []) sh.rowProp(r).h = h;
  sh.merges = (s.merges || []).map((m) => ({ ...m }));
  if (s.freeze) sh.freeze = { r: s.freeze.r || 0, c: s.freeze.c || 0 };
}

export function importSheets(doc) {
  const wb = new Workbook({ sheets: 0 }), notes = [];
  wb.auto = false;
  doc.sheets.forEach((s, i) => { const sh = wb.addSheet(uniqueName(wb, s.name, i)); fillSheet(wb, sh, s); });
  wb.auto = true;
  wb.recalcAll();
  const chartNotes = importCharts(wb, doc);
  // Formulas the engine could not read or has no function for show #NAME?; the file's own result was different.
  let unknown = 0;
  doc.sheets.forEach((s, i) => {
    const sh = wb.sheets[i];
    for (const [k] of s.formulas || []) {
      const cell = sh.cells.get(k), was = s.rows[Math.floor(k / 16384)]?.[k % 16384];
      if (cell && cell.v instanceof FErr && cell.v === ERR.NAME && was !== '#NAME?') unknown++;
    }
  });
  if (unknown) notes.push(t('tables.import.unknown_fn', { n: unknown }));
  notes.push(...chartNotes);
  if (doc.skipped && doc.skipped.length) notes.push(t('tables.import.skipped', { list: doc.skipped.join(', ') }));
  wb.active = 0;
  return { wb, notes };
}

export async function readWorkbook(blob, name) {
  return importSheets(await read(blob, { name }));
}
