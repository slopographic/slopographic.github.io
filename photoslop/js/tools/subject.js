/* PhotoSlop: Select ▸ Subject. The on-device background remover (shared/cutout, the vendored
 * fast model) runs on the visible composite, over white and its matte becomes the selection, one history
 * step ('Select Subject'). If the model cannot run here (no WebAssembly, a stopped worker), a
 * colour-distance fallback selects whatever differs from the average colour of the border. Then
 * Layer ▸ Layer via Cut moves the selection to a new layer. */
'use strict';

const SUBJECT = { busy: false };

/** Fallback matte: the distance from the border's average colour, softened over 24 levels. */
function borderMatte(c) {
  const w = c.width, hh = c.height, d = cxr(c).getImageData(0, 0, w, hh).data;
  let r = 0, g = 0, b = 0, n = 0;
  const px = (x, y) => { const i = (y * w + x) * 4; if (d[i + 3] > 127) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } };
  for (let x = 0; x < w; x += 2) { px(x, 0); px(x, hh - 1); }
  for (let y = 0; y < hh; y += 2) { px(0, y); px(w - 1, y); }
  if (!n) return new Uint8ClampedArray(w * hh);
  r /= n; g /= n; b /= n;
  const out = new Uint8ClampedArray(w * hh);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const dist = Math.hypot(d[j] - r, d[j + 1] - g, d[j + 2] - b);
    out[i] = clamp((dist - 28) / 24, 0, 1) * d[j + 3];
  }
  return out;
}
/** Matte (w×h alpha, 0..255) → a document-sized selection, or null when nothing is selected. */
function matteSelection(matte) {
  const img = new ImageData(D.w, D.h);
  for (let i = 0; i < matte.length && i < D.w * D.h; i++) img.data[i * 4 + 3] = matte[i];
  const c = mkCanvas(D.w, D.h);
  cx(c).putImageData(img, 0, 0);
  return makeSel(c);
}
/** Select ▸ Subject: the subject of the visible composite (over white), in document space. */
async function selectSubject() {
  if (!activeLayer() || SUBJECT.busy) return;
  const tab = CUR && CUR.id, src = flattenCanvas('#ffffff');
  SUBJECT.busy = true;
  toast(tr('photoslop.tool.finding_subject'));
  let matte, how = 'model';
  try {
    if (!window.SlopCutout) throw new Error('no cutout');
    const r = await SlopCutout.removeBackground(src, { model: 'fast' });
    matte = r.mask;
  } catch (e) {
    matte = borderMatte(src);
    how = 'colour';
  } finally { SUBJECT.busy = false; }
  if (CUR && CUR.id !== tab) return; // the person switched documents meanwhile
  const sel = matteSelection(matte);
  if (!sel) { toast(tr('photoslop.tool.no_subject')); return; }
  D.sel = sel;
  commit(tr('photoslop.tool.step_select_subject'));
  toast(tr('photoslop.tool.subject_by_' + how));
}
