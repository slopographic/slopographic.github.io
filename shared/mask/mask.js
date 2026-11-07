/* SlopMask: layer masks for the Slopographic apps (PhotoSlop now; Slop Isolate, Slop Cut and Vector
 * clipping masks can use the same calls). Classic script, no dependencies, exposes window.SlopMask.
 * A mask is { canvas, x, y, def, enabled }: the canvas alpha is how much of the surface shows
 * (opaque reveals, transparent hides). Outside the canvas the default applies: def = true hides it,
 * def = false reveals it. x, y place the canvas in the surface's space. Pure canvas work: no app globals. */
(function () {
  'use strict';
  if (window.SlopMask) return;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

  /** A new mask. kind: 'reveal' (all shown), 'hide' (all hidden) or 'sel' (sel: an alpha canvas, e.g. a selection, shown where opaque). */
  function make(w, h, kind = 'reveal', sel = null) {
    const c = mk(w, h), g = ctx2d(c);
    if (kind === 'reveal') { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); }
    else if (kind === 'sel' && sel) g.drawImage(sel, 0, 0);
    return { canvas: c, x: 0, y: 0, def: kind !== 'reveal', enabled: true };
  }

  /** The mask as an alpha canvas covering a w×h surface whose origin is (ox, oy). Area outside the canvas gets the default. */
  function align(mask, w, h, ox, oy) {
    const c = mk(w, h), g = ctx2d(c);
    if (!mask.def) { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); }
    g.clearRect(mask.x - ox, mask.y - oy, mask.canvas.width, mask.canvas.height);
    g.drawImage(mask.canvas, mask.x - ox, mask.y - oy);
    return c;
  }

  /** A copy of src with the mask's alpha applied (destination-in), the size of src. */
  function apply(src, alpha) {
    const c = mk(src.width, src.height), g = ctx2d(c);
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(alpha, 0, 0);
    return c;
  }

  /** The mask with its visibility swapped: shown becomes hidden and the default flips. */
  function invert(mask) {
    const c = mk(mask.canvas.width, mask.canvas.height), g = ctx2d(c);
    g.drawImage(mask.canvas, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255 - d[i];
    g.putImageData(img, 0, 0);
    return Object.assign({}, mask, { canvas: c, def: !mask.def });
  }

  /** Bakes one stroke into an alpha canvas. buf: the stroke's coverage, in surface space (the caller
   * clips it to any selection). opts: { opacity, value } where value 0 hides (black paint) and 1 reveals
   * (white paint). ox, oy: the alpha canvas's position in surface space. into: optional target canvas
   * (defaults to a new one). Returns the target. */
  function paint(alpha, buf, opts, ox = 0, oy = 0, into = null) {
    const c = into || mk(alpha.width, alpha.height), g = ctx2d(c);
    if (c !== alpha) { g.globalCompositeOperation = 'copy'; g.globalAlpha = 1; g.drawImage(alpha, 0, 0); }
    g.globalAlpha = opts.opacity; g.globalCompositeOperation = 'destination-out'; g.drawImage(buf, -ox, -oy);
    g.globalAlpha = opts.opacity * opts.value; g.globalCompositeOperation = 'lighter'; g.drawImage(buf, -ox, -oy);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    return c;
  }

  /** A live surface for a stroke in progress, to use as a compositing override (e.g. PhotoSlop's live.maskSurface).
   * getMask() returns the current mask; the surface is rebuilt on every call, so the canvas shows each
   * dab as it lands. buf may be a canvas or a function returning one. The last result stays on fn.last for overlays. */
  function live(getMask, buf, opts) {
    let work = null;
    const fn = (L) => {
      const m = getMask(L);
      if (!m) return null;
      if (!work || work.width !== m.canvas.width || work.height !== m.canvas.height) work = mk(m.canvas.width, m.canvas.height);
      paint(m.canvas, typeof buf === 'function' ? buf() : buf, opts, m.x, m.y, work);
      fn.last = { canvas: work, x: m.x, y: m.y, def: m.def };
      return fn.last;
    };
    return fn;
  }

  window.SlopMask = { make, align, apply, invert, paint, live };
})();
