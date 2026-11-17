/* PhotoSlop shape layers. A rectangle or rounded rectangle drawn with the Shape tool keeps
 * L.shape = { kind, r: { x, y, w, h }, radius, fill, stroke, strokeW, fg, bg } (r is in layer coordinates; the layer
 * sits at x = y = 0 when drawn). Its canvas is drawn from that record, so changing the Corner radius option
 * redraws the layer. Pixel edits, transforms and crops rasterize or drop the record, as type layers do. */
'use strict';

const SHAPE_RADIUS_KINDS = ['rect', 'rounded'];
/** Fill and stroke of a shape, with the path from the shared module (shared/shapes/rounded.js). sh: { kind, r, radius, ... }. */
function drawShape(g, sh) {
  shapePath(g, sh.kind, sh.r, sh);
  if (sh.fill) { g.fillStyle = sh.fg; g.fill(); }
  if (sh.stroke || !sh.fill) { g.lineJoin = 'round'; g.lineWidth = sh.strokeW; g.strokeStyle = sh.fill ? sh.bg : sh.fg; g.stroke(); }
}
/** A full-document canvas drawn from a shape record. */
function renderShapeLayer(sh) { const c = mkCanvas(D.w, D.h); drawShape(cx(c), sh); return c; }
/** The record for a shape the Shape tool just drew (only rectangles keep one; other kinds stay plain pixels). */
function shapeRecord(o, r) {
  return { kind: o.kind, r, radius: Math.max(0, +o.radius || 0), fill: !!o.fill, stroke: !!o.stroke, strokeW: o.strokeW, fg: C.fg, bg: C.bg };
}

/* The Corner radius option edits the active shape layer. Each change is one history step: a slider drag settles
 * into a single step (400 ms after the last move), a typed value is one step. */
let lastShapeRadius = Math.max(0, +T.shape.radius || 0);
let shapeEdit = null;
function flushShapeEdit() { if (!shapeEdit) return; clearTimeout(shapeEdit.timer); shapeEdit = null; commit(tr('photoslop.tool.step_corner_radius')); }
function syncShapeRadius() {
  const r = Math.max(0, +T.shape.radius || 0);
  if (r === lastShapeRadius) return; // only the option itself changing counts
  lastShapeRadius = r;
  const L = activeLayer();
  if (!L || !L.shape || !SHAPE_RADIUS_KINDS.includes(L.shape.kind) || L.locked || !L.visible || UI.editMask) return;
  const sh = Object.assign({}, L.shape, { radius: r });
  patchLayer(L.id, { shape: sh, canvas: renderShapeLayer(sh) });
  if (shapeEdit && shapeEdit.id !== L.id) flushShapeEdit();
  if (shapeEdit) clearTimeout(shapeEdit.timer);
  shapeEdit = { id: L.id, timer: setTimeout(flushShapeEdit, 400) };
  emit('doc');
}
listeners.add((w) => { if (w === 'options') syncShapeRadius(); });
