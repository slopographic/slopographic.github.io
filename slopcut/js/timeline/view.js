/* SlopCut: timeline view state and geometry. Zoom (px per second), scroll, rows, hit testing and
   redraw scheduling. Drawing lives in draw.js, pointer input in input.js, headers in heads.js. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model;
  const TL = SE.timeline = {
    pps: 60, scrollX: 0, scrollY: 0, tool: 'select', snap: U.store.get('snap', true),
    RULER: 24, MARKERS: 16, VIDEO_H: 58, AUDIO_H: 50, EDGE: 7,
    w: 0, h: 0, dpr: 1, ghost: null, snapLine: null, marquee: null, hover: null
  };
  TL.top = () => TL.RULER + TL.MARKERS;
  /** Rows in display order: [{ track, y, h }] (y in content space, before scrollY). */
  TL.rows = function () {
    let y = TL.top();
    return M.displayTracks(SE.doc).map((t) => { const h = t.kind === 'video' ? TL.VIDEO_H : TL.AUDIO_H; const r = { track: t, y, h }; y += h; return r; });
  };
  TL.contentH = () => TL.rows().reduce((m, r) => Math.max(m, r.y + r.h), TL.top()) + 30;
  TL.x = (t) => (t - TL.scrollX) * TL.pps;
  TL.t = (x) => x / TL.pps + TL.scrollX;
  TL.rowAt = function (y) { // y in canvas space
    const cy = y + TL.scrollY;
    return TL.rows().find((r) => cy >= r.y && cy < r.y + r.h) || null;
  };
  TL.rowOf = (trackId) => TL.rows().find((r) => r.track.id === trackId);
  /** Screen rect of a clip (canvas space). */
  TL.clipRect = function (c) {
    const r = TL.rowOf(c.track); if (!r) return null;
    return { x: TL.x(c.start), y: r.y - TL.scrollY + 1, w: c.dur * TL.pps, h: r.h - 2, row: r };
  };
  /** What is under a canvas point: { area: 'ruler'|'markers'|'clip'|'empty', clip, part, marker, row, t }. */
  TL.hit = function (x, y) {
    const t = TL.t(x);
    if (y < TL.RULER) return { area: 'ruler', t };
    if (y < TL.top()) {
      const k = SE.doc.markers.find((m) => Math.abs(TL.x(m.t) - x) < 6);
      return { area: 'markers', t, marker: k || null };
    }
    const row = TL.rowAt(y);
    if (!row) return { area: 'empty', t, row: null };
    const clips = SE.doc.clips.filter((c) => c.track === row.track.id);
    for (const c of clips) {
      const r = TL.clipRect(c), edge = Math.min(TL.EDGE, r.w / 3);
      if (x < r.x - 2 || x > r.x + r.w + 2) continue;
      // fade handles: small squares at the top corners
      const fadeKey = c.kind === 'audio' ? ['afIn', 'afOut'] : ['fadeIn', 'fadeOut'];
      if (r.w > 40 && y < r.y + 10) {
        const fi = r.x + c[fadeKey[0]] * TL.pps, fo = r.x + r.w - c[fadeKey[1]] * TL.pps;
        if (Math.abs(x - fi) < 6) return { area: 'clip', clip: c, part: 'fadein', row, t };
        if (Math.abs(x - fo) < 6) return { area: 'clip', clip: c, part: 'fadeout', row, t };
      }
      if (x <= r.x + edge) return { area: 'clip', clip: c, part: 'in', row, t };
      if (x >= r.x + r.w - edge) return { area: 'clip', clip: c, part: 'out', row, t };
      if (c.trIn && x < r.x + c.trIn.dur / 2 * TL.pps && y > r.y + r.h - 16) return { area: 'clip', clip: c, part: 'transition', row, t };
      if (c.kind === 'audio' && r.h > 20) {
        const k = (c.keys || []).findIndex((kk) => Math.abs(r.x + kk.t * TL.pps - x) < 5 && Math.abs(TL.volY(c, r, kk.t) - y) < 5);
        if (k >= 0) return { area: 'clip', clip: c, part: 'key', key: k, row, t };
        if (Math.abs(TL.volY(c, r, (x - r.x) / TL.pps) - y) < 4) return { area: 'clip', clip: c, part: 'volume', row, t };
      }
      return { area: 'clip', clip: c, part: 'body', row, t };
    }
    return { area: 'empty', t, row };
  };
  /** Y of the volume line (gain 0..2 maps to bottom..top; 1 at 2/3 height). */
  const VMAX = 2;
  TL.volY = function (c, r, u) {
    let g = c.vol;
    if (c.keys && c.keys.length) g = M.gainAt(Object.assign({}, c, { afIn: 0, afOut: 0 }), u);
    return r.y + r.h - 3 - Math.sqrt(U.clamp(g, 0, VMAX) / VMAX) * (r.h - 8);
  };
  TL.volFromY = function (r, y) { const f = U.clamp((r.y + r.h - 3 - y) / (r.h - 8), 0, 1); return U.round(f * f * VMAX, 3); };

  /* ------------------------------------------------------------ zoom & scroll */
  TL.clampScroll = function () {
    const maxT = Math.max(M.duration(SE.doc) + 30, TL.w / TL.pps);
    TL.scrollX = U.clamp(TL.scrollX, 0, Math.max(0, maxT - TL.w / TL.pps * 0.5));
    TL.scrollY = U.clamp(TL.scrollY, 0, Math.max(0, TL.contentH() - TL.h));
  };
  TL.setZoom = function (pps, anchorX) {
    const ax = anchorX == null ? (SE.player ? TL.x(SE.player.time) : TL.w / 2) : anchorX;
    const at = TL.t(U.clamp(ax, 0, TL.w));
    TL.pps = U.clamp(pps, 2, 2400);
    TL.scrollX = at - ax / TL.pps;
    TL.clampScroll(); TL.dirty(); U.store.set('pps', TL.pps); SE.emit('zoom', {});
  };
  TL.zoomBy = (f, ax) => TL.setZoom(TL.pps * f, ax);
  TL.fit = function () {
    if (TL.w < 50) return;
    const d = Math.max(M.duration(SE.doc), 5);
    TL.pps = U.clamp((TL.w - 40) / d, 2, 2400); TL.scrollX = 0;
    TL.clampScroll(); TL.dirty(); U.store.set('pps', TL.pps); SE.emit('zoom', {});
  };
  /** Keep the playhead visible while playing (page-scroll style). */
  TL.follow = function (t) {
    const x = TL.x(t);
    if (x > TL.w - 30 || x < 0) { TL.scrollX = Math.max(0, t - (x < 0 ? TL.w * 0.2 : 30) / TL.pps); TL.clampScroll(); }
  };
  TL.setTool = function (tool) { TL.tool = tool; SE.emit('tool', {}); TL.dirty(); };
  /** Select mode (Select several; a long press on a clip turns it on): taps add and remove clips, a drag from empty
   *  space draws a selection box, also with a finger (timeline/input.js). */
  TL.multi = false;
  TL.setMulti = function (on) {
    TL.multi = !!on; SE.emit('tool', {}); TL.dirty();
    if (SE.app && SE.app.status) SE.app.status(on ? U.t('slopedit.tl.select_several_tap_clips_to') : '');
  };
  TL.toggleSnap = function () { TL.snap = !TL.snap; U.store.set('snap', TL.snap); SE.emit('tool', {}); SlopUI.toast(U.t(TL.snap ? 'slopedit.tl.snap_on' : 'slopedit.tl.snap_off')); };
  /** Snap a time (seconds) to edit points within 8 px when snapping is on. */
  TL.snapT = function (t, skip, force) {
    if (!TL.snap && !force) { TL.snapLine = null; return t; }
    const r = SE.edit.snap(SE.doc, t, 8 / TL.pps, skip, SE.player ? [SE.player.time] : []);
    TL.snapLine = r.hit ? r.t : null;
    return r.t;
  };

  /* ------------------------------------------------------------ redraw */
  let raf = 0;
  TL.dirty = function () { if (!raf) raf = requestAnimationFrame(() => { raf = 0; TL.draw(); }); };
  TL.resize = function () {
    const el = SE.app.els.tlLanes, cv = SE.app.els.tlCanvas;
    const r = el.getBoundingClientRect();
    TL.dpr = Math.min(2, window.devicePixelRatio || 1);
    const wasHidden = TL.w < 50;
    TL.w = Math.max(1, r.width); TL.h = Math.max(1, r.height);
    cv.width = Math.round(TL.w * TL.dpr); cv.height = Math.round(TL.h * TL.dpr);
    cv.style.width = TL.w + 'px'; cv.style.height = TL.h + 'px';
    if (wasHidden && TL.w >= 50 && SE.doc.clips.length) { TL.fit(); return; }
    TL.clampScroll(); TL.dirty();
    if (TL.syncHeads) TL.syncHeads();
  };
  TL.init = function () {
    TL.ctx = SE.app.els.tlCanvas.getContext('2d');
    if ('ResizeObserver' in window) new ResizeObserver(() => TL.resize()).observe(SE.app.els.tlLanes); // i18n-ignore: an API name
    SE.on('layout', TL.resize);
    SE.on('change', () => { TL.clampScroll(); TL.dirty(); if (TL.renderHeads) TL.renderHeads(); });
    SE.on('select', TL.dirty); SE.on('media', TL.dirty); SE.on('theme', () => { TL.colors = null; TL.dirty(); });
    SE.on('time', () => { if (SE.player.playing) TL.follow(SE.player.time); TL.dirty(); });
    SE.on('doc', () => { TL.scrollX = 0; TL.scrollY = 0; setTimeout(TL.fit, 0); });
    if (TL.initInput) TL.initInput();
    if (TL.initHeads) TL.initHeads();
    if (TL.initDrops) TL.initDrops();
    TL.resize();
    TL.pps = U.store.get('pps', 60);
  };
})();
