/* Slop Scan: a page made from its photo: the corners found, then the flat page in its look. Classic script, after the
 * core modules (js/core/*.js). The photo of a page is { full, small, w, h }: canvases of the upright picture (the long
 * side at most FULL and SMALL px), read once into pixels when first needed.
 *   photoOf(source) → photo              a canvas or bitmap → the two canvases
 *   detect(photo) → { quad (0..1), found }   on a copy about 400 px long
 *   render(page, max) → canvas           the flat page in its look and turn, the long side at most max px; the last few are
 *                                        kept per page (until the page changes), so a redraw or a thumbnail costs nothing
 *   autoTurn(page) → 0..3                the quarter turns that set lines of text across (from a quick B&W render)
 *   PREVIEW, THUMB, FULL                 the sizes the app asks for */
(function (g) {
  'use strict';
  const S = g.SlopScan, G = S.geom, F = S.filters;
  const FULL = 2400, SMALL = 1200, DETECT = 400, PREVIEW = 1100, THUMB = 220;
  const cache = new WeakMap();   // page → Map(key → canvas)

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  /** A canvas of the picture with the long side at most max (never larger than the picture). */
  function scaled(src, w, h, max) {
    const k = Math.min(1, max / Math.max(w, h)), c = canvas(Math.round(w * k), Math.round(h * k)), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function photoOf(src) {
    const w = src.width, h = src.height, full = scaled(src, w, h, FULL), small = scaled(full, full.width, full.height, SMALL);
    return { full, small, w: full.width, h: full.height, data: new Map() };
  }
  /** The pixels of one of the photo's canvases, read once. */
  function pixels(photo, which) {
    if (!photo.data.has(which)) {
      const c = photo[which];
      photo.data.set(which, c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height));
    }
    return photo.data.get(which);
  }
  function detect(photo) {
    const c = scaled(photo.small, photo.small.width, photo.small.height, DETECT);
    const img = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
    const r = S.detect.find(img);
    return { quad: G.norm(r.quad, c.width, c.height), found: r.found };
  }
  function toCanvas(img) {
    const c = canvas(img.width, img.height);
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  }
  /** The flat page (no look, no turn) from the photo's smaller or full canvas, the long side at most max. */
  function flat(page, max) {
    const ph = page.photo, which = max <= SMALL ? 'small' : 'full', src = pixels(ph, which);
    const quad = G.denorm(page.quad || G.norm(G.inset(1, 1), 1, 1), src.width, src.height);
    const size = G.outSize(quad, max);
    return S.warp.warp(src, quad, size.w, size.h);
  }
  function render(page, max = PREVIEW) {
    let m = cache.get(page);
    if (!m || m.v !== page.v) { m = new Map(); m.v = page.v; cache.set(page, m); }
    const key = String(max);
    if (m.has(key)) return m.get(key);
    const look = F.style(flat(page, max), page.style, { brightness: page.brightness, contrast: page.contrast });
    const out = toCanvas(F.rotate(look, page.turn || 0));
    if (m.size > 3) m.delete(m.keys().next().value);
    m.set(key, out);
    return out;
  }
  function autoTurn(page) {
    const img = flat(page, 500), ink = F.sauvola(F.luma(F.flatten(img)), img.width, img.height, { k: 0.25 });
    return F.orient(ink, img.width, img.height);
  }
  S.render = { photoOf, detect, render, autoTurn, flat, toCanvas, scaled, PREVIEW, THUMB, FULL };
})(window);
