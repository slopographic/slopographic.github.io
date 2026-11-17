// Slop Effects layer operations: add, remove, duplicate, reorder (index 0 is the top of the stack), rename, hide,
// parent, static base values, source fields, and the effect stack of each layer. Every function takes a document and
// returns a new one (or { doc, id } when it makes something). Pure. Classic script: window.SlopEffects.layers.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const C = () => ns.core;
  const D = () => ns.defs;
  const V = () => ns.values;
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  /** The seed of an effect id: the shared FNV hash when the video core is loaded, else a fixed fallback. */
  const seedOf = (id) => (g.SlopVideo && g.SlopVideo.seed ? g.SlopVideo.seed.hash(id) : (parseInt(id.slice(1), 10) * 2654435761) >>> 0);

  /** Adds a layer at the top of the stack (or at index opts.index). Returns { doc, id }. */
  function addLayer(doc, type, opts = {}) {
    const next = C().clone(doc);
    const layer = C().makeLayer(next, type, opts);
    const at = Number.isInteger(opts.index) ? Math.min(Math.max(0, opts.index), next.layers.length) : 0;
    next.layers.splice(at, 0, layer);
    return { doc: next, id: layer.id };
  }

  /** Removes a layer and its keys. Layers parented to it are left unparented. */
  function removeLayer(doc, id) {
    const next = C().clone(doc);
    next.layers = next.layers.filter((l) => l.id !== id);
    for (const l of next.layers) if (l.parent === id) l.parent = null;
    delete next.tl.tracks[id];
    return next;
  }

  /** Copies a layer above itself, with new ids for the layer and its effects, and copies of its keys. Returns { doc, id }. */
  function duplicateLayer(doc, id) {
    const next = C().clone(doc);
    const i = next.layers.findIndex((l) => l.id === id);
    if (i < 0) throw new RangeError(`no layer ${id}`);
    const src = next.layers[i];
    const copy = C().clone(src);
    copy.id = C().nextId(next, 'l');
    copy.name = `${src.name} copy`.slice(0, 80);
    const idMap = { [src.id]: copy.id };
    copy.effects = copy.effects.map((fx) => {
      const nid = C().nextId(next, 'e');
      idMap[fx.id] = nid;
      return { ...fx, id: nid };
    });
    next.layers.splice(i, 0, copy);
    const tracks = next.tl.tracks[src.id];
    if (tracks) {
      const out = {};
      for (const [prop, keys] of Object.entries(tracks)) {
        const m = /^fx\.([a-z0-9]+)\.(\w+)$/.exec(prop);
        const newProp = m && idMap[m[1]] ? `fx.${idMap[m[1]]}.${m[2]}` : prop;
        out[newProp] = keys.map((k) => ({ ...k }));
      }
      next.tl.tracks[copy.id] = out;
    }
    return { doc: next, id: copy.id };
  }

  /** Moves a layer up (delta -1) or down (delta 1) in the stack. Stops at the ends. */
  function moveLayer(doc, id, delta) {
    const next = C().clone(doc);
    const i = next.layers.findIndex((l) => l.id === id);
    const j = i + (delta < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= next.layers.length) return next;
    [next.layers[i], next.layers[j]] = [next.layers[j], next.layers[i]];
    return next;
  }

  /** Changes a layer in place on a clone. fn(layer, next) returns nothing. Throws for an unknown id. */
  function patchLayer(doc, id, fn) {
    const next = C().clone(doc);
    const layer = next.layers.find((l) => l.id === id);
    if (!layer) throw new RangeError(`no layer ${id}`);
    fn(layer, next);
    return next;
  }

  const rename = (doc, id, name) => patchLayer(doc, id, (l) => { l.name = String(name || '').trim().slice(0, 80) || l.name; });
  const setHidden = (doc, id, hidden) => patchLayer(doc, id, (l) => { l.hidden = !!hidden; });

  /** Parents a layer to another layer, or to none (null). A parent that would make a loop is refused. */
  function setParent(doc, id, parentId) {
    if (parentId && !doc.layers.some((l) => l.id === parentId)) throw new RangeError(`no layer ${parentId}`);
    if (parentId && V().wouldLoop(doc, id, parentId)) throw new RangeError('that parent would make a loop');
    return patchLayer(doc, id, (l) => { l.parent = parentId || null; });
  }

  /**
   * Sets a static (unkeyed) base value: position, anchor and scale take [x, y]; rotation and opacity a number. The
   * value is clamped to sensible ranges (opacity 0 to 100, scale 0 to 1000).
   */
  function setBase(doc, id, prop, value) {
    const def = D().PROPS.find((p) => p.name === prop);
    if (!def) throw new RangeError(`unknown property ${prop}`);
    let v = def.kind === 'point' ? [Number(value[0]) || 0, Number(value[1]) || 0] : Number(value) || 0;
    if (prop === 'opacity') v = Math.min(100, Math.max(0, v));
    return patchLayer(doc, id, (l) => { l.base[prop] = v; });
  }

  /** Changes source fields of a layer (colour, text, shape, size and so on). Unknown keys are refused. */
  function setSource(doc, id, patch) {
    return patchLayer(doc, id, (l) => {
      for (const k of Object.keys(patch)) {
        if (!hasOwn(l.source, k)) throw new RangeError(`layer ${l.type} has no ${k}`);
        l.source[k] = patch[k];
      }
    });
  }

  /** Adds an effect to the top of a layer's stack. Returns { doc, id }. The seed comes from the id, so it is stable. */
  function addEffect(doc, layerId, kind) {
    if (!D().EFFECTS[kind]) throw new RangeError(`unknown effect ${kind}`);
    const next = C().clone(doc);
    const layer = next.layers.find((l) => l.id === layerId);
    if (!layer) throw new RangeError(`no layer ${layerId}`);
    const id = C().nextId(next, 'e');
    const seed = seedOf(id);
    layer.effects.push({ id, kind, on: true, seed, params: D().defaultParams(kind) });
    return { doc: next, id };
  }

  /** Removes an effect and its keys. */
  function removeEffect(doc, layerId, fxId) {
    return patchLayer(doc, layerId, (l, next) => {
      l.effects = l.effects.filter((f) => f.id !== fxId);
      const tracks = next.tl.tracks[layerId];
      if (tracks) {
        for (const p of Object.keys(tracks)) if (p.startsWith(`fx.${fxId}.`)) delete tracks[p];
        if (!Object.keys(tracks).length) delete next.tl.tracks[layerId];
      }
    });
  }

  /** Moves an effect up (-1) or down (+1) in the stack. */
  function moveEffect(doc, layerId, fxId, delta) {
    return patchLayer(doc, layerId, (l) => {
      const i = l.effects.findIndex((f) => f.id === fxId);
      const j = i + (delta < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= l.effects.length) return;
      [l.effects[i], l.effects[j]] = [l.effects[j], l.effects[i]];
    });
  }

  const setEffectOn = (doc, layerId, fxId, on) => patchLayer(doc, layerId, (l) => {
    const fx = l.effects.find((f) => f.id === fxId);
    if (fx) fx.on = !!on;
  });

  /** Static value of an effect parameter. Numbers are clamped to the kind's range; colours are '#rrggbb'. */
  function setEffectParam(doc, layerId, fxId, name, value) {
    return patchLayer(doc, layerId, (l) => {
      const fx = l.effects.find((f) => f.id === fxId);
      if (!fx) throw new RangeError(`no effect ${fxId}`);
      const def = D().EFFECTS[fx.kind].params[name];
      if (!def) throw new RangeError(`effect ${fx.kind} has no ${name}`);
      if (def.type === 'colour') {
        if (!/^#[0-9a-fA-F]{6}$/.test(String(value))) throw new RangeError('colour must be #rrggbb');
        fx.params[name] = String(value);
      } else {
        fx.params[name] = D().clampParam(fx.kind, name, Number(value));
      }
    });
  }

  /** Adds a media record to the bin (replacing one with the same id). Returns the document. */
  function addMedia(doc, rec) {
    const next = C().clone(doc);
    next.media = next.media.filter((m) => m.id !== rec.id).concat([{ ...rec }]);
    return next;
  }

  ns.layers = {
    addLayer, removeLayer, duplicateLayer, moveLayer, patchLayer, rename, setHidden, setParent, setBase, setSource,
    addEffect, removeEffect, moveEffect, setEffectOn, setEffectParam, addMedia, seedOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
