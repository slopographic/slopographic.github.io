/* SlopIsolate — the preview canvas. Screen = image * scale + offset (CSS px, relative to #stage).
 * Views: result (composed picture over a checkerboard), before (original), split (original left of the
 * knob, result right; S.split is the knob's fraction of the stage width) and mask. Composed pictures are
 * cached per (act.rev, look), so pan and zoom never re-compose. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, C = CO.compose, P = CO.process;
  const V = CO.view = {};
  const MIN = 0.02, MAX = 40, PAD = 24;
  const T = { scale: 1, ox: 0, oy: 0 };
  let cv = null, cx = null, dpr = 1, fitted = null, frame = 0, checker = null, tint = null;
  const memo = new Map();     // kind -> { act, key, canvas }
  const mips = new WeakMap(); // source canvas -> [half-size levels]
  const $ = U.$;

  const stageSize = () => { const st = $('#stage'); return { w: st ? st.clientWidth : 0, h: st ? st.clientHeight : 0 }; };
  /** Visible rectangle in image px: the crop box in the result view, else the whole image. */
  const rectOf = (act) => (S.view === 'result' ? C.boxOf(act.item, act) : { x: 0, y: 0, w: act.w, h: act.h });

  /** A canvas's pixels go now (iOS counts them until the canvas is collected), its half-size levels too. */
  function release(c) {
    const m = c && mips.get(c);
    if (m) { m.lv.forEach((l) => { if (l) l.width = l.height = 0; }); mips.delete(c); }
  }
  /** Reuse the last composed canvas of a kind while its act and key are unchanged; else draw it again, into the same
   *  canvas when make() takes it (no new full-size canvas per brush step). */
  function cached(kind, act, key, make) {
    const m = memo.get(kind);
    if (m && m.act === act && m.key === key) return m.canvas;
    const old = m && m.canvas, canvas = make(old);
    if (old && old !== canvas) { release(old); old.width = old.height = 0; }
    memo.set(kind, { act, key, canvas });
    return canvas;
  }
  /** Half-size levels of a source, so zoomed-out drawing samples fewer pixels. ver: the source's version; a source drawn
   *  again (same canvas, new pixels) redraws its levels into the canvases they already have. */
  function level(src, n, ver) {
    if (n <= 0) return src;
    let m = mips.get(src);
    if (!m) mips.set(src, (m = { ver, lv: [], ok: [] }));
    if (m.ver !== ver) { m.ver = ver; m.ok = []; }
    if (!m.ok[n]) {
      const prev = level(src, n - 1, ver), w = Math.max(1, Math.round(prev.width / 2)), h = Math.max(1, Math.round(prev.height / 2));
      let c = m.lv[n];
      if (!c || c.width !== w || c.height !== h) { if (c) c.width = c.height = 0; c = m.lv[n] = U.canvas(w, h); }
      const g = U.ctx(c);
      g.clearRect(0, 0, w, h);
      g.imageSmoothingQuality = 'high';
      g.drawImage(prev, 0, 0, w, h);
      m.ok[n] = true;
    }
    return m.lv[n];
  }
  /** The level of a source to draw an image rect w px wide at the current zoom. */
  function pick(src, w, ver) {
    const k = dpr * T.scale * w / src.width; // device px per source px
    return level(src, k < 1 ? Math.min(6, Math.floor(Math.log2(1 / k))) : 0, ver);
  }
  /** Draw a source covering the image rect (x, y, w, h) in image px. */
  function put(src, x, y, w, h, ver) {
    cx.drawImage(pick(src, w, ver), T.ox + x * T.scale, T.oy + y * T.scale, w * T.scale, h * T.scale);
  }
  function checkerboard() {
    if (!checker) {
      const c = U.canvas(16, 16), g = U.ctx(c);
      g.fillStyle = '#c9c9cf'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
      checker = cx.createPattern(c, 'repeat');
    }
    return checker;
  }
  function drawResult(act) {
    const it = act.item, b = C.boxOf(it, act);
    // the plain look (transparent, no shadow, whole picture) is the cut-out itself: no second full-size canvas
    const plain = it.bg.mode === 'transparent' && !(it.shadow.on && it.shadow.opacity > 0) && !b.x && !b.y && b.w === act.w && b.h === act.h;
    const key = act.rev + '|' + JSON.stringify(S.lookOf(it));
    const c = plain ? C.cutCanvas(act) : cached('result', act, key, (old) => C.render(it, act, old));
    if (it.bg.mode === 'transparent') {
      cx.fillStyle = checkerboard();
      cx.fillRect(T.ox + b.x * T.scale, T.oy + b.y * T.scale, b.w * T.scale, b.h * T.scale);
    }
    put(c, b.x, b.y, b.w, b.h, plain ? 'cut' + act.rev : key);
  }
  /** Brush tools: the removed part is tinted so the matte can be seen on the picture while painting. Drawn at screen size
   *  (one canvas the size of the view, kept): pink over the picture, less the cut-out's alpha, at half strength. */
  function drawTint(act) {
    const W = cv.width, H = cv.height, cut = C.cutCanvas(act);
    if (!tint) tint = U.canvas(W, H); else if (tint.width !== W || tint.height !== H) { tint.width = W; tint.height = H; }
    const g = U.ctx(tint), x = T.ox, y = T.oy, w = act.w * T.scale, h = act.h * T.scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = 'rgb(255,40,120)';
    g.fillRect(x, y, w, h);
    g.globalCompositeOperation = 'destination-out';
    g.imageSmoothingEnabled = true;
    g.drawImage(pick(cut, act.w, 'cut' + act.rev), x, y, w, h);
    g.globalCompositeOperation = 'source-over';
    cx.save();
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.globalAlpha = 0.5;
    cx.drawImage(tint, 0, 0);
    cx.restore();
  }
  function drawMask(act) {
    const it = act.item, b = C.boxOf(it, act);
    const key = act.rev + '|' + JSON.stringify(it.crop);
    put(cached('mask', act, key, (old) => C.maskCanvas(it, act, old)), b.x, b.y, b.w, b.h, key);
  }

  /** Centre the visible rect in the stage. */
  function place(act, sz) {
    const r = rectOf(act), k = Math.min(Math.max(1, sz.w - 2 * PAD) / r.w, Math.max(1, sz.h - 2 * PAD) / r.h);
    T.scale = U.clamp(k, MIN, MAX);
    T.ox = (sz.w - r.w * T.scale) / 2 - r.x * T.scale;
    T.oy = (sz.h - r.h * T.scale) / 2 - r.y * T.scale;
  }
  function zoomText() {
    const t = V.zoomPct() + '%';
    document.querySelectorAll('.tb-zoom, #statusZoom').forEach((el) => { el.textContent = t; });
  }
  function placeSplit(show, x) {
    const el = $('#split');
    if (!el) return;
    el.hidden = !show;
    if (show) el.style.left = x + 'px';
  }

  /* ---------- public API ---------- */
  V.init = function () {
    cv = $('#view');
    if (!cv) return;
    cx = U.ctx(cv);
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; V.draw(); }); };
    if (window.ResizeObserver && $('#stage')) new ResizeObserver(schedule).observe($('#stage'));
    else window.addEventListener('resize', schedule);
    for (const t of ['active', 'activeItem', 'look', 'view', 'history', 'list', 'tool']) CO.on(t, schedule);
    CO.on('item', (it) => { if (P.active && P.active.item === it) schedule(); });
    V.draw();
  };

  /** Paint the canvas for the current active record and view. Cheap when nothing changed. */
  V.draw = function () {
    if (!cx) return;
    const act = P.active, sz = stageSize(), app = $('#app');
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(sz.w * dpr)), H = Math.max(1, Math.round(sz.h * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, sz.w, sz.h);
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    if (app) app.dataset.mode = act || S.items.length ? 'work' : 'empty';
    zoomText();
    if (!act) { placeSplit(false); return; }
    if (act !== fitted && sz.w > 2 && sz.h > 2) { fitted = act; place(act, sz); }
    if (S.view === 'split') {
      const sx = Math.round(U.clamp(S.split, 0, 1) * sz.w);
      cx.save(); cx.beginPath(); cx.rect(0, 0, sx, sz.h); cx.clip();
      put(act.bitmap, 0, 0, act.w, act.h, 0);
      cx.restore();
      cx.save(); cx.beginPath(); cx.rect(sx, 0, sz.w - sx, sz.h); cx.clip();
      drawResult(act);
      cx.restore();
      placeSplit(true, sx);
    } else {
      if (S.view === 'before') put(act.bitmap, 0, 0, act.w, act.h, 0);
      else if (S.view === 'mask') drawMask(act);
      else { drawResult(act); if (S.tool === 'keep' || S.tool === 'remove') drawTint(act); }
      placeSplit(false);
    }
  };

  /** Fit the visible picture into the stage. */
  V.fit = function () {
    const act = P.active, sz = stageSize();
    if (!act || sz.w < 3 || sz.h < 3) return;
    fitted = act;
    place(act, sz);
    V.draw();
  };
  V.geom = () => ({ scale: T.scale, ox: T.ox, oy: T.oy });
  /** Stage CSS px (relative to #stage) to image px. */
  V.toImage = (sx, sy) => ({ x: (sx - T.ox) / T.scale, y: (sy - T.oy) / T.scale });
  /** Zoom by factor keeping the point (sx, sy) in place. */
  V.zoomAt = function (f, sx, sy) {
    const s = U.clamp(T.scale * f, MIN, MAX), k = s / T.scale;
    T.ox = sx - (sx - T.ox) * k;
    T.oy = sy - (sy - T.oy) * k;
    T.scale = s;
    V.draw();
  };
  V.panBy = function (dx, dy) { T.ox += dx; T.oy += dy; V.draw(); };
  V.zoomPct = () => Math.round(T.scale * 100);
  V.release = release;
})();
