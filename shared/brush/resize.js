/* Slop brush resize: the maths of a right-button drag on a brush. Across (x) changes the size, down (y) the
 * hardness, the same as PhotoSlop's right-drag. Pure functions, no DOM: apps call them from their own pointer code.
 *   SlopBrushResize.THRESHOLD        px moved before a right press counts as a drag (below it, it is a click)
 *   SlopBrushResize.apply(start, dx, dy) → { size, hardness } for a drag of (dx, dy) screen px from start
 *   SlopBrushResize.readout(size, hardness) → 'Size 48 px · Hardness 60%' (the live label)
 * Size is multiplicative (a 100 px drag doubles it), so small brushes stay precise; hardness moves 1 per 200 px. */
(function (root) {
  'use strict';
  const R = root.SlopBrushResize = {};
  R.THRESHOLD = 4;
  R.MIN_SIZE = 2;
  R.MAX_SIZE = 400;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  R.apply = function (start, dx, dy) {
    const size = clamp(Math.round(start.size * Math.pow(2, dx / 100)), R.MIN_SIZE, R.MAX_SIZE);
    const hardness = clamp(Math.round((start.hardness + dy / 200) * 100) / 100, 0, 1);
    return { size, hardness };
  };
  R.readout = (size, hardness) => `Size ${Math.round(size)} px · Hardness ${Math.round(hardness * 100)}%`;
  R.isDrag = (dx, dy) => Math.hypot(dx, dy) >= R.THRESHOLD;
})(typeof window !== 'undefined' ? window : globalThis);
