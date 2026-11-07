/* Slop Tables for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), so the Slop AI
   panel can sort, filter, add columns and write formulas ("total = price × qty" → add_column Total, fill_column
   Total =B2*C2). Loaded on demand by SlopCmd.prepare() (commands.js); also gives the state summary and the checkpoint.
   Each command is one undo step in the workbook's own history. Hidden from the palette: they are for the assistant.
   The commands that make workbooks, write blocks of cells, format, chart, delete and export are in ai-create.js. */
import { S, sheet, range, redraw } from './state.js';
import { transact, undo, canUndo } from './history.js';
import { toNative, fromNative } from '../io/native.js';
import { colName, addr, rangeText, MAX_ROWS } from '../engine/refs.js';
import { isErr } from '../engine/values.js';
import * as O from './ai-ops.js';
import { LIST as CREATE, made, closeMade } from './ai-create.js';
import { tabs } from './tabs.js';

const Str = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 500, description }, extra);
const Num = (name, min, max, def, description) => ({ name, type: 'number', integer: true, min, max, default: def, description });
const COL = (d) => Str('column', d || 'column letter (B) or header name (Price)', { required: true, maxLength: 100 });
const show = (v) => (v === null || v === undefined ? '' : isErr(v) ? v.code : typeof v === 'number' ? String(+v.toPrecision(12)) : String(v));
const label = (sh, t, c) => { const h = t ? show(sh.value(t.r1, c)) : ''; return colName(c) + (h ? ` (${h})` : ''); };

/** The table of the active sheet, or a plain error when there is nothing to work on. */
function need(rows = 1) {
  const sh = sheet(), t = O.table(sh);
  if (!t || t.r2 - t.r1 < rows) throw new Error(rows ? 'The sheet has no data rows below a header row' : 'The sheet is empty');
  return { sh, t };
}
/** Run fn as one undo step and repaint. */
const step = (fn) => { const out = transact(fn); redraw(); return out; };

function sortColumn(a) {
  const { sh, t } = need(1), c = O.findColumn(sh, a.column, t), desc = a.order === 'descending';
  if (c < t.c1 || c > t.c2) throw new Error(`Column ${colName(c)} is outside the table (${rangeText(t.r1, t.c1, t.r2, t.c2)})`);
  const n = step(() => O.sortRows(S.wb, sh, t, c, desc));
  const what = `${t.r2 - t.r1} rows by ${label(sh, t, c)}, ${desc ? 'largest/Z first' : 'smallest/A first'}`;
  return n ? `Sorted ${what}.` : `Already in order: ${what}.`;
}

function filterRows(a) {
  const { sh, t } = need(1), c = O.findColumn(sh, a.column, t);
  const res = step(() => O.filterRows(S.wb, sh, t, c, a.condition, a.value));
  const cond = a.condition.replace(/_/g, ' ') + (a.value != null && a.value !== '' && !/blank/.test(a.condition) ? ' ' + a.value : '');
  return `Filter ${label(sh, t, c)} ${cond}: showing ${res.shown} of ${res.total} rows.`;
}

function clearFilter() {
  const sh = sheet();
  const n = step(() => O.clearFilter(sh));
  return n ? `Showing all rows again (${n} were hidden by a filter).` : 'No filter was on.';
}

function addColumn(a) {
  const sh = sheet(), t = O.table(sh), name = String(a.name || '').trim();
  const pos = String(a.position || '').trim();
  let at;
  if (!pos || /^(end|last|right|after)$/i.test(pos)) at = t ? t.c2 + 1 : 0;
  else if (/^(start|first|left|before)$/i.test(pos)) at = t ? t.c1 : 0;
  else at = O.findColumn(sh, pos, t);
  const hr = t ? t.r1 : 0;
  step(() => {
    if (t && at <= t.c2) S.wb = O.insertColumn(S.wb, S.si, at);
    const nsh = sheet();
    if (name) S.wb.input(nsh, hr, at, name.startsWith('=') ? "'" + name : name);
    if (a.width && a.width !== nsh.defW) nsh.colProp(at).w = a.width;
    const hs = t && at > 0 && nsh.get(hr, at - 1);
    if (hs && hs.s && nsh.get(hr, at)) nsh.get(hr, at).s = hs.s; // the header looks like its neighbour
    S.sel = { r: hr, c: at, er: hr, ec: at };
  });
  return `Added column ${colName(at)}${name ? ` “${name}”` : ''}${t && at <= t.c2 ? ', moving the columns from there one to the right' : ''}.`;
}

function fillColumn(a) {
  const { sh, t } = need(0), c = O.findColumn(sh, a.column, t);
  const r1 = (a.from_row || t.r1 + 2) - 1, r2 = (a.to_row || t.r2 + 1) - 1;
  if (r2 < r1) throw new Error(`to_row ${r2 + 1} is above from_row ${r1 + 1}`);
  if (r2 - r1 >= 100000) throw new Error('That is more than 100,000 rows; give from_row and to_row');
  step(() => O.fillColumn(S.wb, sh, c, r1, r2, a.formula));
  const top = sheet().value(r1, c);
  return `Filled ${addr(r1, c)}:${addr(r2, c)} (${r2 - r1 + 1} cells) with ${a.formula}; ${addr(r1, c)} is ${show(top) || 'empty'}.`;
}

function setCell(a) {
  const p = O.cellAt(a.cell), sh = sheet(), text = a.value == null ? '' : String(a.value);
  step(() => {
    if (text.startsWith('=')) S.wb.setFormula(sh, p.r, p.c, text); // a syntax error throws before anything changes
    else S.wb.input(sh, p.r, p.c, text);
  });
  const v = sheet().value(p.r, p.c);
  return text ? `${addr(p.r, p.c)} = ${text}${text.startsWith('=') ? ' → ' + show(v) : ''}.` : `Cleared ${addr(p.r, p.c)}.`;
}

function undoSteps(a) {
  let n = 0;
  while (n < a.steps && canUndo()) { undo(); n++; }
  redraw();
  return `Undid ${n} step${n === 1 ? '' : 's'}.`;
}

const LIST = [
  ['sort_column', 'Sort by a column', [COL('column to sort by'), { name: 'order', type: 'enum', values: ['ascending', 'descending'], default: 'ascending', description: 'ascending is A→Z and smallest first' }],
    sortColumn, 'Sort the rows of the table on the active sheet by one column. The first row is the header row and stays on top.'],
  ['filter_rows', 'Filter rows', [COL('column to test'), { name: 'condition', type: 'enum', values: O.OPS, default: 'equals' }, Str('value', 'value to compare with (not needed for is_blank and not_blank)', { maxLength: 200 })],
    filterRows, 'Hide the data rows that do not match. Several filters combine (all must match); clear_filter shows every row again.'],
  ['clear_filter', 'Clear filter', [], clearFilter, 'Show all rows hidden by filters on the active sheet.'],
  ['add_column', 'Add a column', [Str('name', 'header text for the new column', { maxLength: 200 }), Str('position', 'insert before this column (letter or header name); empty or "end" adds it after the last column', { maxLength: 100 }), Num('width', 30, 600, 100, 'px')],
    addColumn, 'Insert a column with a header. Formulas, charts and pivots that point past it move with their cells.'],
  ['fill_column', 'Fill a column', [COL('column to fill'), Str('formula', 'formula for the first row, such as =B2*C2 (relative references move down); text without = is copied as is', { required: true }),
    Num('from_row', 1, MAX_ROWS, undefined, 'first row number; default the first row under the header'), Num('to_row', 1, MAX_ROWS, undefined, 'last row number; default the last row of the table')],
  fillColumn, 'Write a formula down a column, one per row, like dragging the fill handle.'],
  ['set_cell', 'Set a cell', [Str('cell', 'cell reference such as B7', { required: true, maxLength: 12 }), Str('value', 'what to type: a number, text, a date or a formula starting with =; empty clears the cell')],
    setCell, 'Type a value or a formula into one cell of the active sheet.'],
  ['undo', 'Undo', [Num('steps', 1, 20, 1, 'how many steps')], undoSteps, 'Undo the last changes in the workbook.'],
];

/** The workbook in a few lines for the assistant. */
export function state() {
  if (!S.wb) return { app: 'tables', open: false };
  const sh = sheet(), t = O.table(sh), r = range(), cell = sh.get(S.sel.r, S.sel.c);
  return {
    app: 'tables', file: S.file.name, unsaved: !!S.file.dirty,
    sheets: S.wb.sheets.map((s) => s.name), active_sheet: sh.name,
    table: t ? { range: rangeText(t.r1, t.c1, t.r2, t.c2), header_row: t.r1 + 1, data_rows: t.r2 - t.r1, columns: t.c2 - t.c1 + 1 } : null,
    columns: O.headers(sh, t).slice(0, 40).map((h) => ({ col: h.col, name: h.name })),
    selection: rangeText(r.r1, r.c1, r.r2, r.c2),
    active_cell: { ref: addr(S.sel.r, S.sel.c), value: show(sh.value(S.sel.r, S.sel.c)), ...(cell && cell.f ? { formula: '=' + cell.f } : {}) },
    filtered_rows: O.filteredCount(sh), can_undo: canUndo(),
  };
}

/** A function that puts the open workbook back to this moment (as one more undo step), or false when another
    workbook tab is open by then. */
export function checkpoint() {
  if (!S.wb) return () => false;
  const hist = S.hist, json = JSON.stringify(toNative(S.wb)), si = S.si, sel = { ...S.sel }, mark = made.length, T0 = tabs.current();
  return () => {
    closeMade(mark);
    if (S.hist !== hist && T0 && tabs.api()) tabs.api().activate(T0);
    if (S.hist !== hist) return false;
    step(() => { S.wb = fromNative(JSON.parse(json)); S.si = Math.min(si, S.wb.sheets.length - 1); S.sel = { ...sel }; S.edit = null; });
    return true;
  };
}

/** What the AI panel's ready-made prompts fill in (shared/ai/quick/context.js): the file, the sheet, the selected range
    and its cells as tab-separated text (at most 50 rows of 20 columns). */
export function context() {
  if (!S.wb) return { document: null };
  const sh = sheet(), r = range(), rows = [];
  for (let i = r.r1; i <= Math.min(r.r2, r.r1 + 49); i++) {
    const row = [];
    for (let j = r.c1; j <= Math.min(r.c2, r.c1 + 19); j++) row.push(show(sh.value(i, j)));
    rows.push(row.join('\t'));
  }
  return { document: S.file.name, sheet: sh.name, range: rangeText(r.r1, r.c1, r.r2, r.c2), selection: rows.join('\n').trim() };
}

let done = false;
/** Register the commands and the state provider with SlopCmd (once). */
export function register() {
  const C = window.SlopCmd;
  if (done || !C || !C.register) return;
  done = true;
  const defaults = (args) => (window.SlopCmdArgs ? window.SlopCmdArgs.defaults(args) : {});
  C.register(LIST.concat(CREATE).map(([tool, title, args, fn, description, extra]) => Object.assign({
    id: 'tables.ai.' + tool.replace(/_/g, '-'), tool, title, group: 'AI', hidden: true, destructive: false, description, args,
    when: () => !!S.wb && !S.edit, run: (a) => fn(a || defaults(args)),
  }, extra || {})));
  C.provide({ state, checkpoint, context });
}
