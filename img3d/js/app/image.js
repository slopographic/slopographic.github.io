/* Slop Image to 3D: decodes a picture for the pipeline (capped at 1024 px on its long side, so the depth model and
 * the textures stay light). Classic script, page only. Sets window.SlopImg3D.image. */
(function (root) {
  'use strict';
  const ns = (root.SlopImg3D = root.SlopImg3D || {});
  const MAX_SIDE = 1024;
  const tr = (k, v, en) => { const I = root.SlopI18n; return I && I.has(k) ? I.t(k, v) : en; };   // English when the tables are missing (tests load this alone)

  /** Blob or File → { rgba: Uint8ClampedArray, W, H, canvas, name }. Throws a readable error for unknown files. */
  async function decode(blob, name = 'Picture') {
    let bmp;
    try { bmp = await createImageBitmap(blob); } catch (e) { throw new Error(tr('img3d.image.not_picture', null, 'This file is not a picture this browser can read.')); }
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const W = Math.max(1, Math.round(bmp.width * k)), H = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const cx = canvas.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(bmp, 0, 0, W, H);
    if (bmp.close) bmp.close();
    const rgba = cx.getImageData(0, 0, W, H).data;
    return { rgba, W, H, canvas, name: String(name).replace(/\.[^.]+$/, '') || 'Picture' };
  }

  /** The picture as a JPEG data URL (for the texture in a Slop 3D file; under 12 MB). */
  function jpegUrl(canvas) { return canvas.toDataURL('image/jpeg', 0.9); }

  /** The picture as JPEG bytes (for the GLB texture). */
  function jpegBytes(canvas) {
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? b.arrayBuffer().then(res, rej) : rej(new Error('The picture could not be encoded'))), 'image/jpeg', 0.9));
  }

  ns.image = { decode, jpegUrl, jpegBytes, MAX_SIDE };
})(typeof window !== 'undefined' ? window : globalThis);
