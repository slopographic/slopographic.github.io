// A timeline: named tracks per target, a duration, a playhead, and a loop mode. It is plain JSON:
//   { "version": 1, "duration": 2, "loop": "none", "playhead": 0,
//     "tracks": { "slide-1": { "opacity": [ {"t":0,"value":0,"ease":"easeOutQuad"}, {"t":1,"value":1} ] } } }
// loop: 'none' | 'loop' | 'pingpong' (see track.mapTime). All functions here are pure: they return new
// objects and never mutate their input. Classic script: exposes window.SlopMotion.timeline.
(function (g) {
  'use strict';
  const ns = (g.SlopMotion = g.SlopMotion || {});
  const LOOPS = ['none', 'loop', 'pingpong'];
  const VERSION = 1;

  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /** Returns a list of problems with a timeline (empty when valid). Never throws. */
  function validate(tl) {
    const errors = [];
    if (!tl || typeof tl !== 'object' || Array.isArray(tl)) return ['timeline: must be an object'];
    if (tl.version !== undefined && tl.version !== VERSION) errors.push(`timeline: unsupported version ${tl.version}`);
    if (!Number.isFinite(tl.duration) || tl.duration < 0) errors.push('timeline: duration must be a finite number >= 0');
    if (!LOOPS.includes(tl.loop)) errors.push(`timeline: loop must be one of ${LOOPS.join(', ')}`);
    if (!Number.isFinite(tl.playhead) || tl.playhead < 0) errors.push('timeline: playhead must be a finite number >= 0');
    if (!tl.tracks || typeof tl.tracks !== 'object' || Array.isArray(tl.tracks)) {
      errors.push('timeline: tracks must be an object of target -> property -> keys');
      return errors;
    }
    for (const target of Object.keys(tl.tracks)) {
      const props = tl.tracks[target];
      if (!props || typeof props !== 'object' || Array.isArray(props)) { errors.push(`${target}: must be an object of properties`); continue; }
      for (const prop of Object.keys(props)) errors.push(...ns.track.validateKeys(props[prop], `${target}.${prop}`));
    }
    return errors;
  }

  function assertValid(tl) {
    const errors = validate(tl);
    if (errors.length) throw new RangeError(`invalid timeline:\n  ${errors.join('\n  ')}`);
    return tl;
  }

  /** A new empty timeline. opts: { duration, loop, playhead }. */
  function create(opts = {}) {
    return assertValid({
      version: VERSION,
      duration: opts.duration === undefined ? 0 : opts.duration,
      loop: opts.loop === undefined ? 'none' : opts.loop,
      playhead: opts.playhead === undefined ? 0 : opts.playhead,
      tracks: {},
    });
  }

  /**
   * Value of every track at time (default: the playhead). Returns {target: {property: value}}.
   * Only tracks with keys appear. Honours the timeline's loop mode and duration.
   */
  function sample(tl, time) {
    const at = time === undefined ? tl.playhead : time;
    const out = {};
    for (const target of Object.keys(tl.tracks)) {
      const props = {};
      for (const prop of Object.keys(tl.tracks[target])) {
        const v = ns.track.sample(tl.tracks[target][prop], at, { mode: tl.loop, duration: tl.duration });
        if (v !== undefined) props[prop] = v;
      }
      out[target] = props;
    }
    return out;
  }

  /** Returns a new timeline with the playhead placed at time (clamped to [0, duration] when loop is 'none'). */
  function seek(tl, time) {
    if (!Number.isFinite(time)) throw new RangeError('timeline: seek time must be a finite number');
    let p = Math.max(0, time);
    if (tl.loop === 'none') p = Math.min(p, tl.duration);
    else p = ns.track.mapTime(p, tl.duration, tl.loop);
    return { ...tl, playhead: p };
  }

  function setDuration(tl, duration) {
    return assertValid({ ...tl, duration });
  }

  function targets(tl) {
    return Object.keys(tl.tracks);
  }

  /** Keys of one track, or undefined when that target or property has none. */
  function getKeys(tl, target, property) {
    return hasOwn(tl.tracks, target) && hasOwn(tl.tracks[target], property) ? tl.tracks[target][property] : undefined;
  }

  /** New timeline with one track replaced. An empty keys list removes the property, and an empty target. */
  function withKeys(tl, target, property, keys) {
    const tracks = { ...tl.tracks };
    const props = { ...(tracks[target] || {}) };
    if (keys.length) props[property] = keys; else delete props[property];
    if (Object.keys(props).length) tracks[target] = props; else delete tracks[target];
    return assertValid({ ...tl, tracks });
  }

  function requireKeys(tl, target, property) {
    const keys = getKeys(tl, target, property);
    if (!keys) throw new RangeError(`timeline: no track ${target}.${property}`);
    return keys;
  }

  function checkIndex(keys, index) {
    if (!Number.isInteger(index) || index < 0 || index >= keys.length) throw new RangeError(`timeline: no key at index ${index}`);
  }

  /** Inserts a key in time order. A key already at the same time is replaced. */
  function addKey(tl, target, property, key) {
    const keys = (getKeys(tl, target, property) || []).filter((k) => k.t !== key.t);
    const next = [...keys, { ...key }].sort((a, b) => a.t - b.t);
    return withKeys(tl, target, property, next);
  }

  /** Moves the key at index to time newT. Throws if another key already sits at newT. */
  function moveKey(tl, target, property, index, newT) {
    const keys = requireKeys(tl, target, property);
    checkIndex(keys, index);
    if (!Number.isFinite(newT) || newT < 0) throw new RangeError('timeline: key time must be a finite number >= 0');
    if (keys.some((k, i) => i !== index && k.t === newT)) throw new RangeError(`timeline: a key already exists at t=${newT}`);
    const moved = { ...keys[index], t: newT };
    const next = keys.map((k, i) => (i === index ? moved : k)).sort((a, b) => a.t - b.t);
    return withKeys(tl, target, property, next);
  }

  /** Changes value and/or ease of the key at index. Time changes go through moveKey. */
  function updateKey(tl, target, property, index, patch) {
    const keys = requireKeys(tl, target, property);
    checkIndex(keys, index);
    const next = keys.map((k, i) => (i === index ? { ...k, ...pick(patch) } : k));
    return withKeys(tl, target, property, next);
  }

  function pick(patch) {
    const out = {};
    if (hasOwn(patch, 'value')) out.value = patch.value;
    if (hasOwn(patch, 'ease')) out.ease = patch.ease;
    return out;
  }

  /** Removes the key at index. Removing the last key removes the track, and the target when it is empty. */
  function deleteKey(tl, target, property, index) {
    const keys = requireKeys(tl, target, property);
    checkIndex(keys, index);
    return withKeys(tl, target, property, keys.filter((_, i) => i !== index));
  }

  /** Plain JSON text for a timeline (validated first). */
  function serialize(tl) {
    return JSON.stringify(assertValid(tl), null, 2);
  }

  /** Parses JSON text (or accepts an already-parsed object) into a validated, fresh timeline. */
  function parse(input) {
    let obj = input;
    if (typeof input === 'string') {
      try { obj = JSON.parse(input); } catch (e) { throw new RangeError(`timeline: invalid JSON (${e.message})`); }
    }
    const copy = JSON.parse(JSON.stringify(obj === undefined ? null : obj));
    if (copy && typeof copy === 'object') {
      if (copy.version === undefined) copy.version = VERSION;
      if (copy.playhead === undefined) copy.playhead = 0;
      if (copy.loop === undefined) copy.loop = 'none';
    }
    return assertValid(copy);
  }

  ns.timeline = {
    LOOPS, VERSION,
    create, validate, assertValid, parse, serialize,
    sample, seek, setDuration, targets, getKeys,
    addKey, moveKey, updateKey, deleteKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
