/* SlopConfig validator: validate(input, opts) → { ok, value, errors[] }. It never throws. input is the text of a file or
 * an object already parsed. It rejects: a wrong format or version, unknown envelope keys, an unknown kind, an app other
 * than the expected one (opts.app), unknown keys in strict kinds, wrong types and values, code or markup in text, and
 * anything over the size limits. Every import and every AI reply goes through here before anything is applied.
 * errors are { path, message }; path is "data.pages[0].name" style ('' for the whole file). Exposes SlopConfig.validate. */
(function (g) {
  'use strict';
  const C = (g.SlopConfig = g.SlopConfig || {});
  const { FORMAT, VERSION, SHARED, SHARED_APP, LIMITS, ENVELOPE_KEYS, KIND_RX, APP_RX } = C.consts;
  const CODE_RX = /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|svg|math)\b|javascript:|vbscript:|data:text\/html|<[^>]*\son[a-z]+\s*=/i;
  const LOCALE_RX = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
  const CURRENCY_RX = /^[A-Z]{3}$/;
  const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
  // Words: shared/i18n/ui/<code>/config.js (keys ui.cfgv.*), read when a message is made
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const join = (p, k) => (p ? `${p}.${k}` : k);

  /** UTF-8 length of a string in bytes (a loop, so it works in every JS realm). */
  function byteSize(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; } // a surrogate pair is one 4-byte character
      else n += 3;
    }
    return n;
  }

  function checkString(spec, v, path, err, cap) {
    if (typeof v !== 'string') return err(path, tr('ui.cfgv.text'));
    const max = spec.max != null ? spec.max : cap;
    if (v.length > max) return err(path, tr('ui.cfgv.str_max', { n: max }));
    if (spec.min && v.length < spec.min) return err(path, tr('ui.cfgv.str_min', { n: spec.min }));
    if (spec.pattern && !spec.pattern.test(v)) return err(path, tr('ui.cfgv.pattern'));
    if (CODE_RX.test(v)) err(path, tr('ui.cfgv.code'));
  }

  function checkNumber(spec, v, path, err) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return err(path, tr('ui.cfgv.number'));
    if (spec.integer && !Number.isInteger(v)) return err(path, tr('ui.cfgv.integer'));
    if (spec.min !== undefined && v < spec.min) return err(path, tr('ui.cfgv.min', { min: String(spec.min) }));
    if (spec.max !== undefined && v > spec.max) return err(path, tr('ui.cfgv.max', { max: String(spec.max) }));
  }

  function checkCell(v, path, err) {
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') return checkNumber({}, v, path, err);
    if (typeof v === 'string') return checkString({ max: LIMITS.text }, v, path, err, LIMITS.text);
    err(path, tr('ui.cfgv.cell'));
  }

  function checkArray(spec, v, path, err, depth) {
    if (!Array.isArray(v)) return err(path, tr('ui.cfgv.list'));
    const max = spec.max != null ? spec.max : LIMITS.items;
    if (v.length > max) return err(path, tr('ui.cfgv.list_max', { n: max }));
    if (v.length < (spec.min || 0)) return err(path, tr('ui.cfgv.list_min', { n: spec.min }));
    v.forEach((x, i) => checkSpec(spec.items, x, `${path}[${i}]`, err, depth + 1));
  }

  function checkObject(spec, v, path, err, depth) {
    if (!isObj(v)) return err(path, tr('ui.cfgv.object'));
    const fields = spec.fields;
    for (const k of Object.keys(v)) {
      const p = join(path, k);
      if (BAD_KEYS.includes(k)) err(p, tr('ui.cfgv.not_allowed'));
      else if (!hasOwn(fields, k) && spec.strict !== false) err(p, tr('ui.cfgv.unknown_key'));
    }
    for (const k of Object.keys(fields)) {
      const s = fields[k], p = join(path, k);
      const val = hasOwn(v, k) ? v[k] : undefined;
      if (val === undefined) { if (s.required) err(p, tr('ui.cfgv.required')); continue; }
      checkSpec(s, val, p, err, depth + 1);
    }
  }

  function checkSpec(spec, v, path, err, depth) {
    if (depth > 12) return err(path, tr('ui.cfgv.deep'));
    switch (spec.type) {
      case 'string': return checkString(spec, v, path, err, LIMITS.str);
      case 'text': return checkString(spec, v, path, err, LIMITS.text);
      case 'number': return checkNumber(spec, v, path, err);
      case 'bool': if (typeof v !== 'boolean') err(path, tr('ui.cfgv.bool')); return;
      case 'enum': if (!spec.values.includes(v)) err(path, tr('ui.cfgv.enum', { values: spec.values.join(', ') })); return;
      case 'currency': if (typeof v !== 'string' || !CURRENCY_RX.test(v)) err(path, tr('ui.cfgv.currency')); return;
      case 'locale': if (typeof v !== 'string' || !LOCALE_RX.test(v)) err(path, tr('ui.cfgv.locale')); return;
      case 'cell': return checkCell(v, path, err);
      case 'array': return checkArray(spec, v, path, err, depth);
      case 'object': return checkObject(spec, v, path, err, depth);
      default: return err(path, tr('ui.cfgv.bad_type'));
    }
  }

  /** The envelope checks. Returns the entry for the kind, or null, after recording what is wrong. */
  function checkEnvelope(obj, opts, err) {
    for (const k of Object.keys(obj)) if (!ENVELOPE_KEYS.includes(k)) err(k, tr('ui.cfgv.env_key'));
    if (obj.format !== FORMAT) err('format', tr('ui.cfgv.must_be', { v: FORMAT }));
    if (obj.version !== VERSION) {
      err('version', obj.version === undefined ? tr('ui.cfgv.ver_missing', { v: String(VERSION) })
        : tr('ui.cfgv.ver_wrong', { got: JSON.stringify(obj.version), v: String(VERSION) }));
    }
    if (typeof obj.name !== 'string' || !obj.name.trim() || obj.name.length > 120) err('name', tr('ui.cfgv.name'));
    if (obj.description !== undefined) checkString({ max: 1000 }, obj.description, 'description', err, 1000);
    if (typeof obj.created !== 'string' || obj.created.length > 40 || Number.isNaN(Date.parse(obj.created))) {
      err('created', tr('ui.cfgv.created'));
    }
    const kindOk = typeof obj.kind === 'string' && KIND_RX.test(obj.kind);
    const appOk = typeof obj.app === 'string' && APP_RX.test(obj.app);
    if (!kindOk) err('kind', tr('ui.cfgv.kind'));
    if (!appOk) err('app', tr('ui.cfgv.app'));
    if (appOk && Array.isArray(g.SLOP_APPS) && obj.app !== SHARED_APP && !g.SLOP_APPS.some((a) => a && a.id === obj.app)) {
      err('app', tr('ui.cfgv.not_app', { app: obj.app }));
    }
    if (!kindOk || !appOk) return null;
    const entry = C.getKind(obj.kind, obj.app);
    if (!entry) {
      const owners = C.owners(obj.kind);
      err(owners.length ? 'app' : 'kind', owners.length
        ? tr('ui.cfgv.owner', { kind: obj.kind, owners: owners.join(', '), app: obj.app })
        : tr('ui.cfgv.unknown_kind', { kind: obj.kind, app: obj.app }));
      return null;
    }
    if (opts.app && obj.app !== opts.app && entry.app !== SHARED) {
      err('app', tr('ui.cfgv.mismatch', { file: obj.app, app: opts.app }));
    }
    return entry;
  }

  function fail(errors) { return { ok: false, value: null, errors }; }

  function run(input, opts) {
    const errors = [];
    const err = (path, message) => { if (errors.length < LIMITS.errors) errors.push({ path: path || '', message }); };
    let obj = input, json = null;
    if (typeof input === 'string') {
      if (byteSize(input) > LIMITS.bytes) { err('', tr('ui.cfgv.too_big')); return fail(errors); }
      try { obj = JSON.parse(input); } catch (e) { err('', tr('ui.cfgv.bad_json', { err: e.message })); return fail(errors); }
      json = input;
    }
    if (!isObj(obj)) { err('', tr('ui.cfgv.one_object')); return fail(errors); }
    const entry = checkEnvelope(obj, opts, err);
    if (entry) {
      if (obj.data === undefined) err('data', tr('ui.cfgv.required'));
      else checkSpec(entry.schema, obj.data, 'data', err, 0);
      // kind-specific rules the schema cannot say (for example out > in): run only when the shape is right
      if (!errors.length && entry.check) for (const e of entry.check(obj.data) || []) err(e.path ? `data.${e.path}` : 'data', e.message);
    }
    if (!json) {
      try { json = JSON.stringify(obj); } catch (e) { err('', tr('ui.cfgv.not_json')); return fail(errors); }
    }
    if (json && byteSize(json) > LIMITS.bytes) err('', tr('ui.cfgv.too_big'));
    if (errors.length) return fail(errors);
    return { ok: true, value: JSON.parse(json), errors: [] };
  }

  /** validate(input, { app }) → { ok, value, errors }. app: the app importing (files for another app are refused). */
  function validate(input, opts) {
    try { return run(input, opts || {}); } catch (e) {
      return fail([{ path: '', message: tr('ui.cfgv.check_failed', { err: e && e.message ? e.message : String(e) }) }]);
    }
  }

  /** One line per error, for a status bar or a log: "data.pages[0].name: is required". */
  function errorText(errors) {
    return (errors || []).map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ');
  }

  C.validate = validate;
  C.errorText = errorText;
  C.byteSize = byteSize;
})(typeof window !== 'undefined' ? window : globalThis);
