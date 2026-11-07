/* Mouse, finger and pen on the grid: click to select, drag to extend, Shift+click, double-click to edit, click column or
   row headers to select them (drag to select more), drag header edges to resize, click the corner to
   select everything. A finger is as on a phone's spreadsheet: a tap selects, a drag on the cells scrolls them (#vp
   scrolls natively), the knob at the selection's corner (#selknob) extends it, a double tap edits, a long press is
   the cell menu (the shared touch layer sends contextmenu), and the header edges grab from further away. The
   headers and the knob are touch surfaces (data-touch-surface in index.html), so their drags are never a scroll. */
import { S, redraw } from './state.js';
import { els, metrics, HEAD_W, HEAD_H } from './grid.js';
import { beginStep, commitStep } from './history.js';
import { startEdit, commitEdit } from './editor.js';
import { isFormula, pointClick, guardFocus } from './point.js';
import { clampR, clampC } from './nav.js';
import { MAX_ROWS, MAX_COLS } from '../engine/refs.js';

const EDGE = 4, TOUCH_EDGE = 12;   // px either side of a header edge that grab it, for a mouse and for a finger
const DOUBLE_MS = 400;
let drag = null, lastTap = null, press = null;   // lastTap: a finger's last tap on a cell { t, r, c }; press: its press now

export function init() {
  const g = els().grid;
  g.addEventListener('pointerdown', down);
  g.addEventListener('mousedown', guardFocus); // touch-ok: only keeps the focus in the formula being typed (browsers send it after a tap too)
  g.addEventListener('pointermove', hover);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  addEventListener('contextmenu', () => { press = null; }, true);   // a long press opened the cell menu: no tap
}

const local = (e) => { const b = els().grid.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };

/** What is under a point (grid-relative). Plane coordinates are offset by the headers. */
function locate(x, y, edge = EDGE) {
  const m = metrics();
  if (x < HEAD_W && y < HEAD_H) return { kind: 'corner' };
  if (y < HEAD_H) {
    const px = x - HEAD_W, c = m.colAt(px);
    if (c > 0 && px - m.X(c) <= edge) return { kind: 'resize-col', c: c - 1 };
    if (Math.abs(px - (m.X(c) + m.C.size(c))) <= edge) return { kind: 'resize-col', c };
    return { kind: 'cols', c };
  }
  const py = y - HEAD_H;
  if (x < HEAD_W) {
    const r = m.rowAt(py);
    if (r > 0 && py - m.Y(r) <= edge) return { kind: 'resize-row', r: r - 1 };
    if (Math.abs(py - (m.Y(r) + m.R.size(r))) <= edge) return { kind: 'resize-row', r };
    return { kind: 'rows', r };
  }
  return { kind: 'cell', r: m.rowAt(py), c: m.colAt(x - HEAD_W) };
}

/** The cell under a pointer or mouse event, { r, c }, or null. The cells are drawn on a plane the pointer passes
 *  through (pointer-events: none), so a press or a right-click on them lands on the scroller: ctxmenu.js asks here. */
export function cellAt(e) { const { x, y } = local(e), h = locate(x, y); return h.kind === 'cell' ? h : null; }

const isFinger = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

function down(e) {
  if (e.button !== 0 || e.target.closest('#editor')) return;
  const finger = isFinger(e);
  els().grid.classList.toggle('touching', finger);   // shows the selection knob (also under a coarse pointer: tables.css)
  if (e.target.closest('#selknob')) {
    e.preventDefault();
    if (S.edit && !commitEdit()) return;
    drag = { kind: 'cells' };
    return;
  }
  const { x, y } = local(e), hit = locate(x, y, finger ? TOUCH_EDGE : EDGE), m = metrics();
  const vp = els().vp;
  if (x - HEAD_W >= vp.clientWidth || y - HEAD_H >= vp.clientHeight) return;   // the scrollbars belong to the browser
  if (isFormula() && hit.kind === 'cell') { e.preventDefault(); pointClick(hit.r, hit.c); return; }
  // A finger on a cell: a tap selects it when the finger lifts; until then it may be the start of a scroll (or a long
  // press), which must not move the selection.
  if (finger && hit.kind === 'cell' && !e.shiftKey) { press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), r: hit.r, c: hit.c }; return; }
  if (S.edit && !commitEdit()) return;
  e.preventDefault();
  els().grid.focus({ preventScroll: true });
  const shift = e.shiftKey;
  if (hit.kind === 'resize-col' || hit.kind === 'resize-row') {
    const col = hit.kind === 'resize-col';
    drag = { kind: 'resize', col, i: hit.kind === 'resize-col' ? hit.c : hit.r, start: col ? x : y,
      size: col ? m.C.size(hit.c) : m.R.size(hit.r), before: beginStep() };
  } else if (hit.kind === 'cols') {
    S.sel = shift ? { ...S.sel, ec: hit.c, er: MAX_ROWS - 1 } : { r: 0, c: hit.c, er: MAX_ROWS - 1, ec: hit.c };
    drag = { kind: 'cols' };
  } else if (hit.kind === 'rows') {
    S.sel = shift ? { ...S.sel, er: hit.r, ec: MAX_COLS - 1 } : { r: hit.r, c: 0, er: hit.r, ec: MAX_COLS - 1 };
    drag = { kind: 'rows' };
  } else if (hit.kind === 'corner') {
    S.sel = { r: 0, c: 0, er: MAX_ROWS - 1, ec: MAX_COLS - 1 };
  } else if (hit.kind === 'cell') {
    if (shift) { S.sel.er = hit.r; S.sel.ec = hit.c; }
    else S.sel = { r: hit.r, c: hit.c, er: hit.r, ec: hit.c };
    if (e.detail === 2) { startEdit(null); return; }
    drag = { kind: 'cells' };
  }
  redraw();
}

/** A finger's tap on a cell: select it; the second tap of a double tap edits it. In the pointerup, a user gesture, so iOS
 *  shows the keyboard for the editor (it does not for a later, synthetic dblclick). */
function tap(t) {
  if (S.edit && !commitEdit()) return;
  els().grid.focus({ preventScroll: true });
  const again = lastTap && t.t - lastTap.t < DOUBLE_MS && lastTap.r === t.r && lastTap.c === t.c;
  lastTap = again ? null : t;
  S.sel = { r: t.r, c: t.c, er: t.r, ec: t.c };
  if (again) startEdit(null);
  redraw();
}

function move(e) {
  if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) press = null; // a scroll
  if (!drag) return;
  const { x, y } = local(e), m = metrics();
  if (drag.kind === 'resize') {
    const n = Math.max(16, drag.size + (drag.col ? x - drag.start : y - drag.start));
    if (drag.col) m.sh.colProp(drag.i).w = n; else m.sh.rowProp(drag.i).h = n;
  } else if (drag.kind === 'cells') {
    S.sel.er = clampR(m.rowAt(y - HEAD_H));
    S.sel.ec = clampC(m.colAt(x - HEAD_W));
  } else if (drag.kind === 'cols') S.sel.ec = clampC(m.colAt(x - HEAD_W));
  else if (drag.kind === 'rows') S.sel.er = clampR(m.rowAt(y - HEAD_H));
  redraw();
}

function up(e) {
  if (press && e && e.pointerId === press.id) {
    const t = press;
    press = null;
    if (e.type === 'pointerup' && Date.now() - t.t < 500 && Math.hypot(e.clientX - t.x, e.clientY - t.y) <= 10) tap(t);
  }
  if (!drag) return;
  if (drag.kind === 'resize') commitStep(drag.before);
  drag = null;
  redraw();
}

function hover(e) {
  if (drag) return;
  const { x, y } = local(e), hit = locate(x, y);
  els().grid.style.cursor = hit.kind === 'resize-col' ? 'col-resize' : hit.kind === 'resize-row' ? 'row-resize' : '';
}
