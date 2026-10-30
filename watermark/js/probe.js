/* Slop Watermark: what a dropped file is, its size and a small thumbnail, for the list and the shape groups. Pictures by
 * the browser's decoder (an SVG's size from its markup), a video by the browser's video reader (its first frame as the
 * thumbnail, and its length), a PDF by the site's pdf.js (its first page, and the page count). Classic script.
 * Exposes window.WMProbe.of(file) → Promise<{ media, type, w, h, thumb (an object URL), pages, duration }>; it rejects
 * with a reason a person can read. WMProbe.forget(info) frees the thumbnail. */
(function () {
  'use strict';
  const WM = window.SlopWatermark;
  const THUMB = 160;
  const t = (k) => window.WMUtil.t(k);

  const blobOf = (c) => new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
  async function thumbOf(src, w, h) {
    const k = Math.min(1, THUMB / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
    return URL.createObjectURL(await blobOf(c));
  }

  async function picture(file, type) {
    if (type === 'image/heic' || type === 'image/heif') return { w: 0, h: 0, thumb: '' };   // decoded when it is watermarked
    if (type === 'image/svg+xml') {
      const size = WM.svgSize(await file.text()), url = URL.createObjectURL(file);
      try { const im = new Image(); im.src = url; await im.decode(); return { w: Math.round(size.w), h: Math.round(size.h), thumb: await thumbOf(im, size.w, size.h) }; }
      catch (e) { throw new Error(t('watermark.probe.unreadable')); } finally { URL.revokeObjectURL(url); }
    }
    let b;
    try { b = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { throw new Error(t('watermark.probe.unreadable')); }
    try { return { w: b.width, h: b.height, thumb: await thumbOf(b, b.width, b.height) }; } finally { b.close(); }
  }
  function video(file) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video'), url = URL.createObjectURL(file);
      let timer = 0;
      const end = (fn, x) => { clearTimeout(timer); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); fn(x); };
      timer = setTimeout(() => end(reject, new Error(t('watermark.probe.video'))), 20000);
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      v.onloadedmetadata = () => { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); };
      v.onseeked = async () => {
        try { end(resolve, { w: v.videoWidth, h: v.videoHeight, duration: v.duration, thumb: await thumbOf(v, v.videoWidth, v.videoHeight) }); }
        catch (e) { end(resolve, { w: v.videoWidth, h: v.videoHeight, duration: v.duration, thumb: '' }); }
      };
      v.onerror = () => end(reject, new Error(t('watermark.probe.video_try')));
      v.src = url;
    });
  }
  async function pdf(file) {
    const R = await import(new URL('convert/js/core/pdf-raster.js', WM.ROOT).href);
    let doc;
    try { doc = await R.openPdf(new Uint8Array(await file.arrayBuffer())); } catch (e) { throw new Error(e.message.replace(/^This/, 'this').replace(/\.$/, '')); }
    try {
      const p = await doc.getPage(1), vp1 = p.getViewport({ scale: 1 }), k = THUMB / Math.max(vp1.width, vp1.height), vp = p.getViewport({ scale: k });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: g, viewport: vp }).promise;
      return { w: Math.round(vp1.width), h: Math.round(vp1.height), pages: doc.numPages, thumb: URL.createObjectURL(await blobOf(c)) };
    } finally { doc.destroy(); }
  }

  async function of(file) {
    const media = WM.mediaOf(file), type = WM.typeOf(file);
    if (!media) throw new Error(t('watermark.probe.not_media'));
    const info = media === 'picture' ? await picture(file, type) : media === 'video' ? await video(file) : await pdf(file);
    return Object.assign({ media, type, pages: 0, duration: 0 }, info);
  }
  function forget(info) { if (info && info.thumb) URL.revokeObjectURL(info.thumb); }

  window.WMProbe = { of, forget };
})();
