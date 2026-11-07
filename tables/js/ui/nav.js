/* Moving the active cell and the selection. */
import { S, sheet } from './state.js';
import { ensureVisible } from './grid.js';
import { MAX_ROWS, MAX_COLS } from '../engine/refs.js';

export const clampR = (r) => Math.max(0, Math.min(MAX_ROWS - 1, r));
export const clampC = (c) => Math.max(0, Math.min(MAX_COLS - 1, c));

/** Make (r, c) the active cell, or move the far corner of the selection to it when extend is true. */
export function moveTo(r, c, extend = false) {
  r = clampR(r); c = clampC(c);
  if (extend) { S.sel.er = r; S.sel.ec = c; }
  else S.sel = { r, c, er: r, ec: c };
  ensureVisible(r, c);
}

const filled = (sh, r, c) => { const v = sh.value(r, c); return v !== null && v !== undefined; };
/** Ctrl+arrow target from (r, c): the next filled cell, or the edge of a run of filled cells (Excel rules). */
export function jumpEdge(r, c, dr, dc) {
  const sh = sheet(), inB = (y, x) => y >= 0 && x >= 0 && y < MAX_ROWS && x < MAX_COLS;
  let y = r + dr, x = c + dc;
  if (!inB(y, x)) return [r, c];
  if (filled(sh, r, c) && filled(sh, y, x)) {
    while (inB(y + dr, x + dc) && filled(sh, y + dr, x + dc)) { y += dr; x += dc; }
    return [y, x];
  }
  while (inB(y, x) && !filled(sh, y, x)) { y += dr; x += dc; }
  return [clampR(y), clampC(x)];
}
