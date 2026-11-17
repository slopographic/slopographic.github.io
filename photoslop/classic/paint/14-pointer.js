/* Slop Paint, part 14: pointer plumbing: mouse, touch, pan, resize.
 * Touch: #wrap (the canvas) is a touch surface (data-touch-surface in index.html); two fingers pinch through its zoom
 * levels and pan the workspace (wrap.touchSurface, read by shared/input). A long press on a palette swatch opens its menu (ctx.js); on the canvas it does nothing (the right button paints).
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $$, H, S, cancelOp, clamp, clearOverlay, commitCurve, commitPoly, commitSel, commitText, ctx2d, ghost, inCanvas, insideSel, isTyping, lift, mkCanvas, pushUndo, renderFloating, selBox, setCanvasSize, setPos, setSizeStatus, setZoom, stage, status, toImg, touches, updateSelBox, updateSize, wrap, ws } = P;

/* =====================================================================
 * Pointer plumbing
 * ===================================================================== */
const pt = e => ({ x: e.clientX, y: e.clientY });
function midpoint() { let x = 0, y = 0; for (const p of touches.values()) { x += p.x; y += p.y; } return { x: x / touches.size, y: y / touches.size }; }
function onDown(e) {
  if (document.querySelector('.modal-back')) return;
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, pt(e));
    if (touches.size >= 2) {
      if (P.st.op && P.st.op.kind === 'tool') cancelOp(); else if (P.st.op) cancelOp();
      P.st.pan = { last: midpoint() };
      try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    if (P.st.pan) return;
  }
  if (e.button !== 0 && e.button !== 2) return;
  if (P.st.op) { if (e.pointerType === 'mouse') cancelOp(); return; }
  e.preventDefault();
  P.closeMenus(); P.closeStart();
  const ae = document.activeElement;
  if (ae && ae !== document.body && !(P.st.text && ae === P.st.text.ta)) ae.blur();
  const p = toImg(e);
  try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
  P.st.op = { kind: 'tool', id: e.pointerId, btn: e.button === 2 ? 2 : 0, start: p, last: p, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, mode: null };
  const T = H[S.tool];
  if (T.down) T.down.call(T, p, e);
  setPos(p);
}
function onMove(e) {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.set(e.pointerId, pt(e));
    if (P.st.pan) {
      const m = midpoint();
      ws.scrollLeft -= m.x - P.st.pan.last.x; ws.scrollTop -= m.y - P.st.pan.last.y;
      P.st.pan.last = m;
      return;
    }
  }
  const p = toImg(e);
  setPos(inCanvas(p) || P.st.op ? p : null);
  if (!P.st.op) {
    const T = H[S.tool];
    if (T.hover && e.pointerType !== 'touch') T.hover(p, e);
    if (S.tool === 'select' || S.tool === 'freesel') wrap.style.cursor = insideSel(p) ? 'move' : 'crosshair';
    return;
  }
  if (e.pointerId !== P.st.op.id) return;
  if (e.pointerType === 'mouse' && P.st.op.kind === 'tool' && (e.button === 0 || e.button === 2) && e.button !== P.st.op.btn) { cancelOp(); return; }
  P.st.op.shift = e.shiftKey;
  if (P.st.op.kind === 'canvasResize') { moveCanvasResize(e); return; }
  if (P.st.op.kind === 'selResize') { moveSelResize(e); return; }
  const T = H[S.tool];
  if (T.move) T.move.call(T, p, e);
  if (P.st.op) P.st.op.last = p;
}
function onUp(e) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (P.st.pan) { if (touches.size === 0) P.st.pan = null; else P.st.pan.last = midpoint(); return; }
  }
  if (!P.st.op || e.pointerId !== P.st.op.id) return;
  const p = toImg(e);
  if (P.st.op.kind === 'canvasResize') endCanvasResize();
  else if (P.st.op.kind === 'selResize') endSelResize();
  else { const T = H[S.tool]; if (T.up) T.up.call(T, p, e); }
  if (P.st.op && P.st.op.timer) clearInterval(P.st.op.timer);
  P.st.op = null;
  if (!['line', 'rect', 'ellipse', 'rrect'].includes(S.tool) || true) updateSize();
}
function onCancel(e) {
  touches.delete(e.pointerId);
  if (P.st.pan && touches.size === 0) P.st.pan = null;
  if (P.st.op && e.pointerId === P.st.op.id) cancelOp();
}
wrap.addEventListener('pointerdown', onDown);
wrap.addEventListener('pointermove', onMove);
wrap.addEventListener('pointerup', onUp);
wrap.addEventListener('pointercancel', onCancel);
wrap.addEventListener('lostpointercapture', e => { if (P.st.op && e.pointerId === P.st.op.id && P.st.op.kind === 'tool' && e.pointerType !== 'touch') { /* released elsewhere */ } });
wrap.addEventListener('pointerleave', () => {
  if (P.st.op) return;
  setPos(null);
  if (['eraser', 'stamp', 'zoom'].includes(S.tool)) clearOverlay();
});
document.addEventListener('contextmenu', e => { if (!isTyping(e.target)) e.preventDefault(); });

// click on the gray workspace commits text / selection, like Paint
ws.addEventListener('pointerdown', e => {
  if (e.target === ws || e.target === stage) {
    P.closeMenus();
    if (P.st.text) commitText();
    if (P.st.sel && !P.st.op) commitSel();
    if (P.st.curve) commitCurve();
    if (P.st.poly) commitPoly();
  }
});
// Ctrl+wheel zoom
ws.addEventListener('wheel', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const levels = [1, 2, 4, 6, 8], i = levels.indexOf(S.zoom);
  const ni = clamp((i < 0 ? 0 : i) + (e.deltaY < 0 ? 1 : -1), 0, levels.length - 1);
  if (levels[ni] === S.zoom) return;
  const wr = ws.getBoundingClientRect(), p = toImg(e);
  setZoom(levels[ni], { ix: p.x, iy: p.y, cx: e.clientX - wr.left, cy: e.clientY - wr.top });
}, { passive: false });

// Two fingers on the canvas (shared/input): a pinch steps through the zoom levels around its centre, a pan scrolls.
const ZOOM_LEVELS = [1, 2, 4, 6, 8];
let pinchScale = 1;
function stepZoom(dir, cx, cy) {
  const i = ZOOM_LEVELS.indexOf(S.zoom), ni = clamp((i < 0 ? 0 : i) + dir, 0, ZOOM_LEVELS.length - 1);
  if (ZOOM_LEVELS[ni] === S.zoom) return;
  const wr = ws.getBoundingClientRect(), p = toImg({ clientX: cx, clientY: cy });
  setZoom(ZOOM_LEVELS[ni], { ix: p.x, iy: p.y, cx: cx - wr.left, cy: cy - wr.top });
}
wrap.touchSurface = {
  zoom(scale, cx, cy) {
    if (P.st.op) cancelOp();
    pinchScale *= scale;
    if (pinchScale > 1.35) { pinchScale = 1; stepZoom(1, cx, cy); } else if (pinchScale < 0.74) { pinchScale = 1; stepZoom(-1, cx, cy); }
  },
  pan(dx, dy) { ws.scrollLeft -= dx; ws.scrollTop -= dy; },
};

// canvas resize handles
$$('.hdl').forEach(hd => {
  hd.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    if (P.st.op) return;
    P.finishPending();
    try { hd.setPointerCapture(e.pointerId); } catch (_) {}
    P.st.op = { kind: 'canvasResize', id: e.pointerId, dir: hd.dataset.dir, w: S.w, h: S.h };
    moveCanvasResize(e);
  });
});
function moveCanvasResize(e) {
  const r = wrap.getBoundingClientRect(), z = S.zoom;
  if (P.st.op.dir.includes('e')) P.st.op.w = clamp(Math.round((e.clientX - r.left) / z), 1, 6000);
  if (P.st.op.dir.includes('s')) P.st.op.h = clamp(Math.round((e.clientY - r.top) / z), 1, 6000);
  ghost.hidden = false;
  ghost.style.width = P.st.op.w * z + 'px'; ghost.style.height = P.st.op.h * z + 'px';
  setSizeStatus(P.st.op.w, P.st.op.h);
}
function endCanvasResize() {
  ghost.hidden = true;
  if (P.st.op.w !== S.w || P.st.op.h !== S.h) { pushUndo(); setCanvasSize(P.st.op.w, P.st.op.h); status(P.t('paint-classic.status.resized', { w: String(S.w), h: String(S.h) })); }
}
// selection stretch handles
$$('.sh', selBox).forEach(hd => {
  hd.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !P.st.sel) return;
    e.stopPropagation(); e.preventDefault();
    if (P.st.op) return;
    lift();
    try { hd.setPointerCapture(e.pointerId); } catch (_) {}
    P.st.op = { kind: 'selResize', id: e.pointerId, dir: hd.dataset.dir, r0: { x: P.st.sel.x, y: P.st.sel.y, w: P.st.sel.w, h: P.st.sel.h } };
  });
});
function moveSelResize(e) {
  const r = wrap.getBoundingClientRect(), z = S.zoom, r0 = P.st.op.r0, d = P.st.op.dir;
  const px = Math.round((e.clientX - r.left) / z), py = Math.round((e.clientY - r.top) / z);
  let { x, y, w, h: hh } = r0;
  if (d.includes('e')) w = Math.max(1, px - r0.x);
  if (d.includes('s')) hh = Math.max(1, py - r0.y);
  if (d.includes('w')) { x = Math.min(px, r0.x + r0.w - 1); w = r0.x + r0.w - x; }
  if (d.includes('n')) { y = Math.min(py, r0.y + r0.h - 1); hh = r0.y + r0.h - y; }
  Object.assign(P.st.sel, { x, y, w, h: hh });
  renderFloating(); updateSelBox(); setSizeStatus(w, hh);
}
function endSelResize() {
  if (!P.st.sel || !P.st.sel.canvas) return;
  if (P.st.sel.w !== P.st.sel.canvas.width || P.st.sel.h !== P.st.sel.canvas.height) {
    const c = mkCanvas(P.st.sel.w, P.st.sel.h); ctx2d(c).drawImage(P.st.sel.canvas, 0, 0, P.st.sel.w, P.st.sel.h);
    P.st.sel.canvas = c; P.st.sel.ver++;
  }
}
})();
