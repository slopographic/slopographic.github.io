// Slop Effects document core: the project document, its composition settings, ids and frame times.
// A document is plain JSON: { version, name, comp, layers, media, tl, seq }. tl is a SlopMotion timeline (targets are
// layer ids; properties are position, anchor, scale, rotation, opacity and 'fx.<effect id>.<param>').
// Every function here returns a new document and never mutates its input (edits clone first).
// Classic script: exposes window.SlopEffects.core. Needs SlopMotion (timeline) loaded first.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const D = () => ns.defs;
  const TL = () => g.SlopMotion.timeline;
  const VERSION = 1;

  /** Deep copy of plain JSON data. */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** Composition settings, checked and clamped. background is '#rrggbb' or 'transparent'. */
  function normComp(c = {}) {
    const L = D().LIMIT;
    const background = /^#[0-9a-fA-F]{6}$/.test(c.background || '') || c.background === 'transparent' ? c.background : '#000000';
    const fps = D().FPS.includes(c.fps) ? c.fps : 30;
    return {
      width: even(clamp(Math.round(c.width || 1920), L.minSide, L.maxW)),
      height: even(clamp(Math.round(c.height || 1080), L.minSide, L.maxH)),
      fps,
      duration: Math.round(clamp(Number.isFinite(c.duration) ? c.duration : 5, L.minDur, L.maxDur) * 1000) / 1000,
      background,
    };
  }

  /** A new empty document. opts: { name, comp }. */
  function newDoc(opts = {}) {
    const comp = normComp(opts.comp);
    return {
      version: VERSION,
      name: String(opts.name || 'Untitled').slice(0, 120),
      comp,
      layers: [],
      media: [],
      tl: TL().create({ duration: comp.duration }),
      seq: 1,
    };
  }

  /** A fresh id with a prefix, from the document's counter. Mutates doc.seq, so call it on a clone. */
  function nextId(doc, prefix) {
    const id = prefix + doc.seq;
    doc.seq += 1;
    return id;
  }

  /** Whole frames in the composition (round, so 2.5 s at 30 fps is 75). */
  const frameCount = (comp) => Math.max(1, Math.round(comp.duration * comp.fps));
  /** Time of frame i. */
  const frameTime = (comp, i) => i / comp.fps;
  /** The frame nearest a time, clamped to the composition. */
  const frameAt = (comp, t) => clamp(Math.round(t * comp.fps), 0, frameCount(comp) - 1);
  /** Snaps a time to the nearest frame of the composition. */
  const snap = (comp, t) => Math.round(t * comp.fps) / comp.fps;

  /** A static, unanimated base: centred, 100 %, not rotated, fully opaque. */
  function baseFor(comp, w, h) {
    return { position: [comp.width / 2, comp.height / 2], anchor: [w / 2, h / 2], scale: [100, 100], rotation: 0, opacity: 100 };
  }

  /** Default name for a new layer of a type: "Solid 3" counts the layers of that type already there. */
  function layerName(doc, type) {
    const label = D().label(D().LAYER_TYPES, type);
    const n = doc.layers.filter((l) => l.type === type).length + 1;
    return `${label} ${n}`;
  }

  /**
   * A new layer (not yet in the document). opts: { name, shape, color, text, w, h, mediaId, base }.
   * type is one of defs.LAYER_TYPES. Sizes are in composition pixels; media sizes come from the media record.
   */
  function makeLayer(doc, type, opts = {}) {
    if (!D().LAYER_TYPES.some((t) => t[0] === type)) throw new RangeError(`unknown layer type "${type}"`);
    const comp = doc.comp;
    const id = nextId(doc, 'l');
    let source = {};
    let w = 0, h = 0;
    if (type === 'solid') {
      w = Number.isFinite(opts.w) ? opts.w : comp.width; h = Number.isFinite(opts.h) ? opts.h : comp.height;
      source = { color: opts.color || '#3b82f6', w, h };
    } else if (type === 'shape') {
      w = opts.w || 480; h = opts.h || 360;
      source = { shape: opts.shape || 'rect', w, h, radius: 48, fill: '#f5f5f5', stroke: '#000000', strokeWidth: 0 };
    } else if (type === 'text') {
      const size = opts.size || 120;
      w = opts.w || Math.round(size * 4); h = opts.h || Math.round(size * 1.2);
      source = { text: opts.text || 'Slop Effects', font: opts.font || 'Inter', size, color: '#ffffff', align: 'center', weight: 700, w, h };
    } else if (type === 'image' || type === 'video') {
      w = opts.w || comp.width; h = opts.h || comp.height;
      source = { mediaId: opts.mediaId || '', w, h };
      if (type === 'video') source.dur = opts.dur || 0;
    }
    const layer = {
      id,
      name: String(opts.name || layerName(doc, type)).slice(0, 80),
      type,
      hidden: false,
      parent: null,
      base: { ...baseFor(comp, w, h), ...(opts.base || {}) },
      source,
      effects: [],
    };
    return layer;
  }

  /** The layer with an id, or null. */
  const findLayer = (doc, id) => doc.layers.find((l) => l.id === id) || null;

  /** Keyed tracks of a layer, as the timeline stores them ({} when none). */
  const tracksOf = (doc, id) => (doc.tl.tracks[id] ? doc.tl.tracks[id] : {});

  ns.core = {
    VERSION, clone, clamp, normComp, newDoc, nextId, frameCount, frameTime, frameAt, snap,
    makeLayer, layerName, baseFor, findLayer, tracksOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
