/* One call to watermark any file: SlopWatermark.apply(file, spec, { signal, progress, notice, ask }) → Promise<Blob>.
 * It picks the renderer by the kind of file, and every renderer draws the same spec the same way (sizes from the
 * shorter side). Classic script; load spec.js, spec-layout.js, spec-convert.js and core.js first.
 *   pictures  PNG, JPEG, WebP, AVIF, BMP, GIF, SVG and HEIC: the canvas engine (core.js). Each keeps its format where the
 *             browser can write it (JPEG, WebP, PNG); AVIF, BMP and SVG become PNG, HEIC becomes JPEG (the site's HEIC
 *             decoder, shared/heic/engine.js, asks before its first download). An animated GIF is watermarked on every frame
 *             (the video engine, apply-video.js). An animated WebP keeps only its first frame, and notice(text) says so.
 *   videos    MP4, MOV, WebM and M4V: every frame, sound kept (apply-video.js, the site's ffmpeg engine)
 *   PDFs      vector text and images in the file (apply-pdf.js, Slop PDF's own page writer)
 *   mediaOf(file) → 'picture' | 'video' | 'pdf' | '' ; typeOf(file) → its MIME type (by extension when the browser has
 *   none) ; ACCEPT (for <input accept>) ; extOf(blob) → 'jpg' ; outName(name, blob) → 'photo-watermarked.jpg'
 *   isAnimated(bytes, type) → true for a GIF with more than one frame or an animated WebP */
(function () {
  'use strict';
  const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/watermark.js
  const WM = window.SlopWatermark, S = window.SlopWatermarkSpec;
  const EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif',
    svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf' };
  const OUT_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf' };
  const KEEP = ['image/jpeg', 'image/webp', 'image/png'];
  const MAX_SIDE = 16384, MAX_PIXELS = 120e6;
  const ACCEPT = [...new Set(Object.values(EXT))].join(',') + ',' + Object.keys(EXT).map((e) => '.' + e).join(',');

  function typeOf(file) {
    const t = String(file && file.type || '').toLowerCase();
    if (Object.values(EXT).includes(t)) return t;
    const m = /\.([a-z0-9]+)$/i.exec(file && file.name || '');
    return (m && EXT[m[1].toLowerCase()]) || t;
  }
  function mediaOf(file) {
    const t = typeOf(file);
    return t === 'application/pdf' ? 'pdf' : /^video\//.test(t) ? 'video' : /^image\//.test(t) ? 'picture' : '';
  }
  const extOf = (blob) => OUT_EXT[blob && blob.type] || 'png';
  const stem = (name) => String(name || 'file').replace(/\.[^./\\]+$/, '');
  const outName = (name, blob) => stem(name) + '-watermarked.' + extOf(blob);

  /** A GIF with more than one image, or a WebP with the animation flag (VP8X) or animation frames (ANMF). */
  function isAnimated(b, type) {
    if (type === 'image/gif') {
      let p = 13, frames = 0;
      if (b[10] & 0x80) p += 3 << ((b[10] & 7) + 1);              // the global colour table
      const skipBlocks = () => { while (p < b.length && b[p]) p += b[p] + 1; p++; };
      while (p < b.length && frames < 2) {
        if (b[p] === 0x21) { p += 2; skipBlocks(); }               // an extension: label, then its data blocks
        else if (b[p] === 0x2c) {                                  // an image: descriptor, local colour table, LZW data
          frames++;
          const flags = b[p + 9]; p += 10;
          if (flags & 0x80) p += 3 << ((flags & 7) + 1);
          p++; skipBlocks();
        } else break;                                              // the trailer (0x3b) or damage
      }
      return frames > 1;
    }
    if (type === 'image/webp') {
      const s = String.fromCharCode(...b.subarray(12, 16));
      if (s === 'VP8X') return !!(b[20] & 0x02);
    }
    return false;
  }
  const aborted = (signal) => { if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };

  /** An SVG's own size: width and height, else the viewBox, else 1024 square. */
  function svgSize(text) {
    const tag = (/<svg\b[^>]*>/i.exec(text) || [''])[0];
    const attr = (n) => { const m = new RegExp('\\s' + n + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(tag); return m ? m[1] : ''; };
    const px = (v) => (/%/.test(v) ? 0 : parseFloat(v) || 0);
    let w = px(attr('width')), h = px(attr('height'));
    const vb = attr('viewBox').trim().split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      if (!w && !h) { w = vb[2]; h = vb[3]; } else if (!w) w = h * vb[2] / vb[3]; else if (!h) h = w * vb[3] / vb[2];
    }
    return w > 0 && h > 0 ? { w, h } : { w: 1024, h: 1024 };
  }
  function canvas(w, h) {
    const k = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    return c;
  }
  /** The picture upright (EXIF orientation applied) on a canvas of its own size. */
  async function decode(file, type, opts) {
    if (type === 'image/heic' || type === 'image/heif') {
      await WM.load(['shared/heic/engine.js']);
      const r = await window.SlopHeicEngine.decode(new Uint8Array(await file.arrayBuffer()), { ask: opts.ask !== false });
      const c = canvas(r.width, r.height), tmp = document.createElement('canvas');
      tmp.width = r.width; tmp.height = r.height;
      tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
      c.getContext('2d').drawImage(tmp, 0, 0, c.width, c.height);
      return c;
    }
    let src = null, w = 0, h = 0;
    if (type === 'image/svg+xml') {
      const size = svgSize(await file.text()), url = URL.createObjectURL(new Blob([file], { type }));
      try { src = new Image(); src.src = url; await src.decode(); } catch (e) { throw new Error(tr('ui.wm.svg_unread')); } finally { URL.revokeObjectURL(url); }
      w = size.w; h = size.h;
    } else {
      try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; } catch (e) {
        const url = URL.createObjectURL(file);
        try { src = new Image(); src.src = url; await src.decode(); w = src.naturalWidth; h = src.naturalHeight; } catch (x) { throw new Error(tr('ui.wm.picture_unread')); } finally { URL.revokeObjectURL(url); }
      }
    }
    const c = canvas(w, h);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    return c;
  }
  const encode = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(tr('ui.ops.load.not_written')))), type, q));

  async function picture(file, spec, opts) {
    const type = typeOf(file);
    if (type === 'image/gif' || type === 'image/webp') {
      const bytes = new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
      if (isAnimated(type === 'image/gif' ? new Uint8Array(await file.arrayBuffer()) : bytes, type)) {
        if (type === 'image/gif') return video(file, spec, opts);
        if (opts.notice) opts.notice(tr('ui.wm.webp_animated', { name: file.name || 'WebP' }));
      }
    }
    const c = await decode(file, type, opts);
    aborted(opts.signal);
    await WM.ready(spec);
    WM.draw(c.getContext('2d'), c.width, c.height, spec);
    const want = type === 'image/heic' || type === 'image/heif' ? 'image/jpeg' : KEEP.includes(type) ? type : 'image/png';
    let blob = await encode(c, want, 0.92);
    if (blob.type !== want) blob = await encode(c, 'image/png');
    c.width = c.height = 0;
    return blob;
  }
  async function video(file, spec, opts) {
    await WM.load(['shared/watermark/apply-video.js']);
    return WM.applyVideo(file, spec, opts);
  }
  async function pdf(file, spec, opts) {
    await WM.load(['shared/watermark/apply-pdf.js']);
    return WM.applyPdf(file, spec, opts);
  }

  async function apply(file, spec, opts = {}) {
    const sp = S.normalize(spec), problem = S.check(sp);
    if (problem) throw new Error(problem);
    aborted(opts.signal);
    const media = mediaOf(file);
    if (media === 'picture') return picture(file, sp, opts);
    if (media === 'video') return video(file, sp, opts);
    if (media === 'pdf') return pdf(file, sp, opts);
    throw new Error(tr('ui.wm.not_media', { name: (file && file.name) || '?' }));
  }

  Object.assign(WM, { apply, mediaOf, typeOf, extOf, outName, isAnimated, svgSize, ACCEPT });
})();
