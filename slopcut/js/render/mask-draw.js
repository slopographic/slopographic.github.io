/* SlopCut: the raster side of clip masks. compositor.js draws a masked clip into a scratch layer, then keeps only
   the pixels the mask covers (destination-in) and draws that onto the frame. Coverage is the shape, grown or shrunk
   by the expansion (the same rule as core/mask.js covered()), blurred by the feather, and inverted when asked.
   Scratch canvases are shared, so draw one masked layer at a time (the compositor does). */
(function () {
  'use strict';
  const SE = window.SE;
  const MD = (SE.maskDraw = {});
  const pool = new Map();
  function scratch(name, W, H) {
    let c = pool.get(name);
    if (!c) { c = document.createElement('canvas'); pool.set(name, c); }
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    return c;
  }
  /** Reset a context to the identity transform and default state. */
  function plain(g) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; }
  /** The outline (clip space) on a context. */
  function path(g, m) {
    for (const op of SE.mask.ops(m)) {
      if (op[0] === 'M') g.moveTo(op[1], op[2]);
      else if (op[0] === 'L') g.lineTo(op[1], op[2]);
      else if (op[0] === 'C') g.bezierCurveTo(op[1], op[2], op[3], op[4], op[5], op[6]);
      else g.closePath();
    }
  }
  /** Coverage canvas (white where the mask keeps pixels). T = { x, y, rot (deg), s } maps clip space to output px;
      s already includes the output scale, so lengths in clip space are multiplied by s. */
  MD.coverage = function (m, W, H, T) {
    const cv = scratch('cov', W, H), g = cv.getContext('2d');
    plain(g); g.clearRect(0, 0, W, H);
    const r = (T.rot * Math.PI) / 180, cs = Math.cos(r) * T.s, sn = Math.sin(r) * T.s;
    g.setTransform(cs, sn, -sn, cs, T.x, T.y);
    const blur = (m.feather || 0) * T.s;
    g.filter = blur > 0.05 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
    g.beginPath(); path(g, m);
    g.fillStyle = '#fff'; g.fill('evenodd');
    const e = m.expand || 0;
    if (e > 0) { g.lineJoin = 'round'; g.lineWidth = 2 * e; g.strokeStyle = '#fff'; g.stroke(); }
    else if (e < 0) { g.globalCompositeOperation = 'destination-out'; g.lineWidth = -2 * e; g.strokeStyle = '#000'; g.stroke(); }
    plain(g);
    if (!m.invert) return cv;
    const iv = scratch('inv', W, H), ig = iv.getContext('2d');
    plain(ig); ig.clearRect(0, 0, W, H); ig.fillStyle = '#fff'; ig.fillRect(0, 0, W, H);
    ig.globalCompositeOperation = 'destination-out'; ig.drawImage(cv, 0, 0);
    return iv;
  };
  /** Draw one masked layer: draw(lg) paints the unmasked layer into a scratch canvas, the mask keeps its covered
      pixels, and the result is drawn onto g (at the identity transform, as the compositor leaves it). */
  MD.layer = function (g, W, H, draw, m, T) {
    const lc = scratch('layer', W, H), lg = lc.getContext('2d');
    plain(lg); lg.clearRect(0, 0, W, H);
    draw(lg);
    plain(lg); lg.globalCompositeOperation = 'destination-in'; lg.drawImage(MD.coverage(m, W, H, T), 0, 0);
    g.save(); plain(g); g.drawImage(lc, 0, 0); g.restore();
  };
})();
