// Slide transitions, written as keyframed parameters (data), not as code. Each transition has an
// 'outgoing' and an 'incoming' side; each side has tracks over progress 0..1 for these properties:
//   x, y        offset as a fraction of width / height (-1 = one full slide away)
//   scale       1 = normal size
//   rotate      degrees, 2D, around origin
//   opacity     0..1
//   clipTop, clipRight, clipBottom, clipLeft   inset percentages (0 = not clipped, 100 = hidden)
// transition(name, progress, {width, height}) samples those tracks with the shared track engine and
// returns CSS-able state for both sides. progress 0 shows the outgoing slide fully; 1 shows the incoming.
// Classic script: exposes window.SlopMotion.transitions. Pure.
(function (g) {
  'use strict';
  const ns = (g.SlopMotion = g.SlopMotion || {});

  const DEFAULTS = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, clipTop: 0, clipRight: 0, clipBottom: 0, clipLeft: 0 };

  // 'hold' keeps the first value until progress reaches the last key (a switch, not a fade).
  const SPECS = {
    none: {
      outgoing: { tracks: { opacity: [{ t: 0, value: 1, ease: 'hold' }, { t: 1, value: 0 }] } },
      incoming: { tracks: { opacity: [{ t: 0, value: 0, ease: 'hold' }, { t: 1, value: 1 }] } },
    },
    fade: {
      outgoing: { tracks: { opacity: [{ t: 0, value: 1, ease: 'easeInOutQuad' }, { t: 1, value: 0 }] } },
      incoming: { tracks: { opacity: [{ t: 0, value: 0, ease: 'easeInOutQuad' }, { t: 1, value: 1 }] } },
    },
    'push-left': {
      outgoing: { tracks: { x: [{ t: 0, value: 0, ease: 'easeInOutCubic' }, { t: 1, value: -1 }], opacity: [{ t: 0, value: 1, ease: 'hold' }, { t: 1, value: 0 }] } },
      incoming: { tracks: { x: [{ t: 0, value: 1, ease: 'easeInOutCubic' }, { t: 1, value: 0 }] } },
    },
    'push-right': {
      outgoing: { tracks: { x: [{ t: 0, value: 0, ease: 'easeInOutCubic' }, { t: 1, value: 1 }], opacity: [{ t: 0, value: 1, ease: 'hold' }, { t: 1, value: 0 }] } },
      incoming: { tracks: { x: [{ t: 0, value: -1, ease: 'easeInOutCubic' }, { t: 1, value: 0 }] } },
    },
    'push-up': {
      outgoing: { tracks: { y: [{ t: 0, value: 0, ease: 'easeInOutCubic' }, { t: 1, value: -1 }], opacity: [{ t: 0, value: 1, ease: 'hold' }, { t: 1, value: 0 }] } },
      incoming: { tracks: { y: [{ t: 0, value: 1, ease: 'easeInOutCubic' }, { t: 1, value: 0 }] } },
    },
    'push-down': {
      outgoing: { tracks: { y: [{ t: 0, value: 0, ease: 'easeInOutCubic' }, { t: 1, value: 1 }], opacity: [{ t: 0, value: 1, ease: 'hold' }, { t: 1, value: 0 }] } },
      incoming: { tracks: { y: [{ t: 0, value: -1, ease: 'easeInOutCubic' }, { t: 1, value: 0 }] } },
    },
    wipe: {
      outgoing: { tracks: { opacity: [{ t: 0, value: 1, ease: 'hold' }, { t: 1, value: 0 }] } },
      incoming: { tracks: { clipRight: [{ t: 0, value: 100, ease: 'linear' }, { t: 1, value: 0 }] } },
    },
    'zoom-in': {
      outgoing: { tracks: { scale: [{ t: 0, value: 1, ease: 'easeInCubic' }, { t: 1, value: 1.5 }], opacity: [{ t: 0, value: 1, ease: 'easeInCubic' }, { t: 1, value: 0 }] } },
      incoming: { tracks: { scale: [{ t: 0, value: 0.5, ease: 'easeOutCubic' }, { t: 1, value: 1 }], opacity: [{ t: 0, value: 0, ease: 'easeOutCubic' }, { t: 1, value: 1 }] } },
    },
    'zoom-out': {
      outgoing: { tracks: { scale: [{ t: 0, value: 1, ease: 'easeInCubic' }, { t: 1, value: 0.5 }], opacity: [{ t: 0, value: 1, ease: 'easeInCubic' }, { t: 1, value: 0 }] } },
      incoming: { tracks: { scale: [{ t: 0, value: 1.5, ease: 'easeOutCubic' }, { t: 1, value: 1 }], opacity: [{ t: 0, value: 0, ease: 'easeOutCubic' }, { t: 1, value: 1 }] } },
    },
    cube: {
      outgoing: { origin: 'right', tracks: { rotate: [{ t: 0, value: 0, ease: 'easeInCubic' }, { t: 1, value: -90 }], opacity: [{ t: 0, value: 1, ease: 'hold' }, { t: 1, value: 0 }] } },
      incoming: { origin: 'left', tracks: { rotate: [{ t: 0, value: 90, ease: 'easeOutCubic' }, { t: 1, value: 0 }] } },
    },
  };

  const clampP = (p) => (p < 0 ? 0 : p > 1 ? 1 : p);

  function clipCss(s) {
    if (!s.clipTop && !s.clipRight && !s.clipBottom && !s.clipLeft) return 'none';
    return `inset(${s.clipTop}% ${s.clipRight}% ${s.clipBottom}% ${s.clipLeft}%)`;
  }

  function sideState(def, p, width, height) {
    const s = { ...DEFAULTS };
    for (const prop of Object.keys(def.tracks)) s[prop] = ns.track.sample(def.tracks[prop], p);
    const translateX = s.x * width;
    const translateY = s.y * height;
    return {
      translateX,
      translateY,
      scale: s.scale,
      rotate: s.rotate,
      opacity: s.opacity,
      clip: clipCss(s),
      origin: def.origin || 'center',
      transform: `translate(${translateX}px, ${translateY}px) rotate(${s.rotate}deg) scale(${s.scale})`,
    };
  }

  /**
   * CSS-able state for both slides at progress (0..1, clamped). opts: { width, height } in px
   * (default 1920 x 1080). Returns { outgoing, incoming }, each with translateX, translateY (px),
   * scale, rotate (deg), opacity, clip (CSS inset() or 'none'), origin and a transform string.
   */
  function transition(name, progress, opts = {}) {
    const spec = SPECS[name];
    if (!spec) throw new RangeError(`transitions: unknown transition "${name}"`);
    if (!Number.isFinite(progress)) throw new RangeError('transitions: progress must be a finite number');
    const width = opts.width === undefined ? 1920 : opts.width;
    const height = opts.height === undefined ? 1080 : opts.height;
    const p = clampP(progress);
    return {
      outgoing: sideState(spec.outgoing, p, width, height),
      incoming: sideState(spec.incoming, p, width, height),
    };
  }

  /** Names of the transitions, sorted. */
  function names() {
    return Object.keys(SPECS).sort();
  }

  /** The keyframed data of one transition, as a fresh plain object (safe to save as JSON). */
  function spec(name) {
    if (!SPECS[name]) throw new RangeError(`transitions: unknown transition "${name}"`);
    return JSON.parse(JSON.stringify(SPECS[name]));
  }

  ns.transitions = { transition, names, spec, DEFAULTS: { ...DEFAULTS } };
})(typeof window !== 'undefined' ? window : globalThis);
