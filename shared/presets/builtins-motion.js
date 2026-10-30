/* Built-in motion presets (SlopPresets.BUILTIN_MOTION): entrances as plain keyframe data. x and y are fractions of the
 * frame (-1 = one frame away, 1 = one frame below or to the right); rot is in degrees; every preset ends at its rest
 * pose, so it leaves the object as it was. The ids of the Slides presets (fade-in, slide-up, pop, shake, pulse, spin-in)
 * are kept, so saved Slides animations still resolve. Names and descriptions: ui.presets.b.<id> / bd.<id> (builtins()). fractions use the default Slides deck (960 x 540), so slide-up is 40 px and shake 10 px there, as before. */
(function (g) {
  'use strict';
  const SP = (g.SlopPresets = g.SlopPresets || {});
  const motion = (id, duration, tracks) => ({ id, kind: 'motion', apps: ['slides', 'remix', 'slopedit'], params: { duration, tracks } });
  const k = (t, value, ease) => (ease === undefined ? { t, value } : { t, value, ease });

  SP.BUILTIN_MOTION = [
    motion('fade-in', 0.4, { opacity: [k(0, 0, 'easeOutQuad'), k(0.4, 1)] }),
    motion('slide-up', 0.5, {
      y: [k(0, 40 / 540, 'easeOutCubic'), k(0.5, 0)], opacity: [k(0, 0, 'easeOutQuad'), k(0.5, 1)],
    }),
    motion('slide-down', 0.5, {
      y: [k(0, -1, 'easeOutCubic'), k(0.5, 0)], opacity: [k(0, 0, 'easeOutQuad'), k(0.5, 1)],
    }),
    motion('slide-left', 0.5, {
      x: [k(0, -1, 'easeOutCubic'), k(0.5, 0)], opacity: [k(0, 0, 'easeOutQuad'), k(0.5, 1)],
    }),
    motion('slide-right', 0.5, {
      x: [k(0, 1, 'easeOutCubic'), k(0.5, 0)], opacity: [k(0, 0, 'easeOutQuad'), k(0.5, 1)],
    }),
    motion('zoom-in', 0.5, { scale: [k(0, 0.4, 'easeOutCubic'), k(0.5, 1)] }),
    motion('pop', 0.5, {
      scale: [k(0, 0, 'easeOutBack'), k(0.5, 1)], opacity: [k(0, 0), k(0.15, 1)],
    }),
    motion('bounce', 0.6, {
      y: [k(0, -0.5, 'easeOutBounce'), k(0.6, 0)], opacity: [k(0, 0), k(0.15, 1)],
    }),
    motion('shake', 0.5, {
      x: [k(0, 0), k(0.07, -10 / 960), k(0.14, 10 / 960), k(0.21, -8 / 960), k(0.28, 8 / 960), k(0.35, -4 / 960), k(0.42, 4 / 960), k(0.5, 0)],
    }),
    motion('pulse', 0.6, {
      scale: [k(0, 1, 'easeInOutQuad'), k(0.3, 1.08, 'easeInOutQuad'), k(0.6, 1)],
    }),
    motion('spin-in', 0.6, {
      rot: [k(0, -360, 'easeOutCubic'), k(0.6, 0)], scale: [k(0, 0, 'easeOutCubic'), k(0.6, 1)], opacity: [k(0, 0), k(0.2, 1)],
    }),
  ];
})(typeof window !== 'undefined' ? window : globalThis);
