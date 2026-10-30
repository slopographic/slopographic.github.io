// Slop Effects motion helpers. Animate in and animate out place one of the shared motion presets (SlopMotion.presets:
// fade-in, slide-up, pop, spin-in) on a layer's position, scale, rotation and opacity, relative to where the layer rests.
// Random motion writes seeded keys inside bounds: the same seed gives the same keys. Expressions are out of scope for
// version one. Pure: each function returns a new document. Classic script: window.SlopEffects.motion.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const C = () => ns.core;
  const K = () => ns.keys;
  const V = () => ns.values;
  const S = () => g.SlopVideo.seed;
  const PRESET_IDS = ['fade-in', 'slide-up', 'pop', 'spin-in'];
  const MOTION_PROPS = ['position', 'scale', 'rotation', 'opacity'];

  /**
   * Places a preset on a layer. dir 'in' starts at 0 and ends at rest; 'out' starts at rest and ends at the
   * composition's end. Keys of the affected properties inside that window are replaced; keys outside it stay.
   */
  function animate(doc, layerId, dir, presetName) {
    if (dir !== 'in' && dir !== 'out') throw new RangeError('animate: dir must be in or out');
    if (!PRESET_IDS.includes(presetName)) throw new RangeError(`animate: unknown preset ${presetName}`);
    const layer = C().findLayer(doc, layerId);
    if (!layer) throw new RangeError(`no layer ${layerId}`);
    const preset = g.SlopMotion.presets.get(presetName);
    const dur = doc.comp.duration;
    const len = Math.min(preset.duration, dur);
    const start = dir === 'in' ? 0 : Math.max(0, dur - len);
    const rest = V().valuesAt(doc, layer, dir === 'in' ? len : start);
    const at = (t) => Math.min(dur, Math.max(0, start + (dir === 'in' ? t : len - t)));
    const map = {}; // prop -> Map(time -> { value, ease })
    const put = (prop, t, value, ease) => { if (!map[prop]) map[prop] = new Map(); map[prop].set(t, { value, ease }); };
    for (const [track, keys] of Object.entries(preset.tracks)) {
      for (const k of keys) {
        const t = Math.round(at(k.t) * 1e6) / 1e6;
        const ease = dir === 'in' ? (k.ease || 'linear') : 'easeInQuad';
        const v = k.value;
        if (track === 'translateX' || track === 'translateY') {
          const idx = track === 'translateX' ? 0 : 1;
          const cur = map.position && map.position.get(t) ? map.position.get(t).value : [rest.position[0], rest.position[1]];
          cur[idx] = rest.position[idx] + v;
          put('position', t, cur, ease);
        } else if (track === 'scale') put('scale', t, [rest.scale[0] * v, rest.scale[1] * v], ease);
        else if (track === 'rotate') put('rotation', t, rest.rotation + v, ease);
        else if (track === 'opacity') put('opacity', t, rest.opacity * v, ease);
      }
    }
    const next = C().clone(doc);
    for (const prop of Object.keys(map)) {
      const kept = K().keysOf(next, layerId, prop).filter((k) => k.t < start - K().TOL || k.t > start + len + K().TOL);
      const fresh = [...map[prop].entries()].map(([t, e]) => ({ t, value: e.value, ease: e.ease }));
      K().setTrack(next, layerId, prop, kept.concat(fresh));
    }
    return g.SlopMotion.timeline.assertValid(next.tl) && next;
  }

  /** Default bounds for random motion, from the composition. */
  function defaultBounds(comp) {
    return { x: [0, comp.width], y: [0, comp.height], scale: [80, 120], rotation: [-15, 15], opacity: [60, 100] };
  }

  /** FNV-1a of a string, used when no shared hash is loaded (same result as SlopVideo.seed.hash). */
  const hashOf = (s) => (g.SlopVideo ? S().hash(s) : (() => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; })());

  /** Draws the value of one property from the seeded generator r (a function returning [0, 1)). */
  function draw(prop, r, b) {
    const lerp = (lo, hi, u) => lo + (hi - lo) * u;
    if (prop === 'position') return [lerp(b.x[0], b.x[1], r()), lerp(b.y[0], b.y[1], r())];
    if (prop === 'scale') { const s = lerp(b.scale[0], b.scale[1], r()); return [s, s]; }
    if (prop === 'rotation') return lerp(b.rotation[0], b.rotation[1], r());
    return lerp(b.opacity[0], b.opacity[1], r());
  }

  /**
   * Seeded random keys for the chosen properties of a layer, from `from` to `to` (seconds), a key every `every` seconds
   * (snapped to frames) and always one at `to`. Existing keys of those properties inside the range are replaced.
   * opts: { seed, props, every, from, to, ease, bounds }. Same seed, options and document give the same result.
   */
  function randomMotion(doc, layerId, opts = {}) {
    const layer = C().findLayer(doc, layerId);
    if (!layer) throw new RangeError(`no layer ${layerId}`);
    const comp = doc.comp;
    const props = (opts.props || MOTION_PROPS).filter((p) => MOTION_PROPS.includes(p));
    if (!props.length) throw new RangeError('random motion needs at least one property');
    const frame = 1 / comp.fps;
    const every = Math.max(frame, Number.isFinite(opts.every) ? opts.every : 0.5);
    const from = Math.max(0, Number.isFinite(opts.from) ? opts.from : 0);
    const to = Math.min(comp.duration, Number.isFinite(opts.to) ? opts.to : comp.duration);
    if (!(to > from)) throw new RangeError('random motion needs a range that is longer than zero');
    const b = { ...defaultBounds(comp), ...(opts.bounds || {}) };
    const ease = opts.ease || 'easeInOutQuad';
    const seed = (Number(opts.seed) || 0) >>> 0;
    const next = C().clone(doc);
    for (const prop of props) {
      const r = S().rng((seed ^ hashOf(`${layerId}:${prop}`)) >>> 0);
      const times = [];
      for (let i = 0; from + i * every < to - frame / 2; i++) times.push(C().snap(comp, from + i * every));
      times.push(C().snap(comp, to));
      const uniq = times.filter((t, i) => i === 0 || t > times[i - 1] + frame / 2);
      const fresh = uniq.map((t) => ({ t, value: draw(prop, r, b), ease }));
      const kept = K().keysOf(next, layerId, prop).filter((k) => k.t < from - K().TOL || k.t > to + K().TOL);
      K().setTrack(next, layerId, prop, kept.concat(fresh));
    }
    return g.SlopMotion.timeline.assertValid(next.tl) && next;
  }

  ns.motion = { PRESET_IDS, MOTION_PROPS, animate, randomMotion, defaultBounds, hashOf, draw };
})(typeof window !== 'undefined' ? window : globalThis);
