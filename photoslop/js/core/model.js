/* PhotoSlop: document model, history, compositing, selection.
 *
 * Every layer record and every canvas attached to one is treated as immutable
 * once it is in the document: edits make a new canvas and a new record. That
 * makes a history snapshot just a shallow copy of the layer list, and undo
 * shares unchanged pixels between states. */
'use strict';

const BLENDS = [
  // key, label (a getter: photoslop.core.blend_<key>, set by trPairs below), canvas composite op, PSD key
  ['normal', '', 'source-over', 'norm'],
  ['darken', '', 'darken', 'dark'],
  ['multiply', '', 'multiply', 'mul '],
  ['color-burn', '', 'color-burn', 'idiv'],
  ['lighten', '', 'lighten', 'lite'],
  ['screen', '', 'screen', 'scrn'],
  ['color-dodge', '', 'color-dodge', 'div '],
  ['add', '', 'lighter', 'lddg'],
  ['overlay', '', 'overlay', 'over'],
  ['soft-light', '', 'soft-light', 'sLit'],
  ['hard-light', '', 'hard-light', 'hLit'],
  ['difference', '', 'difference', 'diff'],
  ['exclusion', '', 'exclusion', 'smud'],
  ['hue', '', 'hue', 'hue '],
  ['saturation', '', 'saturation', 'sat '],
  ['color', '', 'color', 'colr'],
  ['luminosity', '', 'luminosity', 'lum '],
];
trPairs(BLENDS, 'photoslop.core.blend_');
const BLEND_OP = Object.fromEntries(BLENDS.map((b) => [b[0], b[2]]));
const BLEND_PSD = Object.fromEntries(BLENDS.map((b) => [b[0], b[3]]));
const PSD_BLEND = Object.fromEntries(BLENDS.map((b) => [b[3], b[0]]));

const D = { w: 1200, h: 800, name: 'Untitled', layers: [], activeId: 0, sel: null, dirty: false, fileHandleName: null, guides: [], wm: null }; // i18n-ignore: the document's own name (its file name)
const Hist = { states: [], idx: -1 };
/** Live (uncommitted) edit shown in previews: brush strokes, filter previews, transforms. */
let live = null;
const listeners = new Set();
function emit(what) { for (const f of listeners) f(what); }

/* ---------- layers ---------- */
/** Non-pixel layer data saved by autosave and in PSDs (block 'SLmd'): type, styles, fill/adjustment/shape layers, labels, clipping. */
const LAYER_META = ['text', 'fx', 'fill', 'adj', 'shape', 'label', 'clip', 'fillOp'];
const layerMeta = (L) => { const o = {}; for (const k of LAYER_META) if (L[k] != null && L[k] !== false) o[k] = L[k]; return o; };
function newLayerRecord(props) {
  return Object.assign({ id: uid(), name: 'Layer', canvas: mkCanvas(D.w, D.h), x: 0, y: 0, visible: true, opacity: 1, blend: 'normal', locked: false, mask: null, text: null }, props); // i18n-ignore: layer names are the document's
}
const activeLayer = () => D.layers.find((l) => l.id === D.activeId) || D.layers[D.layers.length - 1];
const layerIndex = (id) => D.layers.findIndex((l) => l.id === id);
/** Replace a layer record (immutably) with a patched copy. */
function patchLayer(id, patch) {
  const i = layerIndex(id); if (i < 0) return null;
  const L = Object.assign({}, D.layers[i], patch);
  D.layers[i] = L;
  return L;
}
/** The first free layer name, "<base> <n>". A base that is a key of photoslop.layer.* (its string holds {n}, "Layer {n}")
 *  gives the name in the chosen language, as a new layer gets it; a name a layer already has never changes. */
function nextName(base) {
  const keyed = /^photoslop\.layer\./.test(base) && tr(base, { n: 1 }) !== base;   // a file named like a key keeps its name
  const at = keyed ? (n) => tr(base, { n }) : (n) => `${base} ${n}`;
  let n = 1; const names = new Set(D.layers.map((l) => l.name));
  while (names.has(at(n))) n++;
  return at(n);
}
/** A copy of the layer whose canvas covers at least the whole document (painting may go anywhere on the page). */
function coverDoc(L) {
  const x0 = Math.min(L.x, 0), y0 = Math.min(L.y, 0);
  const x1 = Math.max(L.x + L.canvas.width, D.w), y1 = Math.max(L.y + L.canvas.height, D.h);
  if (x0 === L.x && y0 === L.y && x1 === L.x + L.canvas.width && y1 === L.y + L.canvas.height) return L;
  const c = mkCanvas(x1 - x0, y1 - y0);
  cx(c).drawImage(L.canvas, L.x - x0, L.y - y0);
  let mask = L.mask;
  if (mask) {
    mask = Object.assign({}, mask, { canvas: SlopMask.align(mask, c.width, c.height, x0, y0), x: x0, y: y0 });
  }
  return patchLayer(L.id, { canvas: c, x: x0, y: y0, mask });
}

/* ---------- history ---------- */
function snapshot(label) { return { label, w: D.w, h: D.h, layers: D.layers.slice(), activeId: D.activeId, sel: D.sel, guides: D.guides || [] }; }
function restore(s) {
  D.w = s.w; D.h = s.h; D.layers = s.layers.slice(); D.activeId = s.activeId; D.sel = s.sel; D.guides = s.guides || [];
  live = null; emit('doc');
}
function histReset(label) { Hist.states = [snapshot(label)]; Hist.idx = 0; D.dirty = false; emit('history'); emit('doc'); }
function commit(label) {
  Hist.states.length = Hist.idx + 1;
  Hist.states.push(snapshot(label));
  Hist.idx++;
  trimHistory();
  D.dirty = true;
  emit('history'); emit('doc');
}
function trimHistory() {
  const MAX_STATES = 60, MAX_BYTES = 900e6;
  while (Hist.states.length > MAX_STATES) { Hist.states.shift(); Hist.idx--; }
  for (;;) {
    const seen = new Set(); let bytes = 0;
    for (const s of Hist.states) for (const L of s.layers) for (const c of [L.canvas, L.mask && L.mask.canvas]) if (c && !seen.has(c)) { seen.add(c); bytes += c.width * c.height * 4; }
    if (bytes <= MAX_BYTES || Hist.idx < 2) break;
    Hist.states.shift(); Hist.idx--;
  }
}
function undo() { if (Hist.idx > 0) { Hist.idx--; restore(Hist.states[Hist.idx]); D.dirty = true; emit('history'); } }
function redo() { if (Hist.idx < Hist.states.length - 1) { Hist.idx++; restore(Hist.states[Hist.idx]); D.dirty = true; emit('history'); } }
function jumpHistory(i) { if (i >= 0 && i < Hist.states.length) { Hist.idx = i; restore(Hist.states[i]); emit('history'); } }
