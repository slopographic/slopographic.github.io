/* Slop Slides: slide transitions. A slide's `transition` is { name, duration }: name is one of SlopMotion's transition
   names (the engine owns the keyframes), duration is seconds from 0.2 to 3. The transition plays when the slide is
   entered in Present mode. Exposes window.SS.anim.transitionOf, names, clampDuration and the menu labels. */
(function () {
  'use strict';
  var SS = window.SS, MO = window.SlopMotion;
  var ANIM = SS.anim = SS.anim || {};
  ANIM.DUR_MIN = 0.2;
  ANIM.DUR_MAX = 3;
  ANIM.DUR_DEFAULT = 0.6;
  var LABELS = { none: 'None', fade: 'Fade', 'push-left': 'Push left', 'push-right': 'Push right', 'push-up': 'Push up', // i18n-ignore
    'push-down': 'Push down', wipe: 'Wipe', 'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out', cube: 'Cube' }; // i18n-ignore

  /** The engine's transition names, sorted. */
  ANIM.transitionNames = function () { return MO.transitions.names(); };
  ANIM.transitionLabel = function (name) { return LABELS[name] || name; };
  /** Seconds, rounded to a tenth and held in [0.2, 3]. Anything that is not a number becomes the default. */
  ANIM.clampDuration = function (d) {
    d = Number(d);
    if (!isFinite(d)) return ANIM.DUR_DEFAULT;
    return Math.round(Math.max(ANIM.DUR_MIN, Math.min(ANIM.DUR_MAX, d)) * 10) / 10;
  };
  /** The slide's transition as valid data: { name, duration }. Unknown names fall back to 'none'. */
  ANIM.transitionOf = function (slide) {
    var t = (slide && slide.transition) || {}, names = ANIM.transitionNames();
    return { name: names.indexOf(t.name) >= 0 ? t.name : 'none', duration: ANIM.clampDuration(t.duration) };
  };
})();
