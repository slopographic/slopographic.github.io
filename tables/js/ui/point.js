/* Point mode, like Excel: while a formula is being edited (its text starts with "="), arrow keys insert a cell
   reference at the caret instead of moving it; Shift+arrow makes a range (A1:B3); a click on a cell inserts its
   address. The reference just inserted stays live, so the next arrow replaces it, until the caret moves or the text
   changes (typing an operator returns to normal typing, so the next arrow inserts a new reference). */
import { S, $ } from './state.js';
import { els } from './grid.js';
import { addr } from '../engine/refs.js';
import { clampR, clampC } from './nav.js';

const STEP = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

export const isFormula = () => !!S.edit && S.edit.text[0] === '=';
export const isPointKey = (key) => key in STEP;

/** The field that holds the caret: the formula bar when it has focus, else the in-cell editor. */
const field = () => (document.activeElement === $('fx') ? $('fx') : els().editor);

/** The reference text for an anchor and a cursor: one address, or top-left:bottom-right for a range. */
function refText(ar, ac, cr, cc) {
  const r1 = Math.min(ar, cr), r2 = Math.max(ar, cr), c1 = Math.min(ac, cc), c2 = Math.max(ac, cc);
  return r1 === r2 && c1 === c2 ? addr(r1, c1) : addr(r1, c1) + ':' + addr(r2, c2);
}

/** True while the last inserted reference is still at the caret and unchanged (so the next arrow replaces it). */
function live(el) {
  const p = S.edit.pt;
  return !!p && el.selectionStart === p.end && el.selectionEnd === p.end && el.value.slice(p.start, p.end) === p.text;
}

/** Replaces [start, end) of the field with text, puts the caret after it and keeps the editor and bar in step. */
function put(el, start, end, text, pt) {
  const v = el.value.slice(0, start) + text + el.value.slice(end), pos = start + text.length;
  el.value = v;
  el.setSelectionRange(pos, pos);
  S.edit.text = v;
  const other = el === $('fx') ? els().editor : $('fx');
  other.value = v;
  S.edit.pt = { ...pt, start, end: pos, text };
}

/** An arrow key while editing a formula: move the reference cursor and insert its reference. */
export function pointKey(e) {
  const el = field(), on = live(el), p = S.edit.pt, base = { r: S.edit.r, c: S.edit.c };
  const from = on ? { r: p.cr, c: p.cc } : base;
  const [dr, dc] = STEP[e.key];
  const cr = clampR(from.r + dr), cc = clampC(from.c + dc);
  const anchor = e.shiftKey ? (on ? { r: p.ar, c: p.ac } : base) : { r: cr, c: cc };
  const pt = { ar: anchor.r, ac: anchor.c, cr, cc };
  const text = refText(pt.ar, pt.ac, cr, cc);
  if (on) put(el, p.start, p.end, text, pt);
  else put(el, el.selectionStart, el.selectionEnd, text, pt);
}

/** A click on a cell while editing a formula: insert that cell's address (replacing a live reference). */
export function pointClick(r, c) {
  const el = field(), on = live(el), p = S.edit.pt;
  if (on) put(el, p.start, p.end, addr(r, c), { ar: r, ac: c, cr: r, cc: c });
  else put(el, el.selectionStart, el.selectionEnd, addr(r, c), { ar: r, ac: c, cr: r, cc: c });
}

/** Mouse down on the grid while editing a formula: keep the focus in the editor so clicking a cell does not commit. */
export function guardFocus(e) {
  if (isFormula() && !e.target.closest('.colhead, .rowhead, .corner')) e.preventDefault();
}
