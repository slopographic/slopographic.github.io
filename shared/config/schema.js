/* SlopConfig: the one shared, versioned format for every app's shareable config, templates and settings.
 * A .slop.json file is one envelope around kind-specific data:
 *   { format: "slop-config", version: 1, kind, app, name, description?, created, data }
 * Apps register the kinds they understand with SlopConfig.registerKind(kind, app, schema, apply, opts), so the format
 * lives here and nowhere else. app '*' registers a shared kind (settings, numbering) that any app may import.
 * Classic script, no dependencies. Exposes window.SlopConfig. validate.js, io.js, template.js, kinds.js, prompt.js and
 * the dialogs add to it. Full contract: shared/config/HANDOFF.md. */
(function (g) {
  'use strict';
  const C = (g.SlopConfig = g.SlopConfig || {});
  const FORMAT = 'slop-config', VERSION = 1, SHARED = '*', SHARED_APP = 'slop';
  const APP_RX = /^[a-z0-9][a-z0-9-]{0,39}$/; // app ids come from shared/apps.js; one of them is '3d'
  const LIMITS = Object.freeze({ bytes: 5 * 1024 * 1024, text: 5000, str: 200, items: 200, rows: 1000, cols: 100, errors: 50 });
  const ENVELOPE_KEYS = Object.freeze(['format', 'version', 'kind', 'app', 'name', 'description', 'created', 'data']);
  const KIND_RX = /^[a-z][a-z0-9-]{0,39}$/;
  const TYPES = ['string', 'text', 'number', 'bool', 'enum', 'currency', 'locale', 'cell', 'array', 'object'];
  const entries = new Map(); // "app/kind" → entry

  /** Field specs. Plain objects, so a schema can be read back for prompts and docs. required: true makes a key mandatory. */
  const F = {
    str: (o = {}) => ({ type: 'string', max: LIMITS.str, ...o }),
    text: (o = {}) => ({ type: 'text', max: LIMITS.text, ...o }),
    num: (o = {}) => ({ type: 'number', min: -1e12, max: 1e12, ...o }),
    int: (o = {}) => ({ type: 'number', integer: true, min: -1e12, max: 1e12, ...o }),
    bool: (o = {}) => ({ type: 'bool', ...o }),
    enum: (values, o = {}) => ({ type: 'enum', values: values.slice(), ...o }),
    currency: (o = {}) => ({ type: 'currency', ...o }),
    locale: (o = {}) => ({ type: 'locale', ...o }),
    cell: (o = {}) => ({ type: 'cell', ...o }),
    list: (items, o = {}) => ({ type: 'array', items, min: 0, max: LIMITS.items, ...o }),
    obj: (fields, o = {}) => ({ type: 'object', fields, strict: true, ...o }),
  };

  /** Throws on a broken schema. Registration is a developer step, so a bad schema fails loudly at once. */
  function assertSpec(s, path) {
    if (!s || typeof s !== 'object' || !TYPES.includes(s.type)) throw new Error(`registerKind: ${path} has no valid type`);
    if (s.type === 'enum' && (!Array.isArray(s.values) || !s.values.length)) throw new Error(`registerKind: ${path} needs values`);
    if (s.type === 'array') assertSpec(s.items, `${path}[]`);
    if (s.type === 'object') {
      if (!s.fields || typeof s.fields !== 'object') throw new Error(`registerKind: ${path} needs fields`);
      for (const [k, v] of Object.entries(s.fields)) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(k)) throw new Error(`registerKind: ${path}.${k} is not a valid key`);
        assertSpec(v, `${path}.${k}`);
      }
    }
  }

  /**
   * registerKind(kind, app, schema, apply, opts): schema = { fields, strict = true }; apply(data, ctx) runs after the
   * file has validated (it may return a promise, and throw to roll back). opts: { read(), label, description }; label and
   * description may be i18n keys or functions (read when shown, so they follow a language change); read gives
   * the current data so the Export dialog can offer the kind. opts.check(data) → [{ path, message }] adds rules the schema
   * cannot express; it runs only after the shape passed. Throws on a bad or duplicate registration.
   */
  function registerKind(kind, app, schema, apply, opts = {}) {
    if (typeof kind !== 'string' || !KIND_RX.test(kind)) throw new Error(`registerKind: bad kind name "${kind}"`);
    if (app !== SHARED && (typeof app !== 'string' || !APP_RX.test(app))) throw new Error(`registerKind: bad app id "${app}"`);
    if (!schema || typeof schema !== 'object' || !schema.fields) throw new Error(`registerKind: ${kind} needs a schema with fields`);
    if (typeof apply !== 'function') throw new Error(`registerKind: ${kind} needs an apply function`);
    const spec = { type: 'object', fields: schema.fields, strict: schema.strict !== false };
    assertSpec(spec, kind);
    const key = `${app}/${kind}`;
    if (entries.has(key)) throw new Error(`registerKind: ${key} is already registered`);
    const lab = (v) => { const I = g.SlopI18n; return String(I && I.label ? I.label(v) : typeof v === 'function' ? v() : v); };
    entries.set(key, {
      kind, app, schema: spec, apply,
      read: typeof opts.read === 'function' ? opts.read : null,
      // read each time: a key ('ui.config.kind_settings') or a function follows a language change (SlopI18n.label)
      get label() { return opts.label ? lab(opts.label) : kind; },
      get description() { return opts.description ? lab(opts.description) : ''; },
      check: typeof opts.check === 'function' ? opts.check : null,
    });
  }

  /** The kind an app's file means: the app's own kind first, then a shared one. null when neither exists. */
  function getKind(kind, app) {
    return entries.get(`${app}/${kind}`) || entries.get(`${SHARED}/${kind}`) || null;
  }

  /** The apps that register a kind (for "registered for tables, not slides" messages). */
  function owners(kind) {
    return [...entries.values()].filter((e) => e.kind === kind && e.app !== SHARED).map((e) => e.app);
  }

  /** Kinds an app can import or export: its own and the shared ones. */
  function kinds(app) {
    return [...entries.values()].filter((e) => e.app === app || e.app === SHARED);
  }

  /** Builds the envelope object (not validated). created defaults to now. */
  function envelope(kind, app, name, data, opts = {}) {
    const env = { format: FORMAT, version: VERSION, kind, app, name: String(name == null ? '' : name) };
    if (opts.description) env.description = String(opts.description);
    env.created = opts.created || new Date().toISOString();
    env.data = data;
    return env;
  }

  C.consts = { FORMAT, VERSION, SHARED, SHARED_APP, LIMITS, ENVELOPE_KEYS, KIND_RX, APP_RX };
  C.F = F;
  C.registerKind = registerKind;
  C.getKind = getKind;
  C.owners = owners;
  C.kinds = kinds;
  C.envelope = envelope;
})(typeof window !== 'undefined' ? window : globalThis);
