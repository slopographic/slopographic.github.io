// Slop Effects project format. toData() flattens a document into plain rows that the shared config schema can check
// (the schema has no free-form values, so keys become { layer, prop, t, x, y, ease } rows). fromData() rebuilds the
// document. The same data is the Slop Drive project file and the body of the 'effects-project' config kind. Media is
// referenced by name, size and (optionally) Drive id, never embedded. problems() checks cross references, which the
// type schema cannot. Classic script: window.SlopEffects.project. Needs SlopMotion (timeline, easing) loaded first.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const C = () => ns.core;
  const D = () => ns.defs;
  const K = () => ns.keys;
  const TL = () => g.SlopMotion.timeline;
  const EASE = () => g.SlopMotion.easing;
  const KIND = 'effects-project', APP = 'effects', FILE_FORMAT = 'slop-effects';
  const POINT = (p) => p === 'position' || p === 'anchor' || p === 'scale';

  const encodeEase = (e) => (Array.isArray(e) ? `bez:${e.join(',')}` : e);
  /** Ease from its row form, or throws when it is not one. */
  function decodeEase(s) {
    if (typeof s !== 'string') throw new RangeError('ease must be text');
    if (!s.startsWith('bez:')) return K().checkEase(s);
    const a = s.slice(4).split(',').map(Number);
    if (a.length !== 4 || !a.every(Number.isFinite)) throw new RangeError('bezier ease needs four numbers');
    return K().checkEase(a);
  }

  /** Plain rows for a document (see the header). Keys are listed by layer, then property, then time. */
  function toData(doc) {
    const keys = [];
    for (const layer of doc.layers) {
      const tracks = doc.tl.tracks[layer.id] || {};
      for (const prop of Object.keys(tracks)) {
        for (const k of tracks[prop]) {
          const point = POINT(prop);
          keys.push({ layer: layer.id, prop, t: k.t, x: point ? k.value[0] : k.value, y: point ? k.value[1] : 0, ease: encodeEase(k.ease) });
        }
      }
    }
    return {
      name: doc.name,
      comp: { ...doc.comp },
      layers: doc.layers.map((l) => ({
        id: l.id, name: l.name, type: l.type, hidden: !!l.hidden, parent: l.parent || '',
        base: C().clone(l.base), source: C().clone(l.source),
        effects: l.effects.map((f) => ({ id: f.id, kind: f.kind, on: !!f.on, seed: f.seed, params: C().clone(f.params) })),
      })),
      keys,
      media: doc.media.map((m) => ({ ...m })),
    };
  }

  /** A document from rows (checked with problems() first by the caller). Throws for a broken timeline. */
  function fromData(d) {
    const comp = C().normComp(d.comp);
    const tracks = {};
    const layers = d.layers.map((l) => ({
      id: l.id, name: l.name, type: l.type, hidden: !!l.hidden, parent: l.parent || null,
      base: C().clone(l.base), source: C().clone(l.source),
      effects: l.effects.map((f) => ({ id: f.id, kind: f.kind, on: f.on !== false, seed: f.seed >>> 0, params: C().clone(f.params) })),
    }));
    for (const k of d.keys) {
      const value = POINT(k.prop) ? [k.x, k.y] : k.x;
      (tracks[k.layer] = tracks[k.layer] || {});
      (tracks[k.layer][k.prop] = tracks[k.layer][k.prop] || []).push({ t: k.t, value, ease: decodeEase(k.ease) });
    }
    for (const id of Object.keys(tracks)) for (const p of Object.keys(tracks[id])) tracks[id][p] = K().normalise(tracks[id][p]);
    const tl = TL().assertValid({ ...TL().create({ duration: comp.duration }), tracks });
    const ids = [...layers.map((l) => l.id), ...layers.flatMap((l) => l.effects.map((f) => f.id))];
    const seq = Math.max(1, ...ids.map((id) => parseInt(id.replace(/\D/g, ''), 10) + 1).filter(Number.isFinite));
    return {
      version: C().VERSION, name: d.name, comp, layers, tl,
      media: d.media.map((m) => ({ ...m })), seq,
    };
  }

  /** Cross-reference problems in rows (empty when none). The type schema has already checked the shapes. */
  function problems(d) {
    const out = [];
    const layerIds = new Set(d.layers.map((l) => l.id));
    const mediaIds = new Set(d.media.map((m) => m.id));
    if (layerIds.size !== d.layers.length) out.push('two layers share an id');
    const fxOf = new Map();
    for (const l of d.layers) {
      if (l.parent && !layerIds.has(l.parent)) out.push(`layer ${l.id} is parented to a layer that is not in the file`);
      if (l.parent === l.id) out.push(`layer ${l.id} is parented to itself`);
      if (l.source.mediaId && !mediaIds.has(l.source.mediaId)) out.push(`layer ${l.id} uses media ${l.source.mediaId} that is not listed`);
      const fx = new Map();
      for (const f of l.effects) {
        if (fx.has(f.id)) out.push(`layer ${l.id} has two effects with id ${f.id}`);
        fx.set(f.id, f);
        for (const name of Object.keys(f.params)) {
          if (!D().EFFECTS[f.kind].params[name]) out.push(`effect ${f.id} (${f.kind}) has no parameter ${name}`);
        }
      }
      fxOf.set(l.id, fx);
    }
    for (const k of d.keys) {
      if (!layerIds.has(k.layer)) { out.push(`a key is on layer ${k.layer}, which is not in the file`); continue; }
      const fx = /^fx\.(e[0-9]+)\.([a-z]+)$/.exec(k.prop);
      if (fx) {
        const f = fxOf.get(k.layer).get(fx[1]);
        if (!f) out.push(`a key is on effect ${fx[1]}, which layer ${k.layer} does not have`);
        else if (!D().EFFECTS[f.kind].params[fx[2]] || D().EFFECTS[f.kind].params[fx[2]].type === 'colour') out.push(`a key is on ${k.prop}, which cannot be keyed`);
      }
      try { decodeEase(k.ease); } catch (e) { out.push(`a key on ${k.layer} ${k.prop} has a bad ease: ${e.message}`); }
    }
    return out;
  }

  /** The schema for the 'effects-project' config kind. F is SlopConfig.F. */
  function kindSchema(F) {
    const hex = /^#[0-9a-fA-F]{6}$/;
    const pair = () => F.list(F.num({ min: -1e7, max: 1e7 }), { min: 2, max: 2 });
    const union = D().paramUnion();
    const params = {};
    for (const [name, u] of Object.entries(union)) params[name] = u.colour ? F.str({ max: 9, pattern: hex }) : F.num({ min: u.min, max: u.max });
    const source = F.obj({
      color: F.str({ max: 9, pattern: hex }), w: F.num({ min: 0, max: 16384 }), h: F.num({ min: 0, max: 16384 }),
      shape: F.enum(D().SHAPES.map((s) => s[0])), radius: F.num({ min: 0, max: 16384 }),
      fill: F.str({ max: 9, pattern: hex }), stroke: F.str({ max: 9, pattern: hex }), strokeWidth: F.num({ min: 0, max: 500 }),
      text: F.text({ max: 2000 }), font: F.str({ max: 80 }), size: F.num({ min: 1, max: 2000 }),
      align: F.enum(D().ALIGN), weight: F.int({ min: 100, max: 900 }), mediaId: F.str({ max: 12, pattern: /^m[0-9]{1,8}$/ }),
      dur: F.num({ min: 0, max: 86400 }),
    });
    const layer = F.obj({
      id: F.str({ max: 12, pattern: /^l[0-9]{1,8}$/, required: true }),
      name: F.str({ max: 80, required: true }),
      type: F.enum(D().LAYER_TYPES.map((t) => t[0]), { required: true }),
      hidden: F.bool(),
      parent: F.str({ max: 12, pattern: /^(l[0-9]{1,8})?$/ }),
      base: F.obj({ position: pair(), anchor: pair(), scale: pair(), rotation: F.num({ min: -1e5, max: 1e5 }), opacity: F.num({ min: 0, max: 100 }) }, { required: true }),
      source,
      effects: F.list(F.obj({
        id: F.str({ max: 12, pattern: /^e[0-9]{1,8}$/, required: true }),
        kind: F.enum(D().EFFECT_KINDS, { required: true }),
        on: F.bool(),
        seed: F.int({ min: 0, max: 4294967295 }),
        params: F.obj(params),
      }), { max: 50 }),
    });
    const key = F.obj({
      layer: F.str({ max: 12, pattern: /^l[0-9]{1,8}$/, required: true }),
      prop: F.str({ max: 40, pattern: /^(position|anchor|scale|rotation|opacity|fx\.e[0-9]{1,8}\.[a-z]{1,16})$/, required: true }),
      t: F.num({ min: 0, max: 86400, required: true }),
      x: F.num({ min: -1e7, max: 1e7, required: true }),
      y: F.num({ min: -1e7, max: 1e7, required: true }),
      ease: F.str({ max: 80, pattern: /^(linear|easeInQuad|easeOutQuad|easeInOutQuad|hold|bez:[-0-9.,e]+)$/, required: true }),
    });
    return {
      strict: true,
      fields: {
        name: F.str({ max: 120 }),
        comp: F.obj({
          width: F.int({ min: 16, max: 7680, required: true }), height: F.int({ min: 16, max: 4320, required: true }),
          fps: F.int({ min: 1, max: 120, required: true }), duration: F.num({ min: 0.1, max: 600, required: true }),
          background: F.str({ max: 9, pattern: /^(#[0-9a-fA-F]{6}|transparent)$/, required: true }),
        }, { required: true }),
        layers: F.list(layer, { max: 200 }),
        keys: F.list(key, { max: 5000 }),
        media: F.list(F.obj({
          id: F.str({ max: 12, pattern: /^m[0-9]{1,8}$/, required: true }),
          name: F.str({ max: 200, required: true }),
          kind: F.enum(['image', 'video'], { required: true }),
          w: F.num({ min: 0, max: 16384 }), h: F.num({ min: 0, max: 16384 }),
          dur: F.num({ min: 0, max: 86400 }), size: F.num({ min: 0, max: 1e12 }),
          driveId: F.str({ max: 80, pattern: /^[A-Za-z0-9]{0,80}$/ }),
        }), { max: 200 }),
      },
    };
  }

  /** The config envelope data check through SlopConfig: { ok, errors }. C is SlopConfig. */
  function checkConfig(C, data) {
    const r = C.validate({ format: 'slop-config', version: 1, kind: KIND, app: APP, name: data.name || 'Untitled', created: '2026-01-01T00:00:00Z', data }, { app: APP });
    return { ok: r.ok, errors: r.errors || [] };
  }

  /** The Drive file text for a document, and the reverse (returns { name, data }; throws when the file is not one). */
  const toFile = (doc) => JSON.stringify({ format: FILE_FORMAT, version: 1, name: doc.name, data: toData(doc) }, null, 2);
  function fromFile(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new RangeError('not a JSON file'); }
    if (!obj || obj.format !== FILE_FORMAT || obj.version !== 1 || !obj.data) throw new RangeError('not a Slop Effects project');
    return { name: String(obj.name || 'Untitled'), data: obj.data };
  }

  ns.project = { KIND, APP, FILE_FORMAT, toData, fromData, problems, kindSchema, checkConfig, toFile, fromFile, encodeEase, decodeEase };
})(typeof window !== 'undefined' ? window : globalThis);
