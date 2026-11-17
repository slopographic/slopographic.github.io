/* Slop PDF — page view zoom and navigation. Ed.zoom is in layout units: the status bar shows Ed.zoom × 72/96 (1 is 75%),
   so the 25% to 800% limits are ZMIN..ZMAX here. Ctrl/⌘ + wheel (a trackpad pinch arrives as Ctrl + wheel) zooms about the
   pointer, the plain wheel scrolls, and buttons, keys and Fit ease for ZOOM_MS keeping the point under the pointer (or the
   centre) in place. The document point is taken from whichever page is under the anchor, so zoom works in every layout. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._;
  var Z = SP.zoom = window.SlopPdfZoom, ZOOM_MS = 120, ZMIN = Z.fromPercent(25), ZMAX = Z.fromPercent(800), ease = null, easeRaf = 0;
  Ed.ZOOM_MIN = ZMIN; Ed.ZOOM_MAX = ZMAX;
  Ed.percent = Z.percent;
  S.stopEase = function () { if (easeRaf) cancelAnimationFrame(easeRaf); easeRaf = 0; ease = null; };
  /** The workspace centre the zoom buttons, menus and typed values zoom about: the centre of the visible area (no scrollbar gutter). */
  function centre() { var v = S.viewer; return Z.viewerCentre(v.getBoundingClientRect(), { left: v.clientLeft, top: v.clientTop, width: v.clientWidth, height: v.clientHeight }); }
  /** Zoom now to z, keeping the document point under anchor (client coordinates) in place. A null anchor is the
      workspace centre, measured again after the layout: a scrollbar that comes or goes with the new size moves it. */
  function setRaw(z, anchor) {
    var a = anchor || centre(), hit = S.slotAt(a.x, a.y);
    if (!hit) { Ed.zoomMode = 'num'; Ed.zoom = U.clamp(z, ZMIN, ZMAX); Ed.layout(); return; }
    var r = hit.el.getBoundingClientRect(), doc = Z.docPoint(a, { x: r.left, y: r.top }, Ed.zoom);
    Ed.zoomMode = 'num'; Ed.zoom = Z.clamp(z, ZMIN, ZMAX); Ed.layout(); // the layout centres the rows again
    var t = anchor || centre(), r2 = hit.el.getBoundingClientRect();
    S.viewer.scrollLeft += (r2.left + doc.x * Ed.zoom) - t.x;
    S.viewer.scrollTop += (r2.top + doc.y * Ed.zoom) - t.y;
    // A stack smaller than the viewer cannot scroll, so what is left of the move is an offset on the pad itself.
    var r3 = hit.el.getBoundingClientRect(), o = Z.originFor(t, doc, Ed.zoom);
    S.pad.style.left = (o.x - r3.left) + 'px';
    S.pad.style.top = (o.y - r3.top) + 'px';
  }
  function frame(now) {
    easeRaf = 0;
    var a = ease; if (!a) return;
    var t = U.clamp(((now == null ? performance.now() : now) - a.t0) / ZOOM_MS, 0, 1), k = 1 - Math.pow(1 - t, 3);
    if (t >= 1) { S.stopEase(); setRaw(a.zt, a.anchor); if (a.mode) { Ed.zoomMode = a.mode; Ed.layout(); } return; }
    setRaw(a.z0 + (a.zt - a.z0) * k, a.anchor);
    easeRaf = requestAnimationFrame(frame);
  }
  /** Eased zoom to zt from the zoom on screen now (a move in flight is continued). anchor is a client point, or null for
      the workspace centre; mode is kept after it lands. */
  function easeTo(zt, anchor, mode) {
    if (!Ed.page() || S.restoring) return;
    S.stopEase();
    ease = { z0: Ed.zoom, zt: U.clamp(zt, ZMIN, ZMAX), t0: performance.now(), anchor: anchor || null, mode: mode || null };
    easeRaf = requestAnimationFrame(frame);
  }
  /** The zoom the view is heading to (the current one when nothing moves). Wheel and key steps build on it. */
  Ed.targetZoom = function () { return ease ? ease.zt : Ed.zoom; };
  /** True while an eased zoom is running (tests wait for it to land). */
  Ed.easing = function () { return !!ease; };
  /** Immediate zoom (the zoom menu's entries, pinch). anchor is client coordinates; the centre when omitted. */
  Ed.setZoom = function (z, anchor) { S.stopEase(); setRaw(z, anchor || null); };
  /** Eased zoom by a factor of the target zoom, about anchor (client coordinates) or the centre. */
  Ed.zoomBy = function (k, anchor) { easeTo(Ed.targetZoom() * k, anchor || null, null); };
  /** Fit: 'fit' (the whole page) or 'width' (Ctrl/⌘ 0). It keeps following the window size after it lands. */
  Ed.fit = function (mode) {
    mode = mode || 'fit';
    if (!Ed.page()) { Ed.zoomMode = mode; return; }
    Ed.fitPid = Ed.pid;
    easeTo(S.fitZoom(mode), null, mode);
  };
  /** 100%: 1 pt per CSS pixel is 96/72 layout units (Ed.zoom 4/3). */
  Ed.actual = function () { easeTo(96 / 72, null, null); };

  /* Navigation: the wheel, Space or middle drag, keys and touch are shared/nav's engine on this viewer, with these
     fixed bindings (not the Navigation preset): Ctrl/⌘ + wheel zooms about the pointer, the plain wheel scrolls
     (passthrough: the viewer scrolls natively), Shift + wheel scrolls sideways, pinch zooms, two fingers pan. */
  var NAV = { zoomWheel: 'ctrl', panWheel: 'shift', spacePan: true, middlePan: true, pinch: 'zoom', touchPan: true, fitKey: 'Mod+0', actualKey: 'Mod+1', handKey: '', clickZoomKey: '', zoomInKeys: ['Mod+='], zoomOutKeys: ['Mod+-'] };
  /** The engine's adapter: its coordinates are relative to the viewer, so they are converted to client ones here. */
  function atViewer(x, y) { var r = S.viewer.getBoundingClientRect(); return { x: r.left + x, y: r.top + y }; }
  Ed.nav = {
    zoomAt: function (f, x, y, live) { var c = atViewer(x, y); if (live) Ed.setZoom(Ed.zoom * f, c); else easeTo(Ed.targetZoom() * f, c, null); },
    panBy: function (dx, dy) { S.viewer.scrollLeft -= dx; S.viewer.scrollTop -= dy; },
    fit: function () { Ed.fit('width'); },
    actual: function () { Ed.actual(); },
    zoomStep: function (dir, x, y) { easeTo(Ed.targetZoom() * (dir > 0 ? 1.25 : 0.8), atViewer(x, y), null); },
    cancelStroke: function () { if (Ed.cancelInteraction) Ed.cancelInteraction(); if (S.cancelPan) S.cancelPan(); },
  };
  /** Attaches the engine to the viewer. Keys and Space are left to the app outside page view (grid). */
  function attachNav() {
    // A touch surface (shared/input): no scroll, callout or text selection takes a drag; pinch is the engine's.
    S.viewer.setAttribute('data-touch-surface', 'nav');
    if (!window.SlopNav || !SlopNav.engine) return;
    SlopNav.engine.attach({
      host: S.viewer, adapter: Ed.nav, bindings: function () { return NAV; }, passthrough: true,
      skip: function () { return !SP.app || SP.app.mode !== 'page'; },
    });
  }

  /** The zoom controls: the phone cluster (a floating bar, shown at phone width) and the attached engine. */
  S.initZoom = function () {
    var zo = U.h('button', { type: 'button', class: 'pv-zf', title: U.t('pdf.ed.zoom_out_tip'), 'aria-label': U.t('ui.zoom_out'), 'data-i18n-attr': 'title:pdf.ed.zoom_out_tip;aria-label:ui.zoom_out' }, '−');
    var zi = U.h('button', { type: 'button', class: 'pv-zf', title: U.t('pdf.ed.zoom_in_tip'), 'aria-label': U.t('ui.zoom_in'), 'data-i18n-attr': 'title:pdf.ed.zoom_in_tip;aria-label:ui.zoom_in' }, '+');
    var zw = U.h('button', { type: 'button', class: 'pv-zf', title: U.t('pdf.ed.fit_width_tip'), 'aria-label': U.t('pdf.ed.fit_width'), 'data-i18n-attr': 'title:pdf.ed.fit_width_tip;aria-label:pdf.ed.fit_width', html: U.icon('fit') });
    S.zoomPct = U.h('span', { class: 'pv-zpct' }, '100%');
    zo.addEventListener('click', function () { Ed.zoomBy(1 / 1.25); });
    zi.addEventListener('click', function () { Ed.zoomBy(1.25); });
    zw.addEventListener('click', function () { Ed.fit('width'); });
    S.zoomFab = U.h('div', { class: 'pv-zoomfab', role: 'toolbar', 'aria-label': U.t('pdf.ed.zoom'), 'data-i18n-attr': 'aria-label:pdf.ed.zoom' }, zo, S.zoomPct, zi, zw);
    S.viewer.parentNode.appendChild(S.zoomFab);
    attachNav();
  };

  /* ------------------------------------------------------------- pan
     A drag on the empty viewer (mouse, pen or one finger) scrolls it. Space or middle drag pans through the engine.
     S.cancelPan ends this drag; the engine calls it when a second finger lands (pinch and two-finger pan). */
  S.startPan = function (e) {
    if (S.cancelPan) S.cancelPan();
    var sx = e.clientX, sy = e.clientY, sl = S.viewer.scrollLeft, st = S.viewer.scrollTop, pid = e.pointerId;
    function mv(ev) { if (ev.pointerId === pid) { S.viewer.scrollLeft = sl - (ev.clientX - sx); S.viewer.scrollTop = st - (ev.clientY - sy); } }
    function up(ev) { if (ev.pointerId === pid) end(); }
    function end() {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      S.viewer.classList.remove('panning'); if (S.cancelPan === end) S.cancelPan = null;
    }
    S.cancelPan = end;
    S.viewer.classList.add('panning');
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
})();
