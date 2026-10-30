/* SlopPresets motion: turns a motion preset's keys into what each app's timeline stores. Values are sampled and eased by
 * SlopMotion (shared/motion), never here, so the engine stays the one place that moves things. Needs window.SlopMotion.
 * A motion preset's params are { duration, tracks } with x and y as frame fractions, scale, rot (degrees), opacity.
 *   toSlides / applyToTimeline  Slop Slides: SlopMotion timeline tracks in px (translateX, translateY, scale, rotate, opacity)
 *   toCut                       Slop Cut: clip anim keys (x, y in px; scale, rot, opacity as stored)
 *   toRemixKeys                 Reel Remix: slot keys with a pose { x, y, scale, rot, opacity }
 *   make / scaleTime            build params from parts (for "Save as preset")
 * Classic script. Exposes window.SlopPresets.motion. */
(function (g) {
  'use strict';
  const SP = (g.SlopPresets = g.SlopPresets || {});
  const MO = () => g.SlopMotion;
  const NEUTRAL = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 };
  const FRAME = { w: 960, h: 540 };
  const round = (v) => Math.round(v * 1e6) / 1e6;
  /** SlopMotion property for each preset track (Slides). */
  const SLIDES_PROP = { x: 'translateX', y: 'translateY', scale: 'scale', rot: 'rotate', opacity: 'opacity' };

  /** The pose of the preset at time t seconds (a track holds its end value; a missing track is neutral). */
  function pose(params, t) {
    const out = {};
    for (const p of Object.keys(NEUTRAL)) {
      const keys = params.tracks[p];
      out[p] = keys && keys.length ? MO().track.sample(keys, t) : NEUTRAL[p];
    }
    return out;
  }
  /** Keys of one track as SlopMotion keys, each value mapped by fn; key times shifted by at and stretched by ts. */
  function mapKeys(keys, fn, at, ts, cut) {
    const out = [];
    for (const k of keys) {
      const t = round(at + k.t * ts);
      if (cut !== undefined && k.t > cut) break;
      out.push(Object.assign({ t, value: fn(k.value) }, k.ease !== undefined ? { ease: k.ease } : {}));
    }
    return out;
  }
  /** Slides: the SlopMotion tracks for target, placed at opts.at and stretched by opts.timeScale; frame is the slide size.
   * Returns { end, props } where props is { translateX: keys, ... } and end is the time the last key lands. */
  function toSlides(params, opts = {}) {
    const at = opts.at === undefined ? 0 : opts.at, ts = opts.timeScale === undefined ? 1 : opts.timeScale;
    const frame = opts.frame || FRAME, props = {};
    for (const p of Object.keys(params.tracks)) {
      const scale = p === 'x' ? frame.w : p === 'y' ? frame.h : 1;
      props[SLIDES_PROP[p]] = mapKeys(params.tracks[p], (v) => round(v * scale), at, ts);
    }
    return { end: round(at + params.duration * ts), props };
  }
  /** A new SlopMotion timeline with the preset on target. Same rules as SlopMotion's presets.apply: it replaces the
   * properties the preset animates on that target and grows the duration when needed. Pure. */
  function applyToTimeline(tl, params, target, opts = {}) {
    const r = toSlides(params, opts);
    const tracks = { ...tl.tracks, [target]: { ...(tl.tracks[target] || {}), ...r.props } };
    return MO().timeline.assertValid({ ...tl, duration: Math.max(tl.duration, r.end), tracks });
  }
  /** Cut: clip anim keys (clip-relative seconds) for a clip of length dur in a frame of W x H px, cut to the first
   * `dur` seconds. A track cut short gets a key at its neutral value at the cut, so the clip settles. */
  function toCut(params, W, H, dur) {
    const D = Math.min(params.duration, dur), out = {};
    const px = { x: W, y: H };
    for (const p of Object.keys(params.tracks)) {
      const scale = px[p] || 1;
      const keys = mapKeys(params.tracks[p], (v) => round(v * scale), 0, 1, D);
      if (params.duration > D) keys.push({ t: round(D), value: NEUTRAL[p], ease: 'linear' });
      out[p] = keys;
    }
    return out;
  }
  /** Reel Remix: keys for the first `slot` seconds of a slot. The preset's duration is fitted to the slot; the key
   * times are the preset's own key times (scaled), so the pose at each one matches SlopMotion's sample. */
  function toRemixKeys(params, slot) {
    const D = Math.min(params.duration, slot), s = D / params.duration;
    const times = [...new Set([0, params.duration].concat(...Object.values(params.tracks).map((ks) => ks.map((k) => k.t))))].sort((a, b) => a - b);
    return times.filter((t) => t <= params.duration + 1e-9).map((t) => {
      const ease = easeFor(params, t);
      const p = pose(params, t);
      for (const k of Object.keys(p)) p[k] = round(p[k]);
      return { t: round(t * s), pose: p, ease };
    });
  }
  /** Remix eases: the segment starting at the key with the same family (linear when unknown). */
  function easeFor(params, t) {
    for (const ks of Object.values(params.tracks)) {
      const k = ks.find((q) => Math.abs(q.t - t) < 1e-9);
      if (k && k.ease) return k.ease.startsWith('easeInOut') ? 'easeInOut' : k.ease.startsWith('easeIn') ? 'easeIn' : k.ease.startsWith('easeOut') ? 'easeOut' : 'linear';
    }
    return 'linear';
  }
  /** Params from parts: duration in seconds and tracks (frame fractions for x and y). Not validated; SlopPresets.save does that. */
  function make(duration, tracks) { return { duration: round(duration), tracks: JSON.parse(JSON.stringify(tracks)) }; }
  /** Params with every time (and duration) multiplied by ts: how a preset plays when an object stretches it. */
  function scaleTime(params, ts) {
    const tracks = {};
    for (const p of Object.keys(params.tracks)) tracks[p] = params.tracks[p].map((k) => Object.assign({}, k, { t: round(k.t * ts) }));
    return make(params.duration * ts, tracks);
  }

  SP.motion = { pose, toSlides, applyToTimeline, toCut, toRemixKeys, make, scaleTime, NEUTRAL, FRAME };
})(typeof window !== 'undefined' ? window : globalThis);
