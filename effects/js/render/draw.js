// Slop Effects frame drawing: one function draws the composition at a time t onto a 2D context of the composition's size.
// The preview and the render (PNG sequence and video) both call drawFrame, so they show the same pixels. Layers are drawn
// bottom to top (the last layer in the list first); a layer with enabled effects is drawn on its own canvas, run through
// its effect stack (fx.js), then placed with its opacity. Media must be ready first: call media.prepare(doc, t) (async).
// Classic script: window.SlopEffects.draw.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const V = () => ns.values;
  const FX = () => ns.fx;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** The CSS font stack for a family name (SlopFonts when it is loaded, else a plain sans-serif stack). */
  function fontStack(family) {
    if (g.SlopFonts && typeof g.SlopFonts.stack === 'function') return g.SlopFonts.stack(family);
    return `"${String(family || 'Inter').replace(/"/g, '')}", sans-serif`;
  }

  /** The current picture of a media item at time t, or null while it is not ready. */
  function mediaDrawable(opts, id) {
    const m = opts && opts.media && opts.media.drawable(id);
    return m || null;
  }

  /** Path of a shape in local space (0,0 is the top-left of the layer's own box). */
  function shapePath(c, s) {
    const { w, h } = s;
    c.beginPath();
    if (s.shape === 'ellipse') c.ellipse(w / 2, h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    else if (s.shape === 'rrect') {
      const r = clamp(s.radius || 0, 0, Math.min(Math.abs(w), Math.abs(h)) / 2);
      c.moveTo(r, 0); c.arcTo(w, 0, w, h, r); c.arcTo(w, h, 0, h, r); c.arcTo(0, h, 0, 0, r); c.arcTo(0, 0, w, 0, r); c.closePath();
    } else if (s.shape === 'line') { c.moveTo(0, 0); c.lineTo(w, h); }
    else c.rect(0, 0, w, h);
  }

  /** Text lines in local space: the top-left of the box is (0, 0); align sets where each line starts across the box. */
  function drawText(c, s) {
    const size = Math.max(1, s.size || 16);
    c.font = `${s.weight || 400} ${size}px ${fontStack(s.font)}`;
    c.textBaseline = 'top';
    c.textAlign = s.align === 'center' ? 'center' : s.align === 'right' ? 'right' : 'left';
    c.fillStyle = s.color || '#ffffff';
    const x = c.textAlign === 'center' ? s.w / 2 : c.textAlign === 'right' ? s.w : 0;
    String(s.text || '').split('\n').forEach((line, i) => c.fillText(line, x, i * size * 1.2));
  }

  /** The content of one layer in its own space, on the context c (the caller sets the transform and alpha). */
  function drawContent(c, layer, opts, t) {
    const s = layer.source;
    if (layer.type === 'solid') { c.fillStyle = s.color; c.fillRect(0, 0, s.w, s.h); return; }
    if (layer.type === 'shape') {
      shapePath(c, s);
      if (s.shape !== 'line') { c.fillStyle = s.fill; c.fill(); }
      if (s.strokeWidth > 0) { c.strokeStyle = s.stroke; c.lineWidth = s.strokeWidth; c.stroke(); }
      return;
    }
    if (layer.type === 'text') { drawText(c, s); return; }
    if (layer.type === 'image' || layer.type === 'video') {
      const el = mediaDrawable(opts, s.mediaId);
      if (el) c.drawImage(el, 0, 0, s.w, s.h);
    }
  }

  /**
   * Draws the composition at time t. opts: { media } (the media store, for image and video layers) and an optional
   * `background` override ('transparent' keeps the canvas clear, for PNG frames with alpha).
   */
  function drawFrame(ctx, doc, t, opts = {}) {
    const W = doc.comp.width, H = doc.comp.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    const bg = opts.background || doc.comp.background;
    if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
    const state = V().frameState(doc, t);
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const layer = doc.layers[i];
      const st = state.get(layer.id);
      if (!st || layer.hidden || layer.type === 'null') continue;
      const alpha = clamp(st.vals.opacity, 0, 100) / 100;
      if (alpha <= 0) continue;
      const fxs = layer.effects.filter((f) => FX().active(f)).map((f) => ({ kind: f.kind, seed: f.seed, on: true, p: st.vals.fx[f.id] }));
      if (!fxs.length) {
        ctx.save();
        ctx.setTransform(...st.world);
        ctx.globalAlpha = alpha;
        drawContent(ctx, layer, opts, t);
        ctx.restore();
        continue;
      }
      const own = FX().take(W, H), oc = own.getContext('2d');
      oc.setTransform(...st.world);
      drawContent(oc, layer, opts, t);
      oc.setTransform(1, 0, 0, 1, 0, 0);
      // Each effect that makes a new canvas gives its input back to the pool, so only the result is given here.
      const out = FX().run(own, W, H, fxs, t, doc.comp.fps);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(out, 0, 0);
      ctx.restore();
      FX().give(out);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  ns.draw = { drawFrame, drawContent, fontStack, shapePath };
})(typeof window !== 'undefined' ? window : globalThis);
