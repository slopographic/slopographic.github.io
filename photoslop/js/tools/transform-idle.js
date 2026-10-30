/* PhotoSlop tools: the layer's box on the canvas (scale handles and a rotate knob) for the tools that don't paint,
   the Move options' Transform button and X/Y/W/H/rotation fields. Every edit goes through Free Transform. */
'use strict';

/** Painting tools, and tools with their own handles: the box stays hidden under them. */
const BOX_HIDDEN_TOOLS = new Set(['brush', 'pencil', 'clone', 'heal', 'spot', 'redeye', 'remove', 'eraser', 'gradient', 'bucket', 'blur', 'sharpen', 'smudge', 'dodge', 'sponge', 'type', 'shape', 'crop', 'hand', 'zoom', 'eyedropper']);

/** The selected part of the layer (cached per canvas, selection and position). */
const selBoxCache = { c: null, sel: null, x: 0, y: 0, b: null };
function layerSelBounds(L) {
  if (selBoxCache.c !== L.canvas || selBoxCache.sel !== D.sel || selBoxCache.x !== L.x || selBoxCache.y !== L.y) {
    const c = copyCanvas(L.canvas), g = cx(c);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(selInLayer(L), 0, 0);
    const b = alphaBounds(c);
    Object.assign(selBoxCache, { c: L.canvas, sel: D.sel, x: L.x, y: L.y, b: b && { x: b.x + L.x, y: b.y + L.y, w: b.w, h: b.h } });
  }
  return selBoxCache.b;
}
/** The box in document space: the layer's pixels, or the selected part of them. Null when there is none to show. */
function boxTarget() {
  const L = activeLayer();
  if (!L || !L.visible || L.locked || TRANSFORM.active || BOX_HIDDEN_TOOLS.has(UI.tool)) return null;
  return D.sel ? layerSelBounds(L) : layerBoundsDoc(L);
}
/** Drawn when the Layer Bounds view option is on and no drag or transform is running. */
function boxShown() { return !live && !V.op && !TRANSFORM.active && store.get('showBounds', true); }
function boxCorners(b) {
  const a = toScreen(b.x, b.y), z = toScreen(b.x + b.w, b.y + b.h);
  return [{ x: a.x, y: a.y }, { x: z.x, y: a.y }, { x: z.x, y: z.y }, { x: a.x, y: z.y }];
}
function pointerScreen(e) { return viewLocal(e); } // unrotated view space, like toScreen
/** Screen points of the handles and the knob, for the viewport and the tests: eight handles, then the knob. */
function idleBoxPoints() {
  const b = boxTarget(); if (!b || !boxShown()) return [];
  const cs = boxCorners(b);
  return cs.concat([0, 1, 2, 3].map((i) => boxMid(cs, i)), [boxKnob(cs)]);
}
/** What is under a screen point on the box: a handle { hx, hy }, { rotate }, { move } inside the box, or null. */
function idleHit(sc) {
  const b = boxTarget(); if (!b) return null;
  const cs = boxCorners(b), h = boxHandle(cs, sc); if (h) return h;
  const k = boxKnob(cs); if (Math.hypot(k.x - sc.x, k.y - sc.y) < handleR(9)) return { rotate: true };
  return sc.x >= cs[0].x && sc.x <= cs[2].x && sc.y >= cs[0].y && sc.y <= cs[2].y ? { move: true } : null;
}

/** A press on a handle or the knob. Nothing starts until the pointer moves 3 px, so a plain click changes nothing;
    the drag then runs as Free Transform does (Enter applies, Escape cancels). A press inside the box goes to the tool. */
const BOX_GRAB = {
  id: 'transform', p0: null, e0: null, started: false,
  move(p, e) {
    if (!this.started) {
      if (Math.hypot(p.x - this.p0.x, p.y - this.p0.y) * V.zoom < 3) return;
      this.started = true;
      startTransform(); if (!TRANSFORM.active) return;
      TRANSFORM_TOOL.down(this.p0, this.e0);
    }
    if (TRANSFORM.active) TRANSFORM_TOOL.move(p, e);
  },
  up(p, e) { if (TRANSFORM.active) TRANSFORM_TOOL.up(p, e); },
  cancel() { if (TRANSFORM.active) TRANSFORM_TOOL.cancel(); },
};
/** Called by the viewport on pointer down, before the tool. Returns true when the box took the gesture.
    touch-ok: V.el (#viewport) is the canvas touch surface (index.html); the grab radius grows for a finger (handleR). */
function idleBoxDown(p, e) {
  if (!boxShown()) return false;
  const hit = idleHit(pointerScreen(e));
  if (!hit || hit.move) return false;
  Object.assign(BOX_GRAB, { p0: p, e0: e, started: false });
  V.op = { tool: BOX_GRAB, id: e.pointerId };
  try { V.el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
  return true;
}
/** Draws the box over the layer (called from the viewport after the tool's overlay). */
function drawIdleBox(g) {
  const b = boxTarget(); if (!b || !boxShown()) return;
  const cs = boxCorners(b);
  g.save(); drawBox(g, cs); drawKnob(g, cs); g.restore();
}
/** Listeners that need the viewport element: double-click starts Free Transform, handles show their cursor. */
function initBoxTool() {
  // A tool with its own double-click (Polygonal Lasso closes its shape) keeps it.
  V.el.addEventListener('dblclick', (e) => { if (!currentTool().dblclick && boxShown() && idleHit(pointerScreen(e))) startTransform(); });
  let cursorSet = false;
  V.el.addEventListener('pointermove', (e) => {
    const hit = !V.op && boxShown() ? idleHit(pointerScreen(e)) : null;
    if (hit && !hit.move) { V.el.style.cursor = handleCursor(hit); cursorSet = true; }
    else if (cursorSet) { V.el.style.cursor = ''; cursorSet = false; }
  });
}

/* Options bar fields (Move tool). Each change is one Free Transform step. */
const BOX_FIELDS = {};
/** Applies one value: X and Y move the layer, W and H scale it (the left or top edge stays put), the angle turns it. */
function applyBoxField(key, v) {
  startTransform(); if (!TRANSFORM.active) return;
  const t = TRANSFORM;
  if (key === 'x') t.tx = v - t.x;
  else if (key === 'y') t.ty = v - t.y;
  else if (key === 'w' || key === 'h') {
    // The left and top edges stay put. With the proportion lock on, the other side scales by the same factor.
    const s = Math.max(1, v) / (key === 'w' ? t.w : t.h);
    if (key === 'w' || t.lock) { t.sx = s; t.tx = (t.x - t.cx) * (1 - s); }
    if (key === 'h' || t.lock) { t.sy = s; t.ty = (t.y - t.cy) * (1 - s); }
  }
  else t.rot = (v * Math.PI) / 180;
  if (!t.tx && !t.ty && t.sx === 1 && t.sy === 1 && !t.rot) { cancelTransform(); return; }
  commitTransform(TRANSFORM_TOOL.name);
}
function boxField(key, label, unit, step) {
  const i = h('input', { type: 'number', class: 'opt-num wide', step, 'aria-label': label, title: tr('photoslop.tool.enter_applies', { label }) });
  i.addEventListener('change', () => { const v = parseFloat(i.value); if (Number.isFinite(v)) applyBoxField(key, v); });
  BOX_FIELDS[key] = i;
  return h('label', { class: 'opt' }, h('span', null, label), i, h('span', { class: 'opt-u' }, unit));
}
/** The Move options' transform controls: Transform (Ctrl+T) and the layer's X, Y, W, H and rotation. */
function moveBoxOptions() {
  const els = [h('button', { class: 'btn', type: 'button', onclick: startTransform, title: tr('photoslop.tool.free_transform_tip') }, tr('photoslop.tool.transform_btn')),
    boxField('x', 'X', 'px', 1), boxField('y', 'Y', 'px', 1), boxField('w', tr('photoslop.tool.box_w'), 'px', 1), lockButton(), boxField('h', tr('photoslop.tool.box_h'), 'px', 1), boxField('rot', '∠', '°', 0.1)];
  syncBoxFields();
  return els;
}
/** Shows the layer's box in the fields, unless the person is typing in one. The angle is a turn, so it reads 0. */
function syncBoxFields() {
  const b = boxTarget();
  const put = (key, v) => { const i = BOX_FIELDS[key]; if (i && document.activeElement !== i) i.value = v; };
  put('x', b ? Math.round(b.x) : ''); put('y', b ? Math.round(b.y) : ''); put('w', b ? Math.round(b.w) : ''); put('h', b ? Math.round(b.h) : ''); put('rot', 0);
}
listeners.add((w) => { if (w === 'doc' || w === 'history') syncBoxFields(); });
