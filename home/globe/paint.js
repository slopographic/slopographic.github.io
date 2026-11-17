/* The app globe's canvas: a faint atmospheric halo in the accent, the globe's body, its rim, and a wireframe of
 * latitude and longitude lines that turns with the icons (the near half drawn finer and clearer than the far half).
 * Classic script, after home/globe/sphere.js: sets window.SlopGlobePaint.paint(ctx, frame).
 *   frame: { W, H, geom: { cx, cy, r, d }, yaw, pitch, ink, accent, lines: SlopGlobeMath.grid(...) }
 * The colours are the theme's own (--bone for ink, --slop for the accent, read by home/globe/globe.js). */
(function () {
  'use strict';
  const G = window.SlopGlobeMath;
  if (!G) return;
  const clear = 'rgba(0, 0, 0, 0)';

  function halo(ctx, g, accent, ink) {
    const { cx, cy, r } = g;
    // the atmosphere: a soft ring of the accent just outside the rim
    const out = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.32);
    out.addColorStop(0, accent); out.addColorStop(1, clear);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = out;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.32, 0, G.TAU); ctx.fill();
    // the body: lit from the upper left, a touch of the accent at its heart
    const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    body.addColorStop(0, accent); body.addColorStop(0.55, clear); body.addColorStop(1, ink);
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, G.TAU); ctx.fill();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, G.TAU); ctx.stroke();
  }

  /** The wireframe: each segment goes into the near or the far path by its depth, and each path is stroked once. */
  function wire(ctx, f) {
    const near = new Path2D(), far = new Path2D();
    for (const line of f.lines) {
      let prev = null, pz = 0;
      for (const p of line) {
        const q = G.rotate(p, f.yaw, f.pitch), s = G.project(q, f.geom);
        if (prev) { const path = q.z + pz > 0 ? near : far; path.moveTo(prev.x, prev.y); path.lineTo(s.x, s.y); }
        prev = s; pz = q.z;
      }
    }
    ctx.strokeStyle = f.ink;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.06; ctx.setLineDash([2, 5]); ctx.stroke(far);
    ctx.globalAlpha = 0.17; ctx.setLineDash([]); ctx.stroke(near);
    ctx.setLineDash([]);
  }

  function paint(ctx, f) {
    if (!ctx) return;
    ctx.clearRect(0, 0, f.W, f.H);
    halo(ctx, f.geom, f.accent, f.ink);
    wire(ctx, f);
    ctx.globalAlpha = 1;
  }
  window.SlopGlobePaint = { paint };
})();
