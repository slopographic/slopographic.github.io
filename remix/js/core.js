/* Reel Remix: state, the plan and the reel manifest. The plan is shared/video (SlopVideo.random.plan), never a
   copy: Remix only chooses the options. The lane (layout switches over time) is the state's lane list; with
   Random on, Remix draws new switch points and replaces the lane with them. Keyframes (keys: per cut and slot, see
   keys.js) and the effect layer (effect, see shared/video/effects.js) are options too. Exposes window.RM. */
(function () {
  'use strict';
  const SV = window.SlopVideo, RM = (window.RM = window.RM || {});
  const S = SV.seed, R = SV.random, P = SV.presets, T = SV.templates, KF = SV.keys, FX = SV.effects;
  RM.GRIDS = ['grid-1x2', 'grid-2x2', 'grid-1x3', 'grid-2x3', 'grid-3x3'];
  /** Text a person reads (remix/i18n, shared/i18n/APPS-HOWTO.md): the key itself when SlopI18n is absent. onLang(fn) runs
     fn after a language change, once the new tables are in. The shared/video lists carry their own labels (ui.video.*). */
  RM.t = (k, v) => { const I = window.SlopI18n; return I ? I.t(k, v) : k; };
  RM.onLang = (fn) => { const I = window.SlopI18n; if (I && I.on) I.on(fn); };
  RM.state = {
    items: [], target: 30, pace: 'medium', preset: 'phone', custom: { w: 1080, h: 1920 },
    base: 'none', random: true, grids: RM.GRIDS.slice(), lane: [], seed: S.make(), plan: null, playhead: 0, fill: 'auto',
    timing: 'same', video: 'through', min: 1, max: 3, stagger: 1, locks: [], audioMode: 'off', audioTrack: 'random', music: null,
    photo: { show: 'cut', sec: 3, min: 2, max: 4, from: 0, to: 0, enter: 'none', exit: 'none' }, clipVideo: { mode: 'full', start: 0, stop: 0, speed: 1 }, overrides: {},
    keys: [], kslot: 0, selKey: 0, effect: Object.assign({}, FX.DEFAULT),
    pending: [] // ids of clips added since the last plan (auto remix and the Remix button's pulse read this)
  };
  /** Functions run with the plan after each new plan (Remix, Reshuffle, Reset all, Randomise). */
  RM.hooks = [];
  RM.onPlan = (fn) => { RM.hooks.push(fn); };
  /** Frame size of the chosen export preset (the sequence size). */
  RM.size = () => P.size(RM.state.preset, RM.state.custom.w, RM.state.custom.h) || { w: 1080, h: 1920 };
  RM.aspect = (size) => { const p = P.get(P.idFor(size.w, size.h)); return p ? p.aspect : '16:9'; };
  /** Options for the shared plan, from the state. seed defaults to the state's seed. */
  RM.options = function (seed) {
    const st = RM.state, size = RM.size();
    return {
      seed: seed == null ? st.seed : seed, target: st.target, pace: st.pace, size, aspect: RM.aspect(size),
      tpl: st.base === 'none' ? null : st.base,
      switches: !!st.random, layouts: st.grids.slice(), fill: st.fill,
      timing: st.timing, video: st.video, min: st.min, max: st.max, stagger: st.stagger, locks: st.locks.map((l) => Object.assign({}, l)),
      photo: Object.assign({}, st.photo), clipVideo: Object.assign({}, st.clipVideo), overrides: JSON.parse(JSON.stringify(st.overrides)),
      audio: { mode: st.audioMode, track: st.audioMode === 'music' && st.audioTrack === 'file' && st.music ? 'file' : st.audioTrack },
      segments: !st.random && st.lane.length ? st.lane.map((s) => ({ start: s.start, layout: s.layout })) : null,
      effect: Object.assign({}, st.effect)
    };
  };
  /** Drag type of a bin item (its id is the data). */
  RM.ITEM_MIME = 'application/x-rm-item';
  /** Per-cut fill override: every slot of cut ci uses mode ('auto' means the plan's fill). */
  RM.setCutFill = function (ci, mode) {
    const beat = RM.state.plan && RM.state.plan.cuts[ci];
    if (!beat) return false;
    beat.forEach((x) => { x.fill = mode; });
    return true;
  };
  /** The clip settings as the Options hold them now (photo or video). */
  RM.clipSettings = function () {
    const st = RM.state;
    return { photo: Object.assign({}, st.photo), video: Object.assign({}, st.clipVideo) };
  };
  /** Override the settings for a clip ('m:<media id>') or a slot ('s:<slot>') with the current Options. */
  RM.setOverride = function (key, kind) {
    const cur = RM.state.overrides[key] || {};
    RM.state.overrides[key] = Object.assign({}, cur, { [kind]: kind === 'photo' ? Object.assign({}, RM.state.photo) : Object.assign({}, RM.state.clipVideo) });
    return RM.state.overrides[key];
  };
  /** Remove the override of a clip or slot. */
  RM.clearOverride = function (key) { delete RM.state.overrides[key]; };
  /** Lock or unlock one slot (it keeps its clip through Reshuffle and Remix). */
  RM.toggleLock = function (ci, slot) {
    const beat = RM.state.plan && RM.state.plan.cuts[ci], it = beat && beat.find((x) => x.slot === slot);
    if (!it) return false;
    RM.state.locks = SV.locks.toggle(RM.state.locks, ci, slot, it);
    return true;
  };
  /** Lock or unlock every slot of a cut. */
  RM.toggleCutLock = function (ci) {
    const beat = RM.state.plan && RM.state.plan.cuts[ci];
    if (!beat) return false;
    RM.state.locks = SV.locks.toggleCut(RM.state.locks, ci, beat);
    return true;
  };
  /** A music file the person picked (kept in the reel, not in the bin). */
  RM.setMusic = function (file) {
    if (RM.state.music) URL.revokeObjectURL(RM.state.music.url);
    RM.state.music = { name: file.name, url: URL.createObjectURL(file) };
    RM.state.audioTrack = 'file';
    return RM.state.music;
  };
  /** Put bin item mediaId in slot `slot` of cut ci (the clip keeps the cut's length; a shorter clip holds its last frame). */
  RM.replaceSlot = function (ci, slot, mediaId) {
    const plan = RM.state.plan, m = RM.state.items.find((x) => x.id === mediaId);
    const it = plan && plan.cuts[ci] && plan.cuts[ci].find((x) => x.slot === slot);
    if (!it || !m || m.missing) return false;
    it.media = m.id;
    RM.state.locks = RM.state.locks.map((l) => (l.cut === ci && l.slot === slot ? Object.assign({}, l, { media: m.id, in: 0 }) : l));
    const room = m.kind === 'image' ? Infinity : m.dur - it.dur;
    it.in = room > 0 ? Math.min(it.in, room) : 0;
    return true;
  };
  /** Media the plan may draw from: the loaded items. */
  RM.media = () => RM.state.items.filter((m) => !m.missing && m.kind && (m.kind === 'image' || m.dur > 0));
  /** Build the random edit. With Random on, the drawn switch points become the lane. Returns the plan or null. */
  RM.remix = function () {
    const st = RM.state;
    const plan = R.plan(RM.options(), RM.media());
    st.plan = plan;
    if (plan) {
      st.seed = plan.seed;
      if (st.random) st.lane = plan.segments.filter((s) => s.layout).map((s) => ({ start: s.start, layout: s.layout }));
      st.keys = KF.prune(st.keys, plan.cuts.length); // keys of cuts the new plan does not have are dropped
      st.pending = []; // every clip in the bin is in this plan now
      RM.hooks.forEach((fn) => { try { fn(plan); } catch (e) { console.error('Remix: plan hook failed', e); } });
    }
    return plan;
  };
  /** Reset all: the plan's options go back to their defaults (the clips and the export preset stay). The seed is kept. */
  RM.resetAll = function () {
    const st = RM.state;
    Object.assign(st, {
      target: 30, pace: 'medium', base: 'none', random: true, grids: RM.GRIDS.slice(), lane: [], fill: 'auto',
      timing: 'same', video: 'through', min: 1, max: 3, stagger: 1, locks: [], keys: [], kslot: 0, selKey: 0,
      effect: Object.assign({}, FX.DEFAULT), audioMode: 'off', audioTrack: 'random'
    });
    return RM.remix();
  };
  /** The effect layer: change some of its options and redraw its picks (the cuts are kept). */
  RM.setEffect = function (patch) {
    const st = RM.state;
    st.effect = FX.norm(Object.assign({}, st.effect, patch));
    if (st.plan) st.plan.effect = FX.plan(st.effect, st.plan.cuts, st.plan.seed);
    return st.effect;
  };
  /** A new seed and a new edit with the same options. */
  RM.reshuffle = function () { RM.state.seed = S.make(); return RM.remix(); };
  /** The lane's layout choices (named templates, then grids), as [id, label]. */
  RM.layoutChoices = () => T.list.map((t) => [t.id, t.name]).concat(RM.GRIDS.map((id) => [id, T.get(id).name]));
  /** The Slop Drive manifest that SlopCut opens (format slop-reel, with the remix options). Ids are Drive ids in play order. */
  RM.manifest = function (ids) {
    const o = RM.options();
    return {
      format: 'slop-reel', version: 2, from: 'remix', created: new Date().toISOString(),
      template: 'remix', length: o.target, pace: o.pace, aspect: o.aspect, order: 'selection',
      files: ids.slice(), overlays: [], remix: JSON.parse(JSON.stringify(o)), keys: JSON.parse(JSON.stringify(RM.state.keys))
    };
  };
})();
