// Slop Effects: the effect passes, drawn on a layer's own canvas in composition pixels, in stack order. Blur and colour
// use the canvas filter (where the browser has it); drop shadow and glow use the canvas shadow; grain, vignette and
// glitch are seeded, so a frame is the same every time it is drawn (preview and export match). Noise and slice maths
// follow Reel Remix's effect layer (remix/js/fx.js), which is not in shared/, so the same ideas are written again here.
// Random values come from SlopVideo.seed. Canvases come from a small pool (take / give). Classic script: window.SlopEffects.fx.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const D = () => ns.defs;
  const rng = (seed) => g.SlopVideo.seed.rng(seed);
  const TILE = 128;
  const pool = new Map(); // "WxH" -> [canvas]
  const hasFilter = () => typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

  /** A cleared canvas of W x H, from the pool when one is free. */
  function take(W, H) {
    const key = `${W}x${H}`;
    const list = pool.get(key) || [];
    const c = list.length ? list.pop() : document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').setTransform(1, 0, 0, 1, 0, 0);
    c.getContext('2d').clearRect(0, 0, W, H);
    return c;
  }
  /** Returns a canvas to the pool (at most four per size). */
  function give(c) {
    if (!c) return;
    const key = `${c.width}x${c.height}`;
    const list = pool.get(key) || [];
    if (list.length < 4) list.push(c);
    pool.set(key, list);
  }
  /** rgba() text for a '#rrggbb' colour and an alpha. */
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.min(1, Math.max(0, a)).toFixed(3)})`;
  }

  /** Does a stack entry draw anything (on, a known kind)? */
  const active = (fx) => !!fx && fx.on !== false && !!D().EFFECTS[fx.kind];

  /** Blur: the layer redrawn through a Gaussian filter of radius px. */
  function blur(src, W, H, p) {
    if (!(p.radius > 0) || !hasFilter()) return src;
    const out = take(W, H), c = out.getContext('2d');
    c.filter = `blur(${p.radius}px)`;
    c.drawImage(src, 0, 0);
    c.filter = 'none';
    give(src);
    return out;
  }

  /** Drop shadow: a copy of the layer's alpha, offset and blurred, under the layer. */
  function shadow(src, W, H, p) {
    if (!(p.opacity > 0)) return src;
    const out = take(W, H), c = out.getContext('2d');
    c.shadowColor = rgba(p.colour, p.opacity);
    c.shadowBlur = Math.max(0, p.blur);
    c.shadowOffsetX = p.x;
    c.shadowOffsetY = p.y;
    c.drawImage(src, 0, 0);
    c.shadowColor = 'rgba(0,0,0,0)';
    c.drawImage(src, 0, 0);
    give(src);
    return out;
  }

  /** Glow: the layer's alpha, tinted and blurred, behind the layer. The shadow is cast from an off-canvas copy. */
  function glow(src, W, H, p) {
    if (!(p.intensity > 0) || !(p.radius > 0)) return src;
    const out = take(W, H), c = out.getContext('2d');
    const off = 4 * Math.max(W, H);
    const passes = p.intensity > 1 ? [1, Math.min(1, p.intensity - 1)] : [Math.min(1, p.intensity)];
    for (const a of passes) {
      c.shadowColor = rgba(p.colour, a);
      c.shadowBlur = p.radius;
      c.shadowOffsetX = off;
      c.drawImage(src, -off, 0);
    }
    c.shadowColor = 'rgba(0,0,0,0)';
    c.drawImage(src, 0, 0);
    give(src);
    return out;
  }

  /** Colour correction: brightness, contrast, saturation and hue through the canvas filter. */
  function colour(src, W, H, p) {
    const neutral = p.brightness === 0 && p.contrast === 0 && p.saturation === 100 && p.hue === 0;
    if (neutral || !hasFilter()) return src;
    const out = take(W, H), c = out.getContext('2d');
    c.filter = `brightness(${(1 + p.brightness / 100).toFixed(4)}) contrast(${(1 + p.contrast / 100).toFixed(4)}) saturate(${(p.saturation / 100).toFixed(4)}) hue-rotate(${p.hue}deg)`;
    c.drawImage(src, 0, 0);
    c.filter = 'none';
    give(src);
    return out;
  }

  /** A grey noise tile for a seed (built once per seed and reused). */
  const tiles = new Map();
  function noiseTile(seed) {
    if (tiles.has(seed)) return tiles.get(seed);
    const t = document.createElement('canvas');
    t.width = TILE; t.height = TILE;
    const c = t.getContext('2d'), img = c.createImageData(TILE, TILE), r = rng(seed);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.floor(r() * 256); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    c.putImageData(img, 0, 0);
    if (tiles.size > 16) tiles.clear();
    tiles.set(seed, t);
    return t;
  }

  /** Film grain: noise over the layer's pixels (source-atop, so transparent areas stay clear), moved every frame. */
  function grain(src, W, H, p, seed, frame) {
    if (!(p.amount > 0)) return src;
    const out = take(W, H), c = out.getContext('2d');
    c.drawImage(src, 0, 0);
    const k = Math.max(1, Math.round(p.size)), r = rng((seed + frame * 7919) >>> 0);
    const ox = Math.floor(r() * TILE), oy = Math.floor(r() * TILE);
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = 0.5 * p.amount;
    c.scale(k, k);
    c.fillStyle = c.createPattern(noiseTile(seed), 'repeat');
    c.translate(-ox, -oy);
    c.fillRect(0, 0, W / k + TILE, H / k + TILE);
    c.restore();
    give(src);
    return out;
  }

  /** Vignette: the edges of the layer darken (source-atop, so only the layer's pixels). feather widens the clear middle. */
  function vignette(src, W, H, p) {
    if (!(p.amount > 0)) return src;
    const out = take(W, H), c = out.getContext('2d');
    c.drawImage(src, 0, 0);
    const outer = Math.hypot(W, H) / 2, inner = Math.min(W, H) * (0.5 - 0.4 * p.feather);
    const grd = c.createRadialGradient(W / 2, H / 2, Math.max(0, inner), W / 2, H / 2, outer);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, rgba('#000000', 0.9 * p.amount));
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = grd;
    c.fillRect(0, 0, W, H);
    c.restore();
    give(src);
    return out;
  }

  /** Glitch: on about half the frames (12 a second) a few horizontal slices of the layer shift sideways. */
  function glitch(src, W, H, p, seed, t) {
    if (!(p.amount > 0)) return src;
    const r = rng((seed ^ Math.imul(Math.floor(t * 12), 0x27d4eb2d)) >>> 0);
    if (r() < 0.5) return src;
    const out = take(W, H), c = out.getContext('2d');
    c.drawImage(src, 0, 0);
    const n = 1 + Math.floor(r() * (2 + 8 * p.amount));
    for (let i = 0; i < n; i++) {
      const y = Math.floor(r() * H), h = Math.max(1, Math.floor((0.02 + r() * 0.12) * H));
      const dx = Math.round((r() * 2 - 1) * 0.08 * p.amount * W);
      c.drawImage(src, 0, y, W, h, dx, y, W, h);
    }
    give(src);
    return out;
  }

  const DRAW = { blur, shadow, glow, colour, grain, vignette, glitch };

  /**
   * Runs a layer's enabled effects over its canvas, in order. entries are { kind, p, seed } (p: the sampled parameters).
   * Returns the canvas to draw (the input canvas, or a new one). The caller gives it back with give().
   */
  function run(src, W, H, entries, t, fps) {
    const frame = Math.floor(t * fps + 1e-6);
    let cur = src;
    for (const e of entries) {
      if (!active(e) || !DRAW[e.kind]) continue;
      const next = e.kind === 'grain' ? grain(cur, W, H, e.p, e.seed, frame)
        : e.kind === 'glitch' ? glitch(cur, W, H, e.p, e.seed, t)
          : DRAW[e.kind](cur, W, H, e.p);
      cur = next;
    }
    return cur;
  }

  ns.fx = { take, give, rgba, active, run, hasFilter, noiseTile, DRAW, poolSize: () => [...pool.values()].reduce((n, l) => n + l.length, 0) };
})(typeof window !== 'undefined' ? window : globalThis);
