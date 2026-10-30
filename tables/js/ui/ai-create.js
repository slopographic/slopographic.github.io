/* Slop Tables for the assistant: making workbooks and filling them. new_workbook and build_table (a new tab, from rows or
   sheets of rows), set_range, add_rows, add_sheet, format_cells, create_chart, delete_rows and delete_column (destructive),
   export_workbook (XLSX, CSV of the active sheet or .stab, to Slop Drive through shared/commands/sources.js and/or a
   download). The cells are written by io/build.js with the engine's own input, so "12%" and "=B2*C2" mean what they mean
   when typed. Each edit is one undo step. LIST entries are [tool, title, args, fn, description, extra]; ai-commands.js
   registers them. made: the tabs the assistant opened (its checkpoint closes them). */
import { S, sheet, redraw } from './state.js';
import { transact } from './history.js';
import { tabs } from './tabs.js';
import { applyStyle } from './actions.js';
import * as Sh from './sheets.js';
import { workbookFrom, writeRows, boldRow } from '../io/build.js';
import { toNative, fromNative, toBlob } from '../io/native.js';
import { toCsv } from '../io/csv.js';
import { toXlsx } from '../io/xlsx.js';
import { parse } from '../engine/parser.js';
import { print, adjustForStructure } from '../engine/printer.js';
import { parseRange, parseCell, rangeText, colName, MAX_ROWS } from '../engine/refs.js';
import { TYPES } from '../objects/chart-data.js';
import { newId } from '../objects/store.js';
import { findColumn, table } from './ai-ops.js';

export const made = [];
const Str = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 500, description }, extra);
const ROWS = { name: 'rows', type: 'array', required: true, maxItems: 20000, items: { type: 'array', items: {} }, description: 'rows of cells: [["Item", "Price"], ["Tea", 3], ["Total", "=SUM(B2:B2)"]]; a formula starts with =' };
const step = (fn) => { const out = transact(fn); redraw(); return out; };
const fileName = (n) => String(n || 'Untitled spreadsheet').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100);

function openWorkbook(wb, name) {
  tabs.open(wb, { name: fileName(name), dirty: true });
  const T = tabs.current();
  if (T) made.push(T);
}
function cellArg(ref) {
  const p = parseCell(String(ref || 'A1').replace(/\$/g, '').trim());
  if (!p) throw new Error(`"${ref}" is not a cell reference (use one like B7)`);
  return p;
}
function rangeArg(text) {
  const g = parseRange(String(text || ''));
  if (!g) throw new Error(`"${text}" is not a range (use one like A1:C10)`);
  return g;
}

function newWorkbook(a) {
  const wb = workbookFrom({ sheets: [{ name: a.sheet || 'Sheet1', rows: [] }] });
  openWorkbook(wb, a.name);
  return `Opened a new workbook “${S.file.name}” in a new tab.`;
}
function buildTable(a) {
  const sheets = a.sheets && a.sheets.length ? a.sheets : [{ name: a.sheet, rows: a.rows || [], header: a.header }];
  const wb = workbookFrom({ title: a.name, sheets });
  openWorkbook(wb, a.name);
  const sh = wb.sheets[0], t = sh.usedRange(false);
  return `Built “${S.file.name}” in a new tab: ${wb.sheets.length} sheet${wb.sheets.length === 1 ? '' : 's'}; ${sh.name} holds ${t ? rangeText(t.r1, t.c1, t.r2, t.c2) : 'nothing'}.`;
}
function setRange(a) {
  const p = cellArg(a.start), sh = sheet();
  const w = step(() => writeRows(S.wb, sh, p.r, p.c, a.rows));
  if (!w.rows) return 'Nothing to write.';
  S.sel = { r: p.r, c: p.c, er: p.r + w.rows - 1, ec: p.c + Math.max(0, w.cols - 1) };
  return `Wrote ${rangeText(p.r, p.c, p.r + w.rows - 1, p.c + Math.max(0, w.cols - 1))} (${w.rows} rows).`;
}
function addRows(a) {
  const sh = sheet(), t = table(sh), r0 = t ? t.r2 + 1 : 0, c0 = t ? t.c1 : 0;
  const w = step(() => writeRows(S.wb, sh, r0, c0, a.rows));
  return `Added ${w.rows} row${w.rows === 1 ? '' : 's'} from row ${r0 + 1}.`;
}
function addSheet(a) {
  let sh = null;
  step(() => { sh = S.wb.addSheet(a.name ? String(a.name).slice(0, 31) : undefined); if (a.rows && a.rows.length) { writeRows(S.wb, sh, 0, 0, a.rows); if (a.rows.length > 1) boldRow(S.wb, sh, 0, 0, Math.max(...a.rows.map((r) => [].concat(r).length)) - 1); } });
  Sh.select(S.wb.sheets.indexOf(sh));
  return `Added the sheet “${sh.name}” and made it active.`;
}
function formatCells(a) {
  const g = rangeArg(a.range), patch = {};
  if (a.bold != null) patch.b = a.bold;
  if (a.italic != null) patch.i = a.italic;
  if (a.number_format) patch.nf = a.number_format === 'General' ? undefined : a.number_format;
  if (a.align) patch.al = { left: 'l', center: 'c', right: 'r' }[a.align];
  if (!Object.keys(patch).length) throw new Error('Nothing to change: give bold, italic, number_format or align');
  if (g.sheet && S.wb.sheetByName(g.sheet) !== sheet()) throw new Error('format_cells works on the active sheet; use its own range');
  S.sel = { r: g.r1, c: g.c1, er: g.r2, ec: g.c2 };
  applyStyle(patch);
  return `Formatted ${rangeText(g.r1, g.c1, g.r2, g.c2)}: ${Object.entries(patch).map(([k, v]) => ({ b: 'bold', i: 'italic', nf: 'format', al: 'align' }[k] + ' ' + v)).join(', ')}.`;
}
function createChart(a) {
  const g = rangeArg(a.range), sh = sheet(), id = newId(S.wb, 'c');
  const n = (sh.charts || []).length, ch = { type: a.type, range: rangeText(g.r1, g.c1, g.r2, g.c2), by: a.series_in, title: a.title || '', legend: a.legend,
    id, w: 420, h: 280, x: 40 + 24 * n, y: 40 + 24 * n };
  step(() => { sh.charts = sh.charts || []; sh.charts.push(ch); });
  return `Added a ${a.type} chart of ${ch.range} (id ${id}).`;
}

/** The workbook with `count` rows or columns removed at `at` on sheet si: cells, sizes, merges, frozen panes, formulas
    in every sheet, names, chart ranges and pivots move or become #REF!, as Excel does (through the native JSON). */
function removeLines(wb, si, axis, at, count) {
  const obj = toNative(wb), target = obj.sheets[si], name = target.name, R = axis === 'r' ? 0 : 1, end = at + count;
  const fix = (f, cur) => { try { return print(adjustForStructure(parse(String(f).replace(/^=/, '')), name, cur, axis, at, -count)); } catch (e) { return f; } };
  target.cells = target.cells.filter((e) => e[R] < at || e[R] >= end).map((e) => { if (e[R] >= end) e[R] -= count; return e; }).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const lines = axis === 'r' ? 'rows' : 'cols';
  target[lines] = target[lines].filter(([i]) => i < at || i >= end).map(([i, p]) => [i >= end ? i - count : i, p]);
  const lo = axis === 'r' ? 'r1' : 'c1', hi = axis === 'r' ? 'r2' : 'c2', fz = axis === 'r' ? 'r' : 'c';
  target.merges = target.merges.filter((m) => m[hi] < at || m[lo] >= end).map((m) => (m[lo] >= end ? { ...m, [lo]: m[lo] - count, [hi]: m[hi] - count } : m));
  if (target.freeze[fz] > at) target.freeze[fz] = Math.max(at, target.freeze[fz] - count);
  for (const so of obj.sheets) {
    for (const e of so.cells) if (e[2].f !== undefined) e[2].f = fix(e[2].f, so.name);
    for (const ch of so.charts || []) ch.range = fix(ch.range, so.name);
    for (const p of so.pivots || []) p.source.ref = fix(p.source.ref, p.source.sheet || so.name);
  }
  for (const d of obj.names || []) d.ref = fix(d.ref, d.scope != null && obj.sheets[d.scope] ? obj.sheets[d.scope].name : '');
  const out = fromNative(obj);
  out.active = wb.active;
  return out;
}
function deleteRows(a) {
  const at = a.from_row - 1, n = Math.min(a.count, MAX_ROWS - at);
  step(() => { S.wb = removeLines(S.wb, S.si, 'r', at, n); S.sel = { r: at, c: 0, er: at, ec: 0 }; });
  return `Deleted row${n === 1 ? ' ' + a.from_row : 's ' + a.from_row + '–' + (at + n)}; the rows below moved up.`;
}
function deleteColumn(a) {
  const c = findColumn(sheet(), a.column, table(sheet()));
  step(() => { S.wb = removeLines(S.wb, S.si, 'c', c, 1); S.sel = { r: 0, c, er: 0, ec: c }; });
  return `Deleted column ${colName(c)}; the columns to its right moved left.`;
}

async function sources() {
  if (window.SlopCmdSources) return window.SlopCmdSources;
  await new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
    { src: new URL('../../../shared/commands/sources.js', import.meta.url).href, onload: res, onerror: () => rej(new Error('Could not load sources.js')) })));
  return window.SlopCmdSources;
}
async function exportWorkbook(a) {
  const blob = a.format === 'csv' ? new Blob([toCsv(sheet())], { type: 'text/csv' }) : a.format === 'stab' ? toBlob(S.wb) : await toXlsx(S.wb);
  const name = fileName(a.name || S.file.name.replace(/\.(stab|xlsx|csv)$/i, '')) + '.' + a.format, out = [];
  if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await (await sources()).put(blob, name, 'tables')})`);
  if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
  return out.join(' and ') + (a.format === 'csv' ? ` (the sheet “${sheet().name}”).` : '.');
}

export const LIST = [
  ['new_workbook', 'New workbook', [Str('name', 'the file name', { maxLength: 100 }), Str('sheet', 'the first sheet\'s name', { maxLength: 31 })], newWorkbook,
    'Start a new, empty workbook in a new tab (the open ones stay as they are).'],
  ['build_table', 'Build a workbook from data', [Str('name', 'the file name', { maxLength: 100 }), Object.assign({}, ROWS, { required: false, description: 'the rows of one sheet; the first row is the header (bold)' }),
    Str('sheet', 'that sheet\'s name', { maxLength: 31 }), { name: 'sheets', type: 'array', maxItems: 50, items: { type: 'object', properties: { name: { type: 'string' }, rows: { type: 'array' }, header: { type: 'boolean' } } }, description: 'or several sheets: [{ name, rows }]' },
    { name: 'header', type: 'boolean', default: true, description: 'make the first row a bold header' }], buildTable,
  'Make a whole workbook in one step from rows of values and formulas (one sheet or several). Opens it in a new tab.'],
  ['set_range', 'Write a block of cells', [Str('start', 'top-left cell, e.g. A1', { maxLength: 12, default: 'A1' }), ROWS], setRange,
    'Write rows of values and formulas into the active sheet from a cell (empty items clear their cell).'],
  ['add_rows', 'Add rows', [ROWS], addRows, 'Append rows under the table on the active sheet.'],
  ['add_sheet', 'Add a sheet', [Str('name', 'the sheet name', { maxLength: 31 }), Object.assign({}, ROWS, { required: false })], addSheet, 'Add a sheet (optionally with rows) and make it active.'],
  ['format_cells', 'Format cells', [Str('range', 'cells such as A1:D1 or B2:B20', { required: true, maxLength: 40 }), { name: 'bold', type: 'boolean' }, { name: 'italic', type: 'boolean' },
    Str('number_format', 'e.g. 0.00, #,##0, 0%, $#,##0.00, yyyy-mm-dd, General', { maxLength: 60 }), { name: 'align', type: 'enum', values: ['left', 'center', 'right'] }], formatCells,
  'Bold, italic, number format and alignment for a range of the active sheet.'],
  ['create_chart', 'Create a chart', [Str('range', 'the data with its header row, e.g. A1:C10', { required: true, maxLength: 60 }), { name: 'type', type: 'enum', options: TYPES, default: 'column' },
    Str('title', 'chart title', { maxLength: 120 }), { name: 'series_in', type: 'enum', options: [['cols', 'columns'], ['rows', 'rows']], default: 'cols' }, { name: 'legend', type: 'boolean', default: true }], createChart,
  'Add a column, bar, line or pie chart of a range on the active sheet.'],
  ['delete_rows', 'Delete rows', [{ name: 'from_row', type: 'number', integer: true, min: 1, max: MAX_ROWS, required: true }, { name: 'count', type: 'number', integer: true, min: 1, max: 100000, default: 1 }], deleteRows,
    'Delete whole rows; the rows below move up and formulas follow.', { destructive: true }],
  ['delete_column', 'Delete a column', [Str('column', 'column letter (B) or header name (Price)', { required: true, maxLength: 100 })], deleteColumn,
    'Delete a whole column; the columns to its right move left and formulas follow.', { destructive: true }],
  ['export_workbook', 'Export the workbook', [{ name: 'format', type: 'enum', values: ['xlsx', 'csv', 'stab'], default: 'xlsx', description: 'csv is the active sheet only' },
    { name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' }, Str('name', 'file name without extension', { maxLength: 100 })], exportWorkbook,
  'Export as Excel (.xlsx), CSV or .stab to Slop Drive (other apps can open it there) and/or as a download.'],
];

/** Closes the tabs the assistant opened after mark (made.length when the checkpoint was taken). */
export function closeMade(mark) {
  const api = tabs.api();
  for (const T of made.splice(mark)) { if (T && T.file) T.file.dirty = false; if (api) api.close(T); }
}
