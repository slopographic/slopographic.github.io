/* SlopIsolate video — compositing helpers. A matte is a grey mask at mask size (mw × mh); it is upscaled with
 * smooth bilinear drawing to the output size and used as alpha:
 *   V.matte.frame(frame, mask, mw, mh, W, H, bg) → canvas (W × H): frame × matte, over bg (a colour) or transparent (null).
 *   V.matte.grey(mask, mw, mh, W, H) → canvas: the matte as an opaque grey picture (for the matte video).
 *   V.matte.plain(frame, W, H) → canvas: the colour frame itself.
 * The canvases are scratch buffers reused by the next call (a 720p canvas per frame is what made long exports
 * grow the heap). Consume the result before calling again: draw it, or make a VideoFrame or blob from it. */
(function () {
  'use strict';
  const CO = window.CO, V = CO.video, U = CO.util;
  const MT = V.matte = {};
  const pool = Object.create(null);

  /** The scratch canvas for a role, resized when the size changes. */
  function scratch(role, w, h) {
    let c = pool[role];
    if (!c || c.width !== w || c.height !== h) { c = pool[role] = U.canvas(w, h); }
    return c;
  }
  /** Alpha canvas: rgb 255, alpha = mask (small). */
  function alphaCanvas(mask, mw, mh) {
    const c = scratch('alpha', mw, mh), g = c.getContext('2d'), img = g.createImageData(mw, mh), d = img.data;
    for (let i = 0, n = mw * mh; i < n; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = mask[i]; }
    g.putImageData(img, 0, 0);
    return c;
  }
  /** Upscale helper: draws a small canvas to W×H with the best smoothing the browser offers. */
  function smooth(g) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; return g; }

  MT.frame = function (frame, mask, mw, mh, W, H, bg) {
    const out = scratch('out', W, H), og = out.getContext('2d');
    og.globalCompositeOperation = 'source-over';
    og.clearRect(0, 0, W, H);
    if (bg) { og.fillStyle = bg; og.fillRect(0, 0, W, H); }
    const layer = scratch('layer', W, H), lg = smooth(layer.getContext('2d'));
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, W, H);
    lg.drawImage(frame, 0, 0, W, H);
    lg.globalCompositeOperation = 'destination-in';
    lg.drawImage(alphaCanvas(mask, mw, mh), 0, 0, W, H);
    og.drawImage(layer, 0, 0);
    return out;
  };
  MT.grey = function (mask, mw, mh, W, H) {
    const small = scratch('greySmall', mw, mh), sg = small.getContext('2d'), img = sg.createImageData(mw, mh), d = img.data;
    for (let i = 0, n = mw * mh; i < n; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = mask[i]; d[i * 4 + 3] = 255; }
    sg.putImageData(img, 0, 0);
    const out = scratch('greyOut', W, H);
    smooth(out.getContext('2d')).drawImage(small, 0, 0, W, H);
    return out;
  };
  /** The colour frame itself as a canvas (no matte): the colour half of a matte pair. */
  MT.plain = function (frame, W, H) {
    const out = scratch('plain', W, H), g = out.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.drawImage(frame, 0, 0, W, H);
    return out;
  };
})();
