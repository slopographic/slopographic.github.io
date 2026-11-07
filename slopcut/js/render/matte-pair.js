/* SlopCut: a matte pair. A clip made by Slop Isolate's "Remove background" has its colour video (the clip's own
   media) and a matte video (clip.matteMedia): a grey picture, white = keep. The compositor draws the colour layer
   into a scratch canvas, turns the matte's red channel into alpha and keeps only the colour where the matte is white,
   then draws the result. Works in preview and export, and in every browser (no decoder alpha needed).
   SE.matteDraw.clipOf(c) → the virtual clip that the frame provider keys the matte under (`<id>:matte`).
   SE.matteDraw.layer(g, W, H, drawColour(ctx), drawMatte(ctx)) draws one pair into g. */
(function () {
  'use strict';
  const SE = window.SE;
  const MD = SE.matteDraw = {};
  const scratch = new Map();

  /** A reusable W×H canvas per name (the compositor draws one layer at a time). */
  function canvas(name, W, H) {
    let c = scratch.get(name);
    if (!c || c.width !== W || c.height !== H) { c = document.createElement('canvas'); c.width = W; c.height = H; scratch.set(name, c); }
    return c;
  }
  MD.clipOf = (c) => Object.assign({}, c, { id: c.id + ':matte', media: c.matteMedia, kind: 'video' });
  MD.layer = function (g, W, H, drawColour, drawMatte) {
    const a = canvas('pair-colour', W, H), ag = a.getContext('2d');
    ag.setTransform(1, 0, 0, 1, 0, 0); ag.globalAlpha = 1; ag.globalCompositeOperation = 'source-over'; ag.filter = 'none';
    ag.clearRect(0, 0, W, H);
    drawColour(ag);
    const b = canvas('pair-matte', W, H), bg = b.getContext('2d');
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.globalAlpha = 1; bg.globalCompositeOperation = 'source-over'; bg.filter = 'none';
    bg.clearRect(0, 0, W, H);
    drawMatte(bg);
    const img = bg.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i]; // the matte's grey level becomes alpha
    bg.putImageData(img, 0, 0);
    ag.globalCompositeOperation = 'destination-in';
    ag.drawImage(b, 0, 0, W, H);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none';
    g.drawImage(a, 0, 0, W, H);
    g.restore();
  };
})();
