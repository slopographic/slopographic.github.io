/* PhotoSlop layers: several layers selected at once, as in Photoshop. In the Layers panel Shift+click selects the range from
 * the active layer to the clicked one, Ctrl/Cmd+click adds or removes one layer, a plain click selects just that layer;
 * Select ▸ All Layers (Alt+Ctrl+A) takes them all. Move (drag and arrow keys), Free Transform, Delete, Duplicate,
 * Hide/Show, Merge Layers (Ctrl+E) and dragging a row act on every selected layer. */
'use strict';

/** The layer selection. D.activeId stays the primary layer, the one the tools paint on; ids are the others selected with
 *  it. It is UI state and never makes a history step. It counts only while `active` is still D.activeId, so any other way
 *  the active layer changes (a new layer, a delete, a merge, Move's auto-select) leaves just that one layer selected;
 *  undo and redo clear it (core/model.js restore). */
const LSEL = { active: null, ids: [] };
/** The ids of the selected layers in stack order (bottom first); just the active layer when only it is selected. */
function selectedLayerIds() {
  const A = activeLayer(); if (!A) return [];
  if (LSEL.active !== A.id || !LSEL.ids.length) return [A.id];
  const set = new Set(LSEL.ids); set.add(A.id);
  return D.layers.filter((l) => set.has(l.id)).map((l) => l.id);
}
const selectedLayers = () => { const s = new Set(selectedLayerIds()); return D.layers.filter((l) => s.has(l.id)); };
const multiSelected = () => selectedLayerIds().length > 1;
function clearLayerSelection() { LSEL.active = null; LSEL.ids = []; }
/** Selects the layers ids with active as the primary one, and redraws. No history step. */
function setLayerSelection(active, ids) {
  const was = D.activeId;
  D.activeId = active; LSEL.active = active; LSEL.ids = ids.filter((id) => id !== active && layerIndex(id) >= 0);
  if (was !== active) UI.editMask = false;
  emit('doc'); if (was !== active) emit('tool');
}
/** Makes id the active layer and keeps the selection when id is in it (a right-click or Move's auto-select on a selected
 *  layer). Returns false, changing nothing, when id is not one of several selected layers. */
function keepInLayerSelection(id) {
  const s = selectedLayerIds(); if (s.length < 2 || !s.includes(id)) return false;
  D.activeId = id; LSEL.active = id; LSEL.ids = s.filter((x) => x !== id);
  return true;
}
/** A click on a layer row: Shift selects the range from the active layer (Ctrl/Cmd+Shift adds it to the selection),
 *  Ctrl/Cmd toggles the layer in or out (one layer always stays selected), a plain click selects only this layer. */
function layerRowPick(id, e) {
  const mod = e.ctrlKey || e.metaKey;
  if (e.shiftKey) {
    const a = layerIndex(D.activeId), b = layerIndex(id); if (a < 0 || b < 0) return;
    const range = D.layers.slice(Math.min(a, b), Math.max(a, b) + 1).map((l) => l.id);
    setLayerSelection(D.activeId, mod ? [...new Set(selectedLayerIds().concat(range))] : range);
  } else if (mod) {
    const cur = selectedLayerIds();
    if (!cur.includes(id)) { setLayerSelection(id, cur.concat(id)); return; }
    if (cur.length < 2) return;
    const rest = cur.filter((x) => x !== id);
    setLayerSelection(id === D.activeId ? rest[rest.length - 1] : D.activeId, rest);
  } else {
    const had = multiSelected(); clearLayerSelection();
    if (D.activeId !== id) { D.activeId = id; UI.editMask = false; emit('doc'); emit('tool'); } else if (had) emit('doc');
  }
}
/** Select ▸ All Layers: every layer, the active one stays primary. */
function selectAllLayers() { if (D.layers.length) setLayerSelection(activeLayer().id, D.layers.map((l) => l.id)); }

/* ---------- commands on the selection ---------- */
/** Layer ▸ Delete ▸ Delete Layer and the panel's bin: every selected layer. A document keeps at least one layer, so with
 *  every layer selected nothing is deleted. The layer below the lowest deleted one becomes active. */
function deleteSelectedLayers() {
  const ids = selectedLayerIds(); if (ids.length < 2) { deleteLayer(); return; }
  if (ids.length >= D.layers.length) { toast(tr('photoslop.core.need_one_layer')); return; }
  const low = layerIndex(ids[0]);
  D.layers = D.layers.filter((l) => !ids.includes(l.id));
  D.activeId = D.layers[clamp(low - 1, 0, D.layers.length - 1)].id; clearLayerSelection();
  commit(tr('photoslop.menu.delete_layers'));
}
/** Duplicate: a copy of every selected layer above its source; the copies become the selection. */
function duplicateSelectedLayers() {
  const ids = selectedLayerIds(); if (ids.length < 2) { duplicateLayer(); return; }
  const copies = {};
  for (const id of ids) { const i = layerIndex(id), L = layerCopy(D.layers[i]); D.layers.splice(i + 1, 0, L); copies[id] = L.id; }
  D.activeId = copies[D.activeId]; LSEL.active = D.activeId; LSEL.ids = ids.map((id) => copies[id]).filter((id) => id !== D.activeId);
  commit(tr('photoslop.menu.duplicate_layers'));
}
/** Ctrl+E: Merge Layers with two or more selected (into one layer named after the top one), else Merge Down. */
function mergeSelectedOrDown() {
  const list = selectedLayers(); if (list.length < 2) { mergeDown(); return; }
  clearLayerSelection(); mergeLayers(list, list[list.length - 1].name, tr('photoslop.menu.merge_layers'));
}
const mergeLabel = () => tr(multiSelected() ? 'photoslop.menu.merge_layers' : 'photoslop.menu.merge_down');
/** Hide or show every selected layer, one history step. */
function setSelectedVisible(on) {
  for (const id of selectedLayerIds()) patchLayer(id, { visible: on });
  commit(tr(on ? 'photoslop.ctx.show_layers' : 'photoslop.ctx.hide_layers'));
}
/** The Hide/Show row of a layer's right-click menu: for the whole selection when the layer is one of several. */
function layerVisItem(L) {
  const many = multiSelected();
  const k = many ? (L.visible ? 'photoslop.ctx.hide_layers' : 'photoslop.ctx.show_layers') : (L.visible ? 'photoslop.ctx.hide_layer' : 'photoslop.ctx.show_layer');
  return { label: tr(k), act: () => (many ? setSelectedVisible(!L.visible) : setLayerProps(L.id, { visible: !L.visible }, tr(k))) };
}
/** A row dropped on the row targetId (above or below it): the dragged layer, or the whole selection when it is in it,
 *  keeping their order. One history step. */
function dropLayers(dragId, targetId, above) {
  const sel = selectedLayerIds(), ids = sel.includes(dragId) && sel.length > 1 ? sel : [dragId];
  if (ids.length === 1) {
    const from = layerIndex(dragId); let to = layerIndex(targetId) + (above ? 1 : 0);
    if (from < to) to--;
    moveLayer(dragId, to); return;
  }
  if (ids.includes(targetId)) return;
  const moving = D.layers.filter((l) => ids.includes(l.id)), rest = D.layers.filter((l) => !ids.includes(l.id));
  rest.splice(rest.findIndex((l) => l.id === targetId) + (above ? 1 : 0), 0, ...moving);
  if (rest.every((l, i) => l === D.layers[i])) return;
  D.layers = rest; commit(tr('photoslop.core.step_move_layer'));
}
/** The layers Move drags or nudges: every selected unlocked layer when several are selected and no pixels are lifted, else null. */
function moveTargets() {
  if (!multiSelected()) return null;
  const ids = selectedLayers().filter((l) => !l.locked).map((l) => l.id);
  return ids.length ? ids : null;
}
/** The union of rectangles { x, y, w, h } (nulls skipped); null when there is none. */
function unionBounds(rects) {
  let b = null;
  for (const r of rects) {
    if (!r) continue;
    if (!b) { b = Object.assign({}, r); continue; }
    const x1 = Math.max(b.x + b.w, r.x + r.w), y1 = Math.max(b.y + b.h, r.y + r.h); b.x = Math.min(b.x, r.x); b.y = Math.min(b.y, r.y); b.w = x1 - b.x; b.h = y1 - b.y;
  }
  return b;
}
/** The union of the bounds in the document of several layers (snapping a multi-layer move). */
function layersBoundsDoc(ids) { return unionBounds(ids.map((id) => { const L = D.layers.find((l) => l.id === id); return L && layerBoundsDoc(L); })); }
/** The layers Free Transform takes: the active one, and the visible, unlocked layers selected with it. */
const transformLayers = () => { const A = activeLayer(); return selectedLayers().filter((q) => q === A || (q.visible && !q.locked)); };

/* ---------- the panel's blend mode, opacity and lock, and Arrange, on the selection ---------- */
/** Patches every selected layer (opacity while the slider moves); with a label, one history step. */
function setSelectedProps(patch, label) {
  for (const id of selectedLayerIds()) patchLayer(id, patch);
  if (label) commit(label); else emit('doc');
}
/** Lock or unlock every selected layer, as the active one turns (the panel's lock, Layer ▸ Lock / Unlock, Ctrl+/). */
function toggleLockSelected(lockKey, unlockKey) {
  const on = !activeLayer().locked;
  setSelectedProps({ locked: on }, tr(on ? lockKey : unlockKey));
}
/** Layer ▸ Arrange on the selection, keeping its order: front and back move them all to the top or the bottom;
 *  forward and backward move each one step past the next unselected layer (a selected neighbour holds it). */
function arrangeLayers(kind) {
  const ids = new Set(selectedLayerIds()), was = D.layers.slice(), Ls = D.layers.slice(), on = (i) => ids.has(Ls[i].id);
  if (kind === 'front' || kind === 'back') {
    const sel = Ls.filter((l) => ids.has(l.id)), rest = Ls.filter((l) => !ids.has(l.id));
    Ls.splice(0, Ls.length, ...(kind === 'front' ? rest.concat(sel) : sel.concat(rest)));
  } else if (kind === 'forward') {
    for (let i = Ls.length - 2; i >= 0; i--) if (on(i) && !on(i + 1)) [Ls[i], Ls[i + 1]] = [Ls[i + 1], Ls[i]];
  } else {
    for (let i = 1; i < Ls.length; i++) if (on(i) && !on(i - 1)) [Ls[i], Ls[i - 1]] = [Ls[i - 1], Ls[i]];
  }
  if (Ls.every((l, i) => l === was[i])) return;
  D.layers = Ls; commit(tr('photoslop.core.step_move_layer'));
}
