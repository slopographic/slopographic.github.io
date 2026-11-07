/* SlopCut: the random effect layer, pure part. A layer (clip kind 'effect') has fx = { seed, every, intensity,
   types }. Time is cut into cuts of `every` seconds (0 = one cut for the whole layer). Each cut draws one effect
   from the enabled types with SlopVideo.seed, so the same seed, settings and cut always give the same effect.
   Pure: no DOM. Drawing lives in render/fx-draw.js. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SE = (root.SE = root.SE || {});
  const S = root.SlopVideo.seed;
  const FX = (SE.fx = {});

  const TYPE_IDS = ['grain', 'colour', 'glitch', 'zoom', 'vignette'];
  /** [[id, label]]: the shared effect names (ui.video.fx.<id>, SlopVideo.word), read each time. */
  Object.defineProperty(FX, 'TYPES', { enumerable: true, get: () => root.SlopVideo.words('fx', TYPE_IDS) });
  FX.EVERY = [[0, 'Whole clip'], [0.5, 'Every 0.5 s'], [1, 'Every 1 s'], [2, 'Every 2 s'], [4, 'Every 4 s']];

  /** Cut number at layer-relative time u. */
  FX.cutIndex = (fx, u) => (fx.every > 0 ? Math.floor(Math.max(0, u) / fx.every + 1e-9) : 0);

  /** The pick for one cut: { type, amount, k, cut, seed } or null when nothing is enabled or intensity is 0.
      amount (0–1) scales the effect; k (0–1) varies its parameters (hue, glitch slices, pulse rate). */
  FX.pick = function (seed, cut, types, intensity) {
    const on = TYPE_IDS.filter((k) => (types || []).includes(k));
    const level = Math.min(1, Math.max(0, intensity == null ? 0 : intensity));
    if (!on.length || level <= 0) return null;
    const rng = S.rng(S.hash((seed >>> 0) + ':' + cut));
    const type = on[Math.floor(rng() * on.length)];
    const amount = level * (0.5 + 0.5 * rng());
    const k = rng();
    return { type, amount: Math.round(amount * 1000) / 1000, k: Math.round(k * 1000) / 1000, cut, seed: seed >>> 0 };
  };

  /** The effect in force at layer-relative time u. */
  FX.stateAt = function (fx, u) {
    if (!fx) return null;
    return FX.pick(fx.seed, FX.cutIndex(fx, u), fx.types, fx.intensity);
  };
})();
