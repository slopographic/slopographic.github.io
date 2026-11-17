/* Typing into a cell and the formula bar. Both show S.edit: typing in one updates the other.
   Enter/Shift+Enter commit and move down/up, Tab/Shift+Tab commit and move across, Escape cancels,
   clicking elsewhere commits. While a formula is edited, arrows point at cells (point.js). */
import { S, $, sheet, toast, redraw } from './state.js';
import { transact } from './history.js';
import { els, placeEditor, focusGrid } from './grid.js';
import { moveTo } from './nav.js';
import { parseInput } from '../engine/index.js';
import { isFormula, isPointKey, pointKey } from './point.js';
import { t } from '../i18n.js';

/** The text a cell shows when you edit it (formula with "=", text that would parse as a number keeps "'"). */
export function rawText(sh, r, c) {
  const cell = sh.get(r, c);
  if (!cell) return '';
  if (cell.f !== undefined) return '=' + cell.f;
  const v = cell.v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v[0] === '=' || v[0] === "'" || parseInput(v).v !== v ? "'" + v : v;
  if (typeof v === 'number') return String(v);
  return v.code || '';
}

export function init() {
  const ed = els().editor, fx = $('fx');
  ed.addEventListener('input', () => setText(ed.value, ed));
  fx.addEventListener('input', () => setText(fx.value, fx));
  for (const el of [ed, fx]) {
    el.addEventListener('keydown', editKey);
    el.addEventListener('blur', (e) => { const other = el === ed ? fx : ed; if (S.edit && e.relatedTarget !== other) commitEdit(); });
  }
  fx.addEventListener('focus', () => { if (!S.edit) startEdit(null, { focus: fx }); });
}

/** Start editing the active cell. text: replace the content (typed key) or null to keep it. */
export function startEdit(text = null, { focus = null, from = null } = {}) {
  if (S.edit) return;
  const sh = sheet(), { r, c } = S.sel, orig = rawText(sh, r, c);
  const val = text === null ? orig : text;
  S.edit = { r, c, text: val, orig, from: from || (focus && focus.id === 'fx' ? 'bar' : 'cell') };
  const ed = els().editor;
  ed.value = val;
  placeEditor();
  (focus || ed).focus({ preventScroll: true });
  const n = val.length;
  (focus || ed).setSelectionRange(n, n);
  syncBar();
}

function setText(text, from) {
  if (!S.edit) return;
  S.edit.text = text;
  const ed = els().editor, fx = $('fx');
  if (from !== ed) ed.value = text;
  if (from !== fx) fx.value = text;
}

/** Commit the edit, optionally moving the active cell by (dr, dc) afterwards. False if the entry was refused. */
export function commitEdit(dr = 0, dc = 0) {
  const e = S.edit;
  if (!e) return true;
  if (e.text !== e.orig) {
    try { transact(() => S.wb.input(sheet(), e.r, e.c, e.text)); }
    catch (err) { toast(err.message ? ('pos' in err ? t('tables.toast.bad_formula', { error: err.message }) : err.message) : t('tables.toast.invalid_entry')); (e.from === 'bar' ? $('fx') : els().editor).focus(); return false; }
  }
  S.edit = null;
  if (dr || dc) moveTo(e.r + dr, e.c + dc);
  focusGrid();
  redraw();
  return true;
}

export function cancelEdit() {
  S.edit = null;
  focusGrid();
  redraw();
}

/** Show the active cell's text in the formula bar (unless the bar has focus). */
export function syncBar() {
  const fx = $('fx');
  if (document.activeElement === fx) return;
  fx.value = S.edit ? S.edit.text : rawText(sheet(), S.sel.r, S.sel.c);
}

function editKey(e) {
  const from = S.edit ? S.edit.from : 'cell';
  const formula = S.edit && S.edit.text[0] === '=';
  if (formula && isPointKey(e.key)) { e.preventDefault(); pointKey(e); e.stopPropagation(); return; }
  if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.shiftKey ? -1 : 1, 0); }
  else if (e.key === 'Tab') { e.preventDefault(); commitEdit(0, e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && from === 'cell' && !formula) { e.preventDefault(); commitEdit(e.key === 'ArrowUp' ? -1 : 1, 0); }
  else return;
  e.stopPropagation();
}
