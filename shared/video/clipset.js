/* Shared video core (window.SlopVideo.clipset): clip settings, split into photos and video.
   Photos: how long each shows ('cut' = the cut's length, 'fixed' seconds, or 'range': a random length between min and
   max, drawn from the plan's rng), a window in the reel (from, to; to 0 = the end), and an entrance and exit (none, fade
   or slide, 0.5 s each). Video: 'full' (from the start, up to the cut), 'trim' (from start to stop), 'speed' (from the
   start at a set speed), or 'loop' (repeats until the slot ends). Defaults come from the options (photo, video); an
   override per clip ('m:<media id>') or per slot ('s:<slot>') replaces the defaults for that item. Pure. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const CS = (SV.clipset = {});

  const IDS = { SHOW: ['cut', 'fixed', 'range'], EDGE: ['none', 'fade', 'slide'], VMODE: ['full', 'trim', 'speed', 'loop'] };
  /** SHOW, EDGE, VMODE: [[id, label]] in the chosen language (getters; labels ui.video.show / edge / vmode). */
  for (const name of Object.keys(IDS)) Object.defineProperty(CS, name, { enumerable: true, get: () => SV.words(name.toLowerCase(), IDS[name]) });
  CS.EDGE_SECONDS = 0.5;
  const num = (v, lo, hi, d) => { const n = +v; return Number.isFinite(n) && v !== '' && v != null ? Math.min(hi, Math.max(lo, n)) : d; };
  const pick = (v, list, d) => (list.some((k) => (Array.isArray(k) ? k[0] : k) === v) ? v : d);

  /** Photo settings, checked and defaulted. */
  CS.photo = (o = {}) => {
    const min = num(o.min, 0.2, 120, 2), max = num(o.max, 0.2, 120, 4);
    return {
      show: pick(o.show, CS.SHOW, 'cut'), sec: num(o.sec, 0.2, 120, 3), min: Math.min(min, max), max: Math.max(min, max),
      from: num(o.from, 0, 1e6, 0), to: num(o.to, 0, 1e6, 0), enter: pick(o.enter, CS.EDGE, 'none'), exit: pick(o.exit, CS.EDGE, 'none')
    };
  };
  /** Video settings, checked and defaulted. */
  CS.video = (o = {}) => ({ mode: pick(o.mode, CS.VMODE, 'full'), start: num(o.start, 0, 1e6, 0), stop: num(o.stop, 0, 1e6, 0), speed: num(o.speed, 0.1, 8, 1) });

  /** Seconds into the clip at elapsed seconds on the slot (dur: the clip's length; 0 or Infinity for stills). */
  CS.videoTime = function (v, elapsed, dur) {
    const len = dur > 0 && isFinite(dur) ? dur : Infinity, e = Math.max(0, elapsed);
    if (v.mode === 'trim') { const end = v.stop > v.start ? Math.min(v.stop, len) : len; return Math.min(v.start + e, end); }
    if (v.mode === 'speed') return Math.min(e * v.speed, len);
    if (v.mode === 'loop') return isFinite(len) ? e % len : e;
    return Math.min(e, len);
  };
  /**
   * Applies the settings to one planned item (mutates and returns it). m: the bin item; opt: the plan options
   * (photo, video, overrides); rng: the plan's generator (used only for a random photo range).
   */
  CS.apply = function (it, m, opt, rng) {
    const ov = opt.overrides || {}, ent = ov['m:' + m.id] || ov['s:' + it.slot] || {};
    if (m.kind === 'image') {
      const p = CS.photo(Object.assign({}, opt.photo || {}, ent.photo || {}));
      let show = it.dur;
      if (p.show === 'fixed') show = p.sec;
      else if (p.show === 'range') show = Math.round((p.min + (p.max - p.min) * rng()) * 100) / 100;
      it.dur = show;
      it.from = p.from; it.to = p.to > 0 ? p.to : null;
      it.enter = p.enter; it.exit = p.exit;
      it.in = 0;
    } else {
      const v = CS.video(Object.assign({}, opt.clipVideo || {}, ent.video || {}));
      it.vset = v;
      it.in = v.mode === 'trim' ? Math.min(v.start, Math.max(0, (m.dur || 0) - it.dur)) : 0;
    }
    return it;
  };
})();
