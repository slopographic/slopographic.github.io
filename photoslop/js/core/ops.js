/* PhotoSlop document: document and layer operations */
'use strict';

/* ---------- document ops ---------- */
function newDocument(w, hh, bg = '#ffffff', name = 'Untitled') { // i18n-ignore: the document's own name
  D.w = w; D.h = hh; D.name = name; D.sel = null; D.guides = []; D.wm = null; live = null;
  const L = newLayerRecord({ name: tr('photoslop.layer.background') });
  if (bg && bg !== 'transparent') { const g = cx(L.canvas); g.fillStyle = bg; g.fillRect(0, 0, w, hh); }
  D.layers = [L]; D.activeId = L.id;
  histReset(tr('photoslop.core.step_new'));
}
function addLayer(props = {}, label = tr('photoslop.core.step_new_layer'), above = true) {
  const L = newLayerRecord(Object.assign({ name: nextName('photoslop.layer.default') }, props));
  const i = layerIndex(D.activeId);
  D.layers.splice(above && i >= 0 ? i + 1 : D.layers.length, 0, L);
  D.activeId = L.id;
  commit(label);
  return L;
}
function deleteLayer(id = D.activeId) {
  if (D.layers.length <= 1) { toast(tr('photoslop.core.need_one_layer')); return; }
  const i = layerIndex(id); if (i < 0) return;
  D.layers.splice(i, 1);
  D.activeId = D.layers[Math.max(0, i - 1)].id;
  commit(tr('photoslop.core.step_delete_layer'));
}
/** Removes every layer and leaves one empty layer (a document always has one). Asks twice; one undo step. */
async function removeAllLayers() {
  const n = D.layers.length;
  if (!n) return;
  const count = tr('photoslop.core.n_layers', { n });
  if (!(await confirmDlg(tr('photoslop.core.remove_all_q'), tr('photoslop.core.remove_all_body', { count, name: D.name }), tr('photoslop.core.continue')))) return;
  if (!(await confirmDlg(tr('photoslop.core.remove_all_q'), tr('photoslop.core.remove_all_body2', { count }), tr('photoslop.core.remove_all'), { danger: true }))) return;
  D.layers = [newLayerRecord({ name: nextName('photoslop.layer.default') })];
  D.activeId = D.layers[0].id;
  commit(tr('photoslop.core.step_remove_all_layers'));
}
function duplicateLayer(id = D.activeId) {
  const i = layerIndex(id); if (i < 0) return;
  const S = D.layers[i];
  const L = Object.assign({}, S, { id: uid(), name: S.name + ' copy', canvas: copyCanvas(S.canvas), mask: S.mask && Object.assign({}, S.mask, { canvas: copyCanvas(S.mask.canvas) }), text: S.text && normText(S.text) });
  D.layers.splice(i + 1, 0, L); D.activeId = L.id;
  commit(tr('photoslop.core.step_duplicate_layer'));
}
function moveLayer(id, toIndex) {
  const i = layerIndex(id); if (i < 0) return;
  toIndex = clamp(toIndex, 0, D.layers.length - 1);
  if (toIndex === i) return;
  const [L] = D.layers.splice(i, 1);
  D.layers.splice(toIndex, 0, L);
  commit(tr('photoslop.core.step_move_layer'));
}
function mergeLayers(list, name, label) {
  if (list.length < 1) return;
  const bottomIdx = layerIndex(list[0].id);
  const c = mkCanvas(D.w, D.h), g = cx(c);
  // Respect the bottom layer's own opacity/blend by compositing everything with their settings.
  for (const L of list) {
    if (!L.visible) continue;
    const b = bakedLayer(L), s = L.fx && L.fx.length ? renderFx(b, L.fx) : b;
    g.globalAlpha = L.opacity; g.globalCompositeOperation = BLEND_OP[L.blend] || 'source-over';
    g.drawImage(s.canvas, s.x, s.y);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const M = newLayerRecord({ name: name || list[0].name, canvas: c });
  D.layers = D.layers.filter((l) => !list.includes(l));
  D.layers.splice(Math.min(bottomIdx, D.layers.length), 0, M);
  D.activeId = M.id;
  commit(label);
}
function mergeDown() {
  const i = layerIndex(D.activeId);
  if (i <= 0) { toast(tr('photoslop.core.no_layer_below')); return; }
  const below = D.layers[i - 1], top = D.layers[i];
  if (!top.visible) { toast(tr('photoslop.core.show_before_merge')); return; }
  mergeLayers([below, top], below.name, tr('photoslop.core.step_merge_down'));
}
function mergeVisible() { const v = D.layers.filter((l) => l.visible); if (v.length) mergeLayers(v, v[0].name, tr('photoslop.core.step_merge_visible')); }
function flattenImage() {
  const c = flattenCanvas('#ffffff');
  const L = newLayerRecord({ name: tr('photoslop.layer.background'), canvas: c });
  D.layers = [L]; D.activeId = L.id;
  commit(tr('photoslop.core.step_flatten'));
}
function setLayerProps(id, patch, label) {
  const L = patchLayer(id, patch);
  if (label) commit(label); else emit('doc');
  return L;
}

/** Apply a pixel function to the active layer (respecting selection). fn(canvas) → new canvas in same layer space. */
function applyToLayer(label, fn, L = activeLayer()) {
  if (!L) return;
  if (L.locked) { toast(tr('photoslop.core.layer_locked')); return; }
  if (L.text || L.shape) L = rasterizeText(L, true);
  const proc = fn(L.canvas, L);
  if (!proc) return;
  const out = D.sel ? mixBySel(L.canvas, proc, selInLayer(L)) : proc;
  patchLayer(L.id, { canvas: out });
  commit(label);
}
function rasterizeText(L, quiet) { const R = patchLayer(L.id, { text: null, shape: null }); if (!quiet) commit(tr('photoslop.core.step_rasterize_type')); return R; }

/** Transform every layer: kind = cw | ccw | 180 | flipH | flipV. */
function transformCanvas(kind) {
  const ow = D.w, oh = D.h, swap = kind === 'cw' || kind === 'ccw';
  const tf = (c, x, y) => {
    const w = c.width, hh = c.height;
    const out = mkCanvas(swap ? hh : w, swap ? w : hh), g = cx(out);
    let nx, ny;
    if (kind === 'cw') { g.translate(hh, 0); g.rotate(Math.PI / 2); nx = oh - (y + hh); ny = x; }
    else if (kind === 'ccw') { g.translate(0, w); g.rotate(-Math.PI / 2); nx = y; ny = ow - (x + w); }
    else if (kind === '180') { g.translate(w, hh); g.rotate(Math.PI); nx = ow - (x + w); ny = oh - (y + hh); }
    else if (kind === 'flipH') { g.translate(w, 0); g.scale(-1, 1); nx = ow - (x + w); ny = y; }
    else { g.translate(0, hh); g.scale(1, -1); nx = x; ny = oh - (y + hh); }
    g.drawImage(c, 0, 0);
    return { c: out, x: nx, y: ny };
  };
  D.layers = D.layers.map((L) => {
    const r = tf(L.canvas, L.x, L.y);
    let mask = L.mask;
    if (mask) { const m = tf(mask.canvas, mask.x, mask.y); mask = Object.assign({}, mask, { canvas: m.c, x: m.x, y: m.y }); }
    return Object.assign({}, L, { canvas: r.c, x: r.x, y: r.y, mask, text: null });
  });
  remapGuides((g) => (kind === 'flipH' ? (g.o === 'v' ? { o: 'v', pos: ow - g.pos } : g) : kind === 'flipV' ? (g.o === 'h' ? { o: 'h', pos: oh - g.pos } : g) : kind === '180' ? { o: g.o, pos: (g.o === 'v' ? ow : oh) - g.pos } : kind === 'cw' ? (g.o === 'v' ? { o: 'h', pos: g.pos } : { o: 'v', pos: oh - g.pos }) : g.o === 'v' ? { o: 'h', pos: ow - g.pos } : { o: 'v', pos: g.pos }));
  if (swap) { D.w = oh; D.h = ow; }
  D.sel = null;
  commit(tr({ cw: 'photoslop.core.step_rotate_cw', ccw: 'photoslop.core.step_rotate_ccw', 180: 'photoslop.core.step_rotate_180', flipH: 'photoslop.core.step_flip_h', flipV: 'photoslop.core.step_flip_v' }[kind]));
}
/** Trim the document to the selection bounds (or a given rect). */
function cropTo(r, deletePixels = true) {
  r = { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) };
  if (deletePixels) {
    D.layers = D.layers.map((L) => {
      const c = mkCanvas(r.w, r.h); cx(c).drawImage(L.canvas, L.x - r.x, L.y - r.y);
      let mask = L.mask;
      if (mask) { const m = mkCanvas(r.w, r.h), g = cx(m); if (mask.def) { g.fillStyle = '#000'; g.fillRect(0, 0, r.w, r.h); g.clearRect(mask.x - r.x, mask.y - r.y, mask.canvas.width, mask.canvas.height); } g.drawImage(mask.canvas, mask.x - r.x, mask.y - r.y); mask = Object.assign({}, mask, { canvas: m, x: 0, y: 0 }); }
      return Object.assign({}, L, { canvas: c, x: 0, y: 0, mask, text: L.text && Object.assign({}, L.text, { x: L.text.x - r.x, y: L.text.y - r.y }), shape: null });
    });
    D.w = r.w; D.h = r.h; D.sel = null; remapGuides((g) => ({ o: g.o, pos: g.pos - (g.o === 'v' ? r.x : r.y) }));
    commit(tr('photoslop.core.step_crop'));
  } else resizeCanvas(r.w, r.h, -r.x, -r.y, tr('photoslop.core.step_crop'));
}

/* ---------- selection → layer ops ---------- */
function copySelectionPixels(merged) {
  const r = D.sel ? D.sel.bounds : { x: 0, y: 0, w: D.w, h: D.h };
  const c = mkCanvas(r.w, r.h), g = cx(c);
  if (merged) { g.drawImage(flattenCanvas(), -r.x, -r.y); }
  else { const L = activeLayer(); const s = bakedLayer(L); g.drawImage(s.canvas, s.x - r.x, s.y - r.y); }
  if (D.sel) { g.globalCompositeOperation = 'destination-in'; g.drawImage(D.sel.mask, -r.x, -r.y); }
  return { canvas: c, x: r.x, y: r.y };
}
function clearSelectionPixels(label = tr('photoslop.core.step_clear')) {
  const L = activeLayer(); if (!L || !D.sel) return;
  if (L.locked) { toast(tr('photoslop.core.layer_locked')); return; }
  const c = copyCanvas(L.canvas), g = cx(c);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(D.sel.mask, -L.x, -L.y);
  patchLayer(L.id, { canvas: c, text: null });
  commit(label);
}
function fillSelection(color, label = tr('photoslop.core.step_fill'), opacity = 1, blend = 'normal', ignoreSel = false) {
  const L0 = activeLayer(); if (!L0) return;
  if (L0.locked) { toast(tr('photoslop.core.layer_locked')); return; }
  const L = coverDoc(L0.text || L0.shape ? rasterizeText(L0, true) : L0);
  const c = copyCanvas(L.canvas), g = cx(c);
  const f = mkCanvas(D.w, D.h), fg = cx(f);
  if (color instanceof HTMLCanvasElement) fg.drawImage(color, 0, 0); else { fg.fillStyle = color; fg.fillRect(0, 0, D.w, D.h); }
  if (D.sel && !ignoreSel) { fg.globalCompositeOperation = 'destination-in'; fg.drawImage(D.sel.mask, 0, 0); }
  g.globalAlpha = opacity; g.globalCompositeOperation = BLEND_OP[blend] || 'source-over';
  g.drawImage(f, -L.x, -L.y);
  patchLayer(L.id, { canvas: c });
  commit(label);
}
