/* PhotoSlop layer effects: the non-destructive effect stack (L.fx).
 * L.fx is an immutable list of { id, type, on, p }. type is a 'style' entry of FILTERS (Drop Shadow,
 * Outer Glow, Stroke, Color Overlay, Bevel & Emboss), p its parameters and on the eye toggle.
 * The same definitions and renderers as the old baked styles run here, in list order, over the
 * layer's pixels (after its mask). No pixels change, so the stack stays editable. Every change
 * builds new arrays and records, so history snapshots stay valid. */
'use strict';

/** Effect types: the 'style' entries of FILTERS, which are also their renderers. */
/* Filters that a layer effect can also be (for effect presets, fx-presets.js): the same renderers, run non-destructively. */
const FX_PRESET_FILTERS = ['gauss', 'sharpen', 'noise', 'vignette', 'huesat', 'glitch'];
const FX_DEFS = FILTERS.filter((f) => (f.menu === 'style' || FX_PRESET_FILTERS.includes(f.id)) && f.fn);
const FX_BY_ID = Object.fromEntries(FX_DEFS.map((f) => [f.id, f]));
const FX_PAD_MAX = 400;

const fxClone = (o) => JSON.parse(JSON.stringify(o));
/** The default parameters of an effect type (@fg and @bg resolve to the palette). */
function fxDefaults(typeId) {
  const p = {};
  for (const q of FX_BY_ID[typeId].params) if (q.k) p[q.k] = q.v === '@fg' ? C.fg : q.v === '@bg' ? C.bg : fxClone(q.v);
  return p;
}
/** "Drop Shadow, 35%": the effect's name and its main amount. */
function fxLabel(e) {
  const def = FX_BY_ID[e.type];
  if (!def) return String(e.type);
  const amount = e.p.op != null ? e.p.op + '%' : e.p.size + 'px';
  return `${def.name.replace('…', '')}, ${amount}`;
}
/** Pixels a stack needs around the layer so shadows and glows are not cut off. */
function fxPad(list) {
  let pad = 0;
  for (const e of list) pad = Math.max(pad, Math.ceil((+e.p.dist || 0) + (+e.p.size || 0) + (+e.p.spread || 0)) + 2);
  return Math.min(pad, FX_PAD_MAX);
}
/** The layer's Fill (0 to 1, layer.fillOp; 1 when unset). Fill scales the layer's own pixels, not its effects. */
const fillOf = (L) => (L.fillOp == null ? 1 : L.fillOp);
/** True when the layer has an effect switched on that PhotoSlop renders. */
const fxOn = (L) => (L.fx || []).some((e) => e.on !== false && FX_BY_ID[e.type]);
/** The alpha a layer is composited with: its opacity, and its fill too when no effect draws (then fill is pixel opacity). */
const layerAlpha = (L) => L.opacity * (fxOn(L) ? 1 : fillOf(L));
/** A layer surface {canvas, x, y, w?} with the enabled effects applied in list order. fill (0 to 1) scales the pixels first. */
function renderFx(s, list, fill = 1) {
  const on = list.filter((e) => e.on !== false && FX_BY_ID[e.type]);
  if (!on.length) return s;
  const w = s.w || s.canvas.width, hh = s.h || s.canvas.height, pad = fxPad(on);
  let c = mkCanvas(w + 2 * pad, hh + 2 * pad);
  cx(c).globalAlpha = fill; cx(c).drawImage(s.canvas, 0, 0, w, hh, pad, pad, w, hh); cx(c).globalAlpha = 1;
  const env = { fg: C.fg, bg: C.bg };
  for (const e of on) c = FX_BY_ID[e.type].fn(c, fxClone(e.p), env);
  return { canvas: c, x: s.x - pad, y: s.y - pad, w: c.width, h: c.height };
}
/** Cache per layer canvas: rebuilt only when the stack, mask or position changes. */
const fxCache = new WeakMap();
/** The layer surface s (from layerSurface) with its effects. Live edits are never cached. */
function fxSurface(L, s) {
  if (!fxOn(L)) return s;
  if (live && live.layerId === L.id) return renderFx(s, L.fx, fillOf(L));
  const e = fxCache.get(L.canvas), fill = fillOf(L);
  if (e && e.fx === L.fx && e.mask === L.mask && e.x === L.x && e.y === L.y && e.fill === fill) return e.out;
  const out = renderFx(s, L.fx, fill);
  fxCache.set(L.canvas, { fx: L.fx, mask: L.mask, x: L.x, y: L.y, fill, out });
  return out;
}

/* ---------- edits (each one history step) ---------- */
const fxOf = (layerId) => { const L = D.layers.find((l) => l.id === layerId); return (L && L.fx) || []; };
const fxIndex = (layerId, fxId) => fxOf(layerId).findIndex((e) => e.id === fxId);
function setFxStack(layerId, list, label) {
  patchLayer(layerId, { fx: list.length ? list : null });
  commit(label);
}
function setFxProps(layerId, fxId, patch, label) {
  setFxStack(layerId, fxOf(layerId).map((e) => (e.id === fxId ? Object.assign({}, e, patch) : e)), label);
}
function removeFx(layerId, fxId) {
  setFxStack(layerId, fxOf(layerId).filter((e) => e.id !== fxId), tr('photoslop.fx.delete_effect'));
}
/** Move an effect to index `to` in the stack (0 = applied first, drawn lowest). */
function moveFx(layerId, from, to) {
  const list = fxOf(layerId).slice();
  if (from < 0 || from >= list.length) return;
  to = clamp(to, 0, list.length - 1);
  if (to === from) return;
  const [e] = list.splice(from, 1);
  list.splice(to, 0, e);
  setFxStack(layerId, list, tr('photoslop.fx.step_move_effect'));
}
