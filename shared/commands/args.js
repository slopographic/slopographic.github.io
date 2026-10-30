/* SlopCmdArgs: argument schemas for SlopCmd commands. A command may describe what it takes:
 *   args: [{ name: 'radius', type: 'number', min: 0.1, max: 250, default: 4, description: 'blur radius in px' },
 *          { name: 'format', type: 'enum', values: ['png', 'jpeg', 'webp'], default: 'png' },
 *          { name: 'text', type: 'string', maxLength: 500, required: true }, { name: 'on', type: 'boolean' },
 *          { name: 'fill', type: 'color', default: '#ffffff' }]        (also an object map { radius: { type… } })
 * Types: number (integer: true rounds; step rounds to the step), string, enum (values, or options [[value, label]]),
 * boolean, color (any CSS hex or a basic colour name → '#rrggbb'), json (an object or array, or its JSON text; maxLength
 * counts the JSON characters; `schema` is its JSON schema for tool definitions, default an object), array (items: a JSON
 * schema for each item, maxItems; a JSON text is parsed, a plain text becomes one item per line), object (properties: JSON
 * schemas; a JSON text is parsed). The command checks the inside of an array or object itself; here only the shape and
 * the size are checked.
 *   validate(schema, raw) → { ok, args, errors: [text], notes: [text] }: unknown names dropped, strings coerced
 *       ("8px" → 8, "yes" → true, "JPEG" → 'jpeg'), numbers clamped to min..max (a note says so), defaults filled,
 *       a missing required argument or a value that cannot be read is an error.
 *   defaults(schema) → { name: default }         jsonSchema(schema) → a JSON-schema object for tool definitions
 *   hint(arg) → 'number 0.1–250, default 4'      summary(title, schema, args) → 'Gaussian blur, radius 8'
 * Classic script for pages (window.SlopCmdArgs) and a CommonJS module for Node tests. No dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopCmdArgs = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const TYPES = new Set(['number', 'string', 'enum', 'boolean', 'color', 'json', 'array', 'object']);
  const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', lime: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
    orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', grey: '#808080', gray: '#808080', brown: '#a52a2a', cyan: '#00ffff',
    magenta: '#ff00ff', navy: '#000080', teal: '#008080', gold: '#ffd700', silver: '#c0c0c0', transparent: '#00000000' };

  /** The schema as a list of { name, type, … } (accepts a list or a map; drops entries without a name). */
  function normalize(schema) {
    if (!schema) return [];
    const list = Array.isArray(schema) ? schema : Object.keys(schema).map((k) => Object.assign({ name: k }, schema[k]));
    return list.filter((a) => a && a.name).map((a) => Object.assign({}, a, { type: TYPES.has(a.type) ? a.type : 'string' }));
  }
  /** Allowed values of an enum: [[value, label]]. */
  const choices = (a) => (a.options ? a.options.map((o) => (Array.isArray(o) ? o : [o, String(o)])) : (a.values || []).map((v) => [v, String(v)]));
  const fmt = (n) => String(Math.round(n * 1000) / 1000);

  function defaults(schema) {
    const out = {};
    for (const a of normalize(schema)) if (a.default !== undefined) out[a.name] = a.default;
    return out;
  }

  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const m = String(v == null ? '' : v).replace(',', '.').match(/[-+]?\d*\.?\d+(e[-+]?\d+)?/i);
    return m ? Number(m[0]) : NaN;
  }
  function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    const s = String(v).trim().toLowerCase();
    if (/^(true|yes|y|on|1|checked|enable|enabled)$/.test(s)) return true;
    if (/^(false|no|n|off|0|unchecked|disable|disabled|none)$/.test(s)) return false;
    return null;
  }
  function toColor(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (NAMED[s]) return NAMED[s];
    let m = s.match(/^#?([0-9a-f]{3,8})$/);
    if (m && [3, 4, 6, 8].includes(m[1].length)) {
      let hx = m[1];
      if (hx.length <= 4) hx = hx.split('').map((c) => c + c).join('');
      return '#' + (hx.length === 8 && hx.endsWith('ff') ? hx.slice(0, 6) : hx);
    }
    m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (m) return '#' + [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, +x)).toString(16).padStart(2, '0')).join('');
    return null;
  }
  /** Enum matching, forgiving the way models write: the exact value, then the label, then either one ignoring case,
   * quotes and spaces, then a CSS stack's first family ("Trebuchet MS" → "'Trebuchet MS', sans-serif"), then a prefix
   * that only one choice has. */
  const loose = (x) => String(x == null ? '' : x).toLowerCase().replace(/["'\s]+/g, '');
  const first = (x) => loose(String(x).split(',')[0]);
  function toEnum(a, v) {
    const raw = String(v == null ? '' : v).trim(), s = loose(raw), list = choices(a);
    const hit = list.find(([val]) => String(val) === raw) || list.find(([, label]) => label === raw)
      || list.find(([val, label]) => loose(val) === s || loose(label) === s)
      || (s && list.find(([val, label]) => /,/.test(String(val)) && (first(val) === first(raw) || loose(label) === first(raw))));
    if (hit) return hit[0];
    const pre = s ? [...new Set(list.filter(([val, label]) => loose(val).startsWith(s) || loose(label).startsWith(s)).map((c) => c[0]))] : [];
    return pre.length === 1 ? pre[0] : undefined;
  }
  /** What the model is shown for an enum: the values, or the labels when a value is raw (a CSS stack, a text with commas). */
  const shown = (a) => { const list = choices(a), raw = list.some(([val]) => /[,'"]/.test(String(val))); return list.map(([val, label]) => (raw ? label : val)); };
  const shownOf = (a, v) => { const list = choices(a), i = list.findIndex(([val]) => val === v); return i < 0 ? v : shown(a)[i]; };
  function lev(x, y) {
    let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
    for (let i = 1; i <= x.length; i++) { const cur = [i]; for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); prev = cur; }
    return prev[y.length];
  }
  function enumError(a, v) {
    const names = shown(a), s = loose(v);
    const best = names.map((n) => [n, lev(s, loose(n))]).sort((x, y) => x[1] - y[1])[0];
    const close = best && best[1] <= Math.max(2, Math.floor(s.length / 2)) ? ` (closest: ${best[0]})` : '';
    return `${a.name} must be one of: ${names.join(', ')}${close}`;
  }

  /** One argument: { ok, value, note } or { ok: false, error }. */
  function one(a, v) {
    if (a.type === 'number') {
      let n = toNumber(v);
      if (!Number.isFinite(n)) return { ok: false, error: `${a.name} must be a number` + (a.min != null && a.max != null ? ` from ${fmt(a.min)} to ${fmt(a.max)}` : '') };
      if (a.integer) n = Math.round(n);
      else if (a.step) n = Math.round(n / a.step) * a.step;
      let note = null;
      if (a.min != null && n < a.min) { note = `${a.name} ${fmt(n)} is below the minimum, so ${fmt(a.min)} was used`; n = a.min; }
      if (a.max != null && n > a.max) { note = `${a.name} ${fmt(n)} is above the maximum, so ${fmt(a.max)} was used`; n = a.max; }
      return { ok: true, value: Number(fmt(n)), note };
    }
    if (a.type === 'boolean') { const b = toBool(v); return b == null ? { ok: false, error: `${a.name} must be true or false` } : { ok: true, value: b }; }
    if (a.type === 'enum') {
      const e = toEnum(a, v);
      return e === undefined ? { ok: false, error: enumError(a, v) } : { ok: true, value: e };
    }
    if (a.type === 'color') { const c = toColor(v); return c ? { ok: true, value: c } : { ok: false, error: `${a.name} must be a colour like #ff8800 or "red"` }; }
    if (a.type === 'json') {
      let o = v;
      if (typeof v === 'string') { try { o = JSON.parse(v); } catch (e) { return { ok: false, error: `${a.name} must be JSON: ${e.message}` }; } }
      if (!o || typeof o !== 'object') return { ok: false, error: `${a.name} must be an object or a list` };
      if (a.maxLength && JSON.stringify(o).length > a.maxLength) return { ok: false, error: `${a.name} is longer than ${a.maxLength} characters` };
      return { ok: true, value: o };
    }
    if (a.type === 'array' || a.type === 'object') return structured(a, v);
    let s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
    let note = null;
    if (a.maxLength && s.length > a.maxLength) { s = s.slice(0, a.maxLength); note = `${a.name} was cut to ${a.maxLength} characters`; }
    if (a.required && !s.trim()) return { ok: false, error: `${a.name} must not be empty` };
    return { ok: true, value: s, note };
  }

  /** An array or object argument: JSON text is parsed; a plain text is one array item per line. */
  function structured(a, v) {
    let x = v;
    if (typeof x === 'string') {
      const s = x.trim();
      if (/^[[{]/.test(s)) { try { x = JSON.parse(s); } catch (e) { return { ok: false, error: `${a.name} is not valid JSON` }; } }
      else if (a.type === 'array') x = s.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s+/, '')).filter((l) => l.trim());
    }
    if (a.type === 'array') {
      if (!Array.isArray(x)) return { ok: false, error: `${a.name} must be a list` };
      if (a.required && !x.length) return { ok: false, error: `${a.name} must not be empty` };
      if (a.maxItems && x.length > a.maxItems) return { ok: true, value: x.slice(0, a.maxItems), note: `${a.name} was cut to ${a.maxItems} items` };
      return { ok: true, value: x };
    }
    if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, error: `${a.name} must be an object` };
    return { ok: true, value: x };
  }

  function validate(schema, raw) {
    const list = normalize(schema), given = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const args = {}, errors = [], notes = [];
    const lower = {};
    for (const k of Object.keys(given)) lower[k.toLowerCase().replace(/[\s_-]/g, '')] = given[k];
    for (const a of list) {
      let v = Object.prototype.hasOwnProperty.call(given, a.name) ? given[a.name] : lower[a.name.toLowerCase().replace(/[\s_-]/g, '')];
      if (v === undefined || v === null || v === '') {
        if (a.default !== undefined) args[a.name] = a.default;
        else if (a.required) errors.push(`Missing ${a.name}` + (a.description ? ` (${a.description})` : ''));
        continue;
      }
      const r = one(a, v);
      if (!r.ok) { errors.push(r.error); continue; }
      args[a.name] = r.value;
      if (r.note) notes.push(r.note);
    }
    const known = new Set(list.map((a) => a.name.toLowerCase().replace(/[\s_-]/g, '')));
    const extra = Object.keys(given).filter((k) => !known.has(k.toLowerCase().replace(/[\s_-]/g, '')));
    if (extra.length) notes.push('ignored unknown argument' + (extra.length > 1 ? 's ' : ' ') + extra.join(', '));
    return { ok: !errors.length, args, errors, notes };
  }

  function jsonSchema(schema) {
    const properties = {}, required = [];
    for (const a of normalize(schema)) {
      const p = {};
      if (a.type === 'number') { p.type = a.integer ? 'integer' : 'number'; if (a.min != null) p.minimum = a.min; if (a.max != null) p.maximum = a.max; }
      else if (a.type === 'boolean') p.type = 'boolean';
      else if (a.type === 'enum') { p.type = 'string'; p.enum = shown(a); }
      else if (a.type === 'color') { p.type = 'string'; p.pattern = '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$'; }
      else if (a.type === 'json') Object.assign(p, a.schema || { type: 'object' });
      else if (a.type === 'array') { p.type = 'array'; p.items = a.items || {}; if (a.maxItems) p.maxItems = a.maxItems; }
      else if (a.type === 'object') { p.type = 'object'; if (a.properties) p.properties = a.properties; }
      else { p.type = 'string'; if (a.maxLength) p.maxLength = a.maxLength; }
      if (a.description) p.description = a.description;
      if (a.default !== undefined) p.default = a.type === 'enum' ? shownOf(a, a.default) : a.default;
      properties[a.name] = p;
      if (a.required) required.push(a.name);
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }

  function hint(a) {
    const d = a.default !== undefined ? `, default ${a.default}` : '';
    if (a.type === 'number') return `number${a.min != null && a.max != null ? ` ${fmt(a.min)}–${fmt(a.max)}` : ''}${d}`;
    if (a.type === 'enum') return `one of ${shown(a).join('|')}${a.default !== undefined ? `, default ${shownOf(a, a.default)}` : ''}`;
    if (a.type === 'color') return `colour #rrggbb${d}`;
    if (a.type === 'array') return `list${a.maxItems ? ` of up to ${a.maxItems}` : ''} (JSON)${d}`;
    if (a.type === 'object') return `object (JSON)${d}`;
    return a.type + d;
  }
  /** A short line for a step: 'Gaussian blur, radius 8'. */
  function summary(title, schema, args) {
    const parts = normalize(schema).filter((a) => args && args[a.name] !== undefined)
      .map((a) => (a.type === 'boolean' ? (args[a.name] ? a.name : 'no ' + a.name) : a.type === 'array' && Array.isArray(args[a.name]) ? `${args[a.name].length} ${a.label || a.name}`
        : a.type === 'object' ? `${a.label || a.name} {…}` : `${a.label || a.name} ${(a.type === 'json' ? JSON.stringify(args[a.name]) : String(args[a.name])).slice(0, 40)}`));
    return [String(title || '').replace(/…$/, '')].concat(parts).join(', ');
  }

  return { normalize, defaults, validate, jsonSchema, hint, summary, toColor, toNumber };
});
