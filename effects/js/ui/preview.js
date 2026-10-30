// Slop Effects preview: the composition drawn at the playhead, at its own size (CSS scales it to fit), through the same
// drawFrame the render uses. Repaints on document and playhead changes; a repaint that arrives while one is running is
// queued, so the last frame always wins. The selected layer gets an outline (the layer's box, in composition pixels).
// Classic script: window.SlopEffects.preview.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const V = () => ns.values;

  /** Mounts the preview into the view element. Returns { repaint(), fit() }. */
  function mount(view, canvas, S, media) {
    const ctx = canvas.getContext('2d');
    let running = false, queued = false, raf = 0;

    /** The composition size fitted into the view, keeping the aspect ratio. */
    function fit() {
      const box = view.getBoundingClientRect();
      const W = S.doc.comp.width, H = S.doc.comp.height;
      const pad = 16;
      const k = Math.max(0.01, Math.min((box.width - pad) / W, (box.height - pad) / H));
      canvas.width = W; canvas.height = H;
      canvas.style.width = `${Math.floor(W * k)}px`;
      canvas.style.height = `${Math.floor(H * k)}px`;
      canvas.dataset.scale = k.toFixed(3);
    }

    /** The outline of the selected layer, drawn on top of the frame (not exported). */
    function outline() {
      const id = S.sel.layer;
      if (!id) return;
      const layer = ns.core.findLayer(S.doc, id);
      if (!layer) return;
      const st = V().frameState(S.doc, S.playhead).get(id);
      if (!st) return;
      const b = V().boundsOf(layer);
      const pts = [[0, 0], [b.w, 0], [b.w, b.h], [0, b.h]].map(([x, y]) => V().apply(st.world, x, y));
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = '#d4ff3a';
      ctx.lineWidth = Math.max(1, S.doc.comp.width / 480);
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (layer.type !== 'null') ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    /** Paints the frame at the playhead. Queued when called while a paint is still waiting for media. */
    async function paint() {
      if (running) { queued = true; return; }
      running = true;
      try {
        do {
          queued = false;
          const t = S.playhead, doc = S.doc;
          await media.prepare(doc, t);
          if (doc !== S.doc || t !== S.playhead) continue;
          ns.draw.drawFrame(ctx, doc, t, { media });
          outline();
        } while (queued);
      } catch (e) {
        console.error(e);
      } finally {
        running = false;
      }
    }

    /** Schedules a repaint for the next animation frame. */
    function repaint() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (canvas.width !== S.doc.comp.width || canvas.height !== S.doc.comp.height) fit();
        paint();
      });
    }

    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { fit(); repaint(); }).observe(view);
    fit();
    return { repaint, fit, paint };
  }

  ns.preview = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
