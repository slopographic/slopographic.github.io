// Slop Effects keyframe interaction on the timeline: click to select a key (Shift adds or removes it), drag a key to
// move the selected keys (snapped to frames, one undo step on release), Enter selects. The drag runs on the window, so
// it survives the re-render that selecting causes. While dragging, the diamonds move in place (ctx.moveDiamonds).
// Classic script: window.SlopEffects.timelineKeys.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const SAME = (a, b) => a.layer === b.layer && a.prop === b.prop && Math.abs(a.t - b.t) < 1e-6;
  const DRAG_PX = 3;

  /**
   * Binds a diamond to its refs (the keys it stands for). ctx: { S, act, pps(), moveDiamonds(refs, dt) }.
   * refs are { layer, prop, t } objects; a summary diamond has several.
   */
  function bind(el, refs, ctx) {
    const S = ctx.S;
    const selected = () => refs.every((r) => S.sel.keys.some((k) => SAME(k, r)));

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      if (e.shiftKey) {
        const rest = S.sel.keys.filter((k) => !refs.some((r) => SAME(k, r)));
        S.select({ layer: refs[0].layer, keys: selected() ? rest : rest.concat(refs.map((r) => ({ ...r }))) });
        return;
      }
      if (!selected()) S.select({ layer: refs[0].layer, fx: null, keys: refs.map((r) => ({ ...r })) });
      startDrag(e);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.select({ layer: refs[0].layer, keys: refs.map((r) => ({ ...r })) }); }
    });

    /** Drags the selected keys. The base list is the selection when the drag began. */
    function startDrag(e) {
      const startX = e.clientX;
      const base = S.sel.keys.map((k) => ({ ...k }));
      const p = ctx.pps();
      const fps = S.doc.comp.fps;
      const dur = S.doc.comp.duration;
      let total = 0, moved = false;
      const move = (ev) => {
        const dx = ev.clientX - startX;
        if (!moved && Math.abs(dx) < DRAG_PX) return;
        moved = true;
        const raw = dx / p;
        const snapped = Math.round(raw * fps) / fps;
        // Keep every key inside the composition: the largest allowed move in either direction.
        const lo = Math.min(...base.map((k) => k.t)), hi = Math.max(...base.map((k) => k.t));
        const clampedDt = Math.min(Math.max(snapped, -lo), dur - hi);
        if (clampedDt === total) return;
        total = clampedDt;
        S.live((d) => ns.keys.moveKeys(d, base, total));
        ctx.moveDiamonds(base, total);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!moved) return;
        if (total === 0) { S.cancelLive(); return; }
        const landed = base.map((k) => ({ ...k, t: ns.core.snap(S.doc.comp, Math.min(dur, Math.max(0, k.t + total))) }));
        S.commitLive(ns.defs.t('effects.undo.move_keys'));
        S.select({ keys: landed });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
  }

  ns.timelineKeys = { bind, SAME };
})(typeof window !== 'undefined' ? window : globalThis);
