/* Slop Tables grid. Only the cells, headers and selection that are on screen are in the DOM. Frozen rows
   and columns stay in place; the rest scrolls inside #vp, whose sizer only provides the scrollbars.
   Every position is computed by metrics(), which pointer.js uses for hit-testing too. */
import { S, $, sheet, range } from './state.js';
import { axesFor } from './layout.js';
import { format } from '../engine/index.js';
import { colName, MAX_ROWS, MAX_COLS } from '../engine/refs.js';
import { FErr } from '../engine/values.js';

export const HEAD_W = 46, HEAD_H = 22;
let E = null;
export const els = () => E;

export function init() {
  E = { grid: $('grid'), vp: $('vp'), sizer: $('sizer'), colhead: $('colhead'), rowhead: $('rowhead'),
    cells: $('cells'), selrect: $('selrect'), cursor: $('cursor'), editor: $('editor'), knob: $('selknob') };
}

/** Geometry for the current scroll position. X(c), Y(r): left/top of a cell inside the plane. */
export function metrics() {
  const sh = sheet(), { R, C } = axesFor(sh);
  const vp = E.vp, W = vp.clientWidth, H = vp.clientHeight;
  const fr = sh.freeze.r, fc = sh.freeze.c;
  const fzW = C.top(fc), fzH = R.top(fr);
  const sxE = Math.max(vp.scrollLeft, fzW), syE = Math.max(vp.scrollTop, fzH);
  return {
    sh, R, C, W, H, fr, fc, fzW, fzH, sxE, syE,
    X: (c) => (c < fc ? C.top(c) : fzW + C.top(c) - sxE),
    Y: (r) => (r < fr ? R.top(r) : fzH + R.top(r) - syE),
    colAt: (px) => Math.min(MAX_COLS - 1, px < fzW ? C.at(px) : C.at(px - fzW + sxE)),
    rowAt: (py) => Math.min(MAX_ROWS - 1, py < fzH ? R.at(py) : R.at(py - fzH + syE)),
  };
}

/** Index ranges [from, to) that are on screen: frozen ones always, the rest from the scroll position. */
function visible(m) {
  return {
    cols: [[0, m.fc], [Math.max(m.fc, m.C.at(m.sxE)), Math.min(MAX_COLS, m.C.at(m.sxE + m.W - m.fzW) + 1)]],
    rows: [[0, m.fr], [Math.max(m.fr, m.R.at(m.syE)), Math.min(MAX_ROWS, m.R.at(m.syE + m.H - m.fzH) + 1)]],
  };
}

/** Style of a cell: column and row styles under the cell's own style. */
export function effStyle(sh, r, c, cell) {
  const wb = S.wb;
  return { ...wb.style(sh.cols.get(c)?.s), ...wb.style(sh.rows.get(r)?.s), ...wb.style(cell ? cell.s : 0) };
}

function cellDiv(m, r, c, cell, v) {
  const sh = m.sh, mg = sh.mergeAt(r, c);
  if (mg && (mg.r1 !== r || mg.c1 !== c)) return null;
  const st = effStyle(sh, r, c, cell);
  const f = format(v, st.nf || (cell && cell.fh) || undefined);
  const w = mg ? m.C.top(mg.c2 + 1) - m.C.top(mg.c1) : m.C.size(c);
  const h = mg ? m.R.top(mg.r2 + 1) - m.R.top(mg.r1) : m.R.size(r);
  const d = document.createElement('div');
  const err = v instanceof FErr;
  const align = st.al || (typeof v === 'number' ? 'r' : err || typeof v === 'boolean' ? 'c' : 'l');
  d.className = 'cell a-' + align + (st.b ? ' b' : '') + (st.i ? ' i' : '') + (err || f.err ? ' err' : '');
  d.style.cssText = `left:${m.X(c)}px;top:${m.Y(r)}px;width:${w}px;height:${h}px;line-height:${h - 1}px`;
  if (f.color) d.style.color = f.color;
  d.dataset.rc = r + ',' + c;
  d.textContent = f.text;
  return d;
}

/** Repaint the grid: cells, headers, selection, editor position. */
export function render() {
  const m = metrics(), sh = m.sh, vis = visible(m), rg = range();
  E.sizer.style.width = m.C.total + 'px';
  E.sizer.style.height = m.R.total + 'px';
  const frag = document.createDocumentFragment();
  for (const [ra, rb] of vis.rows) for (let r = ra; r < rb; r++) {
    if (!m.R.size(r)) continue;
    for (const [ca, cb] of vis.cols) for (let c = ca; c < cb; c++) {
      if (!m.C.size(c)) continue;
      const cell = sh.get(r, c), v = sh.value(r, c);
      if (v === null || v === undefined) continue;
      const d = cellDiv(m, r, c, cell, v);
      if (d) frag.append(d);
    }
  }
  E.cells.replaceChildren(frag);
  const hc = document.createDocumentFragment(), hr = document.createDocumentFragment();
  for (const [ca, cb] of vis.cols) for (let c = ca; c < cb; c++) {
    if (!m.C.size(c)) continue;
    const d = document.createElement('div');
    d.className = 'ch' + (c >= rg.c1 && c <= rg.c2 ? ' on' : '');
    d.style.cssText = `left:${m.X(c)}px;width:${m.C.size(c)}px`;
    d.dataset.c = c; d.textContent = colName(c);
    hc.append(d);
  }
  for (const [ra, rb] of vis.rows) for (let r = ra; r < rb; r++) {
    if (!m.R.size(r)) continue;
    const d = document.createElement('div');
    d.className = 'rh' + (r >= rg.r1 && r <= rg.r2 ? ' on' : '');
    d.style.cssText = `top:${m.Y(r)}px;height:${m.R.size(r)}px`;
    d.dataset.r = r; d.textContent = r + 1;
    hr.append(d);
  }
  E.colhead.replaceChildren(hc);
  E.rowhead.replaceChildren(hr);
  placeSelection(m, rg);
}

function placeSelection(m, rg) {
  const x1 = m.X(rg.c1), y1 = m.Y(rg.r1), x2 = m.X(rg.c2 + 1), y2 = m.Y(rg.r2 + 1);
  E.selrect.hidden = rg.r1 === rg.r2 && rg.c1 === rg.c2;
  E.selrect.style.cssText = `left:${x1}px;top:${y1}px;width:${x2 - x1}px;height:${y2 - y1}px`;
  const { r, c } = S.sel;
  E.cursor.style.cssText = `left:${m.X(c)}px;top:${m.Y(r)}px;width:${m.C.size(c)}px;height:${m.R.size(r)}px`;
  if (E.knob) { E.knob.style.left = x2 + 'px'; E.knob.style.top = y2 + 'px'; E.knob.hidden = !!S.edit; } // the finger's selection knob (pointer.js)
  placeEditor(m);
}

/** Position the in-cell editor over its cell (or hide it). Synchronous, so it can take focus at once. */
export function placeEditor(m = metrics()) {
  const ed = E.editor;
  if (!S.edit) { ed.style.visibility = 'hidden'; return; }
  const { r, c } = S.edit;
  const w = Math.max(m.C.size(c), 120), h = Math.max(m.R.size(r), 20);
  ed.style.cssText = `left:${m.X(c)}px;top:${m.Y(r)}px;width:${w}px;height:${h}px;visibility:visible`;
}

export function focusGrid() { E.grid.focus({ preventScroll: true }); }

/** Scroll the minimum needed so cell (r, c) is on screen (frozen cells never need it). */
export function ensureVisible(r, c) {
  const m = metrics(), vp = E.vp;
  if (r >= m.fr) {
    const top = m.R.top(r), bot = top + m.R.size(r), span = m.H - m.fzH;
    if (top < m.syE) vp.scrollTop = top;
    else if (bot > m.syE + span) vp.scrollTop = bot - span;
  }
  if (c >= m.fc) {
    const left = m.C.top(c), right = left + m.C.size(c), span = m.W - m.fzW;
    if (left < m.sxE) vp.scrollLeft = left;
    else if (right > m.sxE + span) vp.scrollLeft = right - span;
  }
}
