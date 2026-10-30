/* PhotoSlop Auto retouch ▸ Portrait retouch. Loaded on first use (js/retouch/boot.js).
 * Skin: shared/retouch/skin.js (the colour model, learnt from the cheeks when faces are found by shared/faces, cut to the
 * person by the on-device subject matte, eyes, brows and mouth left out). Then, each on its own layer with a mask (paint
 * the mask to refine), bottom to top:
 *   Blemishes       small dark or red spots inside the skin (SlopRetouchSkin.findSpots), healed one by one with
 *                   PhotoSlop's own Spot Healing Brush (healStamp / healPatch, js/tools/heal.js); mask = the healed discs
 *   Skin Smoothing  frequency separation on the healed picture, skin only (SlopRetouchPortrait.smoothSkin); mask = skin
 *   Red Eye         PhotoSlop's red-eye correction (redEyeData, js/filters/repair.js) inside the eyes found by the faces
 *   Teeth / Eyes    light whitening (SlopRetouchPortrait.whiten), when asked for
 * rtPortraitLayers works at any scale (the dialog's preview runs it on a small copy); rtPortrait adds the layers as one
 * history step, "Portrait Retouch". */
'use strict';

/** Bounds of a mask's non-zero pixels, grown by pad and kept inside w × h, or null. */
function rtMaskBox(m, w, hh, pad) {
  let x0 = w, y0 = hh, x1 = -1, y1 = -1;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(hh - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const rtCropU8 = (m, w, b) => { const o = new Uint8Array(b.w * b.h); for (let y = 0; y < b.h; y++) o.set(m.subarray((b.y + y) * w + b.x, (b.y + y) * w + b.x + b.w), y * b.w); return o; };

/** Heals the spots on a copy of src with the Spot Healing Brush's blend; → { canvas, mask } (mask: the healed discs). */
function rtHealSpots(src, spots) {
  const out = copyCanvas(src), S = { g: cx(out) }, m = mkCanvas(src.width, src.height), mg = cx(m);
  mg.fillStyle = '#000';
  // twice: a spot healed next to one not yet healed can borrow a bit of it; the second pass heals from clean skin
  for (let pass = 0; pass < 2; pass++) for (const s of spots) {
    const size = Math.max(6, Math.round(2 * SlopRetouchSkin.healRadius(s.r))), dab = dabCanvas(size, 0.6, '#000000'), tmp = mkCanvas(dab.width, dab.height);
    healStamp(S, { spot: true, rad: size / 2, dab, tmp, tg: cx(tmp), tgt: out }, s.x, s.y);
    if (!pass) { mg.beginPath(); mg.arc(s.x, s.y, size / 2, 0, Math.PI * 2); mg.fill(); }
  }
  blurAlphaCanvas(m, 1.2);
  return { canvas: out, mask: m };
}

/** The portrait layers for a canvas: [{ name, canvas, mask (canvas) }] and what was found.
 *  ctx: { faces (in src px), subject (Uint8 0..255 or null), k (src px per document px, for blemish_size) } */
function rtPortraitLayers(src, a, ctx = {}) {
  const W = src.width, H = src.height, d = rtPixels(src).data, faces = ctx.faces || [], out = [], info = { faces: faces.length, spots: 0 };
  const fw = faces.length ? faces.map((f) => f.w).sort((x, y) => x - y)[faces.length >> 1] : 0;
  // the skin mask from a copy of at most 1024 px (it is smooth), scaled back
  const sm = rtSmall(src, 1024), sk = sm.k, sub = ctx.subject ? rtScaleMask(ctx.subject, W, H, sm.w, sm.h) : null;
  const scaled = faces.map((f) => ({ x: f.x * sk, y: f.y * sk, w: f.w * sk, h: f.h * sk, kps: f.kps && f.kps.map(([x, y]) => [x * sk, y * sk]) }));
  const mask = rtScaleMask(SlopRetouchSkin.skinMask(sm.data, sm.w, sm.h, { faces: scaled, subject: sub }), sm.w, sm.h, W, H);
  const radius = clamp(Math.round(fw ? fw * 0.035 : Math.min(W, H) / 80), 2, 40);
  const box = rtMaskBox(mask, W, H, radius * 3);
  let base = src;
  if (box && a.blemishes !== false) {
    const maxR = a.blemish_size ? a.blemish_size * (ctx.k || 1) : Math.max(4 * (ctx.k || 1), fw ? fw * 0.03 : Math.min(W, H) / 90);
    const cd = cxr(src).getImageData(box.x, box.y, box.w, box.h).data;
    const spots = SlopRetouchSkin.findSpots(cd, box.w, box.h, rtCropU8(mask, W, box), { maxR }).map((s) => ({ x: s.x + box.x, y: s.y + box.y, r: s.r }));
    info.spots = spots.length;
    if (spots.length) { const hs = rtHealSpots(src, spots); base = hs.canvas; out.push({ name: 'Blemishes', canvas: hs.canvas, mask: hs.mask }); } // i18n-ignore: layer names are the document's
  }
  if (box && (a.smoothing ?? 45) > 0) {
    const bd = cxr(base).getImageData(box.x, box.y, box.w, box.h);
    const res = SlopRetouchPortrait.smoothSkin(bd.data, box.w, box.h, rtCropU8(mask, W, box), { strength: a.smoothing ?? 45, radius });
    const c = copyCanvas(base); cx(c).putImageData(new ImageData(res, box.w, box.h), box.x, box.y);
    out.push({ name: 'Skin Smoothing', canvas: c, mask: rtMaskCanvas(mask, W, H) }); // i18n-ignore: layer name
  }
  const regions = faces.map((f) => SlopRetouchSkin.featureRegions(f)).filter(Boolean);
  if (regions.length && a.red_eye !== false) {
    const eyes = SlopRetouchPortrait.regionMap(W, H, regions.flatMap((r) => r.eyes.map((e) => Object.assign({}, e, { rx: e.rx * 0.8, ry: e.ry * 1.1 }))));
    const fixed = redEyeData(new Uint8ClampedArray(d), 50, 60), m = new Uint8Array(W * H);
    let n = 0, area = 0;
    for (let i = 0; i < m.length; i++) {
      if (!eyes[i]) continue;
      area++;
      if (Math.abs(fixed[i * 4] - d[i * 4]) > 20) { m[i] = Math.round(eyes[i] * 255); n++; }
    }
    // a red pupil is a real patch of the eye, not a few reddish pixels in a reflection
    info.redEye = n > Math.max(12, area * 0.015);
    if (info.redEye) { const mc = rtMaskCanvas(m, W, H); blurAlphaCanvas(mc, 1); out.push({ name: 'Red Eye', canvas: rtCanvas(fixed, W, H), mask: mc }); } // i18n-ignore: layer name
  }
  for (const [key, kind, name] of [['teeth', 'teeth', 'Teeth Whitening'], ['eyes', 'eyes', 'Eye Whitening']]) { // i18n-ignore: layer names
    if (!regions.length || !(a[key] > 0)) continue;
    const ell = regions.flatMap((r) => (kind === 'teeth' ? [r.mouth] : r.eyes));
    const r = SlopRetouchPortrait.whiten(d, W, H, SlopRetouchPortrait.regionMap(W, H, ell), a[key], kind);
    if (r.mask.some((v) => v > 8)) out.push({ name, canvas: rtCanvas(r.data, W, H), mask: rtMaskCanvas(r.mask, W, H) });
  }
  info.skin = !!box;
  return { layers: out, info };
}

async function rtPortrait(a = {}) {
  await rtSettle();
  if (!activeLayer()) throw new Error(rtT('no_picture'));
  const src = rtComposite();
  const fr = a.facesFound ? { faces: a.facesFound, note: '' } : await rtFaces(src, a.faces === 'off' ? 'off' : a.askFaces ? 'ask' : 'auto');
  const subject = a.subjectMask !== undefined ? a.subjectMask : a.subject ? await rtSubject(src) : null;
  const r = rtPortraitLayers(src, a, { faces: fr.faces, subject, k: 1 });
  const layers = r.layers.map((L) => ({ name: nextName(L.name), canvas: L.canvas, mask: { canvas: L.mask, x: 0, y: 0, def: false, enabled: true } }));
  if (layers.length) rtAddLayers(layers, rtT('step_portrait'));
  if (window.SlopMacros && a.fromDialog) {
    const o = rtArgsOnly(a); delete o.facesFound; delete o.subjectMask; delete o.askFaces;
    SlopMacros.note('ps.retouch.portrait', o, 'Portrait retouch'); // i18n-ignore: saved in the macro
  }
  dirty(true);
  if (!layers.length) return fr.note ? rtT('no_skin_note', { note: fr.note }) : rtT('no_skin_retouch');
  const list = layers.map((L) => rtT('quoted', { name: L.name })).join(', ');
  return rtT('added_portrait', { layers: list, faces: rtT('n_faces', { n: r.info.faces }), spots: rtT('n_blemishes', { n: r.info.spots }) }) + ' ' +
    rtT('mask_hint') + (fr.note ? ' ' + fr.note : '');
}
