/* SlopMask overlay: draws where a mask hides, so the mask shows on the canvas while it is edited.
 * Needs shared/mask/mask.js first. Adds window.SlopMask.overlay. */
(function () {
  'use strict';
  const M = window.SlopMask;
  if (!M || M.overlay) return;
  let tint = null;
  /** Tints the hidden part of an alpha canvas (opaque = shown). g: the view context; (sx, sy): the screen
   * position of the surface's origin; (ox, oy): the alpha canvas's position in surface space; z: zoom.
   * color: the tint (default a translucent red). Only the canvas's own area is tinted; see mask.def. */
  function overlay(g, alpha, ox, oy, sx, sy, z, color = 'rgba(255,40,40,.5)') {
    const w = alpha.width, h = alpha.height;
    if (!tint || tint.width < w || tint.height < h) { tint = document.createElement('canvas'); tint.width = Math.max(w, tint.width); tint.height = Math.max(h, tint.height); }
    const t = tint.getContext('2d');
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, tint.width, tint.height);
    t.fillStyle = color; t.fillRect(0, 0, w, h);
    t.globalCompositeOperation = 'destination-out'; t.drawImage(alpha, 0, 0);
    g.save(); g.imageSmoothingEnabled = false;
    g.drawImage(tint, 0, 0, w, h, sx + ox * z, sy + oy * z, w * z, h * z);
    g.restore();
  }
  M.overlay = overlay;
})();
