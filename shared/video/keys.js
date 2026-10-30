/* Shared video core (window.SlopVideo.keys): keyframes for one slot of a cut. A key is a whole pose at a time:
   { t, x, y, scale, rot, opacity, ease } where t is seconds from the slot's start (0 to the slot's length), x and y
   are offsets as fractions of the cell (0 is centred), scale is 1 for the natural size, rot is degrees and opacity is
   0 to 1. ease belongs to the segment that starts at the key: 'linear', 'easeIn', 'easeOut' or 'easeInOut' (mapped to
   SlopMotion's quad easings). pose() samples each property with SlopMotion.track, so interpolation and easing are the
   shared engine's, not new code. A store is a list of { cut, slot, keys } for the plan's cuts (see get, put, prune).
   Pure: nothing here mutates its input. Needs window.SlopMotion (easing.js and track.js) loaded first, and seed.js for the list labels. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const KF = (SV.keys = {});
  const M = () => root.SlopMotion.track;

  /** Our ease names to SlopMotion easing names. */
  KF.EASE_MAP = { linear: 'linear', easeIn: 'easeInQuad', easeOut: 'easeOutQuad', easeInOut: 'easeInOutQuad' };
  KF.POSE = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 };
  KF.LIMITS = { x: [-2, 2], y: [-2, 2], scale: [0.1, 4], rot: [-720, 720], opacity: [0, 1] };
  /** Keys of the Animate in presets: the pose the slot starts from (the end is KF.POSE). */
  const POSES = [['fade', { opacity: 0 }], ['left', { x: -1 }], ['right', { x: 1 }], ['top', { y: -1 }], ['bottom', { y: 1 }], ['zoom', { scale: 0.5 }]];
  /** EASES [[id, label]] and ANIMATE [[id, label, pose]] in the chosen language (getters; labels ui.video.ease / anim,
   *  through SlopVideo.word in seed.js). */
  Object.defineProperty(KF, 'EASES', { enumerable: true, get: () => SV.words('ease', Object.keys(KF.EASE_MAP)) });
  Object.defineProperty(KF, 'ANIMATE', { enumerable: true, get: () => POSES.map(([id, pose]) => [id, SV.word('anim', id), pose]) });
  KF.ANIM_SECONDS = 0.5;
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

  /** A pose with every field a finite number inside its limit (missing fields take the default). */
  KF.clampPose = function (p = {}) {
    const out = {};
    for (const k of Object.keys(KF.POSE)) {
      const v = Number.isFinite(p[k]) ? p[k] : KF.POSE[k];
      out[k] = clamp(v, KF.LIMITS[k]);
    }
    return out;
  };
  /** A key from a time, a pose and an ease. */
  KF.make = (t, pose, ease = 'linear') => ({ t: Math.max(0, +t || 0), ...KF.clampPose(pose), ease: KF.EASE_MAP[ease] ? ease : 'linear' });
  /** Keys ordered by t (a copy). */
  KF.sort = (keys) => (keys || []).slice().sort((a, b) => a.t - b.t);
  /** The keys of a slot (cut, slot) in a store, or []. */
  KF.get = (store, cut, slot) => ((store || []).find((e) => e.cut === cut && e.slot === slot) || { keys: [] }).keys;
  /** A new store with the slot's keys replaced; an empty list removes the slot's entry. */
  KF.put = function (store, cut, slot, keys) {
    const rest = (store || []).filter((e) => !(e.cut === cut && e.slot === slot));
    return keys && keys.length ? rest.concat([{ cut, slot, keys: KF.sort(keys) }]) : rest;
  };
  /** A new store without the entries for cuts that the plan no longer has. */
  KF.prune = (store, cutCount) => (store || []).filter((e) => e.cut < cutCount && e.keys && e.keys.length);
  /** Adds a key at time t (replacing a key within 1 ms of it). Returns the new key list. */
  KF.addAt = function (keys, t, pose, ease) {
    const k = KF.make(t, pose, ease);
    return KF.sort((keys || []).filter((x) => Math.abs(x.t - k.t) > 0.001).concat([k]));
  };
  /** Moves key i to time t, kept between its neighbours and inside [0, dur]. Returns the new list. */
  KF.move = function (keys, i, t, dur) {
    const list = KF.sort(keys);
    const prev = list[i - 1], next = list[i + 1];
    const lo = prev ? prev.t + 0.01 : 0, hi = Math.min(dur, next ? next.t - 0.01 : dur);
    list[i] = Object.assign({}, list[i], { t: Math.min(Math.max(t, lo), Math.max(lo, hi)) });
    return list;
  };
  KF.remove = (keys, i) => KF.sort(keys).filter((_, j) => j !== i);
  KF.setEase = (keys, i, ease) => KF.sort(keys).map((k, j) => (j === i && KF.EASE_MAP[ease] ? Object.assign({}, k, { ease }) : k));

  /**
   * The pose of a slot at local time t (seconds from the slot's start). Null when there are no keys (the clip is
   * drawn as usual). Before the first key and after the last the end poses hold.
   */
  KF.pose = function (keys, t) {
    if (!keys || !keys.length) return null;
    const tr = M(), ease = (k) => KF.EASE_MAP[k.ease] || 'linear';
    const one = (f) => tr.sample(keys.map((k) => ({ t: k.t, value: f(k), ease: ease(k) })), t);
    const pos = one((k) => [k.x, k.y]);
    return { x: pos[0], y: pos[1], scale: one((k) => k.scale), rot: one((k) => k.rot), opacity: one((k) => k.opacity) };
  };
  /**
   * The keys of an Animate in preset: the first KF.ANIM_SECONDS (or the whole slot if shorter) start from the preset's
   * pose and end at the default pose. Keys in that window are replaced; later keys are kept. name is an id in KF.ANIMATE.
   */
  KF.animateIn = function (keys, name, dur) {
    const preset = POSES.find((a) => a[0] === name);
    if (!preset || !(dur > 0)) return KF.sort(keys);
    const end = Math.min(KF.ANIM_SECONDS, dur);
    const later = KF.sort(keys).filter((k) => k.t > end + 0.001);
    return [KF.make(0, Object.assign({}, KF.POSE, preset[1]), 'easeOut'), KF.make(end, KF.POSE, 'linear')].concat(later);
  };
})();
