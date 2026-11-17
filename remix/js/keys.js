/* Reel Remix: keyframes of a slot. The keyframe row under the preview edits the selected slot of the cut at the playhead
   (state.kslot, the slot number; the first slot when that one is not in the cut). Keys are stored per cut and slot in
   state.keys (shared/video/keys.js does the maths); times are seconds from the slot's start, inside its window (start to
   hold). Every change here only edits state: the preview and the export read the keys when they draw. Exposes RM.keys. */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo, KF = SV.keys;
  const K = (RM.keys = {});

  /** Index of the cut showing at time t (the last cut at the very end), or -1 when there is no plan. */
  K.cutAt = function (t) {
    const plan = RM.state.plan;
    if (!plan || !plan.cuts.length) return -1;
    let ci = -1;
    plan.cuts.forEach((beat, i) => { if (beat.length && t >= beat[0].start && t < beat[0].start + beat[0].dur + 1e-6) ci = i; });
    return ci < 0 && t >= plan.total - 1e-6 ? plan.cuts.length - 1 : ci;
  };
  /** Length of a slot's window (start to hold) in seconds: the range keys can use. */
  K.span = (it) => (it.hold != null ? it.hold : it.start + it.dur) - it.start;
  /** The selected slot: { ci, item, keys, span } for the cut at the playhead, or null. */
  K.current = function () {
    const st = RM.state, ci = K.cutAt(RM.preview.t), beat = ci >= 0 ? st.plan.cuts[ci] : null;
    if (!beat || !beat.length) return null;
    const item = beat.find((x) => x.slot === st.kslot) || beat[0];
    st.kslot = item.slot;
    return { ci, item, keys: KF.get(st.keys, ci, item.slot), span: K.span(item) };
  };
  /** Stores keys for the current slot and keeps the selection inside the list. */
  function store(cur, keys) {
    RM.state.keys = KF.put(RM.state.keys, cur.ci, cur.item.slot, keys);
    RM.state.selKey = Math.max(0, Math.min(RM.state.selKey, keys.length - 1));
    return keys;
  }
  /** Select key i of the current slot (for the editor and Delete). */
  K.select = (i) => { RM.state.selKey = i; };
  /** Add a key at the playhead, holding the pose the slot has there (so adding a key changes nothing on screen). */
  K.addAtPlayhead = function () {
    const cur = K.current();
    if (!cur) return false;
    const local = Math.max(0, Math.min(cur.span, RM.preview.t - cur.item.start));
    const pose = KF.pose(cur.keys, local) || KF.POSE;
    const keys = store(cur, KF.addAt(cur.keys, local, pose, 'linear'));
    RM.state.selKey = keys.findIndex((k) => Math.abs(k.t - local) < 0.002);
    return true;
  };
  /** Move key i of the current slot to time t (kept between its neighbours and inside the slot). */
  K.move = function (i, t) {
    const cur = K.current();
    if (!cur || !cur.keys[i]) return false;
    store(cur, KF.move(cur.keys, i, t, cur.span));
    return true;
  };
  K.remove = function (i) {
    const cur = K.current();
    if (!cur || !cur.keys[i]) return false;
    store(cur, KF.remove(cur.keys, i));
    return true;
  };
  K.setEase = function (i, ease) {
    const cur = K.current();
    if (!cur || !cur.keys[i]) return false;
    store(cur, KF.setEase(cur.keys, i, ease));
    return true;
  };
  /** Animate in: writes the preset's keys for the first half second of the current slot. A library motion preset writes
   * its own keys (SlopPresets.motion.toRemixKeys); the built-in names keep the KF.ANIMATE keys. */
  K.animateIn = function (name) {
    const cur = K.current();
    if (!cur) return false;
    const lib = window.SlopPresets, p = lib && !KF.ANIMATE.some((a) => a[0] === name) ? lib.get(name) : null;
    if (p && p.kind === 'motion') {
      const fresh = lib.motion.toRemixKeys(p.params, cur.span).map((k) => KF.make(k.t, k.pose, k.ease));
      const end = fresh.length ? fresh[fresh.length - 1].t : 0;
      store(cur, fresh.concat(KF.sort(cur.keys).filter((k) => k.t > end + 0.001)));
    } else store(cur, KF.animateIn(cur.keys, name, cur.span));
    RM.state.selKey = 0;
    return true;
  };
  /** The slot's keys as a motion preset's params (x, y, scale, rot, opacity; times in seconds). Null with no keys. */
  K.motionParams = function (keys) {
    const lib = window.SlopPresets, ks = KF.sort(keys);
    if (!lib || !ks.length) return null;
    const tracks = {};
    for (const prop of ['x', 'y', 'scale', 'rot', 'opacity']) {
      tracks[prop] = ks.map((k) => ({ t: k.t, value: k[prop], ease: KF.EASE_MAP[k.ease] || 'linear' }));
    }
    return lib.motion.make(Math.max(ks[ks.length - 1].t, 0.05), tracks);
  };
  /** Reset: removes every key of the current slot. */
  K.reset = function () {
    const cur = K.current();
    if (!cur) return false;
    store(cur, []);
    return true;
  };
})();
