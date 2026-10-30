/* SlopCut: the playback engine. Owns the playhead (time), the clock and real-time audio.
   At normal speed the WebAudio clock drives the playhead so sound and picture stay in sync;
   J/K/L shuttle speeds (±2×, 4×, 8×, reverse) run on the performance clock without sound.
   Emits 'time' on every frame; the preview listens and redraws. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, AM = SE.audiomix;
  const P = SE.player = { time: 0, playing: false, rate: 0, loop: false };
  let ctx = null, master = null, nodes = [], t0 = 0, c0 = 0, raf = 0, perf0 = 0;

  function audioCtx() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.connect(ctx.destination);
      P.analyser = ctx.createAnalyser(); P.analyser.fftSize = 1024; master.connect(P.analyser);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => null);
    return ctx;
  }
  P.audioContext = audioCtx;
  P.range = function () {
    const p = SE.doc, d = M.duration(p);
    const a = p.io && p.io.in != null ? p.io.in : 0, b = p.io && p.io.out != null ? p.io.out : d;
    return { a: Math.min(a, b), b: Math.max(a, b), d };
  };
  function startAudio() {
    AM.stop(nodes); nodes = [];
    if (P.rate !== 1) return;
    const c = audioCtx(); if (!c) return;
    t0 = P.time; c0 = c.currentTime + 0.06;
    nodes = AM.schedule(c, master, SE.doc, t0, c0);
  }
  function clock() {
    if (P.rate === 1 && ctx && ctx.state === 'running') return t0 + Math.max(0, ctx.currentTime - c0);
    return t0 + ((performance.now() - perf0) / 1000) * P.rate;
  }
  function tick() {
    raf = 0;
    if (!P.playing) return;
    let t = clock();
    const r = P.range(), end = P.loop ? r.b : Math.max(r.d, r.b);
    if (P.rate > 0 && t >= end) {
      if (P.loop && r.b > r.a) { P.time = r.a; restart(); SE.emit('time', {}); raf = requestAnimationFrame(tick); return; }
      P.time = end; P.pause(); SE.emit('time', {}); return;
    }
    if (P.rate < 0 && t <= 0) { P.time = 0; P.pause(); SE.emit('time', {}); return; }
    P.time = Math.max(0, t);
    SE.emit('time', {});
    raf = requestAnimationFrame(tick);
  }
  function restart() { t0 = P.time; perf0 = performance.now(); startAudio(); }

  P.play = function (rate = 1) {
    const r = P.range();
    if (rate > 0 && P.time >= (P.loop ? r.b : Math.max(r.d, r.b)) - 1e-3) P.time = P.loop ? r.a : 0;
    if (rate > 0 && P.loop && (P.time < r.a || P.time > r.b)) P.time = r.a;
    P.rate = rate; P.playing = true;
    audioCtx();
    restart();
    SE.emit('transport', {});
    if (!raf) raf = requestAnimationFrame(tick);
  };
  P.pause = function () {
    if (!P.playing) return;
    P.time = U.snapFrame(clock(), SE.doc.fps) || P.time;
    P.playing = false; P.rate = 0;
    AM.stop(nodes); nodes = [];
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    SE.emit('transport', {}); SE.emit('time', {});
  };
  P.toggle = () => (P.playing ? P.pause() : P.play(1));
  /** J/L: each press doubles the speed in that direction (1, 2, 4, 8). */
  P.shuttle = function (dir) {
    let r = P.playing ? P.rate : 0;
    if (dir > 0) r = r <= 0 ? 1 : Math.min(8, r * 2);
    else r = r >= 0 ? -1 : Math.max(-8, r * 2);
    P.time = P.playing ? clock() : P.time;
    P.play(r);
  };
  P.seek = function (t, opts = {}) {
    const max = Math.max(M.duration(SE.doc), 0) + 60;
    P.time = U.clamp(isFinite(t) ? t : 0, 0, max);
    if (P.playing) restart();
    SE.emit('time', opts);
  };
  P.step = function (n) {
    if (P.playing) P.pause();
    const f = SE.doc.fps;
    P.seek(Math.max(0, Math.round(P.time * f + n) / f));
  };
  /** Edits during playback: reschedule the sound from here. */
  SE.on('change', () => { if (P.playing && P.rate === 1) { P.time = clock(); restart(); } else if (!P.playing) SE.emit('time', {}); });
  SE.on('doc', () => { P.pause(); });
})();
