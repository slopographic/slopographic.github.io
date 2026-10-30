/* Reel Remix: the effect layer, drawn over the whole reel after the cuts (preview.js calls RM.layer.apply from drawFrame,
   so the preview and the export show the same frames). The plan's picks say which effect each cut has (shared/video/
   effects.js). Each effect is drawn from its pick's seed and the time, so a frame is the same every time it is drawn:
   film grain (a seeded noise tile, moved each frame), colour shift (a hue laid over in colour mode), glitch (slices of the
   frame shifted sideways on some frames), zoom pulse (the frame punches in at each cut and settles) and vignette.
   Intensity 0 draws nothing. Exposes RM.layer. */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo, FX = SV.effects, S = SV.seed;
  const L = (RM.layer = {});
  const TILE = 128, ZOOM_SECONDS = 0.6;
  let scratch = null, tile = null, tileSeed = null;

  /** A copy of the frame drawn so far, the same size as the canvas (glitch and zoom read it). */
  function copy(c, W, H) {
    if (!scratch || scratch.width !== W || scratch.height !== H) {
      scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H;
    }
    const g = scratch.getContext('2d');
    g.clearRect(0, 0, W, H); g.drawImage(c.canvas, 0, 0, W, H);
    return scratch;
  }
  /** The noise tile of a seed (built once per seed; grey values from the seed). */
  function noise(seed) {
    if (tile && tileSeed === seed) return tile;
    tile = document.createElement('canvas'); tile.width = TILE; tile.height = TILE;
    const g = tile.getContext('2d'), img = g.createImageData(TILE, TILE), r = S.rng(seed);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.floor(r() * 256); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); tileSeed = seed;
    return tile;
  }
  /** Film grain: the tile laid over in overlay mode, moved to a new place 24 times a second. */
  function grain(c, W, H, t, k, seed) {
    const r = S.rng((seed + Math.floor(t * 24) * 7919) >>> 0), ox = Math.floor(r() * TILE), oy = Math.floor(r() * TILE);
    c.save();
    c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.6 * k;
    c.fillStyle = c.createPattern(noise(seed), 'repeat');
    c.translate(-ox, -oy); c.fillRect(0, 0, W + TILE, H + TILE);
    c.restore();
  }
  /** Colour shift: a hue of the pick's seed laid over the frame in colour mode. */
  function colour(c, W, H, t, k, seed) {
    const hue = Math.floor(S.rng(seed)() * 360);
    c.save();
    c.globalCompositeOperation = 'color'; c.globalAlpha = 0.4 * k;
    c.fillStyle = 'hsl(' + hue + ' 90% 50%)'; c.fillRect(0, 0, W, H);
    c.restore();
  }
  /** Glitch: on about half the frames (12 a second), a few horizontal slices of the frame shift sideways. */
  function glitch(c, W, H, t, k, seed) {
    const r = S.rng((seed ^ Math.imul(Math.floor(t * 12), 0x27d4eb2d)) >>> 0);
    if (r() < 0.5) return;
    const src = copy(c, W, H), n = 1 + Math.floor(r() * (2 + 8 * k));
    for (let i = 0; i < n; i++) {
      const y = Math.floor(r() * H), h = Math.max(1, Math.floor((0.02 + r() * 0.12) * H));
      const dx = Math.round((r() * 2 - 1) * 0.08 * k * W);
      c.drawImage(src, 0, y, W, h, dx, y, W, h);
    }
  }
  /** Zoom pulse: at each cut the frame punches in (up to 12 % at full intensity) and settles over ZOOM_SECONDS. */
  function zoom(c, W, H, t, k, seed, start) {
    const p = Math.max(0, 1 - (t - start) / ZOOM_SECONDS);
    if (p <= 0) return;
    const s = 1 + 0.12 * k * p * p, src = copy(c, W, H);
    c.drawImage(src, -(W * (s - 1)) / 2, -(H * (s - 1)) / 2, W * s, H * s);
  }
  /** Vignette: the corners darken, more at higher intensity. */
  function vignette(c, W, H, t, k) {
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (0.85 * k).toFixed(3) + ')');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  const DRAW = { grain, colour, glitch, zoom, vignette };

  /** Index of the cut that holds time t in the plan (the last cut from its start on), or -1. */
  function cutIndex(plan, t) {
    let ci = -1;
    plan.cuts.forEach((beat, i) => { if (beat.length && t >= beat[0].start - 1e-9) ci = i; });
    return ci;
  }
  /** Draws the effect layer of the plan at time t on a canvas context of size W x H. */
  L.apply = function (c, W, H, t, plan) {
    const e = plan && plan.effect;
    if (!e || e.kind === 'none' || !e.picks || !e.picks.length || !(e.intensity > 0)) return;
    const ci = cutIndex(plan, t), pick = FX.at(e, ci);
    if (!pick || !DRAW[pick.kind]) return;
    c.save();
    DRAW[pick.kind](c, W, H, t, e.intensity, pick.seed, plan.cuts[ci][0].start);
    c.restore();
  };
})();
