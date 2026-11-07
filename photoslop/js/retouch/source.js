/* PhotoSlop Auto retouch: the pieces every retouch step shares. Loaded on first use by psRetouch() (js/retouch/boot.js).
 *   rtSettle()                 ends a type edit or a transform first (as the AI commands do)
 *   rtComposite()              the visible picture (all visible layers), document sized: what every retouch works from
 *   rtPixels(c) / rtCanvas(data, w, h) / rtMaskCanvas(u8, w, h)   ImageData in and out; a 0..255 array as a mask canvas
 *   rtSmall(c, max)            { canvas, data, w, h, k }: a copy at most max px on its long side (k = small / full)
 *   rtAddLayers(list, label)   puts the layers above the active one as ONE history step; returns the new records
 *   rtFaces(c, mode)           { faces, note }: SlopFaces (shared/faces, on this device) when the person has turned face
 *                              detection on in Profile; mode 'ask' shows its opt-in first, 'off' skips it
 *   rtSubject(c)               the on-device subject matte (Uint8 0..255, shared/cutout's portrait model) or null
 *   rtDenoise(c, strength)     the AI Tools edge-keeping denoise (app/ai-tools.js aiDenoiseCanvas), loaded on demand */
'use strict';

async function rtSettle() { if (TE.el) await endTypeEdit(); if (TRANSFORM.active) commitTransform(); }
function rtComposite() { return flattenCanvas(); }
function rtPixels(c) { return cxr(c).getImageData(0, 0, c.width, c.height); }
function rtCanvas(data, w, hh) { const c = mkCanvas(w, hh); cx(c).putImageData(new ImageData(data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data), w, hh), 0, 0); return c; }
function rtMaskCanvas(m, w, hh) {
  const img = new ImageData(w, hh);
  for (let i = 0; i < w * hh; i++) img.data[i * 4 + 3] = m[i];
  const c = mkCanvas(w, hh); cx(c).putImageData(img, 0, 0);
  return c;
}
function rtSmall(c, max) {
  const k = Math.min(1, max / Math.max(c.width, c.height)), w = Math.max(1, Math.round(c.width * k)), hh = Math.max(1, Math.round(c.height * k));
  const s = mkCanvas(w, hh), g = cx(s);
  g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, w, hh);
  return { canvas: s, data: rtPixels(s).data, w, h: hh, k };
}
/** Scales a 0..255 array (w × h) up to W × H through a canvas (smooth), back into a Uint8Array. */
function rtScaleMask(m, w, hh, W, H) {
  if (w === W && hh === H) return m;
  const c = mkCanvas(W, H), g = cx(c);
  g.imageSmoothingQuality = 'high'; g.drawImage(rtMaskCanvas(m, w, hh), 0, 0, W, H);
  const d = rtPixels(c).data, out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
  return out;
}

function rtAddLayers(list, label) {
  if (!list.length) return [];
  let i = layerIndex(D.activeId);
  if (i < 0) i = D.layers.length - 1;
  const recs = list.map((p) => newLayerRecord(Object.assign({ x: 0, y: 0 }, p)));
  D.layers.splice(i + 1, 0, ...recs);
  D.activeId = recs[recs.length - 1].id;
  commit(label);
  return recs;
}

/* ---------- faces and the subject (both on this device) ---------- */
const RT_FACE_FILES = ['../shared/faces/copy.js', '../shared/profile/app-options.js', '../shared/faces/decode.js', '../shared/faces/cache.js',
  '../shared/faces/index.js', '../shared/faces/consent.js', '../shared/faces/recognize.js'];
let rtFaceP = null;
function rtFaceScripts() {
  if (window.SlopFaces && SlopFaces.detect && SlopFaces.askOptIn) return Promise.resolve();
  const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); });
  if (!rtFaceP) rtFaceP = RT_FACE_FILES.reduce((p, s) => p.then(() => add(s)), Promise.resolve()).catch((e) => { rtFaceP = null; throw e; });
  return rtFaceP;
}
async function rtFaces(c, mode = 'auto') {
  if (mode === 'off') return { faces: [], note: '' };
  try { await rtFaceScripts(); } catch (e) { return { faces: [], note: rtT('faces_failed') }; }
  const F = window.SlopFaces;
  if (!F.enabled()) {
    if (mode !== 'ask' || !(await F.askOptIn('photoslop'))) return { faces: [], off: true, note: rtT('faces_off_skipped') };
  }
  const faces = (await F.detect(c)).filter((f) => f.w > 12);
  return { faces, note: faces.length ? '' : rtT('no_face_skipped') };
}
async function rtSubject(c) {
  try {
    if (!window.SlopCutout) return null;
    const M = window.SlopCutoutModels && SlopCutoutModels.get && SlopCutoutModels.get('portrait');
    await rtPrepareAI();   // the shared first-use notice names the download once (it throws when the person says no)
    await aiNotice('cutout-portrait', rtT('find_person'), [{ name: rtT('portrait_model'), bytes: (M && M.bytes) || 25888640 }, AI_RUNTIME]);
    const flat = mkCanvas(c.width, c.height), g = cx(flat);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0);
    const r = await SlopCutout.removeBackground(flat, { model: 'portrait' });
    return r && r.mask && r.mask.length === c.width * c.height ? r.mask : null;
  } catch (e) { return null; }
}
/** The assistant's on-demand scripts (app/ai-*.js), where aiNotice and aiDenoiseCanvas live: loaded once. */
function rtPrepareAI() { return typeof aiDenoiseCanvas === 'function' ? Promise.resolve() : window.SlopCmd && SlopCmd.prepare ? SlopCmd.prepare() : loadAICommands(); }
async function rtDenoise(c, strength) {
  if (!strength || strength === 'none') return c;
  await rtPrepareAI();
  return aiDenoiseCanvas(c, strength);
}
