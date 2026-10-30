/* Slop Slides: object animations. An object's `anims` is a list of { id, preset, trigger, at, timeScale }:
   preset is a SlopMotion preset name, trigger is 'with' (starts with the previous animation on the slide) or 'click'
   (starts the next build), at is the delay in seconds and timeScale stretches the preset (duration = preset duration
   x timeScale). plan(slide) lays the slide's animations out as build steps on one SlopMotion timeline, and stateAt(plan, t)
   gives each animated object its opacity and transform at time t, composed with the engine's sampler. The editor never
   interpolates: every value comes from SlopMotion. Exposes window.SS.anim (see also transition.js and migrate.js). */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util, MO = window.SlopMotion;
  var ANIM = SS.anim = SS.anim || {};
  ANIM.TRIGGERS = [['with', 'With previous'], ['click', 'On click']]; // i18n-ignore
  ANIM.TS_MIN = 0.1;
  ANIM.TS_MAX = 10;
  var num = function (v, lo, hi, dflt) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt; };

  /** Preset list for menus: [{name, label, duration}]. */
  /** The shared library (built-ins and the person's own motion presets) when it is on the page, else SlopMotion's own. */
  var lib = function () { return window.SlopPresets || null; };
  var libPreset = function (name) { var L = lib(), p = L && L.get(name); return p && p.kind === 'motion' ? p : null; };
  /** Motion presets for menus: [{name, label, duration}]. */
  ANIM.presets = function () {
    var L = lib();
    return L ? L.list({ kind: 'motion', app: 'slides' }).map(function (p) { return { name: p.id, label: p.label, duration: p.params.duration }; }) : MO.presets.list();
  };
  ANIM.presetDuration = function (name) { var p = libPreset(name); return p ? p.params.duration : MO.presets.get(name).duration; };
  /** Seconds an animation takes (its preset duration stretched by timeScale). */
  ANIM.duration = function (a) { return ANIM.presetDuration(a.preset) * a.timeScale; };
  /** A new animation for `preset`, starting with the previous one (or on click). */
  ANIM.make = function (preset, trigger) {
    return { id: U.uid('a'), preset: preset, trigger: trigger === 'click' ? 'click' : 'with', at: 0, timeScale: 1 };
  };
  /** Keeps an animation list valid: unknown presets are dropped, numbers are clamped. Used when a file is read. */
  ANIM.cleanList = function (list) {
    var known = {};
    ANIM.presets().forEach(function (p) { known[p.name] = true; });
    return (Array.isArray(list) ? list : []).filter(function (a) { return a && typeof a === 'object' && known[a.preset]; }).map(function (a) {
      return { id: typeof a.id === 'string' && a.id ? a.id : U.uid('a'), preset: a.preset, trigger: a.trigger === 'click' ? 'click' : 'with',
        at: num(a.at, 0, 60, 0), timeScale: num(a.timeScale, ANIM.TS_MIN, ANIM.TS_MAX, 1) };
    });
  };

  /**
   * The slide's build plan. Animations are visited in z-order, then list order. A 'with' animation starts when the one
   * before it starts (plus its delay). An 'on click' animation begins a new step at the end of the previous step.
   * steps[0] plays when the slide opens, unless it begins with a click. Each step: { from, to, click, items }.
   * Returns { steps, tl (SlopMotion timeline), end, clicks, byObj: { objId: { cx, cy, targets: [] } } }.
   */
  /** Places a preset on the timeline: a library preset through its frame-aware conversion, a SlopMotion name as before. */
  function applyMotion(tl, name, target, opts) {
    var p = libPreset(name);
    return p ? lib().motion.applyToTimeline(tl, p.params, target, opts) : MO.presets.apply(tl, name, target, opts);
  }
  ANIM.plan = function (slide, frame) {
    var tl = MO.timeline.create({ duration: 0 }), steps = [{ from: 0, to: 0, click: false, items: [] }], byObj = {};
    var prev = 0;
    slide.objects.forEach(function (o) {
      (o.anims || []).forEach(function (a) {
        var cur = steps[steps.length - 1], base;
        if (a.trigger === 'click') {
          if (cur.items.length) { cur = { from: cur.to, to: cur.to, click: true, items: [] }; steps.push(cur); }
          else cur.click = true;
          base = cur.from;
        } else base = prev;
        var start = base + a.at, dur = ANIM.duration(a), target = o.id + '#' + a.id;
        tl = applyMotion(tl, a.preset, target, { at: start, timeScale: a.timeScale, frame: frame });
        cur.items.push({ id: a.id, target: target, start: start, end: start + dur });
        cur.to = Math.max(cur.to, start + dur);
        prev = start;
        if (!byObj[o.id]) byObj[o.id] = { cx: o.x + o.w / 2, cy: o.y + o.h / 2, targets: [] };
        byObj[o.id].targets.push(target);
      });
    });
    return { steps: steps, tl: tl, end: tl.duration, clicks: steps.filter(function (s) { return s.click; }).length, byObj: byObj };
  };

  /**
   * The state of every animated object at time t of the plan: { objId: { opacity, m } }, where m is the slide-space
   * matrix the scene applies after the object's own transform. Several animations on one object compose: opacity and
   * scale multiply, offsets and rotations add (every preset ends at its identity values, so a finished animation
   * leaves the object as it was). Before an animation starts, its first key holds, so a fade-in is hidden.
   */
  ANIM.stateAt = function (plan, t) {
    var samp = MO.timeline.sample(plan.tl, t), out = {};
    Object.keys(plan.byObj).forEach(function (id) {
      var g = plan.byObj[id], op = 1, sc = 1, tx = 0, ty = 0, rot = 0;
      g.targets.forEach(function (target) {
        var p = samp[target] || {};
        if (p.opacity != null) op *= p.opacity;
        if (p.scale != null) sc *= p.scale;
        if (p.translateX != null) tx += p.translateX;
        if (p.translateY != null) ty += p.translateY;
        if (p.rotate != null) rot += p.rotate;
      });
      var m = U.mat.mul(U.mat.translate(g.cx + tx, g.cy + ty),
        U.mat.mul(U.mat.rotate(rot), U.mat.mul(U.mat.scale(sc, sc), U.mat.translate(-g.cx, -g.cy))));
      out[id] = { opacity: Math.max(0, op), m: m };
    });
    return out;
  };
})();
