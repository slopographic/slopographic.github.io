/* PhotoSlop Auto retouch ▸ Auto enhance and Straighten. Loaded on first use (js/retouch/boot.js).
 * The maths is shared/retouch/tone.js (the same analysis Filter ▸ Auto Enhance… shows in its dialog) and
 * shared/retouch/horizon.js; the denoise is the AI Tools edge-keeping filter (app/ai-tools.js aiDenoiseCanvas).
 * Auto enhance works on the visible picture and puts the result in a new layer, "Auto Enhance", above the active one:
 * hide it, lower its opacity or paint its mask to take the change back anywhere. One history step (with Straighten, the
 * rotation and crop are folded into the same step). */
'use strict';

/** The analysed values for a canvas (a copy of at most 256 px). */
function rtEnhanceValues(c) { const s = rtSmall(c, 256); return SlopRetouchTone.analyse(s.data, s.w, s.h); }
/** The tone parameters from the analysed values and the command's switches (a missing switch is on). */
function rtEnhanceParams(v, a = {}) {
  const on = (k) => a[k] !== false;
  return {
    inB: on('levels') ? v.inB : 0, inW: on('levels') ? v.inW : 255,
    wr: on('white_balance') ? v.wr : 1, wg: on('white_balance') ? v.wg : 1, wb: on('white_balance') ? v.wb : 1,
    ev: on('exposure') ? v.ev : 0, shadows: on('shadows_highlights') ? v.shadows : 0, highlights: on('shadows_highlights') ? v.highlights : 0,
    sat: on('vibrance') ? v.sat : 0, skin: true, strength: a.strength ?? 100, sharpen: a.sharpen ?? v.sharpen,
  };
}
const rtTone = (c, p) => rtCanvas(SlopRetouchTone.apply(rtPixels(c).data, c.width, c.height, p), c.width, c.height);
/** The enhanced canvas: tone, then denoise, then the sharpening (so the noise is not sharpened). */
async function rtEnhanceCanvas(src, p, denoise) {
  let out = rtTone(src, Object.assign({}, p, { sharpen: 0 }));
  out = await rtDenoise(out, denoise);
  if (p.sharpen) out = rtTone(out, { sharpen: (p.sharpen * (p.strength ?? 100)) / 100 });
  return out;
}
function rtDescribe(p) {
  const parts = [rtT('d_levels', { lo: String(p.inB), hi: String(p.inW) }), rtT('d_white_balance', { r: String(p.wr), g: String(p.wg), b: String(p.wb) }),
    rtT('d_exposure', { ev: (p.ev > 0 ? '+' : '') + p.ev })];
  if (p.shadows || p.highlights) parts.push(rtT('d_shadows_highlights', { s: String(p.shadows), h: String(p.highlights) }));
  if (p.sat) parts.push(rtT('d_vibrance', { pct: String(p.sat) }));
  if (p.sharpen) parts.push(rtT('d_sharpen', { pct: String(p.sharpen) }));
  return parts.join(', ');
}

async function rtAutoEnhance(a = {}) {
  await rtSettle();
  if (!activeLayer()) throw new Error(rtT('no_picture_enhance'));
  await rtPrepareAI();
  const src = rtComposite(), p = rtEnhanceParams(rtEnhanceValues(src), a);
  const tilt = a.straighten ? rtTilt(src) : null, fix = tilt && Math.abs(tilt.angle) >= 0.2 && tilt.confidence >= 0.3;
  const out = await rtEnhanceCanvas(src, p, a.denoise);
  await aiOneStep(rtT('step_auto_enhance'), () => {
    rtAddLayers([{ name: nextName('photoslop.layer.auto_enhance'), canvas: out }], rtT('step_auto_enhance'));
    if (fix) rtStraighten(tilt.angle, true);
  });
  if (window.SlopMacros && a.fromDialog) SlopMacros.note('ps.retouch.auto-enhance', rtArgsOnly(a), 'Auto enhance'); // i18n-ignore: saved in the macro
  dirty(true);
  const what = rtDescribe(p) + (a.denoise && a.denoise !== 'none' ? rtT('d_denoise_' + a.denoise) : '');
  return rtT('added_enhance', { what }) + (a.straighten ? ' ' + (fix ? rtT('straightened_by', { deg: String(-tilt.angle) }) : rtT('looks_level')) : '');
}
/** The command's own arguments (what a macro records), without the dialog's extras. */
function rtArgsOnly(a) { const o = Object.assign({}, a); delete o.fromDialog; return o; }

/* ---------- straighten ---------- */
function rtTilt(c) {
  const s = rtSmall(c, 400);
  return SlopRetouchHorizon.detectTilt(SlopRetouchCore.lumaOf(s.data, s.w, s.h), s.w, s.h);
}
/** Rotates every layer (and mask) about the document centre by −angle and, with crop, keeps the largest box of the
 *  picture's own proportions that has no empty corners. One history step, 'Straighten'. */
function rtStraighten(angle, crop = true) {
  const box = crop ? SlopRetouchHorizon.straightenBox(D.w, D.h, angle) : { w: D.w, h: D.h };
  const W = box.w, H = box.h, rad = (-angle * Math.PI) / 180, dw = D.w, dh = D.h;
  const rot = (c, x, y) => {
    const o = mkCanvas(W, H), g = cx(o);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.translate(W / 2, H / 2); g.rotate(rad); g.translate(-dw / 2, -dh / 2); g.drawImage(c, x, y);
    return o;
  };
  D.layers = D.layers.map((L) => {
    const n = Object.assign({}, L, { canvas: rot(L.canvas, L.x, L.y), x: 0, y: 0, text: null, shape: null });
    if (L.mask) n.mask = Object.assign({}, L.mask, { canvas: rot(SlopMask.align(L.mask, dw, dh, 0, 0), 0, 0), x: 0, y: 0 });
    return n;
  });
  D.w = W; D.h = H; D.sel = null;
  remapGuides(() => null);
  commit(rtT('step_straighten'));
  fitView();
}
async function rtStraightenCmd(a = {}) {
  await rtSettle();
  let angle = a.angle, how = rtT('how_given');
  if (angle == null) {
    const t = rtTilt(rtComposite());
    if (!t || t.confidence < 0.2) return rtT('no_lines_cmd');
    angle = t.angle; how = rtT(t.kind === 'horizon' ? 'how_horizon' : 'how_verticals', { c: String(t.confidence) });
  }
  if (Math.abs(angle) < 0.1) return rtT('is_level', { deg: String(angle) });
  rtStraighten(angle, a.crop !== false);
  return rtT('rotated_by', { deg: String(-angle), how, w: D.w, h: D.h });
}
function rtDetectTilt() {
  const t = rtTilt(rtComposite());
  if (!t) return rtT('no_strong_lines');
  return rtT(t.kind === 'horizon' ? 'tilt_info_horizon' : 'tilt_info_verticals', { deg: String(t.angle), c: String(t.confidence), rot: String(-t.angle) });
}
/** Image ▸ Straighten…: detect, then ask. */
async function rtStraightenAsk() {
  await rtSettle();
  const t = rtTilt(rtComposite());
  if (!t || t.confidence < 0.2) { alertDlg(rtT('straighten'), rtT('no_lines')); return; }
  if (Math.abs(t.angle) < 0.1) { alertDlg(rtT('straighten'), rtT('already_level')); return; }
  const ok = await confirmDlg(rtT('straighten'), rtT(t.kind === 'horizon' ? 'ask_horizon' : 'ask_verticals', { deg: String(Math.abs(t.angle)), rot: String(-t.angle) }), rtT('straighten'));
  if (!ok) return;
  rtStraighten(t.angle, true);
  if (window.SlopMacros) SlopMacros.note('ps.retouch.straighten', { angle: t.angle, crop: true }, 'Straighten'); // i18n-ignore: saved in the macro
}
