/* Reel Remix: the preview player. Draws the plan at a time t on a canvas: each cut shows its clip in the slot
   region of the layout active at its start, filled by the cut's fill mode (cover, fit, stretch or blur background;
   see SlopVideo.orient). Stills and videos are the bin items' own elements; videos are seeked to the cut's in point.
   Scrubbing and clicks paint the frame at once, even when paused: a video that is still seeking repaints when its
   frame arrives. Play runs the playhead with requestAnimationFrame. Sound: the music track (remix/js/audio.js) and, in
   Original mode, each video's own sound. Clips hold their windows (plan holds) and freeze when they run out.
   A slot with keyframes (keys.js) is drawn posed: clipped to its cell, then offset, scaled, rotated and faded.
   The effect layer (fx.js) is drawn last, over the whole frame. */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo, R = SV.random, O = SV.orient, KF = SV.keys, CS = SV.clipset;
  const FULL = { x: 0, y: 0, w: 1, h: 1 };
  const PV = (RM.preview = { canvas: null, ctx: null, t: 0, playing: false, raf: 0, last: 0, items: [] });

  PV.attach = function (canvas) { PV.canvas = canvas; PV.ctx = canvas.getContext('2d'); };
  /** The plan's cut items, flat, with their media element and the index of their cut. */
  PV.flat = function (plan) {
    const byId = new Map(RM.state.items.map((m) => [m.id, m]));
    return plan ? plan.cuts.flatMap((beat, ci) => beat.map((it) => Object.assign({}, it, { cut: ci, m: byId.get(it.media) }))).filter((it) => it.m) : [];
  };
  PV.total = () => (RM.state.plan ? RM.state.plan.total : 0);
  /** Size the canvas to the preset frame (its width capped for speed). */
  PV.resize = function () {
    const sz = RM.size(), k = Math.min(1, 960 / sz.w);
    PV.canvas.width = Math.round(sz.w * k); PV.canvas.height = Math.round(sz.h * k);
  };
  /** Draw the preview at time t (the playhead). */
  PV.draw = function (t) {
    PV.t = Math.max(0, Math.min(t, PV.total()));
    drawFrame(PV.ctx, PV.canvas.width, PV.canvas.height, PV.t, RM.state.plan, PV.items);
  };
  /** Draw the plan at time t on any canvas context of size W x H (used by the export). */
  PV.frame = (c, W, H, t) => drawFrame(c, W, H, t, RM.state.plan, PV.items);
  /** Repaint at the current time (after a seeked frame arrives). */
  const repaint = () => { if (!PV.playing) PV.draw(PV.t); };

  function drawFrame(c, W, H, t, plan, items) {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (!plan) return;
    for (const it of items) {
      if (!inWindow(it, t)) { if (it.m.kind === 'video') it.m.el.pause(); continue; }
      const reg = R.regionFor(plan, it) || FULL; // no layout (None): the clip fills the frame
      const box = { x: reg.x * W, y: reg.y * H, w: reg.w * W, h: reg.h * H };
      const pose = KF.pose(KF.get(RM.state.keys, it.cut, it.slot), t - it.start);
      if (pose) drawPosed(c, it, t, box, plan, pose); else drawItem(c, it, t, box, plan);
    }
    RM.layer.apply(c, W, H, t, plan);
  }
  /** A keyed slot: clipped to its cell, then faded, moved, scaled and rotated about the cell's centre. */
  function drawPosed(c, it, t, box, plan, p) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    c.save();
    c.beginPath(); c.rect(box.x, box.y, box.w, box.h); c.clip();
    c.globalAlpha = Math.max(0, Math.min(1, p.opacity));
    c.translate(cx + p.x * box.w, cy + p.y * box.h);
    c.rotate((p.rot * Math.PI) / 180); c.scale(p.scale, p.scale);
    c.translate(-cx, -cy);
    drawItem(c, it, t, box, plan);
    c.restore();
  }
  /** End of a clip's window on its slot: the next clip in that slot (or its own end when the plan has no holds). */
  const holdOf = (it) => (it.hold != null ? it.hold : it.start + it.dur);
  /** The end of a photo's show time is its own length (set in the photo settings); a video runs to its hold. */
  const showEnd = (it) => (it.m.kind === 'image' ? Math.min(holdOf(it), it.start + it.dur) : holdOf(it));
  /** Whether item it is on screen at t: its slot window, and the photo's reel window (from, to). */
  function inWindow(it, t) {
    if (!(t >= it.start && t < showEnd(it))) return false;
    return (it.from == null || t >= it.from) && (it.to == null || t < it.to);
  }
  /** Photo edges: fade (alpha) and slide (a share of the cell's width) over EDGE_SECONDS at each end. */
  function edgeOf(it, t) {
    const E = CS.EDGE_SECONDS, s0 = Math.max(it.start, it.from || 0), e0 = Math.min(showEnd(it), it.to == null ? Infinity : it.to);
    const p = Math.min(1, (t - s0) / E), q = Math.min(1, (e0 - t) / E);
    let alpha = 1, dx = 0;
    if (it.enter === 'fade') alpha *= p; if (it.exit === 'fade') alpha *= q;
    if (it.enter === 'slide') dx -= 1 - p; if (it.exit === 'slide') dx += 1 - q;
    return { alpha: Math.max(0, Math.min(1, alpha)), dx };
  }
  /** One cut's clip in its box: seeks a video to the in point, then paints it with the cell's fill mode. */
  function drawItem(c, it, t, box, plan) {
    const el = it.m.el, video = it.m.kind === 'video';
    const nw = video ? el.videoWidth : el.naturalWidth, nh = video ? el.videoHeight : el.naturalHeight;
    if (!nw || !nh) return;
    if (video) {
      const want = CS.videoTime(it.vset || { mode: 'full' }, t - it.start, it.m.dur); // the clip's settings: full, trim, speed or loop
      if (PV.playing && plan.audio && plan.audio.mode === 'original') { el.muted = false; if (el.paused) el.play().catch(() => {}); }
      if (Math.abs(el.currentTime - want) > 0.25 && el.readyState >= 1) {
        el.currentTime = want;
        el.addEventListener('seeked', repaint, { once: true }); // paint the frame as soon as it arrives
      }
      if (el.readyState < 2) { el.addEventListener('loadeddata', repaint, { once: true }); return; }
    }
    const mode = O.resolve(it.fill && it.fill !== 'auto' ? it.fill : plan.fill, plan.mixed);
    if (video) { paint(c, el, nw, nh, box, mode, it.pan); return; }
    const ed = edgeOf(it, t), bx = Object.assign({}, box, { x: box.x + ed.dx * box.w });
    const prev = c.globalAlpha; c.globalAlpha = prev * ed.alpha;
    paint(c, el, nw, nh, bx, mode, it.pan);
    c.globalAlpha = prev;
  }
  /** Paint one picture into a box: cover (crop), fit (letterbox), stretch (distort) or blur (blurred cover behind a fit). */
  function paint(c, el, nw, nh, b, mode, pan) {
    if (mode === 'stretch') { c.drawImage(el, b.x, b.y, b.w, b.h); return; }
    if (mode === 'blur') {
      const k = Math.max(b.w / nw, b.h / nh);
      c.save(); c.beginPath(); c.rect(b.x, b.y, b.w, b.h); c.clip();
      c.filter = 'blur(' + Math.round(Math.max(b.w, b.h) / 24) + 'px)';
      c.drawImage(el, b.x + (b.w - nw * k) / 2, b.y + (b.h - nh * k) / 2, nw * k, nh * k);
      c.filter = 'none'; c.restore();
    }
    const cover = mode === 'cover';
    const k = cover ? Math.max(b.w / nw, b.h / nh) : Math.min(b.w / nw, b.h / nh);
    const dw = nw * k, dh = nh * k;
    // a cover picture can be panned inside its cell: pan -1..1 moves it to the cell's edge
    const px = cover && pan ? Math.max(-1, Math.min(1, pan.x || 0)) * Math.max(0, (dw - b.w) / 2) : 0;
    const py = cover && pan ? Math.max(-1, Math.min(1, pan.y || 0)) * Math.max(0, (dh - b.h) / 2) : 0;
    if (cover) { c.save(); c.beginPath(); c.rect(b.x, b.y, b.w, b.h); c.clip(); }
    c.drawImage(el, b.x + (b.w - dw) / 2 + px, b.y + (b.h - dh) / 2 + py, dw, dh);
    if (cover) c.restore();
  }
  /** Re-read the plan into the item list (call after each Remix or edit). */
  PV.setPlan = function () { PV.items = PV.flat(RM.state.plan); PV.resize(); PV.draw(Math.min(PV.t, PV.total())); };
  /** Move the playhead to t and paint that frame (also while paused). */
  PV.seek = (t) => { PV.draw(t); if (PV.playing) RM.audio.seek(RM.state.plan, PV.t); if (PV.onTick) PV.onTick(PV.t); };
  PV.play = function () {
    if (PV.playing) return;
    if (PV.t >= PV.total() - 0.01) PV.t = 0;
    PV.playing = true; PV.last = performance.now();
    RM.audio.start(RM.state.plan, PV.t, PV.total());
    const step = (now) => {
      if (!PV.playing) return;
      PV.t += (now - PV.last) / 1000; PV.last = now;
      if (PV.t >= PV.total()) { PV.t = PV.total(); PV.pause(); }
      PV.draw(PV.t);
      RM.audio.tick(RM.state.plan, PV.t, PV.total());
      if (PV.onTick) PV.onTick(PV.t);
      if (PV.playing) PV.raf = requestAnimationFrame(step);
    };
    PV.raf = requestAnimationFrame(step);
  };
  PV.pause = function () {
    PV.playing = false; cancelAnimationFrame(PV.raf);
    RM.audio.stop();
    for (const it of PV.items) if (it.m.kind === 'video') it.m.el.pause();
    if (PV.onTick) PV.onTick(PV.t);
  };
})();
