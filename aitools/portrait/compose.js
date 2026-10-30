/* Portrait blur's picture: the background blurred, the person sharp through the mask from SlopCutout (MODNet). Used by
 * the Portrait blur page (portrait.js) and the assistant's jobs on the hub (aitools/ai-jobs.js). Classic script; sets
 * window.SlopAIPortrait:
 *   compose(bitmap, w, h, { mask, maskW, maskH }, strength 0..100)  → a canvas of w × h */
(function () {
  'use strict';
  function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  /** The mask as a canvas (white = person) at the picture's size. */
  function maskCanvas(m, w, h) {
    const small = canvasOf(m.maskW, m.maskH);
    small.getContext('2d').putImageData(window.SlopCutout.maskToImageData(m.mask, m.maskW, m.maskH), 0, 0);
    const c = canvasOf(w, h), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, w, h);
    return c;
  }
  /** Blurred copy of the picture. Uses the canvas blur filter, or a down-and-up scale where the filter is missing. */
  function blurred(bitmap, w, h, px) {
    const c = canvasOf(w, h), g = c.getContext('2d');
    if ('filter' in g) { g.filter = `blur(${px}px)`; g.drawImage(bitmap, 0, 0, w, h); g.filter = 'none'; return c; }
    const k = Math.max(1, Math.round(px / 2)), small = canvasOf(Math.max(1, Math.round(w / k)), Math.max(1, Math.round(h / k)));
    small.getContext('2d').drawImage(bitmap, 0, 0, small.width, small.height);
    g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, w, h);
    return c;
  }
  function compose(bitmap, w, h, m, strength) {
    const px = Math.round((strength / 100) * 0.04 * Math.min(w, h));
    const out = blurred(bitmap, w, h, px), fg = canvasOf(w, h), fgc = fg.getContext('2d');
    fgc.drawImage(bitmap, 0, 0, w, h);
    fgc.globalCompositeOperation = 'destination-in';
    fgc.drawImage(maskCanvas(m, w, h), 0, 0);
    out.getContext('2d').drawImage(fg, 0, 0);
    return out;
  }
  window.SlopAIPortrait = { compose };
})();
