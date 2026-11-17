// A keyframe track: one property of one target. A track is a plain array of keys, ordered by time:
//   [{ t: 0, value: 0, ease: 'easeOutQuad' }, { t: 1, value: 1 }]
// t is seconds (finite, >= 0, strictly increasing). ease belongs to the segment that STARTS at the key
// (default 'linear'; 'hold' keeps the start value until the next key; [x1,y1,x2,y2] is cubic-bezier).
// value kinds: number, point [x, y], colour {r, g, b, a} (r,g,b 0-255, a 0-1), or string (step enum).
// Strings and 'hold' segments never interpolate: the start value holds until the next key time.
// Classic script: exposes window.SlopMotion.track. Pure: nothing here mutates its input.
(function (g) {
  'use strict';
  const ns = (g.SlopMotion = g.SlopMotion || {});

  /** 'number' | 'point' | 'colour' | 'enum', or null when the value is not a valid kind. */
  function kindOf(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? 'number' : null;
    if (typeof v === 'string') return 'enum';
    if (Array.isArray(v)) return v.length === 2 && v.every(Number.isFinite) ? 'point' : null;
    if (v && typeof v === 'object' && ['r', 'g', 'b'].every((k) => Number.isFinite(v[k]))) {
      if (v.a !== undefined && !(Number.isFinite(v.a) && v.a >= 0 && v.a <= 1)) return null;
      if (['r', 'g', 'b'].some((k) => v[k] < 0 || v[k] > 255)) return null;
      return 'colour';
    }
    return null;
  }

  /** A fresh copy of a value, so callers never share point or colour objects with a track. */
  function copyValue(v) {
    if (Array.isArray(v)) return [v[0], v[1]];
    if (v && typeof v === 'object') return { r: v.r, g: v.g, b: v.b, a: v.a === undefined ? 1 : v.a };
    return v;
  }

  /** Mixes two values of the same kind by p (p is not clamped). Enum values step: a is kept. */
  function lerp(a, b, p) {
    const kind = kindOf(a);
    if (kind === 'number') return a + (b - a) * p;
    if (kind === 'point') return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
    if (kind === 'colour') {
      const ca = copyValue(a);
      const cb = copyValue(b);
      return {
        r: ca.r + (cb.r - ca.r) * p,
        g: ca.g + (cb.g - ca.g) * p,
        b: ca.b + (cb.b - ca.b) * p,
        a: ca.a + (cb.a - ca.a) * p,
      };
    }
    return copyValue(a);
  }

  /**
   * Maps a timeline time onto the track's own range. mode 'none' (default) leaves time alone;
   * 'loop' wraps it into [0, duration); 'pingpong' runs forward then backward over [0, duration].
   */
  function mapTime(time, duration, mode) {
    if (mode === undefined || mode === null || mode === 'none') return time;
    if (!(duration > 0)) return 0;
    if (mode === 'loop') {
      const m = time % duration;
      return m < 0 ? m + duration : m;
    }
    if (mode === 'pingpong') {
      const period = 2 * duration;
      let u = time % period;
      if (u < 0) u += period;
      return u <= duration ? u : period - u;
    }
    throw new RangeError(`track: unknown loop mode "${mode}"`);
  }

  /** Returns a list of human-readable problems with a track (empty when valid). */
  function validateKeys(keys, label = 'track') {
    const errors = [];
    if (!Array.isArray(keys)) return [`${label}: must be an array of keys`];
    let kind = null;
    let prev = -Infinity;
    keys.forEach((k, i) => {
      const at = `${label}[${i}]`;
      if (!k || typeof k !== 'object') { errors.push(`${at}: key must be an object`); return; }
      if (!Number.isFinite(k.t) || k.t < 0) errors.push(`${at}: t must be a finite number >= 0`);
      else if (k.t <= prev) errors.push(`${at}: t must be strictly greater than the previous key`);
      else prev = k.t;
      const vk = kindOf(k.value);
      if (!vk) errors.push(`${at}: value must be a number, [x,y], {r,g,b,a} or string`);
      else if (kind && vk !== kind) errors.push(`${at}: value kind ${vk} does not match track kind ${kind}`);
      else kind = vk;
      if (k.ease !== undefined && k.ease !== 'hold' && !ns.easing.isValid(k.ease)) {
        errors.push(`${at}: unknown ease ${JSON.stringify(k.ease)}`);
      }
    });
    return errors;
  }

  /** Index of the last key with t <= time, or -1 when time is before the first key. */
  function lastIndexAtOrBefore(keys, time) {
    let lo = 0;
    let hi = keys.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (keys[mid].t <= time) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  /**
   * Value of a track at time (seconds). Before the first key and after the last key the end values hold.
   * opts.mode ('none' | 'loop' | 'pingpong') and opts.duration remap time first (see mapTime).
   * Returns undefined for an empty track. Assumes keys already passed validateKeys.
   */
  function sample(keys, time, opts) {
    if (!keys || keys.length === 0) return undefined;
    const tt = opts ? mapTime(time, opts.duration, opts.mode) : time;
    const i = lastIndexAtOrBefore(keys, tt);
    if (i < 0) return copyValue(keys[0].value);
    if (i >= keys.length - 1) return copyValue(keys[keys.length - 1].value);
    const a = keys[i];
    const b = keys[i + 1];
    const kind = kindOf(a.value);
    if (kind === 'enum' || a.ease === 'hold') return copyValue(a.value);
    const u = (tt - a.t) / (b.t - a.t);
    const p = ns.easing.resolve(a.ease)(u);
    return lerp(a.value, b.value, p);
  }

  ns.track = { kindOf, copyValue, lerp, mapTime, validateKeys, sample, lastIndexAtOrBefore };
})(typeof window !== 'undefined' ? window : globalThis);
