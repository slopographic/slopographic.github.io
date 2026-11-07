/* SlopCut: draws one effect of the random effect layer (compositor.js calls apply for each effect layer). The effect
   acts on the frame drawn so far, i.e. the tracks below the layer. Noise and glitch use the layer seed and the time,
   so the same seed gives the same frames in the preview and the export. Colour shift uses ctx.filter (skipped
   where the browser has none). */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, SV = window.SlopVideo;
  const D = (SE.fxDraw = {});
  let scratch = null;

  function mk(w, h) {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
    return U.canvas(w, h);
  }
  /** A copy of the frame drawn so far, in a reused scratch canvas of the same size. */
  function copy(g, W, H) {
    if (!scratch || scratch.width !== W || scratch.height !== H) scratch = mk(W, H);
    const x = scratch.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none';
    x.clearRect(0, 0, W, H);
    x.drawImage(g.canvas, 0, 0, W, H);
    return scratch;
  }
  /** Random numbers for one effect at one time bucket: the same seed, tag and bucket give the same stream. */
  const stream = (st, tag, bucket) => SV.seed.rng(SV.seed.hash(st.seed + '/' + tag + '/' + bucket));

  const FN = {
    grain(g, W, H, st) {
      const tile = mk(128, 128), tx = tile.getContext('2d'), img = tx.createImageData(128, 128);
      const r = stream(st, 'grain', Math.round(st.t * 24));
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (r() * 255) | 0;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      tx.putImageData(img, 0, 0);
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = Math.min(1, st.amount * 0.5);
      g.fillStyle = g.createPattern(tile, 'repeat');
      g.fillRect(0, 0, W, H);
    },
    colour(g, W, H, st, src) {
      if (!('filter' in g)) return;
      const hue = (st.k * 2 - 1) * 60 * st.amount, sat = 1 + 0.6 * st.amount;
      g.filter = 'hue-rotate(' + hue.toFixed(1) + 'deg) saturate(' + sat.toFixed(3) + ')';
      g.drawImage(src, 0, 0, W, H);
      g.filter = 'none';
    },
    glitch(g, W, H, st, src) {
      const r = stream(st, 'glitch', Math.round(st.t * 12)), n = 3 + Math.round(st.amount * 10);
      for (let i = 0; i < n; i++) {
        const y = Math.floor(r() * H), h = Math.max(2, Math.floor((0.01 + r() * 0.12) * H));
        const dx = Math.round((r() * 2 - 1) * 0.08 * W * st.amount);
        g.drawImage(src, 0, y, W, h, dx, y, W, h);
      }
    },
    zoom(g, W, H, st, src) {
      const phase = (st.t * (1 + st.k * 2)) % 1, s = 1 + 0.12 * st.amount * (1 - phase) * (1 - phase);
      g.translate(W / 2, H / 2); g.scale(s, s);
      g.drawImage(src, -W / 2, -H / 2, W, H);
    },
    vignette(g, W, H, st) {
      const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,' + Math.min(1, 0.9 * st.amount).toFixed(3) + ')');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  };

  /** Applies one effect state ({ type, amount, k, seed, t }) to the canvas g of size W×H. */
  D.apply = function (g, W, H, st) {
    if (!st || !(st.amount > 0) || !FN[st.type]) return;
    const src = st.type === 'grain' || st.type === 'vignette' ? null : copy(g, W, H);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    FN[st.type](g, W, H, st, src);
    g.restore();
  };
})();
