/* Slop Slides: the editing canvas. The current slide is painted with the same display list the PDF and the presenter
   use (SS.scene + SS.canvasRender), scaled to fit the stage, with the selection drawn on top (overlay.js). Repaints
   are coalesced to one per animation frame. Exposes window.SS.stage. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, S = SS.scene, R = SS.canvasRender;
  var St = SS.stage = { k: 1, ox: 0, oy: 0, dpr: 1, cv: null, wrap: null };
  var queued = false, BG = '#16161a';

  St.mount = function (wrap, cv) {
    St.wrap = wrap; St.cv = cv;
    if (window.ResizeObserver) new ResizeObserver(function () { St.fit(); St.redraw(); }).observe(wrap);
    ['change', 'deck', 'select', 'slide', 'render', 'load', 'mode'].forEach(function (ev) { A.on(ev, St.redraw); });
    St.fit();
  };
  /** Sizes the canvas to the stage and works out the scale (css px per slide point) and the centring offset. */
  St.fit = function () {
    if (!St.wrap || !A.deck) return;
    var W = Math.max(1, St.wrap.clientWidth), H = Math.max(1, St.wrap.clientHeight), d = A.deck, pad = W < 500 ? 10 : 28;
    var sig = [W, H, d.size.w, d.size.h, window.devicePixelRatio || 1].join(',');
    if (sig === St.sig) return;
    St.sig = sig;
    var k = Math.min((W - 2 * pad) / d.size.w, (H - 2 * pad) / d.size.h);
    St.k = k > 0 ? k : 0.1;
    St.ox = (W - d.size.w * St.k) / 2;
    St.oy = (H - d.size.h * St.k) / 2;
    St.dpr = window.devicePixelRatio || 1;
    St.cv.style.width = W + 'px';
    St.cv.style.height = H + 'px';
    St.cv.width = Math.round(W * St.dpr);
    St.cv.height = Math.round(H * St.dpr);
  };
  St.redraw = function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; St.paint(); });
  };
  function hideMap() {
    var id = SS.textEdit && SS.textEdit.editing;
    if (!id) return null;
    var h = {}; h[id] = true; return h;
  }
  /** Paints now (use St.redraw for the coalesced version). Waits for the fonts: text layout needs them. */
  St.paint = function () {
    var cv = St.cv, d = A.deck;
    if (!cv || !d || !SS.fonts.isReady()) return;
    St.fit();
    var ctx = cv.getContext('2d'), s = A.slide(), k = St.k * St.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!s) return;
    ctx.setTransform(k, 0, 0, k, St.ox * St.dpr, St.oy * St.dpr);
    var scene = S.slide(d, s, { editor: A.mode === 'edit', index: A.idx, hide: hideMap() });
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, d.size.w, d.size.h); ctx.clip();
    R.draw(ctx, scene, { deck: d, onImage: St.redraw });
    ctx.restore();
    ctx.lineWidth = 1 / St.k;
    ctx.strokeStyle = 'rgba(160,160,170,.45)';
    ctx.strokeRect(0, 0, d.size.w, d.size.h);
    if (A.mode === 'edit' && SS.overlay) SS.overlay.draw(ctx);
  };
  /** Client (viewport) pixels to slide points, and back. */
  St.toSlide = function (cx, cy) {
    var r = St.cv.getBoundingClientRect();
    return { x: (cx - r.left - St.ox) / St.k, y: (cy - r.top - St.oy) / St.k };
  };
  St.toClient = function (x, y) {
    var r = St.cv.getBoundingClientRect();
    return { x: r.left + St.ox + x * St.k, y: r.top + St.oy + y * St.k };
  };
})();
