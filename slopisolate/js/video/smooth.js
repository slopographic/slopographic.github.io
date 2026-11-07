/* SlopIsolate video — temporal smoothing of the matte. Exponential smoothing per pixel:
 *   out[i] = prev[i] + w * (raw[i] - prev[i]),  w = weight given to the NEW frame (small, default 0.35).
 * The first frame has no previous mask, so it is kept as it is (it seeds the state; nothing is blended in).
 * Pure function, no DOM: also loaded by tests/node/slopisolate-smooth.test.mjs. CO.video.smooth.step(prev, raw, w, out?). */
(function () {
  'use strict';
  const CO = window.CO || (window.CO = {});
  const V = CO.video || (CO.video = {});
  const SM = V.smooth = {};

  SM.WEIGHT = 0.35;

  /** One smoothing step. prev may be null (first frame). Returns a new Uint8ClampedArray (or writes into out). */
  SM.step = function (prev, raw, w, out) {
    const n = raw.length, res = out || new Uint8ClampedArray(n);
    const k = Math.min(1, Math.max(0, w == null ? SM.WEIGHT : w));
    if (!prev) { for (let i = 0; i < n; i++) res[i] = raw[i]; return res; }
    for (let i = 0; i < n; i++) {
      const p = prev[i];
      res[i] = Math.round(p + k * (raw[i] - p));
    }
    return res;
  };

  /** Run the smoothing over a list of raw masks (all the same length). Returns the smoothed list. */
  SM.series = function (raws, w) {
    const out = [];
    let prev = null;
    for (const raw of raws) { prev = SM.step(prev, raw, w); out.push(prev); }
    return out;
  };
})();
