/* Slop Tables: a workbook from plain data, with the engine's own editing API (no DOM, so it runs headless and in Node).
   Used by the assistant's commands (ui/ai-create.js) and the operation "Table data to spreadsheet" (shared/ops/create-tables.js).
     spec = { title, sheets: [{ name, rows: [[cell, …], …], header: true, widths: [px…] }] }   or   { rows } (one sheet)
     a cell: a number, true/false, text (typed as a person would: "12%", "2026-10-24"), or a formula starting with =
     writeRows(wb, sh, r0, c0, rows)   → { rows, cols } written (a syntax error in a formula throws with its cell)
     boldRow(wb, sh, r, c1, c2)        the header row in bold
     workbookFrom(spec | JSON text | CSV text) → a new Workbook
     parseSpec(input)                  → the spec (JSON object, JSON text, or CSV/TSV text) */
import { Workbook, parse } from '../engine/index.js';
import { addr } from '../engine/refs.js';
import { parseCsv } from './csv.js';

export const MAX_CELLS = 200000;

export function writeRows(wb, sh, r0, c0, rows) {
  const list = [].concat(rows || []).map((r) => (Array.isArray(r) ? r : r && typeof r === 'object' ? Object.values(r) : [r]));
  const cells = list.reduce((n, r) => n + r.length, 0);
  if (cells > MAX_CELLS) throw new Error(`That is ${cells} cells; at most ${MAX_CELLS} at once`);
  list.forEach((row, i) => row.forEach((v, j) => {   // every formula is checked before anything is written
    if (typeof v === 'string' && v.startsWith('=') && v.length > 1) { try { parse(v.slice(1)); } catch (e) { throw new Error(`${addr(r0 + i, c0 + j)}: ${e.message}`); } }
  }));
  let cols = 0;
  wb.batch(() => list.forEach((row, i) => {
    cols = Math.max(cols, row.length);
    row.forEach((v, j) => {
      const r = r0 + i, c = c0 + j;
      if (v === null || v === undefined || v === '') { if (sh.get(r, c)) wb.clear(sh, r, c, r, c, 'contents'); return; }
      if (typeof v === 'number' || typeof v === 'boolean') { wb.setValue(sh, r, c, v); return; }
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (s.startsWith('=') && s.length > 1) {
        wb.setFormula(sh, r, c, s);
      } else wb.input(sh, r, c, s);
    });
  }));
  return { rows: list.length, cols };
}

export function boldRow(wb, sh, r, c1, c2) {
  for (let c = c1; c <= c2; c++) { const cell = sh.ensure(r, c); cell.s = wb.patchStyle(cell.s, { b: true }); }
}

export function parseSpec(input) {
  if (Array.isArray(input)) return { sheets: [{ rows: input }] };
  if (input && typeof input === 'object') return input.sheets ? input : { ...input, sheets: [{ name: input.name, rows: input.rows || [], header: input.header }] };
  const s = String(input == null ? '' : input).replace(/^\uFEFF/, '').trim();
  if (!s) throw new Error('The table data is empty');
  if (/^[[{]/.test(s)) {
    let j;
    try { j = JSON.parse(s); } catch (e) { throw new Error('The table data is not valid JSON: ' + e.message); }
    return parseSpec(j);
  }
  const tab = s.split('\n', 1)[0].includes('\t') && !s.split('\n', 1)[0].includes(',');
  return { sheets: [{ rows: parseCsv(s, tab ? '\t' : ',') }] };
}

export function workbookFrom(input) {
  const spec = parseSpec(input), wb = new Workbook({ sheets: 0 });
  wb.props.title = String(spec.title || '').slice(0, 200);
  const sheets = [].concat(spec.sheets || []).slice(0, 100);
  if (!sheets.length) sheets.push({ rows: [] });
  sheets.forEach((s, i) => {
    let name = String((s && s.name) || '').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet' + (i + 1);
    while (wb.sheetByName(name)) name = name.slice(0, 28) + ' ' + (i + 1);
    const sh = wb.addSheet(name), rows = (s && s.rows) || [];
    const w = writeRows(wb, sh, 0, 0, rows);
    if (s && s.header !== false && rows.length > 1 && w.cols) boldRow(wb, sh, 0, 0, w.cols - 1);
    [].concat((s && s.widths) || []).forEach((px, c) => { const n = Number(px); if (n >= 20 && n <= 1000) sh.colProp(c).w = Math.round(n); });
  });
  wb.recalc();
  return wb;
}
