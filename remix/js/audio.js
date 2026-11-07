/* Reel Remix: the reel's sound. Music is one track under the whole reel (a bin video's sound, or a music file the
   person picked), played from the playhead and faded out over the last AU.FADE seconds. Original sound: each video
   plays its own sound while its cut is on screen. The same elements feed the export: a media element is routed once
   through a Web Audio node that goes to the speakers and to a MediaStream the export records. Audio is off when the
   plan's audio mode is 'off'. */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo, AU = SV.audio;
  const A = (RM.audio = { ctx: null, dest: null, nodes: new WeakMap(), els: new Map() });

  /** The Web Audio context and the export destination, made on first use (inside a click). Null without Web Audio. */
  A.ensure = function () {
    if (!A.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      A.ctx = new C();
      A.dest = A.ctx.createMediaStreamDestination();
    }
    if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
    return A.ctx;
  };
  /** The media element's source node, routed to the speakers and to the export stream (once per element). */
  A.node = function (el) {
    const ctx = A.ensure();
    if (!ctx) return null;
    let n = A.nodes.get(el);
    if (!n) { n = ctx.createMediaElementSource(el); n.connect(ctx.destination); n.connect(A.dest); A.nodes.set(el, n); }
    return n;
  };
  /** The music element of a plan: a bin video's sound, or the picked file. Null when the reel has no music. */
  A.track = function (plan) {
    const a = plan && plan.audio;
    if (!a || a.mode !== 'music' || !a.track) return null;
    const src = a.track === 'file' ? (RM.state.music && RM.state.music.url) : ((RM.state.items.find((x) => x.id === a.track) || {}).url);
    if (!src) return null;
    let el = A.els.get(a.track);
    if (!el || el.src !== src) { el = new Audio(src); el.preload = 'auto'; A.els.set(a.track, el); }
    return el;
  };
  /** Fade the music: full volume, falling to 0 over the last AU.FADE seconds. */
  A.tick = function (plan, t, total) {
    const el = A.track(plan);
    if (el) el.volume = Math.max(0, Math.min(1, (total - t) / AU.FADE));
  };
  /** Playback from t (the preview's Play). Original sound is handled by the preview's video elements. */
  A.start = function (plan, t, total) {
    const el = A.track(plan);
    if (el) { try { el.currentTime = Math.min(t, el.duration || t); } catch (e) { /* not loaded yet */ } el.play().catch(() => {}); A.tick(plan, t, total); }
  };
  /** Stop every music element. */
  A.stop = function () { for (const el of A.els.values()) el.pause(); };
  /** Seek the music while it plays. */
  A.seek = function (plan, t) { const el = A.track(plan); if (el) { try { el.currentTime = t; } catch (e) { /* not loaded yet */ } } };
})();
