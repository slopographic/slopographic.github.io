// Slop Effects keyframe operations on a document: set or delete a key at a time, move keys (the caller snaps the
// delta to frames), change a key's ease (named, or a cubic-bezier [x1, y1, x2, y2]), and copy and paste keys as a
// payload. Keys live in doc.tl (a SlopMotion timeline) and every write is checked by timeline.assertValid. Pure.
// Classic script: window.SlopEffects.keys.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const C = () => ns.core;
  const D = () => ns.defs;
  const TL = () => g.SlopMotion.timeline;
  const EASE = () => g.SlopMotion.easing;
  /** Two keys closer than this (seconds) are the same key. Keys sit on frames, so this is far below one frame. */
  const TOL = 1e-4;
  const PAYLOAD = 'slop-effects-keys';

  /** Is prop a property a key can sit on: a layer property, or 'fx.<effect id>.<number parameter>'. */
  function validProp(prop) {
    if (D().PROP_NAMES.includes(prop)) return true;
    const m = /^fx\.(e[0-9]+)\.([a-z]+)$/.exec(prop);
    return !!m;
  }
  const pointProp = (prop) => prop === 'position' || prop === 'anchor' || prop === 'scale';

  /** The keys of a property (a copy of the list; empty when none). */
  function keysOf(doc, layerId, prop) {
    const tracks = doc.tl.tracks[layerId];
    return tracks && tracks[prop] ? tracks[prop].map((k) => ({ ...k })) : [];
  }

  /** Sorted keys with the same time merged (the later one wins). */
  function normalise(keys) {
    const byT = new Map();
    for (const k of keys) byT.set(k.t, k);
    return [...byT.values()].sort((a, b) => a.t - b.t);
  }

  /** Writes a property's key list on a clone (an empty list removes the property, and the target when it is empty). */
  function setTrack(doc, layerId, prop, keys) {
    const tracks = doc.tl.tracks;
    if (!keys.length) {
      if (tracks[layerId]) {
        delete tracks[layerId][prop];
        if (!Object.keys(tracks[layerId]).length) delete tracks[layerId];
      }
      return;
    }
    tracks[layerId] = tracks[layerId] || {};
    tracks[layerId][prop] = normalise(keys);
  }

  /** Checks a value for a property: [x, y] for points, a finite number otherwise. Returns the value to store. */
  function checkValue(prop, value) {
    if (!validProp(prop)) throw new RangeError(`cannot key ${prop}`);
    if (pointProp(prop)) {
      if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new RangeError(`${prop} needs [x, y]`);
      return [value[0], value[1]];
    }
    if (!Number.isFinite(value)) throw new RangeError(`${prop} needs a number`);
    return value;
  }

  /** Refuses a key on a property the layer cannot take: an effect that is missing, or a colour parameter. */
  function checkKeyable(doc, layerId, prop) {
    const fx = /^fx\.(e[0-9]+)\.([a-z]+)$/.exec(prop);
    if (!fx) return;
    const layer = doc.layers.find((l) => l.id === layerId);
    const eff = layer && layer.effects.find((f) => f.id === fx[1]);
    const def = eff && D().EFFECTS[eff.kind].params[fx[2]];
    if (!def || def.type === 'colour') throw new RangeError(`cannot key ${prop}`);
  }

  /** Checks an ease: a name the engine knows, or [x1, y1, x2, y2] with x in [0, 1]. */
  function checkEase(ease) {
    const e = ease === undefined || ease === null ? 'linear' : ease;
    if (!(e === 'hold' || EASE().isValid(e))) throw new RangeError(`unknown ease ${JSON.stringify(e)}`);
    return Array.isArray(e) ? e.slice() : e;
  }

  /** A time moved onto the nearest frame of the composition, kept inside it. */
  function snapTime(doc, t) {
    const fps = doc.comp.fps;
    return Math.min(doc.comp.duration, Math.max(0, Math.round(clampTime(doc, t) * fps) / fps));
  }

  function clampTime(doc, t) {
    if (!Number.isFinite(t)) throw new RangeError('key time must be a finite number');
    return Math.min(doc.comp.duration, Math.max(0, t));
  }

  /**
   * Sets the key at time t (replacing one within a tenth of a millisecond of it). ease defaults to the existing key's ease,
   * else linear. Returns the new document.
   */
  function setKeyAt(doc, layerId, prop, t, value, ease) {
    const next = C().clone(doc);
    const v = checkValue(prop, value);
    checkKeyable(next, layerId, prop);
    const at = clampTime(next, t);
    const keys = keysOf(next, layerId, prop);
    const old = keys.find((k) => Math.abs(k.t - at) < TOL);
    const e = ease !== undefined ? checkEase(ease) : (old ? old.ease : 'linear');
    const rest = keys.filter((k) => Math.abs(k.t - at) >= TOL);
    setTrack(next, layerId, prop, rest.concat([{ t: at, value: v, ease: e }]));
    return TL().assertValid(next.tl) && next;
  }

  /** Deletes the key at time t (within TOL). Removing the last key removes the property. */
  function deleteKeyAt(doc, layerId, prop, t) {
    const next = C().clone(doc);
    setTrack(next, layerId, prop, keysOf(next, layerId, prop).filter((k) => Math.abs(k.t - t) >= TOL));
    return next;
  }

  /** Removes every key of a property (the stopwatch turned off). */
  function clearTrack(doc, layerId, prop) {
    const next = C().clone(doc);
    setTrack(next, layerId, prop, []);
    return next;
  }

  /** Changes the ease of the key at time t. */
  function setEase(doc, layerId, prop, t, ease) {
    const next = C().clone(doc);
    const keys = keysOf(next, layerId, prop);
    const k = keys.find((x) => Math.abs(x.t - t) < TOL);
    if (!k) throw new RangeError(`no key at ${t} on ${prop}`);
    k.ease = checkEase(ease);
    setTrack(next, layerId, prop, keys);
    return TL().assertValid(next.tl) && next;
  }

  /**
   * Moves keys by delta seconds. refs are { layer, prop, t } naming each key by its current time. A moved key lands
   * on the clamped time; a key already there is replaced. Keys that are not moved stay.
   */
  function moveKeys(doc, refs, delta) {
    const next = C().clone(doc);
    const groups = new Map();
    for (const r of refs) {
      const id = `${r.layer}\u0000${r.prop}`;
      if (!groups.has(id)) groups.set(id, { layer: r.layer, prop: r.prop, times: [] });
      groups.get(id).times.push(r.t);
    }
    for (const grp of groups.values()) {
      const keys = keysOf(next, grp.layer, grp.prop);
      const moving = keys.filter((k) => grp.times.some((t) => Math.abs(t - k.t) < TOL));
      const staying = keys.filter((k) => !moving.includes(k));
      const landed = moving.map((k) => ({ ...k, t: snapTime(next, k.t + delta) }));
      const landedTimes = new Set(landed.map((k) => k.t));
      setTrack(next, grp.layer, grp.prop, staying.filter((k) => !landedTimes.has(k.t)).concat(landed));
    }
    return TL().assertValid(next.tl) && next;
  }

  /**
   * Copies keys to a payload (plain JSON, marked so a paste can tell it from other clips). Times are relative to the first
   * key copied. Returns { payload, count }.
   */
  function copyKeys(doc, refs) {
    const found = [];
    for (const r of refs) {
      const k = keysOf(doc, r.layer, r.prop).find((x) => Math.abs(x.t - r.t) < TOL);
      if (k) found.push({ prop: r.prop, key: k });
    }
    if (!found.length) return { payload: null, count: 0 };
    const t0 = Math.min(...found.map((f) => f.key.t));
    const byProp = new Map();
    for (const f of found) {
      if (!byProp.has(f.prop)) byProp.set(f.prop, []);
      byProp.get(f.prop).push({ dt: f.key.t - t0, value: f.key.value, ease: f.key.ease });
    }
    const items = [...byProp].map(([prop, keys]) => ({ prop, keys: keys.sort((a, b) => a.dt - b.dt) }));
    return { payload: { kind: PAYLOAD, v: 1, items }, count: found.length };
  }

  /** Checks a payload from copyKeys (or from the buffer). Returns the payload, or null when it is not one. */
  function readPayload(p) {
    if (!p || typeof p !== 'object' || p.kind !== PAYLOAD || p.v !== 1 || !Array.isArray(p.items)) return null;
    for (const it of p.items) {
      if (!it || typeof it.prop !== 'string' || !validProp(it.prop) || !Array.isArray(it.keys)) return null;
      for (const k of it.keys) {
        if (!Number.isFinite(k.dt) || k.dt < 0) return null;
        try { checkValue(it.prop, k.value); checkEase(k.ease); } catch (e) { return null; }
      }
    }
    return p;
  }

  /**
   * Pastes a payload onto a layer, with its first key at time t. Keys of an effect the layer does not have are skipped,
   * and so are keys past the end of the composition. Returns { doc, count, skipped }.
   */
  function pasteKeys(doc, layerId, payload, t) {
    const p = readPayload(payload);
    if (!p) throw new RangeError('the buffer does not hold keyframes');
    const layer = doc.layers.find((l) => l.id === layerId);
    if (!layer) throw new RangeError(`no layer ${layerId}`);
    const next = C().clone(doc);
    let count = 0, skipped = 0;
    for (const it of p.items) {
      const fx = /^fx\.(e[0-9]+)\./.exec(it.prop);
      if (fx && !layer.effects.some((f) => f.id === fx[1])) { skipped += it.keys.length; continue; }
      checkKeyable(next, layerId, it.prop);
      let keys = keysOf(next, layerId, it.prop);
      for (const k of it.keys) {
        const at = t + k.dt;
        if (at > next.comp.duration + TOL) { skipped++; continue; }
        const tt = Math.min(next.comp.duration, at);
        keys = keys.filter((x) => Math.abs(x.t - tt) >= TOL).concat([{ t: tt, value: checkValue(it.prop, k.value), ease: checkEase(k.ease) }]);
        count++;
      }
      setTrack(next, layerId, it.prop, keys);
    }
    return { doc: TL().assertValid(next.tl) && next, count, skipped };
  }

  ns.keys = {
    TOL, PAYLOAD, validProp, pointProp, keysOf, normalise, setKeyAt, deleteKeyAt, clearTrack, setEase, moveKeys,
    copyKeys, readPayload, pasteKeys, checkValue, checkEase, setTrack,
  };
})(typeof window !== 'undefined' ? window : globalThis);
