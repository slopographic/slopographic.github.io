// Slop Effects: the fixed definitions the model and the UI share. Layer types, shapes, comp sizes (social formats),
// easing choices, the effect list with each parameter's range, and the properties a layer can animate.
// Pure data. Classic script: exposes window.SlopEffects.defs. Loads in Node too (see tests/node/effects-env.mjs).
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});

  const LAYER_TYPES = [['solid', 'Solid'], ['shape', 'Shape'], ['text', 'Text'], ['image', 'Image'], ['video', 'Video'], ['null', 'Null']];
  const SHAPES = [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['rrect', 'Rounded rectangle'], ['line', 'Line']];
  const FPS = [24, 25, 30, 50, 60];
  const ALIGN = ['left', 'center', 'right'];

  /** Social and screen formats. Sizes are even numbers (encoders need it). 'custom' keeps whatever size is typed. */
  const SIZES = [
    { id: 'youtube', name: 'YouTube and landscape 1920×1080 (16:9)', w: 1920, h: 1080 },
    { id: 'shorts', name: 'Shorts, Reels, TikTok and Stories 1080×1920 (9:16)', w: 1080, h: 1920 },
    { id: 'square', name: 'Instagram and feed square 1080×1080 (1:1)', w: 1080, h: 1080 },
    { id: 'portrait', name: 'Instagram portrait 1080×1350 (4:5)', w: 1080, h: 1350 },
    { id: 'x', name: 'X and LinkedIn landscape 1200×675 (16:9)', w: 1200, h: 675 },
    { id: '4k', name: '4K landscape 3840×2160 (16:9)', w: 3840, h: 2160 },
    { id: 'custom', name: 'Custom', w: 1920, h: 1080 },
  ];
  const LIMIT = { minSide: 16, maxW: 7680, maxH: 4320, minDur: 0.1, maxDur: 600 };

  /** Easing choices for a key's segment. 'bezier' means a custom [x1, y1, x2, y2] (kept in the key). */
  const EASES = [
    ['linear', 'Linear'], ['easeInQuad', 'Ease in'], ['easeOutQuad', 'Ease out'], ['easeInOutQuad', 'Ease in-out'],
    ['hold', 'Hold'], ['bezier', 'Custom bezier'],
  ];

  /** Animatable layer properties: name, label, kind (point = [x, y], number), and the default static value. */
  const PROPS = [
    { name: 'position', label: 'Position', kind: 'point', unit: 'px' },
    { name: 'anchor', label: 'Anchor point', kind: 'point', unit: 'px' },
    { name: 'scale', label: 'Scale', kind: 'point', unit: '%' },
    { name: 'rotation', label: 'Rotation', kind: 'number', unit: '°' },
    { name: 'opacity', label: 'Opacity', kind: 'number', unit: '%' },
  ];
  const PROP_NAMES = PROPS.map((p) => p.name);

  /**
   * The effect list, in the order a Random motion or the stack shows it. Each param has a label, range, default and
   * step. type 'colour' params are not keyed (a hex string); the rest are numbers and can take keyframes.
   * Parameter names are shared across kinds where the meaning is the same (amount, radius), and the union of names
   * is what the project schema accepts (see project.js).
   */
  const EFFECTS = {
    blur: { label: 'Blur', params: {
      radius: { label: 'Radius', min: 0, max: 200, def: 0, step: 0.5 },
    } },
    shadow: { label: 'Drop shadow', params: {
      x: { label: 'Distance X', min: -2000, max: 2000, def: 20, step: 1 },
      y: { label: 'Distance Y', min: -2000, max: 2000, def: 20, step: 1 },
      blur: { label: 'Softness', min: 0, max: 200, def: 12, step: 0.5 },
      opacity: { label: 'Opacity', min: 0, max: 1, def: 0.6, step: 0.01 },
      colour: { label: 'Colour', type: 'colour', def: '#000000' },
    } },
    glow: { label: 'Glow', params: {
      radius: { label: 'Radius', min: 0, max: 200, def: 24, step: 0.5 },
      intensity: { label: 'Intensity', min: 0, max: 2, def: 0.8, step: 0.01 },
      colour: { label: 'Colour', type: 'colour', def: '#ffffff' },
    } },
    colour: { label: 'Colour correction', params: {
      brightness: { label: 'Brightness', min: -100, max: 100, def: 0, step: 1 },
      contrast: { label: 'Contrast', min: -100, max: 100, def: 0, step: 1 },
      saturation: { label: 'Saturation', min: 0, max: 200, def: 100, step: 1 },
      hue: { label: 'Hue', min: -180, max: 180, def: 0, step: 1 },
    } },
    grain: { label: 'Grain', params: {
      amount: { label: 'Amount', min: 0, max: 1, def: 0.3, step: 0.01 },
      size: { label: 'Grain size', min: 1, max: 8, def: 1, step: 1 },
    } },
    vignette: { label: 'Vignette', params: {
      amount: { label: 'Amount', min: 0, max: 1, def: 0.5, step: 0.01 },
      feather: { label: 'Feather', min: 0, max: 1, def: 0.5, step: 0.01 },
    } },
    glitch: { label: 'Glitch', params: {
      amount: { label: 'Amount', min: 0, max: 1, def: 0.3, step: 0.01 },
    } },
  };
  const EFFECT_KINDS = Object.keys(EFFECTS);

  /** Every parameter name any effect uses, with its widest range (the project schema checks against these). */
  function paramUnion() {
    const out = {};
    for (const k of EFFECT_KINDS) for (const [name, p] of Object.entries(EFFECTS[k].params)) {
      const o = out[name] || (out[name] = { min: Infinity, max: -Infinity, colour: false });
      if (p.type === 'colour') o.colour = true; else { o.min = Math.min(o.min, p.min); o.max = Math.max(o.max, p.max); }
    }
    return out;
  }

  /** Clamps a number parameter to its kind's range. Unknown kind or name gives null. */
  function clampParam(kind, name, v) {
    const p = EFFECTS[kind] && EFFECTS[kind].params[name];
    if (!p || p.type === 'colour') return null;
    const n = Number.isFinite(v) ? v : p.def;
    return Math.min(p.max, Math.max(p.min, n));
  }

  /** The default parameter values of an effect kind (a fresh object). */
  function defaultParams(kind) {
    const out = {};
    for (const [name, p] of Object.entries(EFFECTS[kind].params)) out[name] = p.def;
    return out;
  }

  /** Scale properties that the presets and Random motion may write, with their ranges (for the bounds inputs). */
  const MOTION_RANGES = {
    position: { x: [-4000, 4000], y: [-4000, 4000] },
    scale: [0, 400],
    rotation: [-720, 720],
    opacity: [0, 100],
  };

  ns.defs = {
    LAYER_TYPES, SHAPES, FPS, ALIGN, SIZES, LIMIT, EASES, PROPS, PROP_NAMES,
    EFFECTS, EFFECT_KINDS, paramUnion, clampParam, defaultParams, MOTION_RANGES,
    /** Label for a layer type or effect kind, or the id itself. */
    label: (list, id) => ((list.find((x) => x[0] === id) || [id, id])[1]),
    /** Words a person reads (effects/i18n, shared/i18n/APPS-HOWTO.md): t(key, vars), the key itself without SlopI18n (Node).
       word(kind, id, en): the label of a definition above in the chosen language (effects.def.<kind>.<id>), else en.
       onLang(fn): fn after a language change, once the new tables are in. The definitions themselves stay English (API). */
    t: (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key),
    word: (kind, id, en) => { const k = 'effects.def.' + kind + '.' + String(id).replace(/[^a-z0-9]+/gi, '_').toLowerCase(); return g.SlopI18n && g.SlopI18n.has(k) ? g.SlopI18n.t(k) : en; },
    onLang: (fn) => { if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(fn); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
