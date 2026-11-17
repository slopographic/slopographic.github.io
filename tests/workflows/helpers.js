/* Slop Workflows test helpers (window.WFT): boot the app in the test's iframe, small pictures, and a stub background
 * remover. The stub takes SlopCutout's place (shared/cutout/cutout.js is not loaded when window.SlopCutout is there, see
 * shared/ops/isolate.js), so the run needs no model download: it keeps a centred circle and makes the rest see-through,
 * the same result shape as SlopCutout.removeBackground (mask, cutout ImageData, width, height). The real model is tested in
 * tests/slopisolate/inference.test.html. */
(function () {
  'use strict';
  const { waitFor } = SlopTest;
  const T = window.WFT = {};
  try { localStorage.setItem('slop-firstrun:slopisolate', '1'); localStorage.setItem('slop-firstrun:upscale', '1'); } catch (e) { /* blocked */ }

  T.boot = async function (query = '', { width = 1280, height = 900, fresh = false } = {}) {
    const f = document.getElementById('app');
    f.style.width = width + 'px'; f.style.height = height + 'px';
    if (fresh) try { localStorage.removeItem('slop-workflows:draft'); } catch (e) { /* blocked */ }
    f.src = 'about:blank';
    await new Promise((r) => setTimeout(r, 30));
    f.src = '../../workflows/' + query;
    await waitFor(() => f.contentWindow && f.contentWindow.SlopWorkflows && f.contentWindow.SlopWorkflows.ready, { timeout: 20000 });
    T.W = f.contentWindow; T.D = T.W.document; T.A = T.W.SlopWorkflows;
    return T.A;
  };

  /** A picture file: a coloured background with a darker square in the middle. */
  T.picture = async function (name, w = 300, h = 240, bg = '#2a6fdb', type = 'image/png') {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#123'; g.fillRect(w / 4, h / 4, w / 2, h / 2);
    const blob = await new Promise((r) => c.toBlob(r, type, 0.92));
    return new File([blob], name, { type });
  };

  /** Put the stub background remover in the app's window. */
  T.stubCutout = function (W) {
    const calls = [];
    W.SlopCutout = {
      async removeBackground(file, opts = {}) {
        calls.push({ name: file.name, model: opts.model });
        const bmp = await W.createImageBitmap(file), w = bmp.width, h = bmp.height;
        const c = W.document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
        const img = g.getImageData(0, 0, w, h), mask = new W.Uint8ClampedArray(w * h), r = Math.min(w, h) * 0.35;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const a = Math.hypot(x - w / 2, y - h / 2) < r ? 255 : 0;
          mask[y * w + x] = a; img.data[(y * w + x) * 4 + 3] = a;
        }
        if (opts.onProgress) opts.onProgress({ phase: 'infer', loaded: 1, total: 1 });
        return { width: w, height: h, mask, cutout: img, base: mask, model: opts.model || 'fast', timings: {} };
      },
    };
    return calls;
  };

  /** Pixels of a Blob: { w, h, at(x, y) → [r, g, b, a] }. */
  T.pixels = async function (blob) {
    const bmp = await createImageBitmap(blob), c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, at: (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; } };
  };
})();
