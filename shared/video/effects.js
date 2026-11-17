/* Shared video core (window.SlopVideo.effects): the random effect layer, a single layer over the whole reel. The plan
   holds the choice: kind ('none', 'random', or one effect: 'grain', 'colour', 'glitch', 'zoom', 'vignette'), intensity
   (0 to 1) and change ('cut': a new pick at every cut; 'reel': one pick for the whole reel, used for Random only).
   plan() draws the picks from the seed with its own generator (a different salt from the cuts), so the same seed
   gives the same effects, and changing the effect never changes the cuts. Each pick is { kind, seed }: the seed
   drives the effect's own randomness (a hue, glitch frames, grain pattern). Pure: the drawing is in remix/js/fx.js. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const FX = (SV.effects = {});
  const S = SV.seed;
  const SALT = 0x9e3779b9;

  /** The effects Random chooses from. */
  FX.PICKS = ['grain', 'colour', 'glitch', 'zoom', 'vignette'];
  const KIND_IDS = ['none', 'random'].concat(FX.PICKS), CHANGE_IDS = ['cut', 'reel'];
  /** KINDS and CHANGE: [[id, label]] in the chosen language (getters; labels ui.video.fx / change). */
  Object.defineProperty(FX, 'KINDS', { enumerable: true, get: () => SV.words('fx', KIND_IDS) });
  Object.defineProperty(FX, 'CHANGE', { enumerable: true, get: () => SV.words('change', CHANGE_IDS) });
  FX.DEFAULT = { kind: 'none', intensity: 0.5, change: 'cut' };
  /** The label of an effect kind (the kind itself when unknown). */
  FX.name = (kind) => (KIND_IDS.includes(kind) ? SV.word('fx', kind) : kind);

  /** Options checked and defaulted: kind, intensity (0 to 1, two decimals) and change. */
  FX.norm = function (o) {
    const v = o || {};
    const kind = KIND_IDS.includes(v.kind) ? v.kind : FX.DEFAULT.kind;
    const i = Number.isFinite(+v.intensity) && v.intensity !== null ? +v.intensity : FX.DEFAULT.intensity;
    return {
      kind,
      intensity: Math.round(Math.min(1, Math.max(0, i)) * 100) / 100,
      change: CHANGE_IDS.includes(v.change) ? v.change : FX.DEFAULT.change,
    };
  };
  /**
   * The effect layer for a plan's cuts: { kind, intensity, change, picks }, picks one per cut (empty for 'none').
   * Every cut draws its seed in order; Random also draws the kind (once for 'reel', per cut for 'cut').
   */
  FX.plan = function (o, cuts, seed) {
    const e = FX.norm(o), rng = S.rng((seed ^ SALT) >>> 0);
    const n = (cuts || []).length;
    if (e.kind === 'none' || !n) return Object.assign(e, { picks: [] });
    const pick = () => FX.PICKS[Math.floor(rng() * FX.PICKS.length)];
    let shared = e.kind === 'random' && e.change === 'reel' ? pick() : null;
    const picks = [];
    for (let i = 0; i < n; i++) {
      const kind = e.kind !== 'random' ? e.kind : shared || pick();
      picks.push({ kind, seed: (rng() * 4294967296) >>> 0 });
    }
    return Object.assign(e, { picks });
  };
  /** The pick of the cut at index ci in a plan's effect, or null. */
  FX.at = (effect, ci) => (effect && effect.picks && effect.picks[ci]) || null;
})();
