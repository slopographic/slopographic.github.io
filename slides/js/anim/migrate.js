/* Slop Slides: file migration to schema version 2 (transitions and object animations). A version 1 deck had
   slide.transition = { type, dir, dur } (never played) and slide.builds = [{ obj, effect, trigger, delay, dur }]
   (never played). Migration maps transitions to the engine's names and turns each build into an animation on its
   object, then drops `builds`. Files that already have version 2 are left alone. Exposes SS.anim.migrateDeck. */
(function () {
  'use strict';
  var SS = window.SS, O = SS.objects, MO = window.SlopMotion;
  var ANIM = SS.anim = SS.anim || {};
  ANIM.SCHEMA = 2;
  var TYPES = { none: 'none', fade: 'fade', dissolve: 'fade', magic: 'fade', wipe: 'wipe', zoom: 'zoom-in', cube: 'cube' };
  var EFFECTS = { fade: 'fade-in', scale: 'pop', grow: 'pop', zoom: 'pop', fly: 'slide-up', wipe: 'fade-in' };
  var DIRS = ['left', 'right', 'up', 'down'];

  /** A version 1 transition as { name, duration }. */
  ANIM.legacyTransition = function (t) {
    t = t || {};
    var dir = DIRS.indexOf(t.dir) >= 0 ? t.dir : 'left', name;
    if (t.type === 'push' || t.type === 'slide') name = 'push-' + dir;
    else name = TYPES[t.type] || 'none';
    return { name: name, duration: ANIM.clampDuration(t.dur) };
  };

  /** Converts one version 1 build into an animation on its object (the paragraph split is not kept). */
  function buildToAnim(b) {
    var preset = EFFECTS[b.effect] || 'fade-in', dur = Number(b.dur);
    var ts = dur > 0 ? dur / MO.presets.get(preset).duration : 1;
    return { preset: preset, trigger: b.trigger === 'click' ? 'click' : 'with', at: Number(b.delay) || 0, timeScale: ts };
  }

  /** Migrates a parsed deck in place. Returns it. */
  ANIM.migrateDeck = function (d) {
    if (!d || (d.version || 1) >= ANIM.SCHEMA) return d;
    d.slides.forEach(function (s) {
      if (!s.transition || s.transition.name === undefined) s.transition = ANIM.legacyTransition(s.transition);
      (s.builds || []).forEach(function (b) {
        var target = O.find(s, b.obj);
        if (!target) return;
        var a = buildToAnim(b);
        a.id = (typeof b.id === 'string' && b.id) || SS.util.uid('a');
        target.anims = (target.anims || []).concat([a]);
      });
      delete s.builds;
    });
    d.version = ANIM.SCHEMA;
    return d;
  };
})();
