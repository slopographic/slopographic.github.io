/* SlopCut: direct manipulation in the program monitor. Click a layer to select it, drag to move
   (snaps to centre), drag a corner to scale, drag the round handle to rotate (Shift: 15° steps). */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, PV = SE.preview, CMP = SE.compositor;

  function inside(pts, x, y) {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  /** Top-most visible clip under an overlay point (overlay pixels). */
  function pick(x, y) {
    const p = SE.doc, k = PV.box ? PV.box.k : SE.app.els.overlay.width / p.w;
    const layers = CMP.layers(p, SE.player.time).reverse();
    for (const L of layers) {
      if (L.effect) continue;
      const pts = CMP.bounds(p, L.clip, SE.player.time).map(([a, b]) => [a * k, b * k]);
      if (inside(pts, x, y)) return L.clip;
    }
    return null;
  }
  /** The clip under a pointer event on the monitor (or null). */
  PV.clipAt = function (e) {
    const ov = SE.app.els.overlay, r = ov.getBoundingClientRect();
    return pick((e.clientX - r.left) * (ov.width / r.width), (e.clientY - r.top) * (ov.height / r.height));
  };
  PV.initInput = function (ov) {
    const stage = SE.app.els.monStage;
    let drag = null;
    // The monitor is a touch surface (shared/input): dragging a clip's box or a mask handle is never a page scroll.
    stage.setAttribute('data-touch-surface', '');
    /** A handle's hit radius in overlay px: base for a mouse, 22 CSS px for a finger, 12 for a pen. */
    const rad = (e, base) => {
      const w = ov.getBoundingClientRect().width || 1, k = ov.width / w;
      const css = window.SlopTouch && SlopTouch.hit ? SlopTouch.hit(e, 0) : e.pointerType === 'touch' ? 22 : e.pointerType === 'pen' ? 12 : 0;
      return Math.max(base, css * k);
    };
    const local = (e) => { const r = ov.getBoundingClientRect(); return { x: (e.clientX - r.left) * (ov.width / r.width), y: (e.clientY - r.top) * (ov.height / r.height) }; };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || SE.player.playing) return;
      const pt = local(e), b = PV.box;
      let mode = null, c = null;
      if (b) {
        c = M.clip(SE.doc, b.clip);
        const rr = rad(e, 12), rs = rad(e, 10);
        if (Math.hypot(pt.x - b.rot[0], pt.y - b.rot[1]) < rr) mode = 'rot';
        else if (b.pts.some(([x, y]) => Math.abs(pt.x - x) < rs && Math.abs(pt.y - y) < rs)) mode = 'scale';
        else if (inside(b.pts, pt.x, pt.y)) mode = 'move';
      }
      if (!mode) {
        const hit = pick(pt.x, pt.y);
        if (!hit) { if (b) SE.app.select([]); return; }
        SE.app.select([hit.id]); c = hit; mode = 'move';
      }
      if (!c || M.track(SE.doc, c.track).lock) return;
      e.preventDefault(); stage.setPointerCapture(e.pointerId);
      const k = PV.box ? PV.box.k : ov.width / SE.doc.w;
      const cx = (SE.doc.w / 2 + c.x) * k, cy = (SE.doc.h / 2 + c.y) * k;
      drag = { mode, id: c.id, pt, k, x0: c.x, y0: c.y, s0: c.scale, r0: c.rot, cx, cy, d0: Math.hypot(pt.x - cx, pt.y - cy) || 1, a0: Math.atan2(pt.y - cy, pt.x - cx), begun: false };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) { const b = PV.box, pt = local(e); stage.style.cursor = b && (Math.hypot(pt.x - b.rot[0], pt.y - b.rot[1]) < 12 ? 'grab' : b.pts.some(([x, y]) => Math.abs(pt.x - x) < 10 && Math.abs(pt.y - y) < 10) ? 'nwse-resize' : inside(b.pts, pt.x, pt.y) ? 'move' : '') || ''; return; }
      const pt = local(e), d = drag;
      if (!d.begun) { if (Math.hypot(pt.x - d.pt.x, pt.y - d.pt.y) < 3) return; SE.history.begin(d.mode === 'move' ? U.t('slopedit.render.move') : d.mode === 'scale' ? U.t('slopedit.insp.scale') : U.t('slopedit.render.rotate')); d.begun = true; }
      const c = M.clip(SE.doc, d.id); if (!c) return;
      if (d.mode === 'move') {
        let x = d.x0 + (pt.x - d.pt.x) / d.k, y = d.y0 + (pt.y - d.pt.y) / d.k;
        const tol = 10 / d.k;
        if (Math.abs(x) < tol) x = 0; if (Math.abs(y) < tol) y = 0;
        if (e.shiftKey) { if (Math.abs(x - d.x0) > Math.abs(y - d.y0)) y = d.y0; else x = d.x0; }
        c.x = Math.round(x); c.y = Math.round(y);
      } else if (d.mode === 'scale') {
        c.scale = U.round(SE.fit.clampScale(d.s0 * Math.hypot(pt.x - d.cx, pt.y - d.cy) / d.d0), 3);
      } else {
        let r = d.r0 + ((Math.atan2(pt.y - d.cy, pt.x - d.cx) - d.a0) * 180) / Math.PI;
        r = ((r + 540) % 360) - 180;
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        c.rot = U.round(r, 1);
      }
      SE.emit('change', { label: U.t('slopedit.insp.transform'), live: true });
    });
    const end = () => { if (drag && drag.begun) SE.emit('autosave'); drag = null; };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('dblclick', () => { const c = SE.app.primary(); if (c && c.kind === 'title' && SE.inspector) SE.inspector.focusText(); });
  };
})();
