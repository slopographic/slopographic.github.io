/* PhotoSlop watermark: the settings in the PSD as a private image resource (WM_RES_ID, UTF-8 JSON { on, spec }: the
 * site's watermark spec, a logo inside it as a data URL). Photoshop keeps image resources it does not know, so the file still opens there. The watermark is never baked
 * into the PSD's pixels: it is only painted on exports. */
'use strict';

function wmWritePSD(W) {
  const s = D.wm;
  if (!s) return;
  const bytes = new TextEncoder().encode(JSON.stringify({ on: !!s.on, spec: s.spec }));
  W.ascii('8BIM'); W.u16(WM_RES_ID); W.u16(0); W.u32(bytes.length); W.bytes(bytes);
  if (bytes.length % 2) W.u8(0);
}
/** The watermark settings from the image resources between R.p and end (R.p is left where it was), or null. A file
 *  written before the spec holds { on, cfg }: adoptWatermark (state.js) reads both. */
function wmReadPSD(R, end) {
  const at = R.p;
  let out = null;
  try {
    while (R.p + 12 <= end) {
      if (R.ascii(4) !== '8BIM') break;
      const id = R.u16(), nl = R.u8(); R.p += nl + ((nl + 1) % 2);
      const size = R.u32(), next = R.p + size + (size % 2);
      if (id === WM_RES_ID) out = JSON.parse(new TextDecoder().decode(R.bytes(size)));
      R.p = next;
    }
  } catch (e) { out = null; }
  R.p = at;
  return out && typeof out === 'object' ? { on: !!out.on, spec: out.spec || null, cfg: out.cfg || null } : null;
}
