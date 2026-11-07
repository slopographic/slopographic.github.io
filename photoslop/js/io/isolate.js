/* PhotoSlop: Layer ▸ Isolate Subject. The raster layer goes to SlopIsolate through Slop Drive (like Send to), where
 * the person refines the cut-out with the Keep and Remove brushes. "Send back to PhotoSlop" returns the mask, and it
 * becomes that layer's mask here (one undo step; an existing mask is replaced after confirmation). SlopIsolate can
 * also send the cut-out itself back as a new layer. Replies travel on the Slop Hub bus to the tab that asked. */
'use strict';

const ISO = { pending: new Map() }; // requestId → { docId, layerId, x, y, name, hadMask }
const isoHub = () => (document.documentElement.dataset.offline ? null : window.SlopHub || null);
const isoId = () => 'iso' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Layer ▸ Isolate Subject (and the layer right-click menu): opens the layer in SlopIsolate. */
async function isolateSubject(id = D.activeId) {
  const H = isoHub();
  if (!H) return toast(tr('photoslop.io.no_drive'));
  const L = D.layers.find((l) => l.id === id) || activeLayer();
  if (!L) return;
  if (L.text || L.shape) { toast(tr('photoslop.io.rasterize_first')); return; }
  if (L.mask && !(await confirmDlg(tr('photoslop.io.replace_mask'), tr('photoslop.io.replace_mask_body', { name: L.name }), tr('photoslop.io.continue')))) return;
  const requestId = isoId(), name = (L.name || 'Layer') // i18n-ignore: a file name.replace(/[\\/:*?"<>|]+/g, '-') + '.png';
  const blob = await canvasToBlob(copyCanvas(L.canvas), 'image/png');
  const fileId = await H.put(blob, { name, from: 'photoslop', meta: { requestId, intent: 'mask' } });
  ISO.pending.set(requestId, { docId: CUR && CUR.id, layerId: L.id, x: L.x, y: L.y, name: L.name, hadMask: !!L.mask });
  toast(tr('photoslop.io.opening_isolate'));
  await H.sendTo('cutout', null, null, { id: fileId });
}

/** Make the document that asked for an image the current one. Returns its layer, or null if it was closed. */
function isoTarget(p) {
  const rec = CUR && CUR.id === p.docId ? CUR : DOCS.find((r) => r.id === p.docId);
  if (!rec) return null;
  switchToDoc(rec);
  return D.layers.find((l) => l.id === p.layerId) || null;
}

/** The subject mask becomes the layer's mask: alpha = how much shows, one history step. */
function applyIsolatedMask(p, d) {
  const L = isoTarget(p);
  if (!L) return { ok: false, error: tr('photoslop.io.doc_closed') };
  if (L.mask && !p.hadMask) return { ok: false, error: tr('photoslop.io.mask_meanwhile', { name: L.name }) };
  if (d.w !== L.canvas.width || d.h !== L.canvas.height) return { ok: false, error: tr('photoslop.io.mask_size') };
  const c = mkCanvas(d.w, d.h);
  cx(c).putImageData(new ImageData(SlopMaskTransfer.toAlpha(d.mask), d.w, d.h), 0, 0);
  setLayerProps(L.id, { mask: { canvas: c, x: L.x, y: L.y, def: false, enabled: true } }, tr('photoslop.io.step_isolate'));
  return { ok: true };
}

/** The cut-out (PNG with alpha) becomes a new layer at the source layer's position. */
async function applyIsolatedLayer(p, d) {
  const L = isoTarget(p);
  if (!L) return { ok: false, error: tr('photoslop.io.doc_closed') };
  const bmp = await createImageBitmap(d.blob);
  const c = mkCanvas(bmp.width, bmp.height);
  cx(c).drawImage(bmp, 0, 0);
  bmp.close();
  pasteCanvas(c, p.x, p.y, 'photoslop.layer.cutout');
  return { ok: true };
}

/** Listen for SlopIsolate's replies (installed once, when this script loads). Only the tab that asked answers. */
function onIsolateReply(type, ackType, apply) {
  const H = isoHub();
  if (!H) return;
  H.on(type, async (d) => {
    const p = d && ISO.pending.get(d.requestId);
    if (!p) return;
    let res;
    try { res = await apply(p, d); } catch (e) { res = { ok: false, error: e.message || String(e) }; }
    H.emit(ackType, { requestId: d.requestId, ...res });
  });
}
onIsolateReply('slopisolate:mask', 'photoslop:mask-ack', applyIsolatedMask);
onIsolateReply('slopisolate:layer', 'photoslop:layer-ack', applyIsolatedLayer);
