/* Slop Paint, part 10: curve and polygon tools, flood fill.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { S, bezierPts, clearOverlay, drawPolygon, line, mctx, octx, pack, polyline, pushUndo } = P;

/* =====================================================================
 * Curve & polygon (multi-click tools)
 * ===================================================================== */
const colorFor = btn => btn === 2 ? S.secondary : S.primary;
const otherFor = btn => btn === 2 ? S.primary : S.secondary;
function drawCurve(ctx) {
  ctx.fillStyle = colorFor(P.st.curve.btn);
  if (P.st.curve.stage === 0) line(ctx, P.st.curve.p0.x, P.st.curve.p0.y, P.st.curve.p3.x, P.st.curve.p3.y, S.lineWidth);
  else polyline(ctx, bezierPts(P.st.curve.p0, P.st.curve.c1, P.st.curve.c2, P.st.curve.p3), S.lineWidth, false);
}
function previewCurve() { clearOverlay(); if (P.st.curve) drawCurve(octx); }
function commitCurve() {
  if (!P.st.curve) return;
  pushUndo(); drawCurve(mctx); P.st.curve = null; clearOverlay();
}
function cancelCurve() { if (P.st.curve) { P.st.curve = null; clearOverlay(); } }
function previewPoly() {
  clearOverlay();
  if (!P.st.poly) return;
  octx.fillStyle = colorFor(P.st.poly.btn);
  polyline(octx, P.st.poly.pts, S.lineWidth, false);
}
function commitPoly() {
  if (!P.st.poly) return;
  const pts = P.st.poly.pts.filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y);
  const btn = P.st.poly.btn;
  P.st.poly = null; clearOverlay();
  if (!pts.length) return;
  pushUndo();
  drawPolygon(mctx, pts, S.lineWidth, S.fillMode, colorFor(btn), otherFor(btn));
}
function cancelPoly() { if (P.st.poly) { P.st.poly = null; clearOverlay(); } }

/* =====================================================================
 * Flood fill (scanline, exact match)
 * ===================================================================== */
function floodFill(sx, sy, hex) {
  const W = S.w, Hh = S.h;
  const img = mctx.getImageData(0, 0, W, Hh), d = new Uint32Array(img.data.buffer);
  const target = d[sy * W + sx], fill = pack(hex);
  if (target === fill) return false;
  pushUndo();
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop(); let x = stack.pop();
    let i = y * W + x;
    while (x > 0 && d[i - 1] === target) { x--; i--; }
    let up = false, down = false;
    while (x < W && d[i] === target) {
      d[i] = fill;
      if (y > 0) { const m = d[i - W] === target; if (m && !up) { stack.push(x, y - 1); up = true; } else if (!m) up = false; }
      if (y < Hh - 1) { const m = d[i + W] === target; if (m && !down) { stack.push(x, y + 1); down = true; } else if (!m) down = false; }
      x++; i++;
    }
  }
  mctx.putImageData(img, 0, 0);
  return true;
}

Object.assign(P, { cancelCurve, cancelPoly, colorFor, commitCurve, commitPoly, floodFill, otherFor, previewCurve, previewPoly });
})();
