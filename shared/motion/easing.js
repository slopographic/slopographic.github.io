// Easing functions for the shared motion engine. Pure functions t -> t, with t in [0, 1].
// Every named easing maps 0 -> 0 and 1 -> 1. Back and elastic overshoot by design.
// Classic script: exposes window.SlopMotion.easing. Also loads in Node (see tests/node/motion-env.mjs).
(function (g) {
  'use strict';
  const ns = (g.SlopMotion = g.SlopMotion || {});
  const PI = Math.PI;

  const easeInQuad = (t) => t * t;
  const easeOutQuad = (t) => t * (2 - t);
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
  const easeInCubic = (t) => t * t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeInQuart = (t) => t * t * t * t;
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
  const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

  const C1 = 1.70158;
  const C2 = C1 * 1.525;
  const C3 = C1 + 1;
  const easeInBack = (t) => C3 * t * t * t - C1 * t * t;
  const easeOutBack = (t) => 1 + C3 * Math.pow(t - 1, 3) + C1 * Math.pow(t - 1, 2);
  const easeInOutBack = (t) => (t < 0.5
    ? (Math.pow(2 * t, 2) * ((C2 + 1) * 2 * t - C2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((C2 + 1) * (2 * t - 2) + C2) + 2) / 2);

  const C4 = (2 * PI) / 3;
  const C5 = (2 * PI) / 4.5;
  const easeInElastic = (t) => (t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * C4));
  const easeOutElastic = (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * C4) + 1);
  const easeInOutElastic = (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const s = Math.sin((20 * t - 11.125) * C5);
    return t < 0.5 ? -(Math.pow(2, 20 * t - 10) * s) / 2 : (Math.pow(2, -20 * t + 10) * s) / 2 + 1;
  };

  const easeOutBounce = (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { const u = t - 1.5 / d1; return n1 * u * u + 0.75; }
    if (t < 2.5 / d1) { const u = t - 2.25 / d1; return n1 * u * u + 0.9375; }
    const u = t - 2.625 / d1;
    return n1 * u * u + 0.984375;
  };
  const easeInBounce = (t) => 1 - easeOutBounce(1 - t);
  const easeInOutBounce = (t) => (t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2);

  /**
   * CSS-style cubic-bezier(x1, y1, x2, y2). The curve runs from (0,0) to (1,1); x1 and x2 must be
   * in [0, 1] (as in CSS), y1 and y2 may overshoot. Solves x(s) = t with Newton steps, falling
   * back to bisection, to 1e-7 in x, then returns y(s). Returns a function t -> progress.
   */
  function cubicBezier(x1, y1, x2, y2) {
    const pts = [x1, y1, x2, y2];
    if (!pts.every(Number.isFinite)) throw new RangeError('cubic-bezier: control points must be finite numbers');
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) throw new RangeError('cubic-bezier: x control points must be in [0, 1]');
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const curveX = (s) => ((ax * s + bx) * s + cx) * s;
    const curveY = (s) => ((ay * s + by) * s + cy) * s;
    const dxdt = (s) => (3 * ax * s + 2 * bx) * s + cx;
    const EPS = 1e-7;

    function solveS(x) {
      let s = x;
      for (let i = 0; i < 8; i++) {
        const err = curveX(s) - x;
        if (Math.abs(err) < EPS) return s;
        const d = dxdt(s);
        if (Math.abs(d) < 1e-6) break;
        s -= err / d;
      }
      let lo = 0;
      let hi = 1;
      s = x;
      for (let i = 0; i < 100 && hi - lo > 1e-10; i++) {
        const err = curveX(s) - x;
        if (Math.abs(err) < EPS) return s;
        if (err > 0) hi = s; else lo = s;
        s = (lo + hi) / 2;
      }
      return s;
    }

    return function bezier(t) {
      if (!(t > 0)) return 0;
      if (t >= 1) return 1;
      return curveY(solveS(t));
    };
  }

  const table = {
    linear: (t) => t,
    easeInQuad, easeOutQuad, easeInOutQuad,
    easeInCubic, easeOutCubic, easeInOutCubic,
    easeInQuart, easeOutQuart, easeInOutQuart,
    easeInBack, easeOutBack, easeInOutBack,
    easeInElastic, easeOutElastic, easeInOutElastic,
    easeInBounce, easeOutBounce, easeInOutBounce,
  };

  /**
   * Resolves an easing spec to a function: a name from names(), a [x1,y1,x2,y2] array (cubic-bezier),
   * or a function. undefined or null means linear. Input is clamped to [0, 1].
   * Throws RangeError for anything else. The special name 'hold' is handled by track.js, not here.
   */
  function resolve(spec) {
    let fn;
    if (spec === undefined || spec === null) fn = table.linear;
    else if (typeof spec === 'function') fn = spec;
    else if (typeof spec === 'string') {
      fn = table[spec];
      if (!fn) throw new RangeError(`easing: unknown easing "${spec}"`);
    } else if (Array.isArray(spec) && spec.length === 4) fn = cubicBezier(...spec);
    else throw new RangeError('easing: expected a name, [x1,y1,x2,y2] or a function');
    return (t) => fn(t < 0 ? 0 : t > 1 ? 1 : t);
  }

  /** True when spec is something resolve() accepts. */
  function isValid(spec) {
    if (spec === undefined || spec === null) return true;
    if (typeof spec === 'string') return Object.prototype.hasOwnProperty.call(table, spec);
    return Array.isArray(spec) && spec.length === 4 && spec.every(Number.isFinite)
      && spec[0] >= 0 && spec[0] <= 1 && spec[2] >= 0 && spec[2] <= 1;
  }

  ns.easing = {
    ...table,
    cubicBezier,
    resolve,
    isValid,
    /** Sorted list of the named easings. */
    names: () => Object.keys(table).sort(),
  };
})(typeof window !== 'undefined' ? window : globalThis);
