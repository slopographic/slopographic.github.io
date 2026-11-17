/* SlopCut: the program monitor. Renders the timeline at the playhead with the compositor (video from
   the <video> pool, stills as bitmaps), keeps the canvas sized to the panel, draws the safe-area and
   selection overlay, and offers snapshot to PNG / Send to PhotoSlop. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, CMP = SE.compositor, VP = SE.vpool;
  const PV = SE.preview = { safe: U.store.get('safe', false), half: U.store.get('half', false), W: 0, H: 0, box: null };
  let cv, g, ov, og, stage, msg, raf = 0;

  /** Drawable for a clip in the live preview. */
  PV.source = function (c, srcT) {
    const it = SE.media.get(c.media);
    if (!it || it.status !== 'ready') return null;
    if (c.kind === 'image') return it.bmp;
    if (c.kind === 'video') return VP.get(c, srcT);
    return null;
  };
  PV.layout = function () {
    const r = stage.getBoundingClientRect(), p = SE.doc;
    const pad = SE.app.isPhone() ? 6 : 16;
    const s = Math.min((r.width - pad * 2) / p.w, (r.height - pad * 2) / p.h);
    const dw = Math.max(16, Math.floor(p.w * s)), dh = Math.max(9, Math.floor(p.h * s));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = Math.min(p.w, Math.round(dw * dpr)), H = Math.round(W * p.h / p.w);
    if (PV.half) { W = Math.round(W / 2); H = Math.round(H / 2); }
    W += W % 2; H += H % 2;
    for (const c of [cv, ov]) { c.style.width = dw + 'px'; c.style.height = dh + 'px'; c.style.left = Math.round((r.width - dw) / 2) + 'px'; c.style.top = Math.round((r.height - dh) / 2) + 'px'; }
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ow = Math.round(dw * dpr), oh = Math.round(dh * dpr);
    if (ov.width !== ow || ov.height !== oh) { ov.width = ow; ov.height = oh; }
    PV.W = W; PV.H = H; PV.dispScale = dw / p.w; PV.dpr = dpr;
    PV.request();
  };
  PV.request = function () { if (!raf) raf = requestAnimationFrame(PV.draw); };
  PV.draw = function () {
    raf = 0;
    const p = SE.doc, t = SE.player.time;
    const layers = CMP.render(g, p, t, { W: PV.W, H: PV.H, source: PV.source });
    VP.prune(new Set(layers.map((l) => l.clip.id)));
    if (SE.player.playing) VP.preload(p, t);
    drawOverlay();
    updateMsg();
  };
  function drawOverlay() {
    const p = SE.doc, W = ov.width, H = ov.height, k = W / p.w;
    og.clearRect(0, 0, W, H);
    if (PV.safe) {
      og.strokeStyle = 'rgba(255,255,255,.55)'; og.lineWidth = 1; og.setLineDash([6, 4]);
      og.strokeRect(W * 0.05 + 0.5, H * 0.05 + 0.5, W * 0.9, H * 0.9);
      og.strokeStyle = 'rgba(212,255,58,.6)'; og.strokeRect(W * 0.1 + 0.5, H * 0.1 + 0.5, W * 0.8, H * 0.8);
      og.setLineDash([]); og.strokeStyle = 'rgba(255,255,255,.5)';
      og.beginPath(); og.moveTo(W / 2 - 12, H / 2); og.lineTo(W / 2 + 12, H / 2); og.moveTo(W / 2, H / 2 - 12); og.lineTo(W / 2, H / 2 + 12); og.stroke();
      og.fillStyle = 'rgba(255,255,255,.6)'; og.font = '600 ' + Math.round(10 * PV.dpr) + 'px monospace'; // i18n-ignore: canvas fonts, the broadcast safe-area marks, the brand, an API name
      og.fillText('ACTION SAFE', W * 0.05 + 4, H * 0.05 + 14 * PV.dpr); og.fillText('TITLE SAFE', W * 0.1 + 4, H * 0.1 + 14 * PV.dpr); // i18n-ignore: canvas fonts, the broadcast safe-area marks, the brand, an API name
    }
    const c = SE.app.primary();
    PV.box = null;
    if (c && c.kind !== 'audio' && SE.player.time >= c.start && SE.player.time < M.end(c) && !SE.player.playing) {
      const pts = CMP.bounds(p, c, SE.player.time).map(([x, y]) => [x * k, y * k]);
      og.strokeStyle = '#d4ff3a'; og.lineWidth = 1.5;
      og.beginPath(); pts.forEach(([x, y], i) => (i ? og.lineTo(x, y) : og.moveTo(x, y))); og.closePath(); og.stroke();
      og.fillStyle = '#d4ff3a';
      for (const [x, y] of pts) og.fillRect(x - 4, y - 4, 8, 8);
      const top = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
      og.beginPath(); og.arc(top[0], top[1] - 18 * PV.dpr, 5, 0, Math.PI * 2); og.fill();
      PV.box = { clip: c.id, pts, rot: [top[0], top[1] - 18 * PV.dpr], k };
    }
    if (SE.cells) SE.cells.draw(og, W, H); // the layout's cells (render/cells.js)
    if (SE.maskView) SE.maskView.draw(og); // the clip's mask outline and handles (render/mask-view.js)
  }
  /** An empty project shows what SlopCut makes and how (SlopDrop's preview; the bin has Import and Sample project). */
  let intro = null;
  const introOf = () => intro || (intro = window.SlopDrop.panel.preview({
    picture: { src: '../assets/shots/slopedit.jpg', alt: 'slopedit.render.a_short_film_on_the' },   // keys: the preview follows a language change
    steps: ['slopedit.render.step_drop', 'slopedit.render.cut_and_arrange_them_on', 'slopedit.render.export_a_video_file'] }));
  function updateMsg() {
    const p = SE.doc;
    if (!p.clips.length) {
      msg.hidden = false; msg.classList.toggle('mon-intro', !p.media.length);
      const b = document.createElement('b'); b.textContent = 'SlopCut'; // i18n-ignore: canvas fonts, the broadcast safe-area marks, the brand, an API name
      if (p.media.length) msg.replaceChildren(b, U.t('slopedit.render.drag_media_from_the_bin'));
      else msg.replaceChildren(b, introOf());
    } else msg.hidden = true;
  }

  /* ------------------------------------------------------------ snapshot */
  /** Render the current frame at full project resolution (waits for video frames). */
  PV.frameCanvas = async function (t = SE.player.time) {
    const p = SE.doc, out = U.canvas(p.w, p.h);
    await SE.text.ready(p);
    if (SE.watermark) await SE.watermark.ready(p);
    const src = SE.frames ? SE.frames.preview() : null;
    if (src) { await src.prepare(t); CMP.render(out.getContext('2d'), p, t, { W: p.w, H: p.h, source: src.get }); src.close(); }
    else CMP.render(out.getContext('2d'), p, t, { W: p.w, H: p.h, source: PV.source });
    return out;
  };
  PV.snapshotBlob = async function () { const c = await PV.frameCanvas(); return new Promise((r) => c.toBlob(r, 'image/png')); };
  const shotName = () => U.baseName(SE.doc.name) + ' ' + U.timecode(SE.player.time, SE.doc.fps).replace(/:/g, '-') + '.png';
  SE.act.snapshot = async function () { SE.player.pause(); SlopUI.download(await PV.snapshotBlob(), shotName()); SE.app.status(U.t('slopedit.render.saved_frame_as_png')); };
  SE.act.snapshotSend = async function () {
    SE.player.pause();
    try { await SlopOuttake.send('photoslop', { from: 'slopedit', get: PV.snapshotBlob, name: shotName(), type: 'image/png' }); } catch (e) { SlopUI.toast(U.t('slopedit.io.send_failed', { error: e.message })); }
  };
  SE.act.toggleSafe = function () { PV.safe = !PV.safe; U.store.set('safe', PV.safe); PV.request(); SE.emit('transport', {}); };
  SE.act.toggleQuality = function () { PV.half = !PV.half; U.store.set('half', PV.half); PV.layout(); SE.app.status(U.t(PV.half ? 'slopedit.render.quality_half' : 'slopedit.render.quality_full')); };

  PV.init = function () {
    const A = SE.app;
    cv = A.els.preview; ov = A.els.overlay; stage = A.els.monStage; msg = A.els.monMsg;
    g = cv.getContext('2d', { alpha: false }); og = ov.getContext('2d');
    if ('ResizeObserver' in window) new ResizeObserver(() => PV.layout()).observe(stage); // i18n-ignore: canvas fonts, the broadcast safe-area marks, the brand, an API name
    SE.on('layout', PV.layout); SE.on('settings', PV.layout); SE.on('doc', () => { VP.clear(); PV.layout(); });
    for (const ev of ['time', 'frame', 'change', 'select', 'media', 'media-ready']) SE.on(ev, PV.request);
    SE.on('transport', () => { if (!SE.player.playing) VP.pauseAll(); PV.request(); });
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', PV.request);
    if (PV.initInput) PV.initInput(ov);
    if (SE.cells) SE.cells.init();
    if (SE.maskInput) SE.maskInput.init();
    PV.layout();
  };
})();
