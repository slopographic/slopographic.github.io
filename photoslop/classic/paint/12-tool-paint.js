/* Slop Paint, part 12: tool paint helpers: brush spans, erase, spray, stamps, magnifier.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { BRUSHES, EMOJI_FONT, S, bres, clamp, clearOverlay, colorFor, discSpans, mctx, octx, otherFor, pack, pushUndo, slashSpans, spanCache, squareSpans, ws } = P;

/* =====================================================================
 * Tool handlers
 * ===================================================================== */
const fg = () => colorFor(P.st.op.btn);
const bg = () => otherFor(P.st.op.btn);
function beginStroke() { pushUndo(); P.st.op.mutated = true; }
function brushSpans() {
  const [shape, size] = BRUSHES[S.brush];
  const key = shape + size;
  if (!spanCache.has(key)) spanCache.set(key, shape === 'circle' ? discSpans(size) : shape === 'square' ? squareSpans(size) : slashSpans(size, shape === 'back'));
  return spanCache.get(key);
}
function erase(a, b) {
  const s = S.eraser, o = Math.floor(s / 2);
  if (P.st.op.btn !== 2) {
    mctx.fillStyle = S.secondary;
    bres(a.x, a.y, b.x, b.y, (x, y) => mctx.fillRect(x - o, y - o, s, s));
    return;
  }
  // color eraser: replace primary with secondary under the eraser
  const x0 = Math.max(0, Math.min(a.x, b.x) - o), y0 = Math.max(0, Math.min(a.y, b.y) - o);
  const x1 = Math.min(S.w, Math.max(a.x, b.x) - o + s), y1 = Math.min(S.h, Math.max(a.y, b.y) - o + s);
  if (x1 <= x0 || y1 <= y0) return;
  const W = x1 - x0, img = mctx.getImageData(x0, y0, W, y1 - y0), d = new Uint32Array(img.data.buffer);
  const from = pack(S.primary), to = pack(S.secondary);
  let changed = false;
  bres(a.x, a.y, b.x, b.y, (x, y) => {
    for (let yy = Math.max(y - o, y0); yy < Math.min(y - o + s, y1); yy++)
      for (let xx = Math.max(x - o, x0); xx < Math.min(x - o + s, x1); xx++) {
        const i = (yy - y0) * W + (xx - x0);
        if (d[i] === from) { d[i] = to; changed = true; }
      }
  });
  if (changed) mctx.putImageData(img, x0, y0);
}
function eraserCursor(p) {
  clearOverlay();
  const s = S.eraser, o = Math.floor(s / 2);
  octx.fillStyle = '#000'; octx.fillRect(p.x - o - 1, p.y - o - 1, s + 2, s + 2);
  octx.fillStyle = S.secondary; octx.fillRect(p.x - o, p.y - o, s, s);
}
function spray(p) {
  const r = S.air, n = Math.round(r * 1.1) + 3;
  mctx.fillStyle = fg();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
    mctx.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), 1, 1);
  }
}
function stampEmoji(p, emoji = S.emoji, ctx = mctx) {
  ctx.font = `${S.emojiSize}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = S.primary;
  ctx.fillText(emoji, p.x + 0.5, p.y + 0.5);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}
function magRect(p, z) {
  const vw = Math.min(S.w, Math.floor(ws.clientWidth / z)), vh = Math.min(S.h, Math.floor(ws.clientHeight / z));
  return { x: clamp(Math.round(p.x - vw / 2), 0, S.w - vw), y: clamp(Math.round(p.y - vh / 2), 0, S.h - vh), w: vw, h: vh };
}

Object.assign(P, { beginStroke, bg, brushSpans, erase, eraserCursor, fg, magRect, spray, stampEmoji });
})();
