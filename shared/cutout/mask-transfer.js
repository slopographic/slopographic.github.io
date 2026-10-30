/* SlopMaskTransfer: moves a cut-out between an image's alpha and a mask, for PhotoSlop layer masks and SlopIsolate.
 * A mask is Uint8ClampedArray (w*h, 0..255, 255 = keep). Alpha and grey pixels are RGBA byte arrays (w*h*4).
 *   fromAlpha(rgba, w, h)   the alpha channel as a mask            (layer pixels → mask)
 *   toAlpha(mask)           RGBA black with alpha = mask           (PhotoSlop layer mask canvas: black paint hides)
 *   toGrey(mask)            RGBA grey, opaque                      (a viewable mask image, e.g. a Drive PNG)
 *   fromGrey(rgba)          the red channel as a mask              (reads a grey mask image back)
 *   applyAlpha(rgba, mask)  a copy of rgba whose alpha is multiplied by mask
 * Classic script, sets window.SlopMaskTransfer. Pure functions: no DOM. */
(function () {
  'use strict';
  const MT = {};

  MT.fromAlpha = function (rgba, w, h) {
    const n = w * h, out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) out[i] = rgba[i * 4 + 3];
    return out;
  };
  MT.toAlpha = function (mask) {
    const out = new Uint8ClampedArray(mask.length * 4);
    for (let i = 0, j = 0; i < mask.length; i++, j += 4) out[j + 3] = mask[i];
    return out;
  };
  MT.toGrey = function (mask) {
    const out = new Uint8ClampedArray(mask.length * 4);
    for (let i = 0, j = 0; i < mask.length; i++, j += 4) { out[j] = out[j + 1] = out[j + 2] = mask[i]; out[j + 3] = 255; }
    return out;
  };
  MT.fromGrey = function (rgba) {
    const n = rgba.length >> 2, out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) out[i] = rgba[i * 4];
    return out;
  };
  MT.applyAlpha = function (rgba, mask) {
    const out = new Uint8ClampedArray(rgba);
    for (let i = 0; i < mask.length; i++) out[i * 4 + 3] = Math.round(out[i * 4 + 3] * mask[i] / 255);
    return out;
  };

  window.SlopMaskTransfer = MT;
})();
