/* Slop 3D snapping (pure). A step of 0 means "off". Sets window.Slop3D.snap. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const r9 = (v) => Math.round(v * 1e9) / 1e9;
  /** Rounds v to the nearest multiple of step (no change when step is 0 or not a positive number). */
  function snap(v, step) { return step > 0 ? r9(Math.round(v / step) * step) : v; }
  const snapVec = (a, step) => a.map((v) => snap(v, step));
  /** Grid steps offered in the UI, in scene units (metres-ish). */
  const STEPS = [0, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];
  S.snap = { snap, snapVec, STEPS };
})();
