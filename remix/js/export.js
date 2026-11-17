/* Reel Remix: export the current plan from the page. The plan is drawn frame by frame at the export preset's size
   (RM.size()) on an offscreen canvas, in real time, while MediaRecorder records that canvas (captureStream) and the
   reel's sound (music, or each clip's own sound in Original mode, through Web Audio: remix/js/audio.js). The file is
   WebM (or MP4 where the browser records it). Keep the tab visible while it runs; Stop saves what has been drawn so far. Browsers without MediaRecorder are told to use Send to SlopCut. */
(function () {
  'use strict';
  const RM = window.RM, tx = RM.t;
  const X = (RM.exporter = { busy: false, stop: null });

  X.supported = () => typeof MediaRecorder === 'function' && !!HTMLCanvasElement.prototype.captureStream;
  X.mime = () => ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  function label(key) { const b = document.getElementById('rm-export'); if (b) { b.dataset.i18n = key; b.textContent = tx(key); } }
  function save(blob, name) {
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Starts the reel's sound for the export: the music from 0, and the clips' own sound (routed, played with their cut). */
  function startAudio(plan) {
    if (!plan.audio || plan.audio.mode === 'off' || !RM.audio.ensure()) return null;
    if (plan.audio.mode === 'music') {
      const el = RM.audio.track(plan);
      if (el) { RM.audio.node(el); el.currentTime = 0; el.play().catch(() => {}); }
    } else for (const it of RM.preview.items) if (it.m.kind === 'video') RM.audio.node(it.m.el);
    return RM.audio.dest;
  }
  /** Each export frame: the music's fade, and the clips' sound for the cuts on screen. */
  function feedAudio(plan, t) {
    if (plan.audio.mode === 'music') RM.audio.tick(plan, t, plan.total);
    else for (const it of RM.preview.items) {
      if (it.m.kind !== 'video') continue;
      const on = t >= it.start && t < (it.hold != null ? it.hold : it.start + it.dur);
      if (on) { it.m.el.muted = false; if (it.m.el.paused) it.m.el.play().catch(() => {}); } else it.m.el.pause();
    }
  }
  function stopAudio(plan) {
    RM.audio.stop();
    for (const it of RM.preview.items) if (it.m.kind === 'video') it.m.el.pause();
  }
  /**
   * Render and record the plan. o.say(msg) reports progress; o.save (default true) downloads the file.
   * Resolves with { blob, name, stopped } or null when there is nothing to export. A second call while busy stops it.
   */
  X.run = async function (o = {}) {
    const say = o.say || (() => {});
    if (X.busy) { if (X.stop) X.stop(); return null; }
    const plan = RM.state.plan;
    if (!plan || !plan.total) { say(tx('remix.export.first')); return null; }
    if (!X.supported()) { say(tx('remix.export.unsupported')); return null; }
    const sz = RM.size(), W = sz.w + (sz.w % 2), H = sz.h + (sz.h % 2);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), mime = X.mime();
    const stream = cv.captureStream(30), audio = startAudio(plan);
    if (audio) for (const tr of audio.stream.getAudioTracks()) stream.addTrack(tr);
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : {});
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    X.busy = true; label('remix.export.stop');
    RM.preview.pause();
    rec.start(250);
    const total = plan.total, t0 = performance.now();
    let raf = 0;
    let stoppedEarly = false;
    await new Promise((resolve) => {
      const finish = () => { cancelAnimationFrame(raf); resolve(); };
      X.stop = () => { stoppedEarly = true; finish(); };
      const step = (now) => {
        const t = Math.min(total, (now - t0) / 1000);
        RM.preview.frame(g, W, H, t);
        if (audio) feedAudio(plan, t);
        say(RM.t('remix.export.progress', { pct: Math.min(100, Math.round((100 * t) / total)) }));
        if (t >= total) return finish();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    rec.stop();
    await stopped;
    stopAudio(plan);
    X.busy = false; X.stop = null; label('remix.export.export');
    RM.preview.seek(RM.preview.t);
    const type = rec.mimeType || mime || 'video/webm';
    const blob = new Blob(parts, { type });
    const name = 'remix-' + plan.seedHex + '.' + (type.includes('mp4') ? 'mp4' : 'webm');
    if (o.save !== false) save(blob, name);
    say(tx(stoppedEarly ? 'remix.export.stopped' : 'remix.export.done', { name, w: String(W), h: String(H) }));
    SlopSupport.afterExport('remix');
    return { blob, name, stopped: stoppedEarly };
  };
})();
