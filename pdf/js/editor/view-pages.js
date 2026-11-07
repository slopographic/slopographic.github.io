/* Slop PDF — page slots: one element per page (a canvas raster and an annotation SVG, shown in the page stack). Only the
   pages near the viewport are rasterised (an IntersectionObserver with a one-viewport margin); a page that leaves that
   band gives its raster back. Rasters render one at a time, the active page first. The active page is the one the tools
   work on; its element also holds the annotation overlay and the text box (placeTools). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, V = SP.view, Ed = SP.editor, S = Ed._;
  S.slots = new Map(); // page id → slot { pid, el, layer, canvas, svg, key, near, queued }
  S.visible = []; // the slots in the page stack, in order
  var rasterT = 0, queue = [], busy = false;

  /** A slot for a page, created on first use. Its element is only in the stack while the layout shows it. */
  S.slotFor = function (pid) {
    var s = S.slots.get(pid); if (s) return s;
    var el = U.h('div', { class: 'pv-page' }), layer = U.h('div', { class: 'sheet-layer' });
    var canvas = U.h('canvas', { class: 'pv-canvas' }), svg = U.s('svg', { class: 'sheet-svg pv-svg', preserveAspectRatio: 'none' });
    layer.append(canvas, svg); el.appendChild(layer);
    s = { pid: pid, el: el, layer: layer, canvas: canvas, svg: svg, key: null, near: false, queued: false };
    el._slot = s;
    // a press on any page makes it the active page first, so the tool works on the page under the pointer
    el.addEventListener('pointerdown', function (e) { if (Ed.pid !== pid) S.activate(pid); S.pressing = true; S.onDown(e); });
    el.addEventListener('dblclick', function (e) { if (Ed.pid !== pid) S.activate(pid); S.onDbl(e); });
    el.addEventListener('click', function (e) { if (S.onClick) S.onClick(e); }); // a click on a line selects it (sel-lift.js)
    S.slots.set(pid, s);
    return s;
  };
  /** Gives a page's raster back (it keeps its element and size). The active page is never released. */
  S.release = function (s) {
    if (s.pid === Ed.pid) return;
    s.canvas.width = 0; s.canvas.height = 0; s.key = null; s.el.classList.remove('loaded');
    S.dropTextLayer(s);
  };
  /** Sets a slot's size and layer transform for the current zoom and rotation. */
  S.sizePage = function (s) {
    var p = E.pageById(s.pid); if (!p) return;
    var z = Ed.zoom, g = E.geom(p), R = E.rotation(p), vs = E.viewSize(p);
    s.el.style.width = (vs.w * z) + 'px'; s.el.style.height = (vs.h * z) + 'px';
    s.layer.style.width = (g.W * z) + 'px'; s.layer.style.height = (g.H * z) + 'px';
    s.layer.style.transform = V.layerTransform(R, g.W, g.H, z);
    // The text layer's spans are placed with these variables (pdf.js), so they follow the zoom at once, before it is rebuilt.
    var tl = s.layer.querySelector('.pv-textlayer');
    if (tl) { tl.style.setProperty('--scale-factor', String(z)); tl.style.setProperty('--total-scale-factor', String(z)); }
    s.el.dataset.tool = Ed.tool;
    s.el.classList.toggle('is-redacted', !!p.redacted);
  };
  S.sizeRows = function () { S.visible.forEach(S.sizePage); };
  /** Moves the overlay and the text box to the active page's element. */
  S.placeTools = function () {
    var s = Ed.pid ? S.slots.get(Ed.pid) : null; if (!s) return;
    S.pageEl = s.el;
    // moving a focused text box would blur it, so the nodes only move when the active page changed
    if (S.overlay.parentNode !== s.el) s.el.append(S.overlay, S.ta);
  };
  /** Paints one page's annotations (the active page gets the editing state too). */
  S.paintSlot = function (s) {
    var p = E.pageById(s.pid); if (!p) return;
    s.el.classList.toggle('is-current', s.pid === Ed.pid); // the current-page border on the canvas
    var active = s.pid === Ed.pid;
    if (window.SlopPdfFind) window.SlopPdfFind.paintSlot(s); // find highlights (find/paint.js)
    V.paintAnnots(s.svg, p, E.indexOf(p.id), E.state.pages.length, active ? { hide: S.editing ? S.editing.id : null, draft: S.draft } : {});
  };
  /** Repaints the annotations of the active page and of the rasterised pages near the view. */
  S.paintLive = function () {
    S.visible.forEach(function (s) {
      if (s.pid === Ed.pid) S.paintSlot(s);
      else if (s.near && s.key !== null) S.paintSlot(s);
    });
  };

  /* ----------------------------------------------------------- rasters */
  /** The raster key: the page's content and form state, and the zoom. A slot whose key matches needs no render. */
  S.keyOf = function (s) {
    var p = E.pageById(s.pid); if (!p) return '';
    return (p.blank ? 'blank' : p.f + ':' + p.i + ':' + E.formKey(p.f)) + '@' + Math.round(Ed.zoom * 100);
  };
  S.wantRaster = function (s) { return (s.near || s.pid === Ed.pid) && s.key !== S.keyOf(s); };
  /** Queues the renders for every near page whose raster is out of date (the active page first). Debounced while zooming. */
  S.scheduleRaster = function (delay) { clearTimeout(rasterT); rasterT = setTimeout(S.enqueue, delay); };
  S.enqueue = function () {
    queue.forEach(function (s) { s.queued = false; }); queue = [];
    var act = Ed.pid;
    S.visible.filter(function (s) { return s.pid === act; }).concat(S.visible.filter(function (s) { return s.pid !== act; })).forEach(function (s) {
      if (S.wantRaster(s) && !s.queued) { s.queued = true; queue.push(s); }
    });
    S.pump();
  };
  S.pump = function () {
    if (busy) return;
    var s = queue.shift(); if (!s) return;
    s.queued = false; busy = true;
    S.renderSlot(s).catch(function (e) { console.warn('Slop PDF: page render failed', e); }).then(function () { busy = false; S.pump(); });
  };
  S.renderSlot = async function (s) {
    if (!S.wantRaster(s)) return;
    var p = E.pageById(s.pid); if (!p) return;
    var key = S.keyOf(s), g = E.geom(p), dpr = Math.min(3, window.devicePixelRatio || 1);
    var scale = Ed.zoom * dpr, maxPx = 16e6;
    if (g.W * g.H * scale * scale > maxPx) scale = Math.sqrt(maxPx / (g.W * g.H));
    var off = document.createElement('canvas');
    try {
      if (p.blank) {
        off.width = Math.max(1, Math.round(g.W * scale)); off.height = Math.max(1, Math.round(g.H * scale));
        var cx = off.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, off.width, off.height);
      } else {
        await E.renderToCanvas(E.files.get(p.f), p.i, scale, off);
      }
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    }
    // the page left the view, or the zoom changed while it rendered: the next queue run draws it again
    if (S.keyOf(s) !== key || !(s.near || s.pid === Ed.pid)) return;
    s.canvas.width = off.width; s.canvas.height = off.height;
    s.canvas.getContext('2d').drawImage(off, 0, 0);
    off.width = off.height = 0;
    s.key = key;
    s.el.classList.add('loaded');
    S.paintSlot(s);
    S.buildTextLayer(s).catch(function (e) { console.warn('Slop PDF: text layer failed', e); });
  };
  S.rasterObserver = null;
  S.observe = function (s) { if (S.rasterObserver) S.rasterObserver.observe(s.el); };
  S.unobserve = function (s) { if (S.rasterObserver) S.rasterObserver.unobserve(s.el); };
  S.initRasterObserver = function () {
    S.rasterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var s = en.target._slot; if (!s) return;
        s.near = en.isIntersecting;
        if (s.near) S.scheduleRaster(0); else S.release(s);
      });
    }, { root: S.viewer, rootMargin: '100% 0px' });
  };
})();
