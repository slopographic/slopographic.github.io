/* Slop Paint, part 16: image operations: flip, rotate, stretch, invert, black and white.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { EMOJI_FONT, FONTS, S, cancelOp, clamp, clearSelection, commitCurve, commitPoly, commitText, copyCanvas, ctx2d, lift, loadImage, main, markDirty, mctx, mkCanvas, pushUndo, renderFloating, selCanvas, setCanvasSize, updateSelBox, updateSize } = P;

/* =====================================================================
 * Image operations
 * ===================================================================== */
function flipH(c) { const o = mkCanvas(c.width, c.height), x = ctx2d(o); x.setTransform(-1, 0, 0, 1, c.width, 0); x.drawImage(c, 0, 0); return o; }
function flipV(c) { const o = mkCanvas(c.width, c.height), x = ctx2d(o); x.setTransform(1, 0, 0, -1, 0, c.height); x.drawImage(c, 0, 0); return o; }
function rotate(c, deg) {
  const sw = deg === 180, o = mkCanvas(sw ? c.width : c.height, sw ? c.height : c.width), x = ctx2d(o);
  if (deg === 90) x.setTransform(0, 1, -1, 0, c.height, 0);
  else if (deg === 180) x.setTransform(-1, 0, 0, -1, c.width, c.height);
  else x.setTransform(0, -1, 1, 0, 0, c.width);
  x.drawImage(c, 0, 0);
  return o;
}
function invert(c) {
  const o = copyCanvas(c), x = o.getContext('2d', { willReadFrequently: true });
  const img = x.getImageData(0, 0, o.width, o.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
  x.putImageData(img, 0, 0);
  return o;
}
function stretchSkew(c, sx, sy, kx, ky) {
  let cur = c;
  if (sx !== 100 || sy !== 100) {
    const o = mkCanvas(Math.max(1, Math.round(c.width * sx / 100)), Math.max(1, Math.round(c.height * sy / 100)));
    ctx2d(o).drawImage(c, 0, 0, o.width, o.height); cur = o;
  }
  if (kx) {
    const t = Math.tan(kx * Math.PI / 180), extra = Math.round(Math.abs(t) * cur.height);
    const o = mkCanvas(cur.width + extra, cur.height), x = ctx2d(o);
    x.setTransform(1, 0, -t, 1, t > 0 ? extra : 0, 0); x.drawImage(cur, 0, 0); cur = o;
  }
  if (ky) {
    const t = Math.tan(ky * Math.PI / 180), extra = Math.round(Math.abs(t) * cur.width);
    const o = mkCanvas(cur.width, cur.height + extra), x = ctx2d(o);
    x.setTransform(1, -t, 0, 1, 0, t > 0 ? extra : 0); x.drawImage(cur, 0, 0); cur = o;
  }
  return cur;
}
function blackAndWhite(c) {
  const o = copyCanvas(c), x = o.getContext('2d', { willReadFrequently: true });
  const img = x.getImageData(0, 0, o.width, o.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) >= 128 ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
  x.putImageData(img, 0, 0);
  return o;
}
async function slopify(c) {
  const w = c.width, hh = c.height;
  const out = mkCanvas(w, hh), x = out.getContext('2d', { willReadFrequently: true });
  x.drawImage(c, 0, 0);
  // 1. deep-fried jpeg crunch (half-res, potato quality)
  try {
    const small = mkCanvas(Math.max(1, w >> 1), Math.max(1, hh >> 1)), sx = small.getContext('2d');
    sx.fillStyle = '#fff'; sx.fillRect(0, 0, small.width, small.height);
    sx.drawImage(c, 0, 0, small.width, small.height);
    const img = await loadImage(small.toDataURL('image/jpeg', 0.08));
    x.imageSmoothingEnabled = false;
    x.globalAlpha = 0.85; x.drawImage(img, 0, 0, w, hh); x.globalAlpha = 1;
  } catch (_) { /* crunch is optional slop */ }
  // 2. slop-green tint + posterize + saturation boost
  const img = x.getImageData(0, 0, w, hh), d = img.data;
  const q = v => Math.round(v / 255 * 4) / 4 * 255;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const l = (r + g + b) / 3;
    r = l + (r - l) * 1.6; g = l + (g - l) * 1.6; b = l + (b - l) * 1.6;
    r = r * 0.62 + 159 * 0.38; g = g * 0.62 + 204 * 0.38 + 10; b = b * 0.55;
    d[i] = q(clamp(r, 0, 255)); d[i + 1] = q(clamp(g, 0, 255)); d[i + 2] = q(clamp(b, 0, 255));
  }
  x.putImageData(img, 0, 0);
  // 3. sparkle slop
  const n = 5 + Math.round(Math.sqrt(w * hh) / 45);
  const pool = ['✨', '✨', '✨', '🦐', '🙏', '💀', '🔥', '😭', '😇'];
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const s = Math.round(12 + Math.random() * Math.max(12, Math.min(w, hh) / 7));
    x.font = `${s}px ${EMOJI_FONT}`;
    x.fillText(pool[Math.random() * pool.length | 0], Math.random() * w, Math.random() * hh);
  }
  // 4. a little "authenticity" watermark
  if (w > 120 && hh > 40) {
    const fs = clamp(Math.round(w / 40), 9, 18);
    x.font = `bold ${fs}px ${FONTS[0][1]}`; x.textAlign = 'right'; x.textBaseline = 'bottom';
    x.fillStyle = 'rgba(10,10,10,.55)'; x.fillText('certified slop · slopographic.com', w - 3, hh - 2);
    x.fillStyle = 'rgba(212,255,58,.95)'; x.fillText('certified slop · slopographic.com', w - 4, hh - 3);
  }
  return out;
}
async function applyImage(fn) {
  if (P.st.op) cancelOp();
  commitText(); commitCurve(); commitPoly();
  if (P.st.sel) {
    lift();
    const out = await fn(selCanvas());
    if (!P.st.sel) return;
    P.st.sel.canvas = out; P.st.sel.w = out.width; P.st.sel.h = out.height; P.st.sel.ver++;
    renderFloating(); updateSelBox(); updateSize(); markDirty();
    return;
  }
  pushUndo();
  const out = await fn(copyCanvas(main));
  if (out.width !== S.w || out.height !== S.h) setCanvasSize(out.width, out.height, false);
  else { mctx.fillStyle = S.secondary; mctx.fillRect(0, 0, S.w, S.h); }
  mctx.drawImage(out, 0, 0);
}
function clearImage() {
  if (P.st.op) cancelOp();
  commitText(); commitCurve(); commitPoly();
  if (P.st.sel) { clearSelection(); return; }
  pushUndo(); mctx.fillStyle = S.secondary; mctx.fillRect(0, 0, S.w, S.h);
}

Object.assign(P, { applyImage, blackAndWhite, clearImage, flipH, flipV, invert, rotate, slopify, stretchSkew });
})();
