/* PhotoSlop guides: pointer input. Drag guides out of the rulers; with the Move tool (or Ctrl/⌘ held)
 * drag a guide to move it, drop it on a ruler or outside the canvas area to delete it; double-click one
 * to type its position. These capture-phase listeners run before the tools and stop the event when they use it.
 * touch-ok: V.el (#viewport) is the canvas touch surface (index.html); a long press on a guide opens its menu. */
'use strict';

/** Pointer position in unrotated view space (the space the guides and V.ox/V.oy use); equals screen space at 0°. */
function screenPt(e) { return viewLocal(e); }
function inRuler(s) { return rulersShown() && (s.x < RULER || s.y < RULER) ? (s.x < RULER && s.y < RULER ? 'corner' : s.y < RULER ? 'top' : 'left') : null; }
/** The guide under a screen point (index into D.guides), or -1. */
function guideAt(s, tol = handleR(4)) { // a finger grabs from further away (transform.js handleR)
  if (!GUIDE_PREFS.show || !D.guides) return -1;
  let best = -1, bd = tol + 1;
  D.guides.forEach((g, i) => { const d = Math.abs(g.o === 'v' ? V.ox + g.pos * V.zoom - s.x : V.oy + g.pos * V.zoom - s.y); if (d < bd) { bd = d; best = i; } });
  return best;
}
const canGrabGuide = (e) => !GUIDE_PREFS.lock && !TRANSFORM.active && (currentTool().id === 'move' || e.ctrlKey || e.metaKey);
function guidePos(o, e) {
  const p = toDoc(e); let v = o === 'v' ? p.x : p.y;
  if (GUIDE_PREFS.snap) {
    const s = SlopGuides.nearest(o === 'v' ? [0, D.w / 2, D.w] : [0, D.h / 2, D.h], v, 7 / V.zoom);
    if (s) return s.pos;
    if (GUIDE_PREFS.grid && GUIDE_PREFS.snapTo('grid')) { const st = GUIDE_PREFS.gridSize / GUIDE_PREFS.gridSub, gv = Math.round(v / st) * st; if (Math.abs(gv - v) <= 7 / V.zoom) return gv; }
  }
  return e.shiftKey ? Math.round(v / rulerStep(V.zoom) * 10) * rulerStep(V.zoom) / 10 : V.zoom >= 4 ? Math.round(v * 2) / 2 : Math.round(v);
}
function startGuideDrag(e, o, idx) {
  V.guideDrag = { id: e.pointerId, o, idx, pos: idx >= 0 ? D.guides[idx].pos : 0, moved: idx < 0, out: idx < 0, sx: e.clientX, sy: e.clientY };
  try { V.el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
  if (!GUIDE_PREFS.show) store.set('guides', true);
  e.preventDefault(); e.stopImmediatePropagation(); dirty();
}
function onGuidePointerDown(e) {
  if (e.button !== 0 || V.space || (e.pointerType === 'touch' && V.touches.size)) return;
  const s = screenPt(e), r = inRuler(s);
  if (r === 'corner') { e.stopImmediatePropagation(); e.preventDefault(); return; }
  if (r) {
    if (GUIDE_PREFS.lock) { toast(tr('photoslop.guide.locked')); e.stopImmediatePropagation(); return; }
    startGuideDrag(e, r === 'top' ? 'h' : 'v', -1); return;
  }
  if (!canGrabGuide(e)) return;
  const i = guideAt(s);
  if (i >= 0) startGuideDrag(e, D.guides[i].o, i);
}
function onGuidePointerMove(e) {
  const d = V.guideDrag, s = screenPt(e);
  if (!d) {
    const over = !V.op && !V.pan && (inRuler(s) ? null : canGrabGuide(e) ? guideAt(s) : -1);
    const i = typeof over === 'number' ? over : -1;
    V.el.classList.toggle('on-guide-v', i >= 0 && D.guides[i].o === 'v');
    V.el.classList.toggle('on-guide-h', i >= 0 && D.guides[i].o === 'h');
    V.el.classList.toggle('on-ruler', !!inRuler(s) && !V.op);
    if (GUIDE_PREFS.rulers && V.cursorIn) dirty();
    return;
  }
  if (d.id !== e.pointerId) return;
  e.stopImmediatePropagation();
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
  d.moved = true;
  d.pos = guidePos(d.o, e);
  const r = V.el.getBoundingClientRect();
  d.out = e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom || (rulersShown() && (d.o === 'h' ? s.y < RULER : s.x < RULER));
  V.cursor = toDoc(e); emit('cursor');
  dirty();
}
function onGuidePointerUp(e) {
  const d = V.guideDrag; if (!d || d.id !== e.pointerId) return;
  e.stopImmediatePropagation();
  V.guideDrag = null;
  if (!d.moved) { dirty(); return; }
  const list = D.guides.slice();
  if (d.idx >= 0) list.splice(d.idx, 1);
  if (!d.out) list.push({ o: d.o, pos: d.pos });
  else if (d.idx < 0) { dirty(); return; }
  setGuides(list, tr(d.idx < 0 ? 'photoslop.guide.step_new' : d.out ? 'photoslop.guide.step_delete' : 'photoslop.guide.step_move'));
}
function onGuideCancel(e) { if (V.guideDrag && V.guideDrag.id === e.pointerId) { V.guideDrag = null; e.stopImmediatePropagation(); dirty(); } }
function onGuideDblClick(e) {
  const s = screenPt(e);
  if (inRuler(s)) { e.stopImmediatePropagation(); return; }
  if (GUIDE_PREFS.lock || !canGrabGuide(e)) return;
  const i = guideAt(s); if (i < 0) return;
  e.stopImmediatePropagation();
  dlgNewGuide(i);
}
function initGuideInput() {
  const opt = { capture: true };
  V.el.addEventListener('pointerdown', onGuidePointerDown, opt);
  V.el.addEventListener('pointermove', onGuidePointerMove, opt);
  V.el.addEventListener('pointerup', onGuidePointerUp, opt);
  V.el.addEventListener('pointercancel', onGuideCancel, opt);
  V.el.addEventListener('dblclick', onGuideDblClick, opt);
  // After the tools have handled pointer-up, hide the snap indicator.
  window.addEventListener('pointerup', () => { if (V.snapInd) { V.snapInd = null; dirty(); } });
  V.el.addEventListener('contextmenu', (e) => {
    const i = guideAt(screenPt(e)); if (i < 0 || GUIDE_PREFS.lock) return;
    e.preventDefault(); e.stopImmediatePropagation();
    SlopUI.menu([
      { label: tr('photoslop.guide.edit_pos'), act: () => dlgNewGuide(i) },
      { label: tr('photoslop.guide.step_delete'), act: () => { const l = D.guides.slice(); l.splice(i, 1); setGuides(l, tr('photoslop.guide.step_delete')); } },
      '-',
      { label: tr('photoslop.guide.clear_all'), act: clearGuides },
      { label: tr('photoslop.menu.lock_guides'), act: () => togglePref('lockGuides', false, 'lock_guides') },
    ], e.clientX, e.clientY);
  }, opt);
  listeners.add((w) => { if (w === 'doc' && SlopGuides.panel) SlopGuides.panel.refresh(); });
}
