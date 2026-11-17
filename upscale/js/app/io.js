/* Slop Upscale: reading and writing pictures. Classic script; adds SlopUpscale.io.
 *   kind(file)                  'image' | 'video' | null (from the MIME type, then the file name)
 *   decode(blob)                Promise<HTMLCanvasElement>: the picture with its orientation applied
 *   encode(canvas, fmt, q)      Promise<Blob>: fmt 'png' | 'jpeg' | 'webp'; q 0..1 for JPEG and WebP
 *   formatSupported(fmt)        Promise<boolean>: whether this browser writes the format (PNG always)
 *   mime(fmt)                   the MIME type of a format
 *   outName(name, scale, ext)   'holiday-4x.png' */
(function (g) {
  'use strict';
  const U = (g.SlopUpscale = g.SlopUpscale || {}), IO = (U.io = {});
  const t = (k, v) => (U.t ? U.t(k, v) : k);
  const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
  const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp' };

  IO.kind = function (file) {
    const type = file.type || '';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    const n = (file.name || '').toLowerCase();
    if (/\.(jpe?g|png|webp|avif|gif|bmp)$/.test(n)) return 'image';
    if (/\.(mp4|webm|mov|m4v)$/.test(n)) return 'video';
    return null;
  };

  /** Decodes with createImageBitmap, or an <img> when that fails (an old browser or an odd format). */
  IO.decode = async function (blob) {
    let src;
    try { src = await g.createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch (e) {
      const url = URL.createObjectURL(blob);
      try {
        src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(t('upscale.io.unreadable'))); im.src = url; });
      } finally { URL.revokeObjectURL(url); }
    }
    const c = document.createElement('canvas');
    c.width = src.naturalWidth || src.width; c.height = src.naturalHeight || src.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
    if (src.close) src.close();
    return c;
  };

  IO.mime = (fmt) => MIME[fmt] || 'image/png';
  IO.encode = function (canvas, fmt, q) {
    const type = MIME[fmt];
    return new Promise((res, rej) => canvas.toBlob((b) => {
      if (!b) rej(new Error(t('upscale.io.not_written')));
      else if (b.type !== type) rej(new Error(t('upscale.io.no_format', { fmt: fmt.toUpperCase() })));
      else res(b);
    }, type, fmt === 'png' ? undefined : q));
  };

  IO.formatSupported = async function (fmt) {
    if (fmt === 'png') return true;
    const c = document.createElement('canvas'); c.width = c.height = 2;
    return new Promise((res) => c.toBlob((b) => res(!!b && b.type === MIME[fmt]), MIME[fmt]));
  };

  IO.outName = function (name, scale, fmtOrExt) {
    const ext = EXT[fmtOrExt] || fmtOrExt;
    const base = String(name || 'picture').replace(/\.[^.]+$/, '') || 'picture';
    return `${base}-${scale}x.${ext}`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
