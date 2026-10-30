/* Slop Resize: images. Decodes with createImageBitmap (an <img> when that fails), draws with canvas, and encodes to JPEG,
 * PNG, WebP or AVIF. Shrinking halves in steps first (each step averages 2×2 pixels) so a big reduction stays clean;
 * spec.resample 'nearest' skips that and keeps hard pixels. PNG, WebP and AVIF keep transparency. JPEG has none, so a
 * transparent area is filled with the chosen background colour (white when none is chosen), and the note says so.
 * A maximum file size searches the quality of the lossy types (JPEG, WebP, AVIF). Camera RAW files (shared/raw) are
 * developed by the RAW engine, or use their embedded preview when it cannot run.
 * Classic script; exposes window.SlopResize.image. Needs core/size.js and core/format.js. */
(function (g) {
  'use strict';
  const NS = g.SlopResize, I = (NS.image = {}), tr = (k, en, v) => NS.tr(k, en, v);
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const smooth = (ctx, best) => { ctx.imageSmoothingEnabled = best !== false; ctx.imageSmoothingQuality = 'high'; };

  const isRaw = async (blob) => !!g.SlopRaw && (await g.SlopRaw.isRaw(blob, blob.name || ''));
  /** A camera RAW file (shared/raw), developed in full by the RAW engine (as shot white balance, upright), or its
   *  embedded preview when the engine cannot run; note says which. */
  async function loadRaw(blob) {
    const r = await g.SlopRaw.image(blob, { mode: 'full' });
    return { node: r.canvas, w: r.canvas.width, h: r.canvas.height, close: () => {}, note: r.note };
  }

  /** Decode a picture file. Resolves with { node, w, h, close(), note? }. */
  I.load = async function (blob) {
    if (await isRaw(blob)) return loadRaw(blob);
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { node: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch (e) { /* try an <img> below */ }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty');
      return { node: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
    } catch (e) {
      throw new Error(tr('resize.err.no_read', 'The browser cannot read this picture'));
    } finally { URL.revokeObjectURL(url); }
  };

  /** Size of a picture file without keeping it decoded. A RAW file is measured from its embedded preview (no engine)
   *  and gets thumb, a JPEG URL of that preview for the list. */
  I.probe = async function (blob) {
    if (await isRaw(blob)) {
      const r = await g.SlopRaw.image(blob, { mode: 'preview', maxEdge: 160 });
      const t = await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.85));
      return { w: r.width, h: r.height, thumb: t ? URL.createObjectURL(t) : '' };
    }
    const s = await I.load(blob);
    try { return { w: s.w, h: s.h }; } finally { s.close(); }
  };

  /** Halve while a side stays at or above the drawn size, so each draw is at most 2× down. Returns the last source. */
  function halve(node, sw, sh, dw, dh) {
    let cur = node, cw = sw, ch = sh;
    for (;;) {
      const nw = cw / 2 >= dw ? Math.ceil(cw / 2) : cw;
      const nh = ch / 2 >= dh ? Math.ceil(ch / 2) : ch;
      if (nw === cw && nh === ch) break;
      const c = canvas(nw, nh), cx = c.getContext('2d');
      smooth(cx, true);
      cx.drawImage(cur, 0, 0, nw, nh);
      cur = c; cw = nw; ch = nh;
    }
    return { cur, cw, ch };
  }

  /** Draw a loaded picture at the size the spec gives. bg is a colour behind the picture, or null (transparent).
   *  Returns { canvas, w, h }. */
  I.render = function (s, spec, { bg = null, even = false } = {}) {
    const best = NS.size.normalize(spec).resample !== 'nearest';
    const d = NS.size.dims({ w: s.w, h: s.h }, spec, { even });
    const src = best ? halve(s.node, s.w, s.h, d.dw, d.dh) : { cur: s.node };
    const out = canvas(d.w, d.h), ctx = out.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, d.w, d.h); }
    smooth(ctx, best);
    ctx.drawImage(src.cur, d.x, d.y, d.dw, d.dh);
    return { canvas: out, w: d.w, h: d.h };
  };

  /** True when a sample of the picture has any see-through pixel (checked on a small copy, so it stays cheap). */
  function hasTransparency(s) {
    const k = Math.min(1, 256 / Math.max(s.w, s.h));
    const c = canvas(Math.max(1, Math.round(s.w * k)), Math.max(1, Math.round(s.h * k)));
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(s.node, 0, 0, c.width, c.height);
    const px = cx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true;
    return false;
  }

  /** Encode a canvas. Rejects when the browser cannot write that type (it would quietly send PNG instead). */
  I.encode = function (cv, mime, quality) {
    return new Promise((res, rej) => cv.toBlob((b) => (b && b.type === mime ? res(b) : rej(new Error(`This browser cannot write ${mime}`))), mime, quality));
  };

  /** Resize one picture file. o = { mime, quality (0–1), maxBytes (0 = no limit) }.
   *  Resolves with { blob, w, h, ext, note }. note is '' or a line to show the person. */
  I.run = async function (file, spec, o) {
    const fmt = NS.format.byMime(o.mime);
    if (!fmt) throw new Error('Unknown image type ' + o.mime);
    const s = await I.load(file);
    try {
      const chosen = spec.bg !== 'transparent' ? spec.bg : null;
      // Formats without alpha are always filled: white when no colour was chosen (never black).
      const fill = chosen || (fmt.alpha ? null : '#ffffff');
      let note = s.note || '';
      if (!fmt.alpha && !chosen && hasTransparency(s)) {
        note = tr('resize.note.filled_white', '{format} has no transparency, so transparent areas are filled white. Pick a background colour to choose the fill.', { format: fmt.label });
      }
      const r = I.render(s, spec, { bg: fill });
      let blob = await I.encode(r.canvas, fmt.mime, o.quality);
      let sizeNote = '';
      if (o.maxBytes > 0 && blob.size > o.maxBytes) {
        if (!fmt.lossy) {
          sizeNote = tr('resize.note.lossless', '{format} cannot be made smaller by quality. Use JPEG, WebP or AVIF for a size limit.', { format: fmt.label });
        } else {
          const lowest = await I.encode(r.canvas, fmt.mime, 0.05);
          let best = lowest;
          if (lowest.size > o.maxBytes) {
            sizeNote = tr('resize.note.over_limit', 'Even the lowest quality is {size}, over the {limit} limit. Make the picture smaller as well.', { size: NS.format.bytes(lowest.size), limit: NS.format.bytes(o.maxBytes) });
          } else {
            let lo = 0.05, hi = o.quality;
            for (let i = 0; i < 7 && hi - lo > 0.01; i++) {
              const mid = (lo + hi) / 2, b = await I.encode(r.canvas, fmt.mime, mid);
              if (b.size <= o.maxBytes) { best = b; lo = mid; } else hi = mid;
            }
          }
          blob = best;
        }
      }
      return { blob, w: r.w, h: r.h, ext: fmt.ext, note: [note, sizeNote].filter(Boolean).join(' ') };
    } finally { s.close(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
