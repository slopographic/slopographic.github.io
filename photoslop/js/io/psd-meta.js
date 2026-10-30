/* PhotoSlop: its own non-pixel layer data in PSDs, as an extra layer block 'SLmd' (UTF-8 JSON).
 * Photoshop skips blocks it does not know; PhotoSlop reads them back, so type stays editable and
 * layer styles, fill/adjustment/shape layers and colour labels survive a save and reopen.
 * The pixels written for each layer are its own (styles are not baked); the merged image shows the full result. */
'use strict';

function psdWriteMeta(W, L) {
  const m = layerMeta(L); delete m.clip; // clipping lives in the standard record
  if (!Object.keys(m).length) return;
  const bytes = new TextEncoder().encode(JSON.stringify(m));
  W.ascii('8BIM'); W.ascii('SLmd');
  const end = W.lenMark();
  W.bytes(bytes);
  end(4);
}
function psdReadMeta(R, end) {
  try { return JSON.parse(new TextDecoder().decode(R.bytes(end - R.p)).replace(/\0+$/, '')); } catch (e) { return null; }
}
