/* Slop Paint, part 11: Slop Brush: layered slime stroke and animated drips.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { S, clearOverlay, discSpans, markDirty, mctx, octx, stamp } = P;

/* =====================================================================
 * Slop brush (layered slime + animated drips)
 * ===================================================================== */
const SLOP_PAL = { shadow: '#3d5200', body: '#9fcc00', shine: '#e6ff8c' };
const SLOP_DARK = { shadow: '#1f2a00', body: '#4d6600', shine: '#9fcc00' };
function slopStamp(x, y) {
  const st = P.st.slopStroke, pal = st.pal, d = S.slop, r = d / 2;
  const [sh, bo, sn] = st.X;
  sh.fillStyle = pal.shadow; stamp(sh, x + 1, y + 2, discSpans(d));
  bo.fillStyle = pal.body; stamp(bo, x, y, discSpans(d));
  sn.fillStyle = pal.shine; stamp(sn, x - Math.round(r * 0.38), y - Math.round(r * 0.42), discSpans(Math.max(2, Math.round(d * 0.26))));
  st.dist++;
  if (st.dist > st.nextDrip) {
    st.dist = 0; st.nextDrip = 6 + Math.random() * (14 + d);
    const w = Math.max(2, Math.round(2 + Math.random() * r * 0.55));
    P.st.drips.push({ x: x + Math.round((Math.random() * 1.1 - 0.55) * r) - (w >> 1), y: y + Math.round(r * 0.45), w, len: 8 + Math.random() * (14 + d * 3), done: 0, pal, X: st.X });
    if (!P.st.dripRAF) P.st.dripRAF = requestAnimationFrame(dripStep);
  }
}
function slopComposite() { clearOverlay(); if (P.st.slopStroke) for (const c of P.st.slopStroke.L) octx.drawImage(c, 0, 0); }
function dripStep() {
  P.st.dripRAF = 0;
  let alive = false, touchedLayers = false;
  for (const d of P.st.drips) {
    if (d.done >= d.len) continue;
    const speed = 0.35 + (1 - d.done / d.len) * 1.4;
    const y0 = Math.floor(d.y + d.done); d.done = Math.min(d.len, d.done + speed);
    const y1 = Math.floor(d.y + d.done);
    const [sh, bo, sn] = d.X || [mctx, mctx, mctx];
    if (d.X) touchedLayers = true; else markDirty();
    if (y1 > y0) {
      sh.fillStyle = d.pal.shadow; sh.fillRect(d.x + 1, y0 + 1, d.w, y1 - y0 + 1);
      bo.fillStyle = d.pal.body; bo.fillRect(d.x, y0, d.w, y1 - y0 + 1);
      if (d.w >= 3) { sn.fillStyle = d.pal.shine; sn.fillRect(d.x + 1, y0, 1, y1 - y0 + 1); }
    }
    if (d.done >= d.len) {
      const bd = d.w + 2, cx = d.x + (d.w >> 1), cy = y1;
      sh.fillStyle = d.pal.shadow; stamp(sh, cx + 1, cy + 1, discSpans(bd));
      bo.fillStyle = d.pal.body; stamp(bo, cx, cy, discSpans(bd));
      sn.fillStyle = d.pal.shine; sn.fillRect(cx - Math.floor(bd / 4), cy - Math.floor(bd / 4), 1, 1);
    } else alive = true;
  }
  P.st.drips = P.st.drips.filter(d => d.done < d.len);
  if (touchedLayers) slopComposite();
  if (alive) P.st.dripRAF = requestAnimationFrame(dripStep);
}
function stopDrips() { P.st.drips = []; if (P.st.dripRAF) cancelAnimationFrame(P.st.dripRAF); P.st.dripRAF = 0; }
function slopCommit() {
  if (!P.st.slopStroke) return;
  for (const c of P.st.slopStroke.L) mctx.drawImage(c, 0, 0);
  for (const d of P.st.drips) if (d.X === P.st.slopStroke.X) d.X = null;
  P.st.slopStroke = null;
  clearOverlay();
}

Object.assign(P, { SLOP_DARK, SLOP_PAL, slopCommit, slopComposite, slopStamp, stopDrips });
})();
