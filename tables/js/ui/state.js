/* Slop Tables UI state. Modules read and change S, then call changed() (data) or redraw() (view only). */
export const S = {
  wb: null,                                   // the engine Workbook
  si: 0,                                      // active sheet index
  sel: { r: 0, c: 0, er: 0, ec: 0 },          // active cell (r, c) and the far corner of the selection (er, ec)
  edit: null,                                 // { r, c, text, orig, from: 'cell' | 'bar' } while typing in a cell
  chart: null,                                // id of the selected chart on the active sheet (ui/charts.js), or null
  file: { name: 'Untitled spreadsheet', driveId: null, folderId: null, dirty: false }, // i18n-ignore: each tab sets its own (tables.app.untitled)
  clip: null,                                 // internal clipboard: { r1, c1, cells, text, cut }
  hist: { undo: [], redo: [] },               // undo and redo steps of the open workbook (each tab has its own)
};

export const $ = (id) => document.getElementById(id);
export const sheet = () => S.wb.sheets[S.si];
/** Normalised selection rectangle. */
export function range() {
  const { r, c, er, ec } = S.sel;
  return { r1: Math.min(r, er), c1: Math.min(c, ec), r2: Math.max(r, er), c2: Math.max(c, ec) };
}

const subs = {};
export function on(ev, fn) { (subs[ev] ||= []).push(fn); }
export function emit(ev, data) { for (const fn of subs[ev] || []) fn(data); }

let painter = null, queued = false;
/** Set by main.js: the function that repaints every part of the UI. */
export function setPainter(fn) { painter = fn; }
/** Repaint on the next frame (coalesced). */
export function redraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; painter && painter(); });
}
/** The workbook changed: mark the file dirty, tell listeners (autosave, guard), repaint. */
export function changed() {
  S.file.dirty = true;
  emit('change');
  redraw();
}
export function toast(msg) { if (window.SlopUI) window.SlopUI.toast(msg); }
