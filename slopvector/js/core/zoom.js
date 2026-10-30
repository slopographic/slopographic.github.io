/* SlopVector — core/zoom: the artboard view. Zoom limits (1%–3200%), eased zoom, fit, 100%, pan.
 * A wheel step, a keyboard step, the status field, fit and 100% ease to their target over ZOOM_MS. A wheel step is
 * anchored at the pointer: the document point under it stays under it on every frame. Steps build on the target zoom,
 * so a burst of wheel events adds up. Live zoom (touch and trackpad pinch) is SV.setZoom: no easing, so it follows
 * the fingers. The page is SVG, so it is drawn at the device pixel ratio by the browser at every zoom. */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state, D = SV.dom;
  var ZOOM_MS = 120;
  var ZOOM_MIN = 0.01, ZOOM_MAX = 32;
  var STEPS = [0.01, 0.02, 0.03125, 0.0625, 0.125, 0.1667, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  // anim: { z0, zt, x0, y0, xt, yt, t0, px, py, ax, ay }. Anchored (px is set): document point (px, py) stays under
  // screen point (ax, ay). Free (fit, 100%, zoom rectangle): x and y ease to (xt, yt).
  var anim = null, raf = 0;
  SV.ZOOM_MIN = ZOOM_MIN; SV.ZOOM_MAX = ZOOM_MAX;

  function clampZoom(z) { return SV.clamp(z, ZOOM_MIN, ZOOM_MAX); }
  function stageRect() { return D.stage.getBoundingClientRect(); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; anim = null; }

  /** One animation frame at time now (performance.now() units; requestAnimationFrame passes its own). */
  function frame(now) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    var a = anim;
    if (!a) return;
    var t = Math.min(1, Math.max(0, ((now == null ? performance.now() : now) - a.t0) / ZOOM_MS));
    if (t >= 1) { S.view.zoom = a.zt; S.view.x = a.xt; S.view.y = a.yt; anim = null; }
    else {
      var e = ease(t), z = a.z0 + (a.zt - a.z0) * e;
      S.view.zoom = z;
      S.view.x = a.px != null ? a.ax - a.px * z : a.x0 + (a.xt - a.x0) * e;
      S.view.y = a.px != null ? a.ay - a.py * z : a.y0 + (a.yt - a.y0) * e;
      raf = requestAnimationFrame(frame);
    }
    SV.requestRender(true);
  }
  /** Starts an eased move from the view on screen now. A move that starts during another one continues from it. */
  function run(a) { anim = a; if (!raf) raf = requestAnimationFrame(frame); }
  /** Test and tooling hook: runs the frame for time now, so the ease can be read at a chosen moment. */
  SV.zoomTick = function (now) { frame(now); };
  function from(zt) { var v = S.view; return { z0: v.zoom, x0: v.x, y0: v.y, zt: zt, t0: performance.now(), px: null }; }
  function animateTo(zt, x, y) { var a = from(clampZoom(zt)); a.xt = x; a.yt = y; run(a); }
  function animateAt(z, cx, cy) {
    var a = from(clampZoom(z)), d = SV.toDoc(cx, cy);
    a.px = d.x; a.py = d.y; a.ax = cx; a.ay = cy;
    a.xt = cx - d.x * a.zt; a.yt = cy - d.y * a.zt;
    run(a);
  }
  function place(t, animate) {
    if (animate) { animateTo(t.zoom, t.x, t.y); return; }
    stop(); S.view.zoom = t.zoom; S.view.x = t.x; S.view.y = t.y; SV.requestRender(true);
  }

  /** The zoom the view is heading to (the current one when nothing is moving). Wheel and key steps build on it. */
  SV.targetZoom = function () { return anim ? anim.zt : S.view.zoom; };
  /** The view at rest: where an eased move ends. Saved by ui/view-state.js, so a move in flight is never saved half-way. */
  SV.targetView = function () {
    var a = anim;
    return a ? { zoom: a.zt, x: a.xt, y: a.yt } : { zoom: S.view.zoom, x: S.view.x, y: S.view.y };
  };
  /** Eased zoom to z, anchored at the stage point (cx, cy); the centre of the stage when omitted. */
  SV.zoomTo = function (z, cx, cy) {
    var r = stageRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    animateAt(z, cx, cy);
  };
  /** Eased zoom by a factor relative to the target zoom (a wheel step). */
  SV.zoomBy = function (f, cx, cy) { SV.zoomTo(SV.targetZoom() * f, cx, cy); };
  /** Immediate zoom, anchored at (cx, cy) or the centre. Pinch and trackpad pinch use this so they follow the fingers. */
  SV.setZoom = function (z, cx, cy) {
    stop();
    if (cx == null) { var r = stageRect(); cx = r.width / 2; cy = r.height / 2; }
    var d = SV.toDoc(cx, cy), zz = clampZoom(z);
    S.view.zoom = zz; S.view.x = cx - d.x * zz; S.view.y = cy - d.y * zz;
    SV.requestRender(true);
  };
  /** The next discrete step in or out (the + and - keys, the status buttons, the zoom tool's click). */
  SV.zoomStep = function (dir, cx, cy) {
    var z = SV.targetZoom(), nz = z, i;
    if (dir > 0) { for (i = 0; i < STEPS.length; i++) if (STEPS[i] > z * 1.001) { nz = STEPS[i]; break; } }
    else { for (i = STEPS.length - 1; i >= 0; i--) if (STEPS[i] < z / 1.001) { nz = STEPS[i]; break; } }
    if (nz !== z) SV.zoomTo(nz, cx, cy);
  };
  /** Zoom and offset that fit the artboard in the stage with a margin. */
  SV.fitTarget = function () {
    var r = stageRect(), pad = r.width < 500 ? 16 : 48, doc = S.doc;
    var z = clampZoom(Math.min((r.width - pad * 2) / doc.width, (r.height - pad * 2) / doc.height));
    return { zoom: z, x: (r.width - doc.width * z) / 2, y: (r.height - doc.height * z) / 2 };
  };
  SV.fitArtboard = function (animate) { place(SV.fitTarget(), animate); };
  SV.actualSize = function (animate) {
    var r = stageRect();
    place({ zoom: 1, x: (r.width - S.doc.width) / 2, y: (r.height - S.doc.height) / 2 }, animate);
  };
  SV.zoomToRect = function (b) {
    var r = stageRect();
    if (b.w < 1 || b.h < 1) return;
    var z = clampZoom(Math.min(r.width / b.w, r.height / b.h) * 0.92);
    animateTo(z, r.width / 2 - (b.x + b.w / 2) * z, r.height / 2 - (b.y + b.h / 2) * z);
  };
  /** Pan by screen pixels. A move in flight moves with it, so a pan during an animation is kept. */
  SV.panView = function (dx, dy) {
    S.view.x += dx; S.view.y += dy;
    var a = anim;
    if (a) {
      a.x0 += dx; a.y0 += dy; a.xt += dx; a.yt += dy;
      if (a.px != null) { a.ax += dx; a.ay += dy; }
    }
    SV.requestRender(true);
  };
})();
