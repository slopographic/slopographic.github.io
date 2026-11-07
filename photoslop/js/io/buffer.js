/* PhotoSlop io: the shared copy-and-drop buffer (window.SlopBuffer, see shared/buffer/).
 * Copy to buffer and Copy merged to buffer put the selection as a PNG. Paste and drop place the buffer as a new layer:
 * a PNG as it is, an SVG rasterised at its own size (the note says so). Classic script. */
'use strict';

/** Copies the selection (or the merged image) to the buffer as a PNG. The internal clipboard gets it too. */
function copyToBuffer(merged) {
  if (!activeLayer()) return;
  const r = copySelectionPixels(merged), stamp = Date.now(); // one stamp: the buffer and the local clipboard agree
  CLIP.canvas = r.canvas; CLIP.x = r.x; CLIP.y = r.y; CLIP.t = stamp;
  canvasToBlob(r.canvas)
    .then((blob) => SlopBuffer.put({ kind: 'image', formats: { 'image/png': blob }, source: 'photoslop', t: stamp }))
    .then(() => toast(tr(merged ? 'photoslop.io.buffer_merged' : 'photoslop.io.buffer_copied')), () => toast(tr('photoslop.io.buffer_copy_failed'), 4200));
}

/** True when the buffer holds something newer than this app's own clipboard. */
function bufferIsNewer() {
  const rec = SlopBuffer.get();
  return !!rec && (!CLIP.t || CLIP.t < rec.t);
}

/** Places the buffer as a new layer. Returns true when it started (the buffer is newer and holds an image). */
function pasteBuffer() {
  if (!bufferIsNewer()) return false;
  return placeBuffer(SlopBuffer.get()) !== false;
}

/** Turns a buffer record into a layer. SVG is rasterised at its own size, and the user is told. */
function placeBuffer(rec) {
  const c = SlopBuffer.choose(rec, ['image/png', 'image/svg+xml']);
  if (!c) return false;
  const made = c.type === 'image/png' ? fileToCanvas(c.data) : SlopBuffer.rasterize(c.data);
  made.then((canvas) => {
    pasteCanvas(canvas, null, null, 'photoslop.layer.pasted_image');
    if (c.type !== 'image/png') toast(tr('photoslop.io.buffer_rasterized'), 4200);
    else if (c.simplified) toast(c.note, 4200);
  }, () => toast(tr('photoslop.io.buffer_unreadable'), 4200));
  return true;
}

/** Drop target: the whole page. Buffer drags carry no files, so the file drop handlers ignore them. */
function bindBufferDrop() {
  if (!window.SlopBuffer) return;
  SlopBuffer.bindDrop(document.body, (rec) => { placeBuffer(rec); });
  SlopBuffer.tray(document.body);
}
