/* SlopCut: picture placement maths, pure (no DOM). The compositor draws a picture clip fitted into the frame (scale 1 =
   the whole source inside the frame), then scales it by clip.scale about the frame centre, offset by x, y in project
   pixels, with its crop cut away (render/compositor.js). Here:
     SE.fit.frame(frame, src, crop, mode)  the { scale, x, y } that make the visible (cropped) picture fill the frame
                                            ('fill': cover it, no gaps, aspect kept) or fit inside it ('fit': contain)
     SE.fit.SCALE                           the scale limits: the number field takes 1 % to 100 000 %, the slider shows
                                            1 % to 2000 % on a logarithmic track (toSlider / fromSlider, 0 to 1000)
   tests/node/slopcut-pick.test.mjs checks them. */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis, SE = G.SE = G.SE || {};
  const F = SE.fit = {};
  F.SCALE = { min: 0.01, max: 1000, sliderMax: 20, steps: 1000 };

  /** frame { w, h }, src { w, h }, crop { l, t, r, b } (fractions of the source). */
  F.frame = function (frame, src, crop = {}, mode = 'fill') {
    const l = crop.l || 0, t = crop.t || 0, r = crop.r || 0, b = crop.b || 0;
    const vw = Math.max(1e-6, 1 - l - r) * src.w, vh = Math.max(1e-6, 1 - t - b) * src.h; // the visible box, source px
    const base = Math.min(frame.w / src.w, frame.h / src.h);                              // scale 1: the whole source fits
    const s = mode === 'fit' ? Math.min(frame.w / vw, frame.h / vh) : Math.max(frame.w / vw, frame.h / vh);
    // The visible box's centre, from the source centre, in source px; it goes to the frame centre.
    const cx = ((l - r) / 2) * src.w, cy = ((t - b) / 2) * src.h;
    const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
    return { scale: round(s / base, 6), x: round(-cx * s, 3) || 0, y: round(-cy * s, 3) || 0 };
  };

  /** Places clip c of project p (its media m, or none) to fill or fit the frame, unrotated. A clip without a picture
   *  size of its own (title, colour, graphic) already spans the frame at scale 1. Returns c. */
  F.clip = function (p, c, m, mode) {
    c.rot = 0;
    if (!m || !m.w || !m.h) return Object.assign(c, { scale: 1, x: 0, y: 0 });
    return Object.assign(c, F.frame({ w: p.w, h: p.h }, { w: m.w, h: m.h }, { l: c.cropL, t: c.cropT, r: c.cropR, b: c.cropB }, mode));
  };
  /** Clamp a scale (1 = 100 %) to what a clip takes. */
  F.clampScale = (v) => Math.min(F.SCALE.max, Math.max(F.SCALE.min, Number(v) || 1));
  /** Slider position (0 … steps) for a scale: logarithmic from 1 % to 2000 % (beyond: the end of the track). */
  F.toSlider = function (scale) {
    const S = F.SCALE, v = Math.min(S.sliderMax, Math.max(S.min, scale));
    return Math.round((Math.log(v / S.min) / Math.log(S.sliderMax / S.min)) * S.steps);
  };
  /** The scale for a slider position, rounded to a whole percent above 10 % (to 0.1 % below). */
  F.fromSlider = function (pos) {
    const S = F.SCALE, v = S.min * Math.pow(S.sliderMax / S.min, Math.min(S.steps, Math.max(0, pos)) / S.steps);
    return v >= 0.1 ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000;
  };

  if (typeof module === 'object' && module.exports) module.exports = F;
})();
