// Customer photos. A picked picture is scaled down and saved as a JPEG data address, small enough for the customer
// record (the photo field holds at most MAX characters). Nothing is uploaded.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const MAX = 400000;
  const STEPS = [[256, 0.85], [192, 0.8], [128, 0.7]]; // longest side in px, JPEG quality: tried in order

  /** Loads a picked file as an image. Rejects when the file is not a picture. */
  function load(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not a picture')); };
      img.src = url;
    });
  }

  /** The picture as a JPEG data address that fits the record, or null when even the smallest step is too big. */
  async function shrink(file) {
    const img = await load(file);
    const w = img.naturalWidth || img.width || 1, h = img.naturalHeight || img.height || 1;
    for (const [px, q] of STEPS) {
      const s = Math.min(1, px / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * s));
      c.height = Math.max(1, Math.round(h * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= MAX) return url;
    }
    return null;
  }

  NS.photo = { shrink, MAX };
})(typeof window !== 'undefined' ? window : globalThis);
