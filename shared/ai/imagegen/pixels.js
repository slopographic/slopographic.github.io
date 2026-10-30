/* SlopAIKit imageGen pixels: the picture and mask that go out with an edit, and the result put back. Classic script
 * (browser: canvas); adds to SlopAIKit.imageGen.
 *   prepare(source, { selection, max }) → Promise<{ image: { blob, data (base64), mime, width, height },
 *        mask: { blob } | null, from: { width, height } }>
 *        source: a canvas, ImageBitmap or Blob. selection: a canvas the same size whose alpha marks what may change.
 *        The copy is scaled to at most max px on its longest side (1536, OpenAI's largest standard edge) as PNG. The
 *        mask follows OpenAI's rule: fully transparent where the picture may change, opaque elsewhere, same size.
 *   fit(blob, width, height) → Promise<canvas>: a result scaled to the document's size
 *   keepInside(original, result, selection) → canvas: the result only inside the selection, the original elsewhere
 *        (for providers without a mask, and to keep the edges exact for those with one)
 *   toBlob(canvas, type) · b64(blob) */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const G = (K.imageGen = K.imageGen || {});
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const toBlob = (c, type = 'image/png') => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the picture'))), type));
  async function b64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function drawable(src) {
    if (src instanceof Blob) return createImageBitmap(src);
    return src;
  }

  async function prepare(source, { selection = null, max = 1536 } = {}) {
    const src = await drawable(source), W = src.width, H = src.height;
    const k = Math.min(1, max / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const c = canvas(w, h);
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    const blob = await toBlob(c);
    const out = { image: { blob, data: await b64(blob), mime: 'image/png', width: w, height: h }, mask: null, from: { width: W, height: H } };
    if (selection) {
      const m = canvas(w, h), g = m.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';   // selected pixels become transparent: "edit here"
      g.drawImage(selection, 0, 0, w, h);
      out.mask = { blob: await toBlob(m), width: w, height: h };
    }
    return out;
  }

  async function fit(blob, width, height) {
    const bmp = await createImageBitmap(blob), c = canvas(width || bmp.width, height || bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c;
  }

  function keepInside(original, result, selection) {
    const w = original.width, h = original.height, c = canvas(w, h), g = c.getContext('2d');
    const inside = canvas(w, h), ig = inside.getContext('2d');
    ig.drawImage(result, 0, 0, w, h);
    ig.globalCompositeOperation = 'destination-in'; ig.drawImage(selection, 0, 0, w, h);
    g.drawImage(original, 0, 0);
    g.globalCompositeOperation = 'destination-out'; g.drawImage(selection, 0, 0, w, h);
    g.globalCompositeOperation = 'source-over'; g.drawImage(inside, 0, 0);
    return c;
  }

  Object.assign(G, { prepare, fit, keepInside, toBlob, b64 });
})();
