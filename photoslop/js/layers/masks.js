/* PhotoSlop layer masks and clipping masks: the operations behind the Layer menu, the layers
 * panel and the layer right-click menu. A mask is { canvas, x, y, def, enabled }: the canvas alpha
 * is how much of the layer shows (black paint hides, white reveals), and def = true means the
 * area outside the canvas is hidden (Hide All), false means revealed (Reveal All). Every change
 * here is one history step. */
'use strict';

/** Layer ▸ Layer Mask ▸ Invert Mask: swaps shown and hidden. Outside the canvas flips with def. */
function invertMask(id) {
  const L = D.layers.find((l) => l.id === id);
  if (!L || !L.mask) return;
  setLayerProps(id, { mask: SlopMask.invert(L.mask) }, tr('photoslop.layer.step_invert_mask'));
}
/** While a mask is edited with the overlay on (UI.maskOverlay), tints where it hides (the live stroke's mask while
 *  painting). Off by default: the canvas shows the composited result, so black paint hides pixels as it goes. */
function drawMaskOverlay(g) {
  const L = activeLayer(); if (!L || !L.mask || L.mask.enabled === false) return;
  const m = live && live.layerId === L.id && live.maskSurface && live.maskSurface.last ? live.maskSurface.last : L.mask;
  SlopMask.overlay(g, m.canvas, m.x, m.y, V.ox, V.oy, V.zoom);
}

/** The mask overlay on/off (Alt-click a mask thumbnail, View ▸ Mask Overlay): turning it on edits the active layer's
 *  mask. Leaving the mask (editing the pixels) hides it with the mask. */
function toggleMaskOverlay(id) {
  const L = id ? D.layers.find((l) => l.id === id) : activeLayer();
  if (!L || !L.mask) return;
  const on = !(UI.editMask && UI.maskOverlay && D.activeId === L.id);
  D.activeId = L.id; UI.editMask = true; UI.maskOverlay = on;
  emit('doc'); emit('tool'); dirty();
}

/** Clipping mask on/off: a clipped layer shows only where the layer below it is opaque. */
function setClipping(id, on) {
  const i = layerIndex(id);
  if (i < 0) return;
  const L = D.layers[i];
  if (!!L.clip === !!on) return;
  if (on && i === 0) { toast(tr('photoslop.layer.no_layer_below')); return; }
  if (L.locked && on) { toast(tr('photoslop.layer.locked')); return; }
  setLayerProps(id, { clip: on ? true : false }, tr(on ? 'photoslop.layer.step_create_clip' : 'photoslop.layer.step_release_clip'));
}
/** Alt-click on a layer row: toggles the clipping mask of that layer. */
function toggleClippingAt(id) { const L = D.layers.find((l) => l.id === id); if (L) setClipping(id, !L.clip); }
