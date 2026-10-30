/* SlopCut: a clip's mask in the monitor. Three frames of reference: clip space (project px from the clip's centre,
   scale 1), frame space (project px from the frame centre, what the compositor transforms) and overlay pixels.
   Draws the outline of the selected clip's mask, the handles in edit mode and the shape being drawn with a tool.
   Hit testing for handles is here too; the pointer logic is in mask-input.js. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, MK = SE.mask, A = SE.app;
  const V = (SE.maskView = {});
  const HIT = 10; // overlay px

  /** Transform of the clip at the playhead (keyframes included). */
  V.xf = (c) => SE.anim.combine(c, U.clamp(SE.player.time - c.start, 0, c.dur));
  /** Clip space → frame space (project px from the frame centre). */
  V.toFrame = function (c, l) {
    const xf = V.xf(c), r = (xf.rot * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
    return { x: xf.x + (l.x * cs - l.y * sn) * xf.scale, y: xf.y + (l.x * sn + l.y * cs) * xf.scale };
  };
  /** Frame space → clip space. */
  V.toLocal = function (c, q) {
    const xf = V.xf(c), r = (-xf.rot * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), s = xf.scale || 1;
    const dx = q.x - xf.x, dy = q.y - xf.y;
    return { x: (dx * cs - dy * sn) / s, y: (dx * sn + dy * cs) / s };
  };
  /** Pointer event → overlay pixels. */
  V.ovPt = function (e) {
    const ov = A.els.overlay, r = ov.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (ov.width / r.width), y: (e.clientY - r.top) * (ov.height / r.height) };
  };
  /** Pointer event → frame space (project px from the frame centre). */
  V.framePt = function (e) {
    const p = SE.doc, o = V.ovPt(e), k = A.els.overlay.width / p.w;
    return { x: o.x / k - p.w / 2, y: o.y / k - p.h / 2 };
  };
  /** Frame space → overlay pixels. */
  V.overlayOf = function (q) {
    const p = SE.doc, k = A.els.overlay.width / p.w;
    return { x: (q.x + p.w / 2) * k, y: (q.y + p.h / 2) * k };
  };
  /** Clip-space point → overlay pixels. */
  V.lOv = (c, l) => V.overlayOf(V.toFrame(c, l));

  /** Handles of a mask in clip space: corners and the radius for shapes, anchors and handles for paths. */
  V.handles = function (m) {
    const out = [];
    if (m.shape === 'path') {
      m.pts.forEach((p, i) => {
        out.push({ kind: 'anchor', i, l: { x: p.x, y: p.y } });
        if (p.ix || p.iy) out.push({ kind: 'hi', i, l: { x: p.x + p.ix, y: p.y + p.iy } });
        if (p.ox || p.oy) out.push({ kind: 'ho', i, l: { x: p.x + p.ox, y: p.y + p.oy } });
      });
      return out;
    }
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push({ kind: 'corner', sx, sy, l: { x: m.x + (sx * m.w) / 2, y: m.y + (sy * m.h) / 2 } });
    if (m.shape === 'rrect') out.push({ kind: 'radius', l: { x: m.x - m.w / 2 + Math.min(m.r, m.w / 2, m.h / 2), y: m.y - m.h / 2 } });
    return out;
  };
  /** The handle under an overlay point (or null). */
  V.hitHandle = function (c, o, r) { // r: a bigger radius (overlay px) for a finger or a pen (mask-input.js)
    for (const h of V.handles(c.mask)) {
      const f = V.lOv(c, h.l);
      if (Math.hypot(f.x - o.x, f.y - o.y) <= Math.max(HIT, r || 0)) return h;
    }
    return null;
  };
  /** Pending shape of a draw tool as a temporary mask (for drawing only). */
  function pendingMask(P) {
    if (P.kind === 'box') return MK.make(P.shape, null, { x: (P.a.x + P.b.x) / 2, y: (P.a.y + P.b.y) / 2, w: Math.abs(P.b.x - P.a.x), h: Math.abs(P.b.y - P.a.y) });
    if (P.kind === 'free') return MK.path(P.pts);
    if (P.kind === 'pen') return MK.make('path', null, { pts: P.pts.slice() });
    return null;
  }
  function strokePolys(og, c, m) {
    og.beginPath();
    for (const poly of MK.flatten(m, 16)) {
      poly.forEach(([x, y], i) => { const o = V.lOv(c, { x, y }); if (i) og.lineTo(o.x, o.y); else og.moveTo(o.x, o.y); });
      og.closePath();
    }
    og.stroke();
  }
  /** Draw the mask outline (and handles in edit mode) plus any shape being drawn. */
  V.draw = function (og) {
    const c = A.primary(), I = SE.maskInput, t = SE.player.time;
    if (!c || !SE.doc.clips.includes(c) || c.kind === 'audio' || c.kind === 'effect' || t < c.start || t >= M.end(c) || SE.player.playing) return;
    const P = I && I.pending && I.pending.id === c.id ? I.pending : null;
    og.save();
    if (c.mask) {
      og.strokeStyle = '#ffb347'; og.lineWidth = 1.5;
      if (c.mask.invert) og.setLineDash([6, 4]);
      strokePolys(og, c, c.mask);
      og.setLineDash([]);
      if (I && I.edit === c.id) {
        og.fillStyle = '#ffb347';
        for (const h of V.handles(c.mask)) {
          const o = V.lOv(c, h.l);
          if (h.kind === 'radius') { og.beginPath(); og.arc(o.x, o.y, 4, 0, Math.PI * 2); og.fill(); }
          else if (h.kind === 'hi' || h.kind === 'ho') { og.beginPath(); og.arc(o.x, o.y, 3, 0, Math.PI * 2); og.fill(); }
          else og.fillRect(o.x - 4, o.y - 4, 8, 8);
        }
      }
    }
    if (P) {
      og.strokeStyle = '#d4ff3a'; og.lineWidth = 1.5; og.setLineDash([4, 3]);
      const m = pendingMask(P);
      if (m) strokePolys(og, c, m);
      og.setLineDash([]);
      if (P.kind === 'pen') { og.fillStyle = '#d4ff3a'; for (const q of P.pts) { const o = V.lOv(c, q); og.fillRect(o.x - 3, o.y - 3, 6, 6); } }
    }
    og.restore();
  };
})();
