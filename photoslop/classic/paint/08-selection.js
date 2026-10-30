/* Slop Paint, part 08: selection: lift, float, copy, cut, paste, move.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { S, clamp, clearOverlay, copyCanvas, ctx2d, hexToRgb, loadBlobImage, main, markDirty, mctx, mkCanvas, octx, pushUndo, selBox, setCanvasSize, status, updateSize, ws } = P;

/* =====================================================================
 * Selection
 * ===================================================================== */
function updateSelBox(r = P.st.sel, marquee = false) {
  if (!r) { selBox.hidden = true; return; }
  const z = S.zoom;
  selBox.hidden = false;
  selBox.style.left = (r.x * z - 1) + 'px';
  selBox.style.top = (r.y * z - 1) + 'px';
  selBox.style.width = (r.w * z + 2) + 'px';
  selBox.style.height = (r.h * z + 2) + 'px';
  selBox.classList.toggle('handles', !marquee && r === P.st.sel);
}
const transCache = { key: null, canvas: null };
function selImage() {
  if (!S.transparent) return P.st.sel.canvas;
  const key = `${P.st.sel.ver}|${S.secondary}|${P.st.sel.canvas.width}x${P.st.sel.canvas.height}`;
  if (transCache.key === key && transCache.src === P.st.sel.canvas) return transCache.canvas;
  const c = copyCanvas(P.st.sel.canvas), x = c.getContext('2d', { willReadFrequently: true });
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  const [r, g, b] = hexToRgb(S.secondary);
  for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) d[i + 3] = 0;
  x.putImageData(img, 0, 0);
  Object.assign(transCache, { key, canvas: c, src: P.st.sel.canvas });
  return c;
}
function renderFloating() {
  clearOverlay();
  if (P.st.sel && P.st.sel.canvas) octx.drawImage(selImage(), P.st.sel.x, P.st.sel.y, P.st.sel.w, P.st.sel.h);
}
function getRegion(s) {
  const c = mkCanvas(s.w, s.h), x = ctx2d(c);
  x.drawImage(main, -s.x, -s.y);
  if (s.mask) { x.globalCompositeOperation = 'destination-in'; x.drawImage(s.mask, 0, 0); }
  return c;
}
function tinted(mask, color) {
  const c = copyCanvas(mask), x = ctx2d(c);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}
function lift() {
  if (!P.st.sel || P.st.sel.canvas) return;
  pushUndo();
  P.st.sel.canvas = getRegion(P.st.sel);
  P.st.sel.ver = (P.st.sel.ver || 0) + 1;
  if (P.st.sel.mask) mctx.drawImage(tinted(P.st.sel.mask, S.secondary), P.st.sel.x, P.st.sel.y);
  else { mctx.fillStyle = S.secondary; mctx.fillRect(P.st.sel.x, P.st.sel.y, P.st.sel.w, P.st.sel.h); }
  P.st.sel.mask = null;
  renderFloating();
}
function commitSel() {
  if (!P.st.sel) return;
  if (P.st.sel.canvas) { mctx.drawImage(selImage(), P.st.sel.x, P.st.sel.y, P.st.sel.w, P.st.sel.h); markDirty(); }
  P.st.sel = null;
  clearOverlay();
  updateSelBox(null);
  updateSize();
}
function selCanvas() {
  if (!P.st.sel) return null;
  if (P.st.sel.canvas) { const c = mkCanvas(P.st.sel.w, P.st.sel.h); ctx2d(c).drawImage(selImage(), 0, 0, P.st.sel.w, P.st.sel.h); return c; }
  return getRegion(P.st.sel);
}
function clearSelection() {
  if (!P.st.sel) return;
  if (!P.st.sel.canvas) {
    pushUndo();
    if (P.st.sel.mask) mctx.drawImage(tinted(P.st.sel.mask, S.secondary), P.st.sel.x, P.st.sel.y);
    else { mctx.fillStyle = S.secondary; mctx.fillRect(P.st.sel.x, P.st.sel.y, P.st.sel.w, P.st.sel.h); }
  }
  P.st.sel = null; clearOverlay(); updateSelBox(null); updateSize(); markDirty();
}
function copySel() {
  if (P.st.op) return false;
  P.commitText();
  const c = selCanvas();
  if (!c) { status(P.t('paint-classic.status.select_first')); return false; }
  P.st.clip = c; P.st.clipInternalNewer = true;
  try {
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      const item = new ClipboardItem({ 'image/png': new Promise(res => c.toBlob(res, 'image/png')) });
      navigator.clipboard.write([item]).catch(() => {});
    }
  } catch (_) { /* in-app clipboard still works */ }
  status(P.t('paint-classic.status.copied', { w: String(c.width), h: String(c.height) }));
  return true;
}
function cutSel() { if (copySel()) clearSelection(); }
function viewOrigin() {
  return { x: clamp(Math.floor((ws.scrollLeft - 3) / S.zoom), 0, S.w - 1), y: clamp(Math.floor((ws.scrollTop - 3) / S.zoom), 0, S.h - 1) };
}
async function pasteCanvas(src) {
  if (P.st.op) P.cancelOp();
  P.finishPending();
  if (src.width > S.w || src.height > S.h) {
    const r = await P.msgBox(P.t('paint-classic.msg.enlarge'), ['Yes', 'No', 'Cancel'], 'question');
    if (r === 'Cancel' || r == null) return;
    if (r === 'Yes') { pushUndo(); setCanvasSize(Math.max(S.w, src.width), Math.max(S.h, src.height)); }
  }
  P.setTool('select');
  pushUndo();
  const v = viewOrigin();
  P.st.sel = { x: v.x, y: v.y, w: src.width, h: src.height, canvas: copyCanvas(src), ver: 1 };
  renderFloating(); updateSelBox(); updateSize();
  status(P.t('paint-classic.status.pasted'));
}
async function pasteBlob(blob) {
  try {
    const img = await loadBlobImage(blob);
    const c = mkCanvas(img.naturalWidth, img.naturalHeight); ctx2d(c).drawImage(img, 0, 0);
    await pasteCanvas(c);
  } catch (_) { P.msgBox(P.t('paint-classic.msg.cannot_paste'), ['OK'], 'warn'); }
}
async function pasteMenu() {
  if (P.st.clipInternalNewer && P.st.clip) return pasteCanvas(P.st.clip);
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const t = it.types.find(x => x.startsWith('image/'));
        if (t) return pasteBlob(await it.getType(t));
      }
    }
  } catch (_) { /* permission denied: fall back */ }
  if (P.st.clip) return pasteCanvas(P.st.clip);
  status(P.t('paint-classic.status.clip_empty'));
}
function selectAll() {
  if (P.st.op) return;
  P.finishPending();
  P.setTool('select');
  P.st.sel = { x: 0, y: 0, w: S.w, h: S.h, ver: 0 };
  updateSelBox(); updateSize();
}
function insideSel(p) { return P.st.sel && p.x >= P.st.sel.x && p.y >= P.st.sel.y && p.x < P.st.sel.x + P.st.sel.w && p.y < P.st.sel.y + P.st.sel.h; }

Object.assign(P, { clearSelection, commitSel, copySel, cutSel, insideSel, lift, pasteBlob, pasteCanvas, pasteMenu, renderFloating, selCanvas, selImage, selectAll, updateSelBox });
})();
