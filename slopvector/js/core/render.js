/* SlopVector — core: view, zoom and incremental document rendering */
(function () {
  'use strict';
  var G = window.SVGeom;
  var SV = window.SV = window.SV || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round;
  var fmt = G.fmt;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var $ = SV._core = SV._core || {};
  function clamp() { return $.clamp.apply(this, arguments); }
  function objToSVG() { return $.objToSVG.apply(this, arguments); }
  function renderOverlay() { return $.renderOverlay.apply(this, arguments); }
  var S = $.S;

  /* ================= DOM refs & view ================= */
  var D = SV.dom = {};
  function V() { return [S.view.zoom, 0, 0, S.view.zoom, S.view.x, S.view.y]; }
  SV.viewM = V;
  function toScreen(p) { return { x: p.x * S.view.zoom + S.view.x, y: p.y * S.view.zoom + S.view.y }; }
  function toDoc(sx, sy) { return { x: (sx - S.view.x) / S.view.zoom, y: (sy - S.view.y) / S.view.zoom }; }
  SV.toScreen = toScreen; SV.toDoc = toDoc;
  function stageRect() { return D.stage.getBoundingClientRect(); }
  function evDoc(e) { var r = stageRect(); return toDoc(e.clientX - r.left, e.clientY - r.top); }
  SV.evDoc = evDoc;

  /* ================= rendering ================= */
  var objEls = new Map(), layerEls = new Map(), rafPending = false, uiPending = false;
  SV.requestRender = function (ui) {
    if (ui) uiPending = true;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      renderDoc(); renderOverlay(); if (SV.drawRulers) SV.drawRulers();
      if (S.editing && SV.positionEditor) SV.positionEditor();
      if (uiPending) { uiPending = false; SV.ui && SV.ui.update(); }
    });
  };
  SV.renderNow = function () { renderDoc(); renderOverlay(); if (SV.drawRulers) SV.drawRulers(); if (SV.ui) SV.ui.update(); };
  var tmpSvg = null;
  function elFromString(str) {
    if (!tmpSvg) tmpSvg = document.createElementNS(SVGNS, 'svg');
    tmpSvg.innerHTML = str;
    var el = tmpSvg.firstElementChild;
    if (str.indexOf('sv-asset:') >= 0) {
      Array.prototype.forEach.call(el.querySelectorAll('image'), function (im) {
        var hr = im.getAttribute('href') || '';
        if (hr.indexOf('sv-asset:') === 0) im.setAttribute('href', (S.doc.assets && S.doc.assets[hr.slice(9)]) || '');
      });
    }
    return el;
  }
  function liveCtx(o) {
    return { defs: [], live: true, outline: S.prefs.outline, hideId: S.editing ? S.editing.id : null, gradId: function (ob, w) { return 'sv-' + ob.id + '-' + w; } };
  }
  function renderDoc() {
    var doc = S.doc, z = S.view.zoom;
    var tr = 'matrix(' + z + ' 0 0 ' + z + ' ' + S.view.x + ' ' + S.view.y + ')';
    D.vpBack.setAttribute('transform', tr);
    D.vpArt.setAttribute('transform', tr);
    D.artboard.setAttribute('width', doc.width); D.artboard.setAttribute('height', doc.height);
    D.artShadow.setAttribute('width', doc.width); D.artShadow.setAttribute('height', doc.height);
    D.artShadow.setAttribute('x', 3 / z); D.artShadow.setAttribute('y', 4 / z);
    D.docsvg.classList.toggle('outline', !!S.prefs.outline);
    renderGrid();
    var seenL = new Set(), prevL = null;
    doc.layers.forEach(function (L) {
      seenL.add(L.id);
      var g = layerEls.get(L.id);
      if (!g) { g = document.createElementNS(SVGNS, 'g'); g.setAttribute('data-layer', L.id); layerEls.set(L.id, g); }
      if (g.parentNode !== D.vpArt || g.previousSibling !== prevL) D.vpArt.insertBefore(g, prevL ? prevL.nextSibling : D.vpArt.firstChild);
      prevL = g;
      g.style.display = L.hidden ? 'none' : '';
      var prev = null;
      L.children.forEach(function (o) {
        var ctx = liveCtx(o), body = objToSVG(o, ctx);
        var sig = body + ctx.defs.join('');
        var c = objEls.get(o.id), el;
        if (c && c.sig === sig) el = c.el;
        else {
          el = elFromString('<g data-id="' + o.id + '">' + (ctx.defs.length ? '<defs>' + ctx.defs.join('') + '</defs>' : '') + body + '</g>');
          if (c && c.el.parentNode) c.el.parentNode.replaceChild(el, c.el);
          objEls.set(o.id, { sig: sig, el: el, seen: true });
        }
        objEls.get(o.id).seen = true;
        if (el.parentNode !== g || el.previousSibling !== prev) g.insertBefore(el, prev ? prev.nextSibling : g.firstChild);
        prev = el;
      });
      while (prev ? prev.nextSibling : g.firstChild) { var extra = prev ? prev.nextSibling : g.firstChild; g.removeChild(extra); }
    });
    layerEls.forEach(function (g, id) { if (!seenL.has(id)) { if (g.parentNode) g.parentNode.removeChild(g); layerEls.delete(id); } });
    objEls.forEach(function (c, id) { if (!c.seen) { if (c.el.parentNode) c.el.parentNode.removeChild(c.el); objEls.delete(id); } c.seen = false; });
  }
  SV.renderDoc = renderDoc;
  SV.resetRenderCache = function () { objEls.forEach(function (c) { if (c.el.parentNode) c.el.parentNode.removeChild(c.el); }); objEls.clear(); };

  function renderGrid() {
    if (!S.prefs.grid) { D.grid.innerHTML = ''; return; }
    var r = stageRect(), z = S.view.zoom, gs = S.prefs.gridSize, major = gs * 10;
    var step = gs * z < 6 ? major : gs;
    if (step * z < 6) { D.grid.innerHTML = ''; return; }
    var d0 = toDoc(0, 0), d1 = toDoc(r.width, r.height), minor = '', maj = '';
    var x = Math.floor(d0.x / step) * step, y;
    for (; x <= d1.x; x += step) { var sx = round(x * z + S.view.x) + 0.5; var isM = abs(x / major - round(x / major)) < 1e-6; (isM ? (maj += 'M' + sx + ' 0V' + r.height) : (minor += 'M' + sx + ' 0V' + r.height)); }
    for (y = Math.floor(d0.y / step) * step; y <= d1.y; y += step) { var sy = round(y * z + S.view.y) + 0.5; var isMy = abs(y / major - round(y / major)) < 1e-6; (isMy ? (maj += 'M0 ' + sy + 'H' + r.width) : (minor += 'M0 ' + sy + 'H' + r.width)); }
    D.grid.innerHTML = '<path d="' + minor + '" class="grid-minor"/><path d="' + maj + '" class="grid-major"/>';
  }

  $.D = D; $.V = V; $.stageRect = stageRect; $.toScreen = toScreen;
})();
