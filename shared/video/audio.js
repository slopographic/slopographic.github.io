/* Shared video core (window.SlopVideo.audio): the audio choice of a reel. Modes: 'off', 'original' (each video keeps its
   own sound, cut with its slot) and 'music' (one track under the whole reel: a bin clip's sound, or a music file the
   person picks, which the plan records as 'file'). Random music picks a bin video with the seed, so the same seed gives
   the same track. Pure. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const AU = (SV.audio = {});
  const S = SV.seed;

  const MODE_IDS = ['off', 'original', 'music'];
  /** [[id, label]] in the chosen language (a getter; labels ui.video.audio.<id>). */
  Object.defineProperty(AU, 'MODES', { enumerable: true, get: () => SV.words('audio', MODE_IDS) });
  AU.FADE = 2; // seconds of fade-out at the end of the reel
  /**
   * The audio of a plan. o: { mode, track } where track is a bin id for music, or 'random', or 'file' (a picked file).
   * media: the bin items (only videos can supply music). Returns { mode, track } with track a bin id, 'file' or null.
   */
  AU.choose = function (o, seed, media) {
    const mode = MODE_IDS.includes(o && o.mode) ? o.mode : 'off';
    if (mode !== 'music') return { mode, track: null };
    const pool = (media || []).filter((m) => m.kind === 'video' && m.dur > 0).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (o.track === 'file') return { mode, track: 'file' };
    if (o.track && o.track !== 'random') return { mode, track: pool.some((m) => m.id === o.track) ? o.track : null };
    if (!pool.length) return { mode, track: null };
    const i = Math.floor(S.rng((seed ^ 0x5bd1e995) >>> 0)() * pool.length);
    return { mode, track: pool[i].id };
  };
})();
