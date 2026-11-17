/* SlopCut: the compositor. Works out which clips are visible at time t (including both sides of a
   transition) and draws them bottom (V1) to top with fit, crop, position, scale, rotation, opacity,
   fades, colour grading and the transition terms (render/transitions.js). Used by the live preview and by export.
   An effect layer (clip kind 'effect', see core/fx-random.js) is a layer with `effect` set: it changes the frame
   drawn so far, so it affects the tracks below it. Keyframes (core/anim.js) are read here as layer.xf.
   render(ctx, p, t, { W, H, source(clip, srcT) }) — source returns a drawable or null. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model;
  const CMP = SE.compositor = {};

  /** Transition window of a clip with trIn: [a, b) and its outgoing clip (or null). */
  CMP.trWindow = function (p, c) {
    if (!c.trIn) return null;
    const prev = M.prevAdjacent(p, c), d = c.trIn.dur;
    return prev ? { a: c.start - d / 2, b: c.start + d / 2, out: prev, inc: c, type: c.trIn.type } : { a: c.start, b: c.start + d, out: null, inc: c, type: c.trIn.type };
  };
  /** Transition terms for one side of a window at progress q (sequence pixels; see render/transitions.js). */
  const trOf = (p, win, q, role, solo) => ({ type: win.type, q, role, solo, P: SE.transitions.params(win.type, role, q, p.w, p.h, solo) });
  /** Visible layers bottom to top: [{ clip, srcT, u, alpha, xf, tr: { type, q, role } }] and effect layers
      [{ clip, effect, u, t }]. Effect layers come before the clips of their own track (they act on what is below). */
  CMP.layers = function (p, t) {
    const out = [];
    for (const tk of M.videoTracks(p)) {
      if (!M.trackLive(p, tk)) continue;
      const all = M.clipsOn(p, tk.id);
      const fxc = all.find((c) => c.kind === 'effect' && t >= c.start && t < M.end(c));
      if (fxc) {
        const st = SE.fx.stateAt(fxc.fx, t - fxc.start);
        if (st) out.push({ clip: fxc, effect: Object.assign(st, { t }), u: t - fxc.start });
      }
      const clips = all.filter((c) => c.kind !== 'audio' && c.kind !== 'effect');
      let win = null;
      for (const c of clips) { const w = CMP.trWindow(p, c); if (w && t >= w.a && t < w.b) { win = w; break; } }
      if (win) {
        const q = U.clamp((t - win.a) / (win.b - win.a), 0, 1);
        if (win.out) out.push(layer(p, win.out, t, trOf(p, win, q, 'out', false)));
        out.push(layer(p, win.inc, t, trOf(p, win, q, 'in', !win.out)));
        continue;
      }
      const c = clips.find((x) => t >= x.start && t < M.end(x));
      if (c) out.push(layer(p, c, t, null));
    }
    return out;
  };
  function layer(p, c, t, tr) {
    const len = M.srcLen(p, c);
    const srcT = U.clamp(M.srcAt(c, t), 0, isFinite(len) ? Math.max(0, len - 1e-3) : Infinity);
    const u = U.clamp(t - c.start, 0, c.dur), xf = SE.anim.combine(c, u);
    return { clip: c, srcT, u, alpha: xf.opacity * M.fadeAt(c, u), tr, xf };
  }
  /** Natural size of a layer's drawable (title/colour layers are frame-sized). */
  function sizeOf(src) {
    return { w: src.displayWidth || src.videoWidth || src.naturalWidth || src.width || 1, h: src.displayHeight || src.videoHeight || src.naturalHeight || src.height || 1 };
  }
  /** Draw one layer. k = output pixels per project pixel. Glitch layers are drawn once per band (L.slice). */
  function drawLayer(g, p, L, src, W, H, k) {
    const c = L.clip, xf = L.xf, P = L.tr ? L.tr.P : null;
    if (P && P.hide) return;
    if (P && P.slices && !L.slice) { for (const s of P.slices) drawLayer(g, p, Object.assign({}, L, { slice: s }), src, W, H, k); return; }
    let alpha = L.alpha, dx = 0, dy = 0, sc = 1, rot = 0, blur = L.blur || 0, clip = null, overlay = null;
    if (P) {
      alpha *= P.alpha; dx = P.dx * k; sc = P.sc; rot = P.rot; blur += P.blur; overlay = P.overlay;
      if (P.clip) clip = P.clip.map((v) => v * k);
    }
    if (L.slice) { clip = L.slice.rect.map((v) => v * k); dx += L.slice.dx * k; }
    if (c.kind === 'title') { const a = SE.text.animAt(c, L.u); alpha *= a.alpha; dy += a.dy * H; sc *= a.scale; blur += a.blur; }
    if (alpha <= 0.002 && !overlay) return;
    if (c.mask && !L.flat) { // masked clip: draw it alone, then keep only what the mask covers (mask-draw.js)
      const T = { x: W / 2 + xf.x * k + dx, y: H / 2 + xf.y * k + dy, rot: xf.rot, s: Math.max(1e-6, xf.scale * sc * k) };
      return SE.maskDraw.layer(g, W, H, (lg) => drawLayer(lg, p, Object.assign({}, L, { flat: true }), src, W, H, k), c.mask, T);
    }
    g.save();
    if (clip) { g.beginPath(); g.rect(clip[0], clip[1], clip[2], clip[3]); g.clip(); }
    if (src && alpha > 0.002) {
      const s = sizeOf(src), frame = c.kind === 'title' || c.kind === 'color' || c.kind === 'graphic';
      const base = frame ? 1 : Math.min(W / s.w, H / s.h);
      let img = src;
      if (SE.grade.needed(c) && c.kind !== 'color') {
        const gw = Math.min(s.w, s.w * base * xf.scale * 1.05), gh = gw * s.h / s.w;
        const graded = SE.grade.apply(src, gw, gh, c);
        if (graded) img = graded; else g.filter = SE.grade.filter(c);
      }
      if (blur > 0) g.filter = 'blur(' + (blur * k).toFixed(1) + 'px)';
      g.globalAlpha = U.clamp(alpha, 0, 1);
      g.translate(W / 2 + xf.x * k + dx, H / 2 + xf.y * k + dy);
      if (xf.rot + rot) g.rotate(((xf.rot + rot) * Math.PI) / 180);
      g.scale(base * xf.scale * sc, base * xf.scale * sc);
      const iw = sizeOf(img).w / s.w; // graded copies may be smaller than the source
      const cl = c.cropL, ct = c.cropT, cw = Math.max(0, 1 - c.cropL - c.cropR), ch = Math.max(0, 1 - c.cropT - c.cropB);
      if (cw > 0 && ch > 0) {
        if (c.kind === 'color') { g.fillStyle = c.color; g.fillRect(-s.w / 2 + cl * s.w, -s.h / 2 + ct * s.h, cw * s.w, ch * s.h); }
        else g.drawImage(img, cl * s.w * iw, ct * s.h * iw, cw * s.w * iw, ch * s.h * iw, -s.w / 2 + cl * s.w, -s.h / 2 + ct * s.h, cw * s.w, ch * s.h);
      }
    }
    g.restore();
    if (overlay && overlay.a > 0) { g.save(); g.globalAlpha = U.clamp(overlay.a, 0, 1); g.fillStyle = overlay.col; g.fillRect(0, 0, W, H); g.restore(); }
  }
  /** Colour matte drawable: a frame-sized stand-in (drawn with fillRect). */
  CMP.frameStub = (W, H) => ({ width: W, height: H });
  /** Draw a frame. opts: { W, H, source(clip, srcT, layer) → drawable|null, bg } */
  CMP.render = function (g, p, t, opts) {
    const W = opts.W, H = opts.H, k = W / p.w;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.filter = 'none';
    g.fillStyle = p.bg || '#000'; g.fillRect(0, 0, W, H);
    const layers = CMP.layers(p, t);
    for (const L of layers) {
      if (L.effect) { SE.fxDraw.apply(g, W, H, L.effect); continue; }
      const c = L.clip;
      let src = null;
      if (c.kind === 'color') src = CMP.frameStub(W, H);
      else if (c.kind === 'title') src = SE.text.canvas(c, W, H, k, SE.text.animAt(c, L.u).chars);
      else if (c.kind === 'graphic') src = SE.gfx.canvas(c, W, H, k, L.u);
      else src = opts.source(c, L.srcT, L);
      if (c.matteMedia && src && c.kind === 'video') { // a matte pair: colour × matte (matte-pair.js)
        const msrc = opts.source(SE.matteDraw.clipOf(c), L.srcT, L);
        if (msrc) { SE.matteDraw.layer(g, W, H, (lg) => drawLayer(lg, p, L, src, W, H, k), (lg) => drawLayer(lg, p, Object.assign({}, L, { alpha: 1, tr: null, blur: 0 }), msrc, W, H, k)); continue; }
      }
      drawLayer(g, p, L, src, W, H, k);
    }
    if (SE.watermark) SE.watermark.apply(g, W, H, p, t); // the watermark module (js/watermark): monitor, snapshot and every export, at this time
    g.restore();
    return layers;
  };
  /** Project-space bounding box corners of a visual clip at its transform (for the overlay). With time t the
      keyframes at t are included; without it the clip's own values are used. */
  CMP.bounds = function (p, c, t) {
    let w = p.w, h = p.h;
    if (c.kind === 'title') { const m = SE.text.measure(c); w = m.w; h = m.h; } else if (c.kind === 'graphic') { w = h = c.gfx.size * p.h; } else if (c.media) { const m = M.media(p, c.media); if (m && m.w && m.h) { const b = Math.min(p.w / m.w, p.h / m.h); w = m.w * b; h = m.h * b; } }
    const xf = t == null ? { x: c.x, y: c.y, scale: c.scale, rot: c.rot } : SE.anim.combine(c, U.clamp(t - c.start, 0, c.dur));
    const s = xf.scale, r = (xf.rot * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    const x0 = -w / 2 + c.cropL * w, x1 = w / 2 - c.cropR * w, y0 = -h / 2 + c.cropT * h, y1 = h / 2 - c.cropB * h;
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [p.w / 2 + xf.x + (x * cos - y * sin) * s, p.h / 2 + xf.y + (x * sin + y * cos) * s]);
  };
})();
