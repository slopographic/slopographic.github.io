/* SlopRaw: camera RAW photos for every Slopographic app (PhotoSlop, Slop Gallery, Slop Resize, File convert).
 * Load shared/raw/tiff.js, detect.js and preview.js first (classic scripts, or side-effect imports in a module); the
 * engine (engine.js, LibRaw in WebAssembly) is loaded only when a RAW file is developed. Classic script; window.SlopRaw:
 *   FORMATS, EXTS, ACCEPT ('.cr2,.cr3,…' for file inputs)   isRawName(name)   sniff(bytes, name) -> { ext, label, maker } | null
 *   isRaw(file | bytes, name?) -> Promise<boolean>         by content (the first 256 KB) and extension
 *   meta(bytes) -> { make, model, date, iso, shutter, aperture, focal, orientation }
 *   preview(bytes) -> Promise<Blob | null>                 the embedded JPEG, instant, no download
 *   previewCanvas(bytes, maxEdge?) -> Promise<{ canvas, width, height, fullWidth, fullHeight } | null>   the embedded
 *     JPEG drawn upright (width/height: the canvas, fullWidth/fullHeight: the JPEG's own upright size)
 *   decode(bytes, opts, onProgress) -> Promise<{ width, height, bits, data, imageData?, meta }>   the full develop (engine.js
 *     settingsFor lists opts); 8-bit gives imageData (sRGB), 16-bit gives data as RGB Uint16Array; orientation applied
 *   toCanvas(decoded) -> canvas                             an 8-bit result on a canvas
 *   image(blob, { mode: 'preview' | 'full', ask, maxEdge, onProgress, ...develop }) -> Promise<{ canvas, width, height,
 *     from: 'preview' | 'engine', meta, note }>   width/height: the picture's upright size before maxEdge;
 *     'preview' falls back to a half-size develop when there is no preview;
 *     'full' falls back to the preview when the engine cannot run or the person declines its download (note says so) */
(function (root) {
  'use strict';
  const doc = root.document;
  const SELF = (doc && doc.currentScript && doc.currentScript.src) || (root.location && root.location.href) || '';
  const D = () => root.SlopRawDetect, P = () => root.SlopRawPreview;
  const HEAD = 256 * 1024;
  let engineP = null;

  function engine() {
    if (root.SlopRawEngine) return Promise.resolve(root.SlopRawEngine);
    if (!engineP) {
      engineP = new Promise((res, rej) => {
        const s = doc.createElement('script');
        s.src = new URL('engine.js', root.SlopRawBase || SELF).href;
        s.onload = () => (root.SlopRawEngine ? res(root.SlopRawEngine) : rej(new Error('The RAW engine script did not load')));
        s.onerror = () => rej(new Error('The RAW engine script could not be loaded'));
        doc.head.append(s);
      });
      engineP.catch(() => { engineP = null; });
    }
    return engineP;
  }

  const u8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));
  const isBlob = (x) => typeof Blob !== 'undefined' && x instanceof Blob;
  async function bytesOf(x) { return isBlob(x) ? new Uint8Array(await x.arrayBuffer()) : u8(x); }

  async function isRaw(x, name) {
    if (!x) return false;
    const n = name || (x && x.name) || '';
    const head = isBlob(x) ? new Uint8Array(await x.slice(0, HEAD).arrayBuffer()) : u8(x).subarray(0, HEAD);
    return !!D().sniff(head, n) || (head.length < 12 && D().isRawName(n));
  }

  async function preview(x) {
    const p = P().extract(await bytesOf(x));
    return p ? new Blob([p.jpeg], { type: 'image/jpeg' }) : null;
  }

  /** The affine matrix that draws a w × h picture upright for EXIF orientation o (1 to 8). */
  function matrix(o, w, h) {
    switch (o) {
      case 2: return [-1, 0, 0, 1, w, 0];
      case 3: return [-1, 0, 0, -1, w, h];
      case 4: return [1, 0, 0, -1, 0, h];
      case 5: return [0, 1, 1, 0, 0, 0];
      case 6: return [0, 1, -1, 0, h, 0];
      case 7: return [0, -1, -1, 0, h, w];
      case 8: return [0, -1, 1, 0, 0, w];
      default: return [1, 0, 0, 1, 0, 0];
    }
  }
  function canvas(w, h) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }

  /** Draws a decoded picture upright, scaled so the long edge is at most maxEdge. */
  function upright(src, w, h, o, maxEdge) {
    const side = o >= 5 && o <= 8, uw = side ? h : w, uh = side ? w : h;
    const k = maxEdge ? Math.min(1, maxEdge / Math.max(uw, uh)) : 1;
    const c = canvas(Math.max(1, Math.round(uw * k)), Math.max(1, Math.round(uh * k))), g = c.getContext('2d');
    const [a, b, cc, d, e, f] = matrix(o, w, h);
    g.setTransform(a * k, b * k, cc * k, d * k, e * k, f * k);
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    return c;
  }

  async function previewCanvas(x, maxEdge) {
    const b = await bytesOf(x);
    for (const j of P().candidates(b).slice(0, 3)) {   // the largest that this browser can decode
      let bmp;
      const blob = new Blob([b.subarray(j.start, j.end)], { type: 'image/jpeg' });
      try { bmp = await createImageBitmap(blob, { imageOrientation: 'none' }); } catch (e) { try { bmp = await createImageBitmap(blob); } catch (e2) { continue; } }
      try {
        const o = P().meta(b).orientation, c = upright(bmp, bmp.width, bmp.height, o, maxEdge), side = o >= 5 && o <= 8;
        return { canvas: c, width: c.width, height: c.height, fullWidth: side ? bmp.height : bmp.width, fullHeight: side ? bmp.width : bmp.height };
      } finally { bmp.close(); }
    }
    return null;
  }

  async function decode(x, opts = {}, onProgress) {
    const b = await bytesOf(x);
    const E = await engine();
    const r = await E.decode(b, opts, onProgress);
    const own = P().meta(b);
    r.meta = { ...own, ...Object.fromEntries(Object.entries(r.meta || {}).filter(([, v]) => v)), orientation: own.orientation };
    if (r.bits === 8 && typeof ImageData !== 'undefined') r.imageData = new ImageData(r.data, r.width, r.height);
    return r;
  }
  function toCanvas(r) {
    const c = canvas(r.width, r.height);
    c.getContext('2d').putImageData(r.imageData || new ImageData(r.data, r.width, r.height), 0, 0);
    return c;
  }
  function shrink(c, maxEdge) {
    if (!maxEdge || Math.max(c.width, c.height) <= maxEdge) return c;
    return upright(c, c.width, c.height, 1, maxEdge);
  }

  async function image(blob, o = {}) {
    const b = await bytesOf(blob), meta = P().meta(b);
    const viaEngine = async (half) => {
      const r = await decode(b, { ...o, half }, o.onProgress);
      const k = half ? 2 : 1;
      return { canvas: shrink(toCanvas(r), o.maxEdge), width: r.width * k, height: r.height * k, from: 'engine', meta: r.meta, note: '' };
    };
    const viaPreview = async () => { const p = await previewCanvas(b, o.maxEdge); return p ? { canvas: p.canvas, width: p.fullWidth, height: p.fullHeight, from: 'preview', meta, note: '' } : null; };
    if (o.mode === 'preview') {
      const p = await viaPreview();
      return p || viaEngine(true);
    }
    try { return await viaEngine(false); } catch (e) {
      const p = await viaPreview();
      if (!p) throw e;
      p.note = e.code === 'declined' ? 'The RAW engine was not downloaded, so the camera\'s embedded preview was used.' : `The RAW engine could not develop this file (${e.message}), so the camera's embedded preview was used.`;
      return p;
    }
  }

  root.SlopRaw = {
    get FORMATS() { return D().FORMATS; }, get EXTS() { return D().EXTS; }, get ACCEPT() { return D().ACCEPT; },
    isRawName: (n) => D().isRawName(n), sniff: (b, n) => D().sniff(u8(b), n), meta: (b) => P().meta(u8(b)),
    isRaw, preview, previewCanvas, decode, toCanvas, image, engine, matrix,
  };
})(typeof window !== 'undefined' ? window : globalThis);
