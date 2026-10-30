// Slop Effects values: what each layer looks like at a time. A property is its keyframes when it has any (sampled with
// SlopMotion.track, so easing and bezier handles are the shared engine's), else its static base value. Also the 2D
// affine maths: a layer's local matrix is position, then rotation, then scale about the anchor point, and a child's
// world matrix is its parent's world matrix times its own (AE style: the parent moves, rotates and scales the child).
// Pure. Classic script: window.SlopEffects.values.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const D = () => ns.defs;
  const TR = () => g.SlopMotion.track;
  const I = Object.freeze([1, 0, 0, 1, 0, 0]);
  const MAX_DEPTH = 64;

  /** Sampled value of one keyed property of a layer at t, or undefined when it has no keys. */
  function keyed(doc, layerId, prop, t) {
    const tracks = doc.tl.tracks[layerId];
    const keys = tracks && tracks[prop];
    if (!keys || !keys.length) return undefined;
    return TR().sample(keys, t);
  }

  /** Every property of a layer at time t: { position, anchor, scale, rotation, opacity, fx: { effectId: { param } } }. */
  function valuesAt(doc, layer, t) {
    const out = {};
    for (const p of D().PROP_NAMES) {
      const v = keyed(doc, layer.id, p, t);
      const base = layer.base[p];
      out[p] = v !== undefined ? v : (Array.isArray(base) ? base.slice() : base);
    }
    out.fx = {};
    for (const fx of layer.effects) {
      const row = {};
      for (const [name, def] of Object.entries(D().EFFECTS[fx.kind].params)) {
        if (def.type === 'colour') { row[name] = fx.params[name]; continue; }
        const v = keyed(doc, layer.id, `fx.${fx.id}.${name}`, t);
        row[name] = v !== undefined ? v : fx.params[name];
      }
      out.fx[fx.id] = row;
    }
    return out;
  }

  /** Affine product m * n: applying the result equals applying n, then m. */
  function mul(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  }
  const translate = (x, y) => [1, 0, 0, 1, x, y];
  const rotate = (deg) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; };
  const scale = (sx, sy) => [sx, 0, 0, sy, 0, 0];

  /** A layer's own transform: anchor point moved to the origin, scaled, rotated, then placed at its position. */
  function localMatrix(v) {
    const [px, py] = v.position, [ax, ay] = v.anchor, [sx, sy] = v.scale;
    return mul(mul(mul(translate(px, py), rotate(v.rotation)), scale(sx / 100, sy / 100)), translate(-ax, -ay));
  }

  /** Applies a matrix to a point. */
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  /**
   * The state of every layer at time t: Map layerId -> { layer, vals, world }. world is the matrix from the layer's own
   * space to the composition. A parent that is missing (deleted) counts as no parent, and a loop is cut at MAX_DEPTH.
   */
  function frameState(doc, t) {
    const byId = new Map(doc.layers.map((l) => [l.id, l]));
    const out = new Map();
    const worldOf = (layer, depth) => {
      if (out.has(layer.id)) return out.get(layer.id).world;
      const vals = valuesAt(doc, layer, t);
      const parent = layer.parent && depth < MAX_DEPTH ? byId.get(layer.parent) : null;
      const pw = parent && parent.id !== layer.id ? worldOf(parent, depth + 1) : I;
      const world = mul(pw, localMatrix(vals));
      out.set(layer.id, { layer, vals, world });
      return world;
    };
    for (const layer of doc.layers) worldOf(layer, 0);
    return out;
  }

  /** True when setting parent would make a loop (the parent is the layer, or sits below it in its own chain). */
  function wouldLoop(doc, layerId, parentId) {
    let p = parentId;
    for (let i = 0; p && i < MAX_DEPTH; i++) {
      if (p === layerId) return true;
      const l = doc.layers.find((x) => x.id === p);
      p = l ? l.parent : null;
    }
    return false;
  }

  /** The size of a layer's own content in its local space: [0, 0, w, h]. Null has none. */
  function boundsOf(layer) {
    const s = layer.source || {};
    if (layer.type === 'null') return { w: 0, h: 0 };
    return { w: Number(s.w) || 0, h: Number(s.h) || 0 };
  }

  ns.values = { valuesAt, frameState, mul, localMatrix, apply, wouldLoop, boundsOf, I, MAX_DEPTH };
})(typeof window !== 'undefined' ? window : globalThis);
