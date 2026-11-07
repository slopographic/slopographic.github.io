/* SlopPresets: one library of effect and motion presets for every editing app (window.SlopPresets).
 * A preset is plain data: { id, kind, label, description?, apps, params }.
 *   kind 'effect'  params = { effects: [{ type, on?, p }] }   (layer / clip effects; types in EFFECT_TYPES)
 *   kind 'motion'  params = { duration, tracks: { x|y|scale|rot|opacity: [{ t, value, ease? }] } }
 *                  x and y are fractions of the frame (-1 = one frame away), rot is in degrees.
 * Built-ins: builtins-effect.js and builtins-motion.js (SlopPresets.BUILTIN_EFFECTS / BUILTIN_MOTION).
 * The person's own presets are kept by store.js in Slop Drive (meta.type 'preset') and have ids starting 'u-'.
 * This file: the vocabulary, validation and the registry (list, get, save, remove). Pure apart from the store.
 * Contract, limits and how an app wires in: shared/presets/HANDOFF.md. */
(function (g) {
  'use strict';
  const SP = (g.SlopPresets = g.SlopPresets || {});

  const KINDS = ['effect', 'motion'];
  /** Apps that can apply presets, by registry id (shared/apps.js). */
  const APPS = { photoslop: 'PhotoSlop', slopedit: 'Slop Cut', slides: 'Slop Slides', remix: 'Reel Remix' };
  const MOTION_APPS = ['slides', 'remix', 'slopedit'];
  const LIMITS = { label: 60, description: 200, apps: 4, effects: 8, tracks: 5, keys: 16, duration: [0.05, 10] };
  const COLOUR = { t: 'color' };
  const num = (min, max) => ({ t: 'num', min, max });
  const PS = ['photoslop'];

  /** Effect types. Each lists its parameters (all required) and the apps that can apply it. Names are the shared
   *  vocabulary; each app maps them to its own effects (photoslop/js/layers/fx-presets.js, slopcut/js/ui/presets.js). */
  const EFFECT_TYPES = {
    'drop-shadow': { apps: PS, params: { color: COLOUR, op: num(0, 100), a: num(-180, 180), dist: num(0, 300), size: num(0, 250) } },
    'inner-shadow': { apps: PS, params: { color: COLOUR, op: num(0, 100), a: num(-180, 180), dist: num(0, 300), size: num(0, 250) } },
    glow: { apps: PS, params: { color: COLOUR, op: num(0, 100), spread: num(0, 40), size: num(1, 250) } },
    'inner-glow': { apps: PS, params: { color: COLOUR, op: num(0, 100), size: num(1, 250) } },
    stroke: { apps: PS, params: { size: num(1, 60), color: COLOUR, pos: { t: 'enum', values: ['inside', 'outside'] } } },
    bevel: { apps: PS, params: { size: num(1, 60), depth: num(10, 500), a: num(-180, 180) } },
    overlay: { apps: PS, params: { color: COLOUR, op: num(0, 100), blend: { t: 'str', pattern: /^[a-z-]{1,20}$/ } } },
    gradient: { apps: PS, params: { c1: COLOUR, c2: COLOUR, op: num(0, 100), a: num(-180, 180), scale: num(10, 300), blend: { t: 'str', pattern: /^[a-z-]{1,20}$/ } } },
    blur: { apps: PS, params: { radius: num(0.1, 100) } },
    sharpen: { apps: PS, params: {} },
    grain: { apps: PS, params: { amount: num(0.1, 100), mono: { t: 'bool' }, seed: num(1, 999) } },
    vignette: { apps: PS, params: { amount: num(0, 100), size: num(10, 150), color: COLOUR } },
    'colour-shift': { apps: PS, params: { hue: num(-180, 180), sat: num(-100, 100), light: num(-100, 100) } },
    glitch: { apps: PS, params: { amount: num(1, 100), shift: num(0, 60), seed: num(1, 999) } },
    'colour-look': { apps: ['slopedit'], params: { temp: num(-100, 100), sat: num(-100, 100), contrast: num(-100, 100), bright: num(-100, 100) } },
  };
  /** A word people read (shared/i18n/ui/<code>/presets.js): ui.presets.<key>, read each time so it follows a language
   *  change; the key itself without SlopI18n (tests load the en table). kid() turns an id into a key part. */
  const word = (k, vars) => (g.SlopI18n ? g.SlopI18n.t('ui.presets.' + k, vars) : 'ui.presets.' + k);
  const kid = (id) => String(id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  // each effect type's label (ui.presets.type.<type>)
  for (const id of Object.keys(EFFECT_TYPES)) Object.defineProperty(EFFECT_TYPES[id], 'label', { enumerable: true, get: () => word('type.' + kid(id)) });

  /** Motion properties: range of each value. x and y are frame fractions; scale is a multiplier; rot degrees. */
  const MOTION_PROPS = { x: [-4, 4], y: [-4, 4], scale: [0, 8], rot: [-3600, 3600], opacity: [0, 1] };
  const EASE_FAMILIES = ['Quad', 'Cubic', 'Quart', 'Back', 'Elastic', 'Bounce'];
  const EASES = ['linear', 'hold'].concat(EASE_FAMILIES.flatMap((f) => ['easeIn', 'easeOut', 'easeInOut'].map((k) => k + f)));
  const ID_PREFIX = 'u-';
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  /* ---------- validation: pure, never throws ---------- */

  function checkEase(e, path, errs) {
    if (e === undefined || EASES.includes(e)) return;
    if (Array.isArray(e) && e.length === 4 && e.every(isNum) && e[0] >= 0 && e[0] <= 1 && e[2] >= 0 && e[2] <= 1) return;
    errs.push({ path, message: `ease must be one of ${EASES.join(', ')} or [x1, y1, x2, y2] (x in 0 to 1)` });
  }
  function checkTrack(prop, keys, duration, path, errs) {
    const [lo, hi] = MOTION_PROPS[prop];
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > LIMITS.keys) { errs.push({ path, message: `needs 1 to ${LIMITS.keys} keys` }); return; }
    let prev = -1;
    keys.forEach((k, i) => {
      const kp = `${path}[${i}]`;
      if (!isObj(k)) { errs.push({ path: kp, message: 'a key is an object { t, value, ease? }' }); return; }
      for (const f of Object.keys(k)) if (!['t', 'value', 'ease'].includes(f)) errs.push({ path: `${kp}.${f}`, message: 'unknown key' });
      if (!isNum(k.t) || k.t < 0 || k.t > duration) errs.push({ path: kp + '.t', message: `t must be a number from 0 to the duration (${duration})` });
      else if (k.t <= prev) errs.push({ path: kp + '.t', message: 'key times must increase' });
      else prev = k.t;
      if (!isNum(k.value) || k.value < lo || k.value > hi) errs.push({ path: kp + '.value', message: `${prop} must be a number from ${lo} to ${hi}` });
      checkEase(k.ease, kp + '.ease', errs);
    });
  }
  function checkMotion(p, errs) {
    for (const f of Object.keys(p)) if (!['duration', 'tracks'].includes(f)) errs.push({ path: 'params.' + f, message: 'unknown key' });
    if (!isNum(p.duration) || p.duration < LIMITS.duration[0] || p.duration > LIMITS.duration[1]) errs.push({ path: 'params.duration', message: `duration must be from ${LIMITS.duration[0]} to ${LIMITS.duration[1]} seconds` });
    if (!isObj(p.tracks)) { errs.push({ path: 'params.tracks', message: 'tracks is an object of property lists' }); return; }
    const names = Object.keys(p.tracks);
    if (!names.length || names.length > LIMITS.tracks) errs.push({ path: 'params.tracks', message: `1 to ${LIMITS.tracks} tracks` });
    for (const prop of names) {
      if (!hasOwn(MOTION_PROPS, prop)) { errs.push({ path: 'params.tracks.' + prop, message: `unknown property (use ${Object.keys(MOTION_PROPS).join(', ')})` }); continue; }
      checkTrack(prop, p.tracks[prop], isNum(p.duration) ? p.duration : 0, 'params.tracks.' + prop, errs);
    }
  }
  function checkParamValue(spec, v, path, errs) {
    if (spec.t === 'color') { if (typeof v !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) errs.push({ path, message: 'a colour as #rrggbb' }); }
    else if (spec.t === 'num') { if (!isNum(v) || v < spec.min || v > spec.max) errs.push({ path, message: `a number from ${spec.min} to ${spec.max}` }); }
    else if (spec.t === 'bool') { if (typeof v !== 'boolean') errs.push({ path, message: 'true or false' }); }
    else if (spec.t === 'enum') { if (!spec.values.includes(v)) errs.push({ path, message: `one of ${spec.values.join(', ')}` }); }
    else if (spec.t === 'str') { if (typeof v !== 'string' || !spec.pattern.test(v)) errs.push({ path, message: 'a short lowercase word' }); }
  }
  function checkEffects(p, apps, errs) {
    for (const f of Object.keys(p)) if (f !== 'effects') errs.push({ path: 'params.' + f, message: 'unknown key' });
    if (!Array.isArray(p.effects) || !p.effects.length || p.effects.length > LIMITS.effects) { errs.push({ path: 'params.effects', message: `1 to ${LIMITS.effects} effects` }); return; }
    p.effects.forEach((e, i) => {
      const ep = `params.effects[${i}]`;
      if (!isObj(e)) { errs.push({ path: ep, message: 'an effect is { type, on?, p }' }); return; }
      for (const f of Object.keys(e)) if (!['type', 'on', 'p'].includes(f)) errs.push({ path: `${ep}.${f}`, message: 'unknown key' });
      const def = hasOwn(EFFECT_TYPES, e.type) ? EFFECT_TYPES[e.type] : null;
      if (!def) { errs.push({ path: ep + '.type', message: `unknown effect (use ${Object.keys(EFFECT_TYPES).join(', ')})` }); return; }
      if (e.on !== undefined && typeof e.on !== 'boolean') errs.push({ path: ep + '.on', message: 'true or false' });
      for (const a of apps) if (!def.apps.includes(a)) errs.push({ path: ep + '.type', message: `${e.type} does not apply in ${APPS[a] || a}` });
      if (!isObj(e.p)) { errs.push({ path: ep + '.p', message: 'the effect settings object' }); return; }
      for (const k of Object.keys(def.params)) {
        if (!hasOwn(e.p, k)) errs.push({ path: `${ep}.p.${k}`, message: 'required' });
        else checkParamValue(def.params[k], e.p[k], `${ep}.p.${k}`, errs);
      }
      for (const k of Object.keys(e.p)) if (!hasOwn(def.params, k)) errs.push({ path: `${ep}.p.${k}`, message: 'unknown setting' });
    });
  }
  /** Copies the input into the stored shape: trimmed label, unique apps, plain numbers. */
  function clean(input) {
    const out = { kind: input.kind, label: String(input.label).trim(), apps: [...new Set(input.apps)] };
    if (input.description !== undefined && input.description !== '') out.description = String(input.description).trim();
    out.params = JSON.parse(JSON.stringify(input.params));
    if (out.kind === 'motion') for (const prop of Object.keys(out.params.tracks)) out.params.tracks[prop] = out.params.tracks[prop].map((k) => ({ t: k.t, value: k.value, ...(k.ease !== undefined ? { ease: k.ease } : {}) }));
    return out;
  }
  /**
   * Checks a preset (no id). Returns { ok, value, errors: [{ path, message }] }; value is the cleaned copy when ok.
   * Never throws: a bad preset returns the list of problems, each with the path to the bad field.
   */
  function validate(input) {
    const errs = [];
    if (!isObj(input)) return { ok: false, value: null, errors: [{ path: '', message: 'a preset is an object' }] };
    for (const f of Object.keys(input)) if (!['kind', 'label', 'description', 'apps', 'params'].includes(f)) errs.push({ path: f, message: 'unknown key' });
    if (!KINDS.includes(input.kind)) errs.push({ path: 'kind', message: 'effect or motion' });
    if (typeof input.label !== 'string' || !input.label.trim() || input.label.trim().length > LIMITS.label || /[\x00-\x1f\x7f]/.test(input.label)) errs.push({ path: 'label', message: `a name of 1 to ${LIMITS.label} characters` });
    if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > LIMITS.description)) errs.push({ path: 'description', message: `text up to ${LIMITS.description} characters` });
    const apps = input.apps;
    const appsOk = Array.isArray(apps) && apps.length >= 1 && apps.length <= LIMITS.apps && apps.every((a) => hasOwn(APPS, a));
    if (!appsOk) errs.push({ path: 'apps', message: `1 to ${LIMITS.apps} of ${Object.keys(APPS).join(', ')}` });
    if (appsOk && new Set(apps).size !== apps.length) errs.push({ path: 'apps', message: 'each app once' });
    const list = appsOk ? apps : [];
    if (input.kind === 'effect') checkEffects(isObj(input.params) ? input.params : {}, list, errs);
    else if (input.kind === 'motion') {
      if (!isObj(input.params)) errs.push({ path: 'params', message: 'the motion settings object' });
      else checkMotion(input.params, errs);
      for (const a of list) if (!MOTION_APPS.includes(a)) errs.push({ path: 'apps', message: `motion does not apply in ${APPS[a]}` });
    } else if (!isObj(input.params)) errs.push({ path: 'params', message: 'the settings object' });
    if (errs.length) return { ok: false, value: null, errors: errs };
    return { ok: true, value: clean(input), errors: [] };
  }

  /* ---------- registry ---------- */

  let user = new Map(), store = null, loaded = false;
  const newId = () => ID_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const copy = (r) => JSON.parse(JSON.stringify(r));
  /** The preset data of a record (drops id, created, modified and builtin). */
  const dataOf = (r) => { const d = {}; for (const f of ['kind', 'label', 'description', 'apps', 'params']) if (r[f] !== undefined) d[f] = r[f]; return d; };
  /** A store that keeps records in memory (node tests, and pages without Slop Drive). */
  function memoryStore() {
    const rows = new Map();
    return {
      async list() { return [...rows.values()].map(copy); },
      async put(rec) { rows.set(rec.id, copy(rec)); return rec.id; },
      async remove(id) { rows.delete(id); },
    };
  }
  function emit() {
    if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') g.dispatchEvent(new g.CustomEvent('slop-presets:change'));
  }
  /** Built-in presets, copies, flagged builtin: true, with the name and description in the chosen language
   *  (ui.presets.b.<id>, ui.presets.bd.<id>). */
  function builtins() {
    return [].concat(SP.BUILTIN_EFFECTS || [], SP.BUILTIN_MOTION || []).map((b) => Object.assign(copy(b), { label: word('b.' + kid(b.id)), description: word('bd.' + kid(b.id)), builtin: true }));
  }
  const isBuiltin = (id) => [].concat(SP.BUILTIN_EFFECTS || [], SP.BUILTIN_MOTION || []).some((b) => b.id === id);
  const matches = (r, o) => (!o.kind || r.kind === o.kind) && (!o.app || r.apps.includes(o.app));
  /** Every preset (built-in first, then the person's by label), optionally { kind, app }. Copies. */
  function list(o = {}) {
    const mine = [...user.values()].map((r) => Object.assign(copy(r), { builtin: false })).sort((a, b) => a.label.localeCompare(b.label));
    return builtins().concat(mine).filter((r) => matches(r, o));
  }
  function get(id) {
    const b = builtins().find((r) => r.id === id);
    if (b) return b;
    const u = user.get(id);
    return u ? Object.assign(copy(u), { builtin: false }) : null;
  }
  /** Replaces the store (page: SlopPresets.useDrive(); tests: a memory store). Forgets what was loaded. */
  function setStore(s) { store = s; user = new Map(); loaded = false; }
  /** Reads the store into the registry. Bad records are skipped and counted in SlopPresets.skipped. */
  async function load() {
    if (!store) store = memoryStore();
    const rows = await store.list();
    user = new Map();
    SP.skipped = 0;
    for (const r of rows) {
      const v = r && typeof r.id === 'string' && r.id.startsWith(ID_PREFIX) ? validate(dataOf(r)) : { ok: false };
      if (v.ok) user.set(r.id, Object.assign({}, v.value, { id: r.id, created: r.created || 0, modified: r.modified || 0 }));
      else SP.skipped++;
    }
    loaded = true;
    emit();
    return user.size;
  }
  /**
   * Saves a preset (new, or replacing the one with id). Validates first: a bad preset is not written.
   * Resolves { ok, id, record } or { ok: false, errors }.
   */
  async function save(input, opts = {}) {
    const v = validate(input);
    if (!v.ok) return { ok: false, errors: v.errors };
    if (!store) store = memoryStore();
    if (opts.id && isBuiltin(opts.id)) return { ok: false, errors: [{ path: 'id', message: 'built-in presets cannot be changed' }] };
    const now = Date.now();
    const prev = opts.id && user.get(opts.id);
    const rec = Object.assign({}, v.value, { id: prev ? opts.id : newId(), created: prev ? prev.created : now, modified: now });
    const id = await store.put(rec);
    rec.id = id;
    if (prev && id !== prev.id) user.delete(prev.id);
    user.set(id, rec);
    emit();
    return { ok: true, id, record: Object.assign(copy(rec), { builtin: false }) };
  }
  /** Deletes one of the person's presets. Built-ins are refused. */
  async function remove(id) {
    if (isBuiltin(id)) return { ok: false, errors: [{ path: 'id', message: 'built-in presets cannot be removed' }] };
    if (!user.has(id)) return { ok: false, errors: [{ path: 'id', message: 'no such preset' }] };
    if (store) await store.remove(id);
    user.delete(id);
    emit();
    return { ok: true };
  }

  Object.assign(SP, {
    KINDS, APPS, MOTION_APPS, EFFECT_TYPES, MOTION_PROPS, EASES, LIMITS, ID_PREFIX,
    validate, list, get, save, remove, load, setStore, builtins, isBuiltin, memoryStore, word, kid,
    isLoaded: () => loaded, skipped: 0,
  });
})(typeof window !== 'undefined' ? window : globalThis);
