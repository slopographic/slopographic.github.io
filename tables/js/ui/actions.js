/* Cell actions: styles, clearing, copy/cut/paste, freeze panes and selection statistics.
   Each change is one undo step. */
import { S, sheet, range, redraw, toast } from './state.js';
import { transact } from './history.js';
import { effStyle } from './grid.js';
import { parseCsv } from '../io/csv.js';
import { pasteBuffer } from './buffer.js';
import { format } from '../engine/index.js';
import { MAX_ROWS, MAX_COLS } from '../engine/refs.js';
import { t } from '../i18n.js';

const WHOLE_ROWS = (r1, r2) => r1 === 0 && r2 === MAX_ROWS - 1;
const WHOLE_COLS = (c1, c2) => c1 === 0 && c2 === MAX_COLS - 1;

/** Merge a style patch into every cell of the selection (or the whole columns/rows selected). */
export function applyStyle(patch) {
  const { r1, c1, r2, c2 } = range(), sh = sheet(), wb = S.wb;
  transact(() => wb.batch(() => {
    if (WHOLE_ROWS(r1, r2) && !WHOLE_COLS(c1, c2)) {
      for (let c = c1; c <= c2; c++) { const p = sh.colProp(c); p.s = wb.patchStyle(p.s, patch); }
    } else if (WHOLE_COLS(c1, c2) && !WHOLE_ROWS(r1, r2)) {
      for (let r = r1; r <= r2; r++) { const p = sh.rowProp(r); p.s = wb.patchStyle(p.s, patch); }
    } else if (((r2 - r1 + 1) * (c2 - c1 + 1)) <= 20000) {
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const cell = sh.ensure(r, c); cell.s = wb.patchStyle(cell.s, patch); }
    } else sh.eachIn(r1, c1, r2, c2, (r, c, cell) => { cell.s = wb.patchStyle(cell.s, patch); });
  }));
  redraw();
}

/** Style of the active cell, as it displays. */
export function activeStyle() { const sh = sheet(), { r, c } = S.sel; return effStyle(sh, r, c, sh.get(r, c)); }
export function toggleStyle(key) { applyStyle({ [key]: !activeStyle()[key] }); }
export function setFormat(code) { applyStyle({ nf: code === 'General' ? undefined : code }); }

export function clearRange(what = 'contents') {
  const { r1, c1, r2, c2 } = range();
  transact(() => S.wb.clear(sheet(), r1, c1, r2, c2, what));
  redraw();
}

const COPY_LIMIT = 200000;
const sizeOk = () => { const { r1, c1, r2, c2 } = range(); if ((r2 - r1 + 1) * (c2 - c1 + 1) <= COPY_LIMIT) return true; toast(t('tables.toast.copy_too_large')); return false; };

/** Copy the selection to the internal clipboard and to the system clipboard (or the given DataTransfer). */
export function copySel(cut = false, dt = null) {
  if (!sizeOk()) return;
  const { r1, c1, r2, c2 } = range(), sh = sheet(), cells = [], lines = [];
  for (let r = r1; r <= r2; r++) {
    const row = [], texts = [];
    for (let c = c1; c <= c2; c++) {
      const cell = sh.get(r, c);
      row.push(cell ? { f: cell.f, v: cell.v, s: cell.s, fh: cell.fh } : null);
      const v = sh.value(r, c);
      texts.push(v === null || v === undefined ? '' : format(v, S.wb.style(cell && cell.s).nf || (cell && cell.fh) || undefined).text);
    }
    cells.push(row); lines.push(texts.join('\t'));
  }
  const text = lines.join('\n');
  S.clip = { r1, c1, cells, text, cut };
  if (dt) dt.setData('text/plain', text);
  else if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  if (cut) clearRange('all');
  redraw();
}

/** Paste from the browser clipboard text. Our own copy is pasted with its formulas shifted. */
export function paste(text) {
  if (S.clip && (text === undefined || text === S.clip.text)) return pasteClip();
  if (pasteBuffer()) return;
  if (text) pasteTsv(text);
}

function pasteClip() {
  const clip = S.clip, sh = sheet(), wb = S.wb, { r, c } = S.sel;
  const dr = r - clip.r1, dc = c - clip.c1, h = clip.cells.length, w = h ? clip.cells[0].length : 0;
  transact(() => wb.batch(() => {
    clip.cells.forEach((row, i) => row.forEach((cell, j) => {
      const tr = r + i, tc = c + j;
      if (!cell) { wb.clear(sh, tr, tc, tr, tc, 'all'); return; }
      if (cell.f !== undefined) wb.setFormula(sh, tr, tc, wb.shiftFormula(cell.f, dr, dc), { lenient: true });
      else wb.setValue(sh, tr, tc, cell.v ?? null);
      sh.ensure(tr, tc).s = cell.s || 0;
    }));
  }));
  S.sel = { r, c, er: r + h - 1, ec: c + w - 1 };
  if (clip.cut) S.clip = null;
  redraw();
}

function pasteTsv(text) {
  const rows = parseCsv(text, '\t'), sh = sheet(), { r, c } = S.sel;
  transact(() => S.wb.batch(() => rows.forEach((row, i) => row.forEach((v, j) => S.wb.input(sh, r + i, c + j, v)))));
  S.sel = { r, c, er: r + rows.length - 1, ec: c + Math.max(0, ...rows.map((x) => x.length)) - 1 };
  redraw();
}

export function freezeAt(at = S.sel) { transact(() => { sheet().freeze = { r: at.r, c: at.c }; }); redraw(); }
export function unfreeze() { transact(() => { sheet().freeze = { r: 0, c: 0 }; }); redraw(); }

export function selectAll() { S.sel = { r: 0, c: 0, er: MAX_ROWS - 1, ec: MAX_COLS - 1 }; redraw(); }

/** Count, sum and average of the selection (numbers only for sum and average). Null for one cell. */
export function stats() {
  const { r1, c1, r2, c2 } = range();
  if (r1 === r2 && c1 === c2) return null;
  const sh = sheet();
  let count = 0, sum = 0, nums = 0;
  sh.eachIn(r1, c1, r2, c2, (r, c) => {
    const v = sh.value(r, c);
    if (v === null || v === undefined) return;
    count++;
    if (typeof v === 'number') { sum += v; nums++; }
  });
  return { count, sum, avg: nums ? sum / nums : 0, nums };
}

/** Copy, cut and paste from the browser (keyboard and menus). Typing in fields keeps their own clipboard. */
export function bindClipboard() {
  const field = (node) => node && node.closest && node.closest('input, textarea, select, [contenteditable="true"]');
  document.addEventListener('copy', (e) => { if (S.edit || field(e.target)) return; e.preventDefault(); copySel(false, e.clipboardData); });
  document.addEventListener('cut', (e) => { if (S.edit || field(e.target)) return; e.preventDefault(); copySel(true, e.clipboardData); });
  // A pasted spreadsheet file is the intake's (ui/drop.js), which takes it first; this is pasted cells and text.
  document.addEventListener('paste', (e) => { // intake-ok: cells and text pasted into the grid
    if (e.defaultPrevented || S.edit || field(e.target)) return;
    e.preventDefault();
    paste(e.clipboardData ? e.clipboardData.getData('text/plain') : undefined);
  });
}

/* Whole rows and columns: select one, hide or show them (the header menus). */
export function selectLine(axis, i) {
  S.sel = axis === 'row' ? { r: i, c: 0, er: i, ec: MAX_COLS - 1 } : { r: 0, c: i, er: MAX_ROWS - 1, ec: i };
  redraw();
}
export function setHidden(axis, a, b, hidden) {
  transact(() => {
    const sh = sheet();
    for (let i = a; i <= b; i++) {
      const o = axis === 'row' ? sh.rowProp(i) : sh.colProp(i);
      if (hidden) o.hidden = true; else delete o.hidden;
    }
  });
  redraw();
}
export const hasHidden = () => { const sh = sheet(); return [...sh.rows.values(), ...sh.cols.values()].some((o) => o && o.hidden); };
export function showAll() {
  transact(() => { const sh = sheet(); for (const o of [...sh.rows.values(), ...sh.cols.values()]) delete o.hidden; });
  redraw();
}
