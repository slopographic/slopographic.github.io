/* Slop Paint, part 06: undo and redo snapshots.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { S, clamp, markDirty, mctx, redoStack, setCanvasSize, status, undoStack } = P;

/* =====================================================================
 * Undo / redo
 * ===================================================================== */
const maxUndo = () => clamp(Math.floor(320e6 / (S.w * S.h * 4)), 5, 50);
function snapshot() { return { w: S.w, h: S.h, data: mctx.getImageData(0, 0, S.w, S.h) }; }
function restore(s) {
  if (s.w !== S.w || s.h !== S.h) setCanvasSize(s.w, s.h, false);
  mctx.putImageData(s.data, 0, 0);
}
function pushUndo() {
  undoStack.push(snapshot());
  const m = maxUndo();
  while (undoStack.length > m) undoStack.shift();
  redoStack.length = 0;
  markDirty();
}
function undo() {
  if (P.st.op) P.cancelOp();
  if (P.st.curve || P.st.poly) { P.cancelCurve(); P.cancelPoly(); return; }
  P.commitText(); P.commitSel(); P.stopDrips();
  if (!undoStack.length) { status(P.t('paint-classic.status.nothing_undo')); return; }
  redoStack.push(snapshot());
  restore(undoStack.pop());
  markDirty();
}
function redo() {
  if (P.st.op) P.cancelOp();
  P.finishPending(); P.stopDrips();
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  markDirty();
}

Object.assign(P, { pushUndo, redo, undo });
})();
