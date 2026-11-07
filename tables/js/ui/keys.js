/* Keyboard on the grid: arrows (Ctrl jumps to the edge of the data, Shift extends the selection),
   Home/End, PageUp/PageDown, Enter/Tab, F2, Delete, and typing to start a cell edit. Ctrl/⌘ shortcuts
   go to SlopCmd when it is loaded, otherwise to commands.js. */
import { S, sheet, redraw } from './state.js';
import { metrics } from './grid.js';
import { startEdit } from './editor.js';
import { moveTo, jumpEdge } from './nav.js';
import { clearRange } from './actions.js';
import { runShortcut } from './commands.js';
import { onKey as chartKey } from './charts.js';

const STEP = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

export function init() { document.addEventListener('keydown', onKey); }

function onKey(e) {
  if (S.edit || e.isComposing) return;
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (document.querySelector('.sui-back, .sui-menu')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod && chartKey(e)) return;
  if (mod && !window.SlopCmd && runShortcut(e)) { e.preventDefault(); return; }
  const shift = e.shiftKey, sel = S.sel;
  if (STEP[e.key]) {
    e.preventDefault();
    const [dr, dc] = STEP[e.key], [br, bc] = shift ? [sel.er, sel.ec] : [sel.r, sel.c];
    const [r, c] = mod ? jumpEdge(br, bc, dr, dc) : [br + dr, bc + dc];
    moveTo(r, c, shift);
  } else if (e.key === 'Home') {
    e.preventDefault();
    if (mod) moveTo(0, 0, shift); else moveTo(shift ? sel.er : sel.r, 0, shift);
  } else if (e.key === 'End') {
    e.preventDefault();
    const u = sheet().usedRange(false);
    if (mod) { if (u) moveTo(u.r2, u.c2, shift); } else moveTo(shift ? sel.er : sel.r, u ? u.c2 : 0, shift);
  } else if (e.key === 'PageDown' || e.key === 'PageUp') {
    e.preventDefault();
    const m = metrics(), rows = Math.max(1, Math.floor(m.H / m.sh.defH) - 1), dir = e.key === 'PageDown' ? 1 : -1;
    moveTo(sel.r + dir * rows, sel.c, shift);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    moveTo(sel.r + (shift ? -1 : 1), sel.c);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    moveTo(sel.r, sel.c + (shift ? -1 : 1));
  } else if (e.key === 'F2') {
    e.preventDefault();
    startEdit(null);
    return;
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    clearRange('contents');
    return;
  } else if (e.key.length === 1 && !mod && !e.altKey) {
    e.preventDefault();
    startEdit(e.key);
    return;
  } else return;
  redraw();
}

