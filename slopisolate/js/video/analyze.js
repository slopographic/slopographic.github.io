/* SlopIsolate video — the matte pass. CO.video.analyze(src, { model, signal, onProgress }) runs the same on-device
 * model on every frame, at mask size (the long side is MASK_LONG px, then upscaled), and smooths the masks over time
 * (smooth.js) so edges do not flicker. The model runs in the existing worker (SlopCutout); this file only feeds it.
 * Resolves { masks: Uint8ClampedArray[] (one per frame, mask size), mw, mh, weight, cancelled }. */
(function () {
  'use strict';
  const CO = window.CO, V = CO.video, U = CO.util, L = V.limits, SM = V.smooth;

  V.analyze = async function (src, { model = 'fast', signal, onProgress, weight = SM.WEIGHT } = {}) {
    const ms = L.maskSize(src.out.w, src.out.h), mw = ms.w, mh = ms.h;
    const small = U.canvas(mw, mh), g = small.getContext('2d', { willReadFrequently: false });
    const masks = [];
    let prev = null, cancelled = false, t0 = performance.now();
    await src.each(async (frame, i) => {
      if (signal && signal.aborted) { cancelled = true; return; }
      g.drawImage(frame, 0, 0, mw, mh);
      const r = await SlopCutout.removeBackground(small, { model, keep: false, onProgress: (p) => onProgress && onProgress({ phase: 'model', p }) });
      if (signal && signal.aborted) { cancelled = true; return; }
      if (!r.mask || r.mask.length !== mw * mh) throw new Error('The matte came back at the wrong size');
      prev = SM.step(prev, r.mask, weight);
      masks.push(prev);
      if (onProgress) onProgress({ phase: 'frame', i: i + 1, n: src.count, ms: performance.now() - t0 });
    }, { signal });
    if (signal && signal.aborted) cancelled = true;
    return { masks, mw, mh, weight, cancelled };
  };
})();
