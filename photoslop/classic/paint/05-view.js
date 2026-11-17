/* Slop Paint, part 05: status bar, title, toast, canvas size, zoom and layout.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, DEFAULT_MSG, S, t, clamp, copyCanvas, gridEl, main, mctx, octx, over, stage, toastEl, wrap, ws } = P;

/* =====================================================================
 * Status bar, title, toast
 * ===================================================================== */
const sbMsg = $('#sbMsg'), sbPos = $('#sbPos'), sbSize = $('#sbSize'), sbCanvas = $('#sbCanvas');
function status(msg) { sbMsg.textContent = msg || t(DEFAULT_MSG); }
function setPos(p) { sbPos.textContent = p ? `${p.x},${p.y}` : ''; }
function setSizeStatus(w, hh) { sbSize.textContent = w == null ? '' : `${w}x${hh}`; }
function updateSize() { if (P.st.sel) setSizeStatus(P.st.sel.w, P.st.sel.h); else setSizeStatus(null); }
function updateTitle() {
  const name = S.fileName === 'untitled' ? t('paint-classic.app.untitled') : S.fileName;
  const title = `${name} - Slop Paint`;
  $('#title').textContent = title; $('#taskTitle').textContent = title;
}
function markDirty() { S.dirty = true; }
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
}

/* =====================================================================
 * Canvas size, zoom, layout
 * ===================================================================== */
function layout() {
  const z = S.zoom, W = S.w * z, Hh = S.h * z;
  wrap.style.width = W + 'px'; wrap.style.height = Hh + 'px';
  for (const c of [main, over]) { c.style.width = W + 'px'; c.style.height = Hh + 'px'; }
  stage.style.width = (W + 3 + 18) + 'px'; stage.style.height = (Hh + 3 + 18) + 'px';
  gridEl.hidden = !(S.grid && z >= 4);
  gridEl.style.backgroundSize = `${z}px ${z}px`;
  P.updateSelBox();
  if (P.st.text) P.styleTextBox();
  sbCanvas.textContent = `${S.w}x${S.h}`;
}
function setCanvasSize(nw, nh, keep = true, fill = S.secondary) {
  nw = clamp(Math.round(nw), 1, 6000); nh = clamp(Math.round(nh), 1, 6000);
  const tmp = keep ? copyCanvas(main) : null;
  main.width = nw; main.height = nh; over.width = nw; over.height = nh;
  mctx.imageSmoothingEnabled = false; octx.imageSmoothingEnabled = false;
  mctx.fillStyle = fill; mctx.fillRect(0, 0, nw, nh);
  if (tmp) mctx.drawImage(tmp, 0, 0);
  S.w = nw; S.h = nh;
  layout();
}
function setZoom(z, anchor) {
  z = clamp(z, 1, 8);
  if (z === S.zoom && !anchor) return;
  P.commitText();
  S.zoom = z;
  layout();
  if (anchor) {
    ws.scrollLeft = anchor.ix * z + 3 - anchor.cx;
    ws.scrollTop = anchor.iy * z + 3 - anchor.cy;
  }
  if (S.tool === 'zoom') P.renderOptions();
  status(t('paint-classic.status.zoom', { pct: String(z * 100) }));
}
function clearOverlay() { octx.clearRect(0, 0, over.width, over.height); }
function toImg(e) {
  const r = wrap.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) / S.zoom), y: Math.floor((e.clientY - r.top) / S.zoom) };
}
const inCanvas = p => p.x >= 0 && p.y >= 0 && p.x < S.w && p.y < S.h;

Object.assign(P, { clearOverlay, inCanvas, layout, markDirty, setCanvasSize, setPos, setSizeStatus, setZoom, status, toImg, toast, updateSize, updateTitle });
})();
