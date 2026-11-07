/* SlopCut: the audio mix. Schedules every audible clip (track mute/solo, clip volume, keyframes,
   fades, speed) on a WebAudio context. The same graph plays in real time and renders offline for export. */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model;
  const AM = SE.audiomix = {};
  const CURVE_RATE = 60; // envelope points per second

  /** Does this clip need an envelope curve (keyframes or fades)? */
  const shaped = (c) => (c.keys && c.keys.length) || c.afIn > 0 || c.afOut > 0;
  /**
   * Schedule clips from timeline time `from` (optionally until `to`), starting at context time `when`.
   * Returns the source nodes (call AM.stop(nodes) to silence them).
   */
  AM.schedule = function (ctx, dest, p, from, when, to = Infinity) {
    const nodes = [];
    for (const c of p.clips) {
      if (c.kind !== 'audio') continue;
      const tk = M.track(p, c.track);
      if (!tk || !M.trackLive(p, tk)) continue;
      const it = SE.media.get(c.media);
      if (!it || !it.audio) continue;
      const a = Math.max(from, c.start), b = Math.min(M.end(c), to);
      if (b - a < 0.002) continue;
      const off = M.srcAt(c, a);
      if (off >= it.audio.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = it.audio;
      src.playbackRate.value = c.speed;
      const g = ctx.createGain();
      const at = when + (a - from), dur = b - a;
      if (shaped(c)) {
        const n = Math.max(2, Math.ceil(dur * CURVE_RATE) + 1), curve = new Float32Array(n);
        for (let i = 0; i < n; i++) curve[i] = M.gainAt(c, a - c.start + (dur * i) / (n - 1));
        g.gain.setValueAtTime(curve[0], Math.max(0, at));
        try { g.gain.setValueCurveAtTime(curve, Math.max(0, at), dur); } catch (e) { g.gain.value = c.vol; }
      } else g.gain.value = c.vol;
      src.connect(g); g.connect(dest);
      const startAt = Math.max(at, ctx.currentTime);
      src.start(startAt, off + (startAt - at) * c.speed, Math.max(0.001, dur * c.speed));
      nodes.push(src);
    }
    return nodes;
  };
  AM.stop = function (nodes) { for (const n of nodes || []) { try { n.stop(); n.disconnect(); } catch (e) { /* already stopped */ } } };
  /** Render [from, to) to a stereo AudioBuffer. */
  AM.render = async function (p, from, to, sampleRate = 48000) {
    const len = Math.max(1, Math.ceil((to - from) * sampleRate));
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctx(2, len, sampleRate);
    const master = ctx.createGain(); master.connect(ctx.destination);
    AM.schedule(ctx, master, p, from, 0, to);
    return ctx.startRendering();
  };
  /** Does the timeline have any audible audio between from and to? */
  AM.hasAudio = (p, from = 0, to = Infinity) => p.clips.some((c) => c.kind === 'audio' && M.end(c) > from && c.start < to && SE.media.get(c.media) && SE.media.get(c.media).audio && M.trackLive(p, M.track(p, c.track)));
})();
