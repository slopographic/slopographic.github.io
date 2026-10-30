/* Slop Gallery: "Cut out subjects first" for a reel. Runs one photo through SlopIsolate's engine (shared/cutout/cutout.js,
 * loaded on first use) with the Fast model, as it is, and returns a PNG with alpha. Nothing is re-implemented here.
 * Exposes window.SlopGallery.reelCutout.cutOut(blob, { signal, onProgress }) -> Promise<Blob> (image/png). */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});

  /** The engine, loaded once from the site's shared folder. */
  async function engine() {
    if (!window.SlopCutout) {
      if (!window.SlopHub || !SlopHub.loadScript) throw new Error('Slop Hub is not available');
      await SlopHub.loadScript('shared/cutout/cutout.js');
    }
    if (!window.SlopCutout) throw new Error('SlopIsolate did not start');
    return window.SlopCutout;
  }

  /** blob: the photo's original bytes. Rejects with an AbortError when signal fires. */
  async function cutOut(blob, { signal, onProgress } = {}) {
    const C = await engine();
    const r = await C.removeBackground(blob, { model: 'fast', signal, onProgress: onProgress || (() => {}) });
    return r.toBlob('image/png');
  }

  G.reelCutout = { cutOut, engine };
})();
