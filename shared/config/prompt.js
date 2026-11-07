/* SlopConfig AI helpers. buildPrompt(kind, app, request) writes the instructions, the exact data schema (every key, type,
 * limit and allowed value) and a valid example, for any model to follow. parseAiReply(text, opts) takes the first JSON
 * object out of a reply (prose and code fences around it are fine) and runs the validator on it. A reply is never applied
 * here: the dialog applies only a value that came back ok, and it goes through applyValue again. Both return the same
 * { ok, value, errors } shape as validate. Exposes SlopConfig.buildPrompt and SlopConfig.parseAiReply. */
(function (g) {
  'use strict';
  const C = g.SlopConfig;
  if (!C) throw new Error('shared/config/prompt.js needs schema.js first');
  const { FORMAT, VERSION, LIMITS } = C.consts;

  const TYPE_NAME = {
    string: 'text', text: 'long text', number: 'number', bool: 'true or false', enum: 'one of the allowed values',   // i18n-ignore: the AI prompt and its example file
    currency: 'currency code', locale: 'language tag', cell: 'text, number, true, false or null', array: 'list', object: 'object',
  };
  // Words a person reads (the reply's problems): shared/i18n/ui/<code>/config.js. The prompt itself is for the model: English.
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  const DEFAULT_MAX = { string: LIMITS.str, text: LIMITS.text };

  /** One line for a key: its type, whether it is required, its limits and allowed values, then its description. */
  function describeKey(name, s) {
    const bits = [s.required ? 'required' : 'optional'];
    if (s.type === 'enum') bits.push(`allowed values: ${s.values.map((v) => JSON.stringify(v)).join(', ')}`);
    if (s.type === 'number') {
      if (s.integer) bits.push('whole number');
      if (s.min !== undefined && s.min > -1e12) bits.push(`at least ${s.min}`);
      if (s.max !== undefined && s.max < 1e12) bits.push(`at most ${s.max}`);
    }
    if (s.type === 'string' || s.type === 'text') bits.push(`at most ${s.max != null ? s.max : DEFAULT_MAX[s.type]} characters`);
    if (s.type === 'array') bits.push(`${s.min ? `at least ${s.min} and ` : ''}at most ${s.max} items`);
    if (s.pattern) bits.push(`must match ${String(s.pattern)}`);
    if (s.desc) bits.push(s.desc);
    return `- ${name} (${TYPE_NAME[s.type] || s.type}; ${bits.join('; ')})`;
  }

  /** The schema as indented lines, nested objects and list items included. */
  function describe(spec, indent) {
    const out = [];
    for (const [k, s] of Object.entries(spec.fields)) {
      out.push(indent + describeKey(k, s));
      if (s.type === 'object') out.push(...describe(s, indent + '  '));
      if (s.type === 'array' && s.items.type === 'object') {
        out.push(`${indent}  each item is an object with these keys:`);
        out.push(...describe(s.items, indent + '    '));
      }
    }
    return out;
  }

  /** A valid value for a spec: required keys only, the first allowed value, the smallest allowed number. */
  function sample(s) {
    switch (s.type) {
      case 'enum': return s.values[0];
      case 'number': {
        let v = 0;
        if (s.min !== undefined && v < s.min) v = s.min;
        if (s.max !== undefined && v > s.max) v = s.max;
        return v;
      }
      case 'bool': return true;
      case 'currency': return 'USD';
      case 'locale': return 'en-US';
      case 'array': return Array.from({ length: Math.max(1, s.min || 0) }, () => sample(s.items));
      case 'object': {
        const o = {};
        for (const [k, c] of Object.entries(s.fields)) if (c.required) o[k] = sample(c);
        return o;
      }
      default: return 'Example';
    }
  }

  /** The instructions for one kind of file, as one string to paste into any assistant or send to a local model. */
  function buildPrompt(kind, app, request) {
    const e = C.getKind(kind, app);
    if (!e) throw new Error(`no kind "${kind}" for app "${app}"`);
    const example = {
      format: FORMAT, version: VERSION, kind, app, name: 'Example name',   // i18n-ignore: the AI prompt and its example file
      description: 'One line about this file.', created: '2026-01-01T00:00:00Z', data: sample(e.schema),   // i18n-ignore: the AI prompt and its example file
    };
    const want = String(request || '').trim().slice(0, 2000) || '(the person did not say; make a sensible example)';
    return [
      `Write one Slopographic config file: a single JSON object of kind "${kind}" for the app "${app}".`,
      ...(e.description ? [`What it is: ${e.label}. ${e.description}.`] : []),
      'Reply with the JSON object only. No prose before or after it, no comments, no code, no links or URLs.',
      '',
      'The envelope has these keys and no others:',
      `- format: "${FORMAT}"`,
      `- version: ${VERSION}`,
      `- kind: "${kind}"`,
      `- app: "${app}"`,
      '- name: a short name, 1 to 120 characters',
      '- description: optional, one line, at most 1000 characters',
      '- created: a date and time such as "2026-01-01T00:00:00Z"',
      '- data: the object described next',
      '',
      'The data object (use no keys other than these; use only the allowed values):',
      ...describe(e.schema, '  '),
      '',
      'An example of a valid file. Keep the envelope and replace the values with the right ones:',
      JSON.stringify(example, null, 2),
      '',
      'What the person wants:',
      want,
    ].join('\n');
  }

  const fail = (message) => ({ ok: false, value: null, errors: [{ path: '', message }] });

  /** The text of the first { ... } in s, with strings and escapes respected. null when no object is closed. */
  function firstObject(s) {
    const start = s.indexOf('{');
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return s.slice(start, i + 1);
    }
    return null;
  }

  /** parseAiReply(text, { app }) → { ok, value, errors }. Never applies anything and never throws. */
  function parseAiReply(text, opts = {}) {
    try {
      if (typeof text !== 'string' || !text.trim()) return fail(tr('ui.cfgv.reply_empty'));
      if (text.length > LIMITS.bytes) return fail(tr('ui.cfgv.reply_big'));
      const raw = firstObject(text);
      if (raw === null) return fail(tr('ui.cfgv.reply_no_object'));
      let obj;
      try { obj = JSON.parse(raw); } catch (e) { return fail(tr('ui.cfgv.reply_bad_json', { err: e.message })); }
      return C.validate(obj, opts);
    } catch (e) {
      return fail(tr('ui.cfgv.reply_failed', { err: e && e.message ? e.message : String(e) }));
    }
  }

  /** The example value of a kind's data: every required key, with a valid example. Used for plain templates. */
  function exampleValue(kind, app) {
    const e = C.getKind(kind, app);
    if (!e) throw new Error(`no kind "${kind}" for app "${app}"`);
    return sample(e.schema);
  }

  C.buildPrompt = buildPrompt;
  C.exampleValue = exampleValue;
  C.parseAiReply = parseAiReply;
})(typeof window !== 'undefined' ? window : globalThis);
