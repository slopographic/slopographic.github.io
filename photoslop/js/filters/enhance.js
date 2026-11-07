/* PhotoSlop filters: Auto Enhance (Filter ▸ Auto Enhance…), on the active layer. The analysis and the rendering are
 * shared/retouch/tone.js, the same maths as Auto Retouch's Auto enhance (js/retouch/enhance.js), here with the dialog's
 * six values: levels (black and white point), white balance (red and blue gains, green the reference), exposure and a
 * vibrance lift that spares skin (shared/retouch/skin.js) unless "Protect skin tones" is off. autoEnhanceValues analyses
 * a small copy of the layer; its values are the dialog's sliders, and "Reset to auto" returns to them. */
'use strict';

/** Pixels of a small copy of src (at most 256 px on its long side). */
function aeSample(src) {
  const k = Math.min(1, 256 / Math.max(src.width, src.height)), w = Math.max(1, Math.round(src.width * k)), hh = Math.max(1, Math.round(src.height * k));
  const c = mkCanvas(w, hh);
  cx(c).drawImage(src, 0, 0, w, hh);
  return { data: cxr(c).getImageData(0, 0, w, hh).data, w, h: hh };
}
const aeRound = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

/** The values Auto Enhance chooses for a layer canvas (white balance relative to green, as the dialog shows it). */
function autoEnhanceValues(src) {
  const s = aeSample(src), v = SlopRetouchTone.analyse(s.data, s.w, s.h);
  return { inB: v.inB, inW: v.inW, wr: aeRound(clamp(v.wr / v.wg, 0.6, 1.6), 3), wb: aeRound(clamp(v.wb / v.wg, 0.6, 1.6), 3), ev: v.ev, sat: v.sat };
}

/** Applies the parameters (levels, white balance, exposure, vibrance) to a layer canvas. */
function autoEnhanceApply(src, p) {
  return withPixels(src, (d, w, hh) => {
    d.set(SlopRetouchTone.apply(d, w, hh, { inB: p.inB, inW: p.inW, wr: p.wr, wg: 1, wb: p.wb, ev: p.ev, sat: p.sat, skin: p.skin !== false }));
  });
}

/** The dialog's parameters for given analysed values (a and the neutral defaults use the same list). */
const AE_PARAMS = (a) => [
  R('inB', 'black_point', 0, 250, a.inB),
  R('inW', 'white_point', 5, 255, a.inW),
  R('wr', 'white_balance_red', 0.6, 1.6, a.wr, { step: 0.001 }),
  R('wb', 'white_balance_blue', 0.6, 1.6, a.wb, { step: 0.001 }),
  R('ev', 'exposure', -1, 1, a.ev, { step: 0.01, unit: 'EV' }),
  R('sat', 'saturation_lift', 0, 30, a.sat, { unit: '%' }),
  P({ k: 'skin', lk: 'protect_skin_tones', type: 'check', v: true }),
];
FILTERS.push(
  // params: neutral defaults (used by code that calls fn directly); plist: the analysed values for the dialog.
  { id: 'autoenhance', menu: 'Auto', auto: true, // i18n-ignore: menu ids
    params: AE_PARAMS({ inB: 0, inW: 255, wr: 1, wb: 1, ev: 0, sat: 0 }),
    plist: (base) => AE_PARAMS(autoEnhanceValues(base)),
    fn: (s, p) => autoEnhanceApply(s, p) },
);
