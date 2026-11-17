/* Slop Gallery: decode an image, apply its EXIF orientation by hand, and make a JPEG thumbnail (long edge <= 320 px).
 * Decoding uses imageOrientation 'none' so the browser never rotates the pixels behind our back: the orientation we
 * read from EXIF is the only one applied, and the stored width/height are the upright ones.
 * SVG is drawn from an <img> (createImageBitmap refuses SVG). Camera RAW files use their embedded preview (shared/raw). Classic script, exposes window.SlopGallery.thumb.make(blob,
 * orientation) -> { blob, w, h }. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const MAX_EDGE = 320, SVG_SIZE = 512;

  /** The affine matrix [a, b, c, d, e, f] that maps raw pixel coords (rw x rh) to upright coords, for EXIF 1-8. */
  function matrix(o, rw, rh) {
    switch (o) {
      case 2: return [-1, 0, 0, 1, rw, 0];
      case 3: return [-1, 0, 0, -1, rw, rh];
      case 4: return [1, 0, 0, -1, 0, rh];
      case 5: return [0, 1, 1, 0, 0, 0];
      case 6: return [0, 1, -1, 0, rh, 0];
      case 7: return [0, -1, -1, 0, rh, rw];
      case 8: return [0, -1, 1, 0, 0, rw];
      default: return [1, 0, 0, 1, 0, 0];
    }
  }
  /** Upright width/height for a raw size and orientation (5-8 turn the image on its side). */
  function uprightSize(o, rw, rh) { return o >= 5 && o <= 8 ? { w: rh, h: rw } : { w: rw, h: rh }; }

  /** An SVG picture from an <img> (its size is the SVG's own, or SVG_SIZE when it has none). */
  function decodeSvg(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob), img = new Image();
      const close = () => URL.revokeObjectURL(url);
      img.onload = () => res({ src: img, width: img.naturalWidth || SVG_SIZE, height: img.naturalHeight || SVG_SIZE, close });
      img.onerror = () => { close(); rej(new Error('This SVG could not be read')); };
      img.src = url;
    });
  }
  /** Is this blob an SVG? By its type, or by its opening text when the type is missing. */
  async function isSvg(blob) {
    if (/svg/.test(blob.type || '')) return true;
    return /<svg[\s>]/i.test(await blob.slice(0, 1024).text());
  }
  /** { src, width, height, close } for a blob the browser can draw: an ImageBitmap, or an SVG <img>. */
  async function decode(blob) {
    if (await isSvg(blob)) return decodeSvg(blob);
    let bmp;
    try { bmp = await createImageBitmap(blob, { imageOrientation: 'none' }); } catch (e) { bmp = await createImageBitmap(blob); }
    return { src: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }

  /** A camera RAW file's thumbnail: its embedded JPEG preview, drawn upright by SlopRaw (shared/raw), or a half-size
   *  develop when the file has none. w and h are the picture's upright size. */
  async function rawThumb(blob) {
    const r = await window.SlopRaw.image(blob, { mode: 'preview', maxEdge: MAX_EDGE });
    const out = await new Promise((res, rej) => r.canvas.toBlob((x) => (x ? res(x) : rej(new Error('Thumbnail failed'))), 'image/jpeg', 0.82));
    return { blob: out, w: r.width, h: r.height, raw: true };
  }
  const isRaw = async (blob) => !!window.SlopRaw && (await window.SlopRaw.isRaw(blob, blob.name || ''));

  /** Thumbnail for an image Blob. Throws if the browser cannot decode it (for example HEIC in Chromium). */
  async function make(blob, orientation = 1) {
    if (await isRaw(blob)) return rawThumb(blob);   // upright already: the RAW's own orientation is applied
    const bmp = await decode(blob);
    try {
      const o = orientation >= 1 && orientation <= 8 ? orientation : 1;
      const up = uprightSize(o, bmp.width, bmp.height);
      const s = Math.min(1, MAX_EDGE / Math.max(up.w, up.h));
      const cw = Math.max(1, Math.round(up.w * s)), ch = Math.max(1, Math.round(up.h * s));
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      const [a, b, c, d, e, f] = matrix(o, bmp.width, bmp.height);
      ctx.setTransform(a * s, b * s, c * s, d * s, e * s, f * s);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp.src, 0, 0, bmp.width, bmp.height);
      const out = await new Promise((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error('Thumbnail failed'))), 'image/jpeg', 0.82));
      return { blob: out, w: up.w, h: up.h };
    } finally {
      bmp.close();
    }
  }

  /** Upright size of an image Blob without keeping the pixels around. */
  async function dims(blob, orientation = 1) {
    const bmp = await decode(blob);
    const up = uprightSize(orientation, bmp.width, bmp.height);
    bmp.close();
    return up;
  }

  G.thumb = { make, dims, matrix, uprightSize, isRaw, MAX_EDGE };
})();
