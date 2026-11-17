// Named, reusable animations as data. A preset is { duration, tracks } (its label: ui.motion.<name>, in the chosen language) with key times relative
// to 0 (seconds). Any app can place one on any target: SlopMotion.presets.apply(timeline, 'pop', 'card-3', {at: 1}).
// translateX / translateY are in px (scale them with opts.amount). Classic script: window.SlopMotion.presets.
(function (g) {
  'use strict';
  const ns = (g.SlopMotion = g.SlopMotion || {});
  const label = (name) => { const I = g.SlopI18n, k = 'ui.motion.' + name.replace(/-/g, '_'); return I && I.t ? I.t(k) : k; };   // shared/i18n/ui/<code>/templates.js

  const PRESETS = {
    'fade-in': {
      duration: 0.4,
      tracks: {
        opacity: [{ t: 0, value: 0, ease: 'easeOutQuad' }, { t: 0.4, value: 1 }],
      },
    },
    'slide-up': {
      duration: 0.5,
      tracks: {
        translateY: [{ t: 0, value: 40, ease: 'easeOutCubic' }, { t: 0.5, value: 0 }],
        opacity: [{ t: 0, value: 0, ease: 'easeOutQuad' }, { t: 0.5, value: 1 }],
      },
    },
    pop: {
      duration: 0.5,
      tracks: {
        scale: [{ t: 0, value: 0, ease: 'easeOutBack' }, { t: 0.5, value: 1 }],
        opacity: [{ t: 0, value: 0 }, { t: 0.15, value: 1 }],
      },
    },
    shake: {
      duration: 0.5,
      tracks: {
        translateX: [
          { t: 0, value: 0 }, { t: 0.07, value: -10 }, { t: 0.14, value: 10 }, { t: 0.21, value: -8 },
          { t: 0.28, value: 8 }, { t: 0.35, value: -4 }, { t: 0.42, value: 4 }, { t: 0.5, value: 0 },
        ],
      },
    },
    pulse: {
      duration: 0.6,
      tracks: {
        scale: [{ t: 0, value: 1, ease: 'easeInOutQuad' }, { t: 0.3, value: 1.08, ease: 'easeInOutQuad' }, { t: 0.6, value: 1 }],
      },
    },
    'spin-in': {
      duration: 0.6,
      tracks: {
        rotate: [{ t: 0, value: -360, ease: 'easeOutCubic' }, { t: 0.6, value: 0 }],
        scale: [{ t: 0, value: 0, ease: 'easeOutCubic' }, { t: 0.6, value: 1 }],
        opacity: [{ t: 0, value: 0 }, { t: 0.2, value: 1 }],
      },
    },
  };
  const AMOUNT_PROPS = ['translateX', 'translateY'];

  /** [{name, label, duration}] for UI menus, sorted by name. */
  function list() {
    return Object.keys(PRESETS).sort().map((name) => ({ name, label: label(name), duration: PRESETS[name].duration }));
  }

  /** A fresh plain copy of one preset's data. Throws for unknown names. */
  function get(name) {
    if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) throw new RangeError(`presets: unknown preset "${name}"`);
    return { name, label: label(name), ...JSON.parse(JSON.stringify(PRESETS[name])) };
  }

  /**
   * Values of a preset at time seconds after its start (before 0 and after its end the ends hold).
   * Returns {property: value}. Useful for previews without a timeline.
   */
  function valueAt(name, time, opts = {}) {
    const p = get(name);
    const out = {};
    for (const prop of Object.keys(p.tracks)) {
      const amount = AMOUNT_PROPS.includes(prop) && opts.amount !== undefined ? opts.amount : 1;
      const v = ns.track.sample(p.tracks[prop], time);
      out[prop] = amount === 1 ? v : v * amount;
    }
    return out;
  }

  /**
   * New timeline with the preset placed on target. opts: { at (seconds, default 0), timeScale (default 1),
   * amount (multiplier for translateX/Y, default 1) }. The preset replaces the properties it animates on
   * that target. The duration grows when the preset would end after it. Pure.
   */
  function apply(tl, name, target, opts = {}) {
    const p = get(name);
    const at = opts.at === undefined ? 0 : opts.at;
    const timeScale = opts.timeScale === undefined ? 1 : opts.timeScale;
    const amount = opts.amount === undefined ? 1 : opts.amount;
    if (!Number.isFinite(at) || at < 0) throw new RangeError('presets: at must be a finite number >= 0');
    if (!(Number.isFinite(timeScale) && timeScale > 0)) throw new RangeError('presets: timeScale must be a finite number > 0');
    if (!Number.isFinite(amount)) throw new RangeError('presets: amount must be a finite number');
    if (typeof target !== 'string' || !target) throw new RangeError('presets: target must be a non-empty string');

    const props = {};
    for (const prop of Object.keys(p.tracks)) {
      const scale = AMOUNT_PROPS.includes(prop) ? amount : 1;
      props[prop] = p.tracks[prop].map((k) => ({
        ...k,
        t: round(at + k.t * timeScale),
        value: typeof k.value === 'number' ? k.value * scale : k.value,
      }));
    }
    const end = round(at + p.duration * timeScale);
    const duration = Math.max(tl.duration, end);
    const tracks = { ...tl.tracks, [target]: { ...(tl.tracks[target] || {}), ...props } };
    return ns.timeline.assertValid({ ...tl, duration, tracks });
  }

  /** Rounds to microseconds, so scaled key times stay clean in saved JSON. */
  const round = (v) => Math.round(v * 1e6) / 1e6;

  ns.presets = { list, get, apply, valueAt };
})(typeof window !== 'undefined' ? window : globalThis);
