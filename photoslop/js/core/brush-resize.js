/* PhotoSlop: right-button drag on the canvas resizes the brush live. Across = size, down = hardness
 * (the same as Shift-drag, minus Alt for opacity). No history step: the value goes straight into the
 * brush settings (BRUSH_OPTS) and is stored with the other tool options. A right-click without a drag
 * still opens the canvas menu (ui/context.js). Windows and Linux send the menu event after the release,
 * macOS sends it on the press; both are handled here. touch-ok: V.el (#viewport) is the canvas touch surface (index.html);
 * a finger has no right button, so a long press opens the menu instead (shared/input). */
'use strict';

function brushRightDown(e) {
  const t = currentTool(), bo = typeof BRUSH_OPTS === 'function' && BRUSH_OPTS()[t.id];
  if (!bo || TRANSFORM.active || V.space) return false;
  V.rightDragged = false;
  V.resize = { id: e.pointerId, sx: e.clientX, sy: e.clientY, p: snapP(toDoc(e), t), e, o: bo, size: bo.size, hard: bo.hardness, op: bo.opacity, moved: false, alt: false, right: true, menu: false };
  try { V.el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
  dirty();
  return true;
}
/** The menu event for a right button. Returns true when it was taken care of (menu suppressed or deferred). */
function brushRightContext() {
  if (V.resize && V.resize.right) { V.resize.menu = true; return true; } // macOS: the menu comes on the press
  if (V.rightDragged) { V.rightDragged = false; return true; }          // Windows/Linux: the drag was not a click
  return false;
}
function brushRightEnd(R) {
  if (R.moved) { V.rightDragged = !R.menu; saveToolOptions(); buildOptions(); } // a drag: no menu after it
  else if (R.menu) openContextMenu(V.el, R.e.clientX, R.e.clientY);             // macOS click: the menu was held back
}
/** The live brush circle and its label while a Shift-drag resizes the brush (drawn in screen space, after the view rotation). */
function drawResizePreview(g) {
  const R = V.resize, r = V.el.getBoundingClientRect(), cxp = R.sx - r.left, cyp = R.sy - r.top, rad = Math.max(1, (R.o.size * V.zoom) / 2);
  const hd = R.o.hardness != null ? R.o.hardness : 1, gr = g.createRadialGradient(cxp, cyp, 0, cxp, cyp, rad);
  gr.addColorStop(0, 'rgba(212,255,58,.55)'); gr.addColorStop(clamp(hd, 0, 0.98), 'rgba(212,255,58,.55)'); gr.addColorStop(1, 'rgba(212,255,58,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(cxp, cyp, rad, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
  const label = `${R.o.size}px · ${R.alt ? 'opacity ' + Math.round((R.o.opacity || 1) * 100) : 'hardness ' + Math.round(hd * 100)}%`;
  g.font = '600 12px "JetBrains Mono", monospace'; const tw = g.measureText(label).width; // i18n-ignore: a CSS font
  g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(cxp - tw / 2 - 8, cyp + rad + 10, tw + 16, 22); g.fillStyle = '#fff'; g.fillText(label, cxp - tw / 2, cyp + rad + 25);
}
