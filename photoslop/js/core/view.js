/* PhotoSlop: the viewport. Zoom/pan, checkerboard, composite cache, marching ants, tool overlays, pointer routing.
 * Touch: #viewport is a touch surface (data-touch-surface="nav" in index.html: SlopNav and this file pinch and pan it);
 * a long press opens the canvas menu (shared/input) and abandons the stroke it began. */
'use strict';

const V = {
  zoom: 1, ox: 0, oy: 0, el: null, canvas: null, g: null, dpr: 1, W: 0, H: 0,
  comp: null, needComp: true, needDraw: true,
  ants: 0, selPath: null, selPathVer: -1,
  cursor: null, cursorIn: false, space: false, pan: null, touches: new Map(), pinch: null,
  op: null, // active pointer op: { tool, id }
};
let checker = null;

function initView() {
  V.el = $('#viewport'); V.canvas = $('#view'); V.g = V.canvas.getContext('2d');
  const c = mkCanvas(16, 16), g = cx(c);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#cccccc'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
  checker = c;
  new ResizeObserver(resizeView).observe(V.el);
  resizeView();
  V.el.addEventListener('pointerdown', onPointerDown);
  V.el.addEventListener('pointermove', onPointerMove);
  V.el.addEventListener('pointerup', onPointerUp);
  V.el.addEventListener('pointercancel', onPointerCancel);
  V.el.addEventListener('pointerleave', () => { V.cursorIn = false; dirty(); });
  V.el.addEventListener('pointerenter', () => { V.cursorIn = true; });
  V.el.addEventListener('wheel', onWheel, { passive: false });
  ctxTarget(V.el, 'canvas', canvasItems); // right-click and Menu key: ui/context.js
  V.el.addEventListener('contextmenu', (e) => {
    if (brushRightContext()) { e.preventDefault(); e.stopPropagation(); return; } // a right-button brush drag (brush-resize.js)
    if (V.op) { const t = V.op.tool; if (e.pointerType === 'touch' || e.slopTouch || !e.button) { if (t.cancel) t.cancel(); V.op = null; } }
  });
  V.el.addEventListener('dblclick', (e) => { const t = currentTool(); V.lastDbl = toDoc(e); if (t.dblclick) t.dblclick(toDoc(e), e); emit('dblclick'); });
  listeners.add((what) => { if (what === 'doc') { V.needComp = true; dirty(); } });
  requestAnimationFrame(frame);
}
function resizeView() {
  const r = V.el.getBoundingClientRect();
  const first = !V.W;
  V.dpr = Math.min(2, window.devicePixelRatio || 1);
  V.W = r.width; V.H = r.height;
  V.canvas.width = Math.max(1, Math.round(r.width * V.dpr)); V.canvas.height = Math.max(1, Math.round(r.height * V.dpr));
  V.canvas.style.width = r.width + 'px'; V.canvas.style.height = r.height + 'px';
  if (first) fitView(true);
  dirty();
}
function dirty(comp) { V.needDraw = true; if (comp) V.needComp = true; }
// Pointer → document goes through the view rotation (view-rot.js); with no rotation viewLocal is the plain viewport offset.
const toDoc = (e) => { const s = viewLocal(e); return { x: (s.x - V.ox) / V.zoom, y: (s.y - V.oy) / V.zoom, pressure: SlopTouch.gesture.pressure(e), pen: e.pointerType === 'pen' }; };
const toScreen = (x, y) => ({ x: x * V.zoom + V.ox, y: y * V.zoom + V.oy });

function fitView(capAt100) {
  const pad = Math.min(48, Math.max(12, V.W * 0.04));
  let z = Math.min((V.W - pad * 2) / D.w, (V.H - pad * 2) / D.h);
  if (capAt100) z = Math.min(z, 1);
  setZoom(z || 1, null, true);
  V.ox = Math.round((V.W - D.w * V.zoom) / 2); V.oy = Math.round((V.H - D.h * V.zoom) / 2);
  dirty();
}
const ZOOMS = [0.01, 0.02, 0.03, 0.05, 0.0667, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 5, 6, 8, 12, 16, 24, 32, 64];
function setZoom(z, anchor, noRecentre) {
  z = clamp(z, 0.01, 64);
  const a = anchor || { x: V.W / 2, y: V.H / 2 };
  const dx = (a.x - V.ox) / V.zoom, dy = (a.y - V.oy) / V.zoom;
  V.zoom = z;
  if (!noRecentre) { V.ox = a.x - dx * z; V.oy = a.y - dy * z; }
  emit('zoom'); dirty();
}
function zoomStep(dir, anchor) {
  const z = V.zoom;
  const next = dir > 0 ? ZOOMS.find((v) => v > z * 1.001) : [...ZOOMS].reverse().find((v) => v < z * 0.999);
  if (next) setZoom(next, anchor);
}
function actualPixels() { setZoom(1); V.ox = Math.round((V.W - D.w) / 2); V.oy = Math.round((V.H - D.h) / 2); dirty(); }

/* ---------- drawing ---------- */
function frame() {
  requestAnimationFrame(frame);
  if (D.sel && document.visibilityState === 'visible') { const t = Math.floor(performance.now() / 90); if (t !== V.ants) { V.ants = t; V.needDraw = true; } }
  if (live && live.animate) V.needDraw = true;
  if (!V.needDraw) return;
  V.needDraw = false;
  draw();
}
function draw() {
  const g = V.g, z = V.zoom;
  g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  if (!V.paste || V.pasteTheme !== document.documentElement.dataset.theme) { V.paste = getComputedStyle(V.el).getPropertyValue('--pasteboard') || '#262626'; V.pasteTheme = document.documentElement.dataset.theme; }
  g.fillStyle = V.paste;
  g.fillRect(0, 0, V.W, V.H);
  if (!D.layers.length) return;
  if (V.needComp || live) {
    if (!V.comp || V.comp.width !== D.w || V.comp.height !== D.h) V.comp = mkCanvas(D.w, D.h);
    const cg = cx(V.comp); cg.clearRect(0, 0, D.w, D.h);
    // While a live edit runs on one layer, the layers beneath it can't change: cache them once.
    const li = live && live.layerId ? layerIndex(live.layerId) : -1;
    if (li > 0) {
      if (!V.below || V.below.live !== live || V.below.w !== D.w || V.below.h !== D.h) {
        const c = V.below && V.below.c.width === D.w && V.below.c.height === D.h ? V.below.c : mkCanvas(D.w, D.h), bg = cx(c);
        bg.clearRect(0, 0, D.w, D.h);
        const keep = live; live = null; compositeInto(bg, { only: D.layers.slice(0, li) }); live = keep;
        V.below = { live, c, w: D.w, h: D.h };
      }
      cg.drawImage(V.below.c, 0, 0);
      compositeInto(cg, { from: li });
    } else compositeInto(cg);
    V.needComp = !!live;
  }
  const x0 = V.ox, y0 = V.oy, w = D.w * z, hh = D.h * z;
  g.save(); rotateCtx(g); // the view rotation: everything up to the brush cursor draws in unrotated view space
  // drop shadow around the page
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 18; g.shadowOffsetY = 4; g.fillStyle = '#fff'; g.fillRect(x0, y0, w, hh); g.restore();
  g.save(); g.beginPath(); g.rect(x0, y0, w, hh); g.clip();
  g.fillStyle = g.createPattern(checker, 'repeat'); g.fillRect(x0, y0, w, hh);
  g.imageSmoothingEnabled = z < 2; g.imageSmoothingQuality = 'high';
  g.drawImage(V.comp, x0, y0, w, hh);
  wmPreviewView(g, x0, y0, w, hh);
  if (z >= 8 && store.get('pixelGrid', true)) {
    g.beginPath(); g.strokeStyle = 'rgba(128,128,128,.35)'; g.lineWidth = 1;
    const ix0 = Math.max(0, Math.floor(-x0 / z)), ix1 = Math.min(D.w, Math.ceil((V.W - x0) / z)), iy0 = Math.max(0, Math.floor(-y0 / z)), iy1 = Math.min(D.h, Math.ceil((V.H - y0) / z));
    for (let x = ix0; x <= ix1; x++) { const sx = Math.round(x0 + x * z) + 0.5; g.moveTo(sx, y0 + iy0 * z); g.lineTo(sx, y0 + iy1 * z); }
    for (let y = iy0; y <= iy1; y++) { const sy = Math.round(y0 + y * z) + 0.5; g.moveTo(x0 + ix0 * z, sy); g.lineTo(x0 + ix1 * z, sy); }
    g.stroke();
  }
  g.restore();
  drawGuidesLayer(g);
  // Selection
  if (D.sel && !(live && live.hideSel)) drawAnts(g);
  if (UI.editMask && UI.maskOverlay) drawMaskOverlay(g);   // the result shows by default; the red tint is a toggle
  const t = currentTool();
  if (t.overlay) { g.save(); t.overlay(g); g.restore(); }
  drawIdleBox(g);
  if (!(V.resize && V.resize.moved) && V.cursorIn && V.cursor && t.brushCursor && !V.pan) {
    const r = Math.max(0.5, (t.brushCursor() * z) / 2), s = toScreen(V.cursor.x, V.cursor.y);
    g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2);
    g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.8)'; g.stroke();
    g.beginPath(); g.arc(s.x, s.y, Math.max(0.5, r - 1), 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
    if (r < 4) { g.fillStyle = '#fff'; g.fillRect(s.x - 0.5, s.y - 4, 1, 8); g.fillRect(s.x - 4, s.y - 0.5, 8, 1); }
  }
  drawTopOverlays(g);
  g.restore();
  if (V.resize && V.resize.moved) drawResizePreview(g); // a Shift-drag brush preview lives in screen space, not the rotated view
}
/** Outline of the selection mask (alpha ≥ 128) as a Path2D in document space. */
function selectionPath(sel) {
  const { mask, bounds: b } = sel;
  const x0 = Math.max(0, b.x - 1), y0 = Math.max(0, b.y - 1), w = Math.min(D.w, b.x + b.w + 1) - x0, hh = Math.min(D.h, b.y + b.h + 1) - y0;
  const d = cxr(mask).getImageData(x0, y0, w, hh).data;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < hh && d[(y * w + x) * 4 + 3] >= 128;
  const p = new Path2D();
  for (let y = 0; y <= hh; y++) {
    let run = -1;
    for (let x = 0; x <= w; x++) {
      const edge = x < w && inside(x, y) !== inside(x, y - 1);
      if (edge && run < 0) run = x;
      else if (!edge && run >= 0) { p.moveTo(x0 + run, y0 + y); p.lineTo(x0 + x, y0 + y); run = -1; }
    }
  }
  for (let x = 0; x <= w; x++) {
    let run = -1;
    for (let y = 0; y <= hh; y++) {
      const edge = y < hh && inside(x, y) !== inside(x - 1, y);
      if (edge && run < 0) run = y;
      else if (!edge && run >= 0) { p.moveTo(x0 + x, y0 + run); p.lineTo(x0 + x, y0 + y); run = -1; }
    }
  }
  return p;
}
function drawAnts(g, sel = D.sel, offset) {
  if (V.selPathVer !== sel.ver) { V.selPath = selectionPath(sel); V.selPathVer = sel.ver; }
  const z = V.zoom;
  g.save();
  g.translate(V.ox + (offset ? offset.x * z : 0), V.oy + (offset ? offset.y * z : 0)); g.scale(z, z);
  g.lineWidth = 1 / z;
  g.setLineDash([4 / z, 4 / z]);
  g.strokeStyle = '#000'; g.lineDashOffset = -V.ants / z; g.stroke(V.selPath);
  g.strokeStyle = '#fff'; g.lineDashOffset = (-V.ants + 4) / z; g.stroke(V.selPath);
  g.restore();
}

/* ---------- input ---------- */
function onPointerDown(e) {
  if (e.target && e.target.closest && e.target.closest('.type-edit')) return; // caret and selection inside the text box
  if (e.pointerType === 'touch') {
    // The first finger of a touch (isPrimary): no other finger is down, whatever this map remembers. iOS sends the lift of
    // a finger whose element left the page to that element, where nothing hears it; a finger kept from then on would make
    // every later one a second finger, a pinch, and the brush would never paint.
    if (e.isPrimary) { V.touches.clear(); V.pinch = null; }
    V.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (V.touches.size === 2) {
      // Second finger: abandon the stroke and pinch/pan instead.
      if (V.op) { const t = V.op.tool; if (t.cancel) t.cancel(); V.op = null; }
      const [a, b] = [...V.touches.values()];
      V.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: V.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox: V.ox, oy: V.oy };
      return;
    }
    if (V.touches.size > 2) return;
  }
  if (e.button === 1 || V.space || (currentTool().id === 'hand' && e.button === 0)) {
    V.pan = { x: e.clientX, y: e.clientY, ox: V.ox, oy: V.oy };
    V.el.setPointerCapture(e.pointerId); V.el.classList.add('panning'); e.preventDefault();
    return;
  }
  if (e.button === 2 && brushRightDown(e)) return; // right-drag resizes the brush; a plain right-click opens the menu
  if (e.button !== 0) return;
  if (isMac && e.ctrlKey && !e.metaKey) return; // Ctrl-click = context menu on a Mac
  if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body && !document.activeElement.closest('.type-edit')) document.activeElement.blur();
  const t = currentTool();
  const p = snapP(toDoc(e), t);
  V.cursor = p;
  if (idleBoxDown(p, e)) { e.preventDefault(); dirty(); return; } // a handle of the layer's box (tools/transform-idle.js)
  if (eyeAltSample(t, p, e)) { e.preventDefault(); return; } // Alt on a painting tool samples the colour and never paints
  // Shift-drag with a brush: left/right = size, up/down = hardness (with Alt: opacity).
  // A Shift-click without dragging still draws a straight line from the last point.
  const bo = typeof BRUSH_OPTS === 'function' && BRUSH_OPTS()[t.id];
  if (bo && e.shiftKey && !TRANSFORM.active) {
    V.resize = { id: e.pointerId, sx: e.clientX, sy: e.clientY, p, e, o: bo, size: bo.size, hard: bo.hardness, op: bo.opacity, moved: false, alt: e.altKey };
    try { V.el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    e.preventDefault(); dirty();
    return;
  }
  if (t.down) {
    V.op = { tool: t, id: e.pointerId };
    try { V.el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    t.down(p, e);
    dirty();
  }
  e.preventDefault();
}
function onPointerMove(e) {
  if (e.pointerType === 'touch' && V.touches.has(e.pointerId)) {
    V.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (V.pinch && V.touches.size === 2) {
      const [a, b] = [...V.touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = clamp((V.pinch.z * d) / V.pinch.d, 0.01, 64);
      const m0 = viewLocal({ clientX: V.pinch.mx, clientY: V.pinch.my }), m1 = viewLocal({ clientX: mx, clientY: my });
      const docX = (m0.x - V.pinch.ox) / V.pinch.z, docY = (m0.y - V.pinch.oy) / V.pinch.z;
      V.zoom = z; V.ox = m1.x - docX * z; V.oy = m1.y - docY * z;
      emit('zoom'); dirty();
      return;
    }
  }
  const p = V.op ? snapP(toDoc(e), V.op.tool) : toDoc(e);
  V.cursor = p; V.cursorIn = true;
  emit('cursor');
  if (V.pan) { const d = viewDelta(e.clientX - V.pan.x, e.clientY - V.pan.y); V.ox = V.pan.ox + d.x; V.oy = V.pan.oy + d.y; dirty(); return; }
  if (V.resize && V.resize.id === e.pointerId) {
    const R = V.resize, dx = e.clientX - R.sx, dy = e.clientY - R.sy;
    if (!R.moved && Math.hypot(dx, dy) > 4) R.moved = true;
    if (R.moved) {
      R.o.size = clamp(Math.round(R.size + dx / V.zoom * 1.2), 1, 1000);
      if (!R.right && (R.alt || e.altKey)) { if (R.o.opacity != null) R.o.opacity = clamp(R.op - dy / 200, 0.01, 1); }
      else if (R.o.hardness != null) R.o.hardness = clamp(R.hard - dy / 200, 0, 1);
      if (R.o.preset) R.o.preset = null;
      emit('options');
    }
    dirty(); return;
  }
  const t = currentTool();
  if (V.op && V.op.id === e.pointerId) {
    const ot = V.op.tool; // the tool that owns the gesture (a box handle hands over to Free Transform mid-drag)
    if (ot.move) {
      const evs = ot.coalesce && e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      if (evs && evs.length > 1) for (const ce of evs) ot.move(toDoc(ce), ce); else ot.move(p, e);
    }
  } else if (t.hover) t.hover(p, e);
  dirty();
}
function onPointerUp(e) {
  if (e.pointerType === 'touch') { V.touches.delete(e.pointerId); if (V.pinch) { if (V.touches.size === 0) V.pinch = null; return; } }
  if (V.pan) { V.pan = null; V.el.classList.remove('panning'); return; }
  if (V.resize && V.resize.id === e.pointerId) {
    const R = V.resize; V.resize = null;
    if (R.right) brushRightEnd(R);
    else if (R.moved) { saveToolOptions(); buildOptions(); }
    else { const t = currentTool(); if (t.down) { t.down(R.p, R.e); if (t.up) t.up(R.p, R.e); } }
    dirty(); return;
  }
  if (V.op && V.op.id === e.pointerId) {
    const t = V.op.tool; V.op = null;
    if (t.up) t.up(snapP(toDoc(e), t), e);
    dirty();
  }
}
function onPointerCancel(e) {
  V.touches.delete(e.pointerId);
  if (V.touches.size === 0) V.pinch = null;
  if (V.pan) { V.pan = null; V.el.classList.remove('panning'); }
  if (V.op && V.op.id === e.pointerId) { const t = V.op.tool; V.op = null; if (t.cancel) t.cancel(); dirty(); }
}
function onWheel(e) {
  e.preventDefault();
  const a = viewLocal(e);
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
  if (e.ctrlKey || e.metaKey || e.altKey) setZoom(V.zoom * Math.exp(-dy * (e.ctrlKey && !e.metaKey && Math.abs(dy) < 50 ? 0.01 : 0.002)), a);
  else { const d = e.shiftKey ? viewDelta(dy || dx, 0) : viewDelta(dx, dy); V.ox -= d.x; V.oy -= d.y; dirty(); }
}
