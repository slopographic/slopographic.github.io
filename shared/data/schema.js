// Record validation and save rules over the definitions in schema-defs.js: prepare() (trim, defaults,
// derived totals, validation) and checkTransition() before store.js saves. Money is integer minor units.
// Tax rates are integer basis points. Dates are YYYY-MM-DD. Exposes window.SlopData.schema.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ENUM, ACCT, DEFAULT_CHART, DEFAULT_SETTINGS, DEFAULT_SEQUENCES, FLOWS, RX, LINE, JLINE, COUNT, DEFS, COLLECTIONS, movementError, journalErrors, fxErrors } = ns.schemaDefs;
  const MAX = 9e12;
  const META = ['createdAt', 'updatedAt', 'version', 'deletedAt'];
  const ok = (value) => ({ ok: true, value }), clone = (v) => (Array.isArray(v) ? v.slice() : v);
  const fail = (code, message, extra) => Object.assign({ ok: false, code, message: message || code }, extra || {});
  const isResult = (v) => !!v && typeof v === 'object' && typeof v.ok === 'boolean';
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  ns.result = { ok, fail, isResult };

  const lineOk = (l) => isObj(l) && Number.isSafeInteger(l.qty) && Number.isSafeInteger(l.unitPrice) && Number.isSafeInteger(l.taxRate) && Math.abs(l.qty * l.unitPrice) <= MAX;
  /** Recomputes line amounts and document totals from the lines (in place). Skipped when a line is unusable. */
  function derive(rec) {
    if (!Array.isArray(rec.lines) || !rec.lines.every(lineOk)) return;
    const m = ns.money;
    rec.lines = rec.lines.map((l) => { const a = m.lineAmounts(l); return { ...l, net: a.net, tax: a.tax, total: a.total }; });
    const t = m.documentTotals(rec.lines);
    rec.subtotal = t.subtotal;
    rec.tax = t.tax;
    rec.total = t.total;
  }

  const isDate = (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !isNaN(d) && d.toISOString().slice(0, 10) === v;
  };

  function checkValue(s, v, field, errors) {
    const bad = (message) => errors.push({ field, message });
    switch (s.t) {
      case 'id': if (typeof v !== 'string' || v.length > 80) bad(say('ui.data.v.id')); break;
      case 'string': case 'text': case 'currency': case 'locale': {
        const max = s.max || (s.t === 'text' ? 5000 : 200);
        if (typeof v !== 'string' || v.length > max) bad(say('ui.data.v.text_max', { n: max }));
        else if (s.pattern && !s.pattern.test(v)) bad(say('ui.data.v.format'));
        else if (s.t === 'currency' && !RX.currency.test(v)) bad(say('ui.data.v.currency'));
        else if (s.t === 'locale' && !RX.locale.test(v)) bad(say('ui.data.v.locale'));
        break;
      }
      case 'bool': if (typeof v !== 'boolean') bad(say('ui.data.v.bool')); break;
      case 'int': if (!Number.isSafeInteger(v) || v < s.min || v > s.max) bad(say('ui.data.v.int', { min: String(s.min), max: String(s.max) })); break;
      case 'money': if (!Number.isSafeInteger(v) || v < s.min || v > MAX) bad(say('ui.data.v.money', { min: String(s.min), max: String(MAX) })); break;
      case 'rate': if (!Number.isSafeInteger(v) || v < 0 || v > 10000) bad(say('ui.data.v.rate')); break;
      case 'date': if (typeof v !== 'string' || !isDate(v)) bad(say('ui.data.v.date')); break;
      case 'ts': if (!Number.isSafeInteger(v) || v < 0) bad(say('ui.data.v.ts')); break;
      case 'enum': if (!s.values.includes(v)) bad(say('ui.data.v.enum', { list: s.values.join(', ') })); break;
      case 'ean': if (!ns.barcode.isValidEan(v)) bad(say('ui.data.v.ean')); break;
      case 'entries': if (!Array.isArray(v) || v.length > s.max || v.some((e) => !isObj(e) || typeof e.value !== 'string' || !e.value || e.value.length > s.valMax || (e.label !== undefined && (typeof e.label !== 'string' || e.label.length > 40)))) bad(say('ui.data.v.entries', { max: String(s.max), len: String(s.valMax) })); break;
      case 'strings': if (!Array.isArray(v) || v.length > s.max || v.some((x) => typeof x !== 'string' || !x || x.length > s.itemMax)) bad(say('ui.data.v.tags', { max: String(s.max), len: String(s.itemMax) })); break;
      case 'lines': case 'jlines': case 'countLines': checkList(s, v, field, errors); break;
      case 'rows': checkRows(s, v, field, errors); break;
    }
  }

  function checkList(s, v, field, errors) {
    if (!Array.isArray(v) || v.length < (s.min || 0)) { errors.push({ field, message: say('ui.data.v.min_entries', { n: s.min || 0 }) }); return; }
    const specs = s.t === 'lines' ? LINE : s.t === 'jlines' ? JLINE : COUNT;
    v.forEach((l, i) => {
      const f = `${field}[${i}]`;
      if (!isObj(l)) { errors.push({ field: f, message: say('ui.data.v.object') }); return; }
      checkFields(specs, l, errors, `${f}.`, []);
      if (s.t === 'lines' && Math.abs(l.qty * l.unitPrice) > MAX) errors.push({ field: f, message: say('ui.data.v.line_too_large') });
    });
  }

  /** A list of small records with their own field specs (s.of), at most s.max of them: a project's columns, a checklist. */
  function checkRows(s, v, field, errors) {
    if (!Array.isArray(v) || v.length < (s.min || 0) || v.length > s.max) { errors.push({ field, message: say('ui.data.v.rows', { min: String(s.min || 0), max: String(s.max) }) }); return; }
    v.forEach((r, i) => {
      const f = `${field}[${i}]`;
      if (!isObj(r)) { errors.push({ field: f, message: say('ui.data.v.object') }); return; }
      for (const k of Object.keys(r)) if (!(k in s.of)) errors.push({ field: `${f}.${k}`, message: say('ui.data.v.no_field_here') });
      checkFields(s.of, r, errors, `${f}.`, []);
    });
  }

  function checkFields(specs, rec, errors, prefix, skip) {
    for (const [k, s] of Object.entries(specs)) {
      const v = rec[k];
      if (v === undefined || v === null || v === '') {
        if (s.req && !skip.includes(k)) errors.push({ field: prefix + k, message: say('ui.data.v.required') });
        continue;
      }
      checkValue(s, v, prefix + k, errors);
    }
  }

  function checkMeta(rec, errors) {
    for (const k of ['createdAt', 'updatedAt', 'deletedAt']) if (rec[k] !== undefined && !(Number.isSafeInteger(rec[k]) && rec[k] >= 0)) errors.push({ field: k, message: say('ui.data.v.timestamp') });
    if (rec.version !== undefined && !(Number.isSafeInteger(rec.version) && rec.version >= 1)) errors.push({ field: 'version', message: say('ui.data.v.from_one') });
  }

  /** Totals must match what the lines say (skipped when the lines already have errors). */
  function checkDerived(rec, errors) {
    if (!Array.isArray(rec.lines) || errors.some((e) => e.field.startsWith('lines'))) return;
    const c = { ...rec, lines: rec.lines.map((l) => ({ ...l })) };
    derive(c);
    const bad = ['subtotal', 'tax', 'total'].some((k) => c[k] !== rec[k])
      || c.lines.some((l, i) => ['net', 'tax', 'total'].some((k) => l[k] !== rec.lines[i][k]));
    if (bad) errors.push({ field: 'total', message: say('ui.data.v.totals') });
  }

  /** Checks a record in its stored shape. opts: skipKey (no id yet), deferNumber (number assigned later). */
  function validate(name, rec, opts = {}) {
    const d = DEFS[name];
    if (!d) return [{ field: '', message: say('ui.data.err.collection', { name }) }];
    if (!isObj(rec)) return [{ field: '', message: say('ui.data.err.record_object') }];
    const errors = [];
    for (const k of Object.keys(rec)) if (!(k in d.fields) && !META.includes(k)) errors.push({ field: k, message: say('ui.data.v.no_field', { name }) });
    checkFields(d.fields, rec, errors, '', opts.skipKey ? [d.key] : []);
    checkMeta(rec, errors);
    if (d.derive) checkDerived(rec, errors);
    if (d.check) for (const m of d.check(rec, opts)) errors.push({ field: '', message: m });
    return errors;
  }

  /** Normalises input: trims text, drops blanks, applies defaults, derives totals, then validates.
   *  Returns { ok, value, errors }. Unknown fields are errors; meta fields (createdAt...) are ignored. */
  function prepare(name, input, opts = {}) {
    const d = DEFS[name];
    if (!d) return { ok: false, value: null, errors: [{ field: '', message: say('ui.data.err.collection', { name }) }] };
    if (!isObj(input)) return { ok: false, value: null, errors: [{ field: '', message: say('ui.data.err.record_object') }] };
    const errors = [], out = {};
    for (const k of Object.keys(input)) if (!(k in d.fields) && !META.includes(k)) errors.push({ field: k, message: say('ui.data.v.no_field', { name }) });
    for (const [k, s] of Object.entries(d.fields)) {
      let v = typeof input[k] === 'string' ? input[k].trim() : input[k];
      if (v === '' || v === null) v = undefined;
      if (v === undefined) { if (s.def === undefined) continue; v = clone(s.def); } else v = normalize(s, v);
      if (v === '' || v === undefined) continue;
      out[k] = v;
    }
    derive(out);
    errors.push(...validate(name, out, { ...opts, skipKey: true }));   // the store assigns the key before saving
    return { ok: errors.length === 0, value: out, errors };
  }

  function normalize(s, v) {
    if (s.t === 'ean') return ns.barcode.normalizeEan(v);
    if (s.t === 'currency') return String(v).toUpperCase();
    if (s.t === 'strings' && Array.isArray(v)) return [...new Set(v.map((x) => (typeof x === 'string' ? x.trim() : x)).filter(Boolean))];
    if (s.t === 'lines' && Array.isArray(v)) return v.map((l) => (isObj(l) ? { ...l } : l));
    if (s.t === 'rows' && Array.isArray(v)) return v.map((r) => (isObj(r) ? Object.fromEntries(Object.entries(r).filter(([, x]) => x !== undefined && x !== null).map(([k, x]) => [k, typeof x === 'string' ? x.trim() : x])) : r));
    if (s.t === 'jlines' && Array.isArray(v)) return v.map((l) => (isObj(l) ? { ...l, debit: l.debit ?? 0, credit: l.credit ?? 0 } : l));
    return v;
  }

  /** Why a store.put may not move a record from prev to next, or null. */
  function checkTransition(name, prev, next) {
    const d = DEFS[name];
    if (!d) return say('ui.data.err.collection', { name });
    if (d.immutable) return say('ui.data.err.immutable', { name });
    const same = (keys) => keys.every((k) => JSON.stringify(prev[k]) === JSON.stringify(next[k]));
    const f = FLOWS[name];
    if (f) {
      if (prev.status !== next.status && !(f.next[prev.status] || []).includes(next.status)) return say(f.noun, { from: say('ui.data.status.' + prev.status), to: say('ui.data.status.' + next.status) });
      if (!f.open.includes(prev.status) && !same(f.lock)) return say(f.locked);
    }
    if (name === 'timeEntries' && prev.invoiceId && prev.invoiceId === next.invoiceId && !same(['date', 'customerId', 'minutes', 'rate', 'currency', 'billable'])) {
      return say('ui.data.err.billed_time_change');
    }
    if (name === 'numbering' && next.next < prev.next) return say('ui.data.err.numbering_back');
    return null;
  }

  /** Why a record may not be deleted, or null. */
  function removable(name, rec) {
    const d = DEFS[name];
    if (!d) return say('ui.data.err.collection', { name });
    if (d.immutable) return say('ui.data.err.immutable_rm', { name });
    if (d.noRemove) return say(d.noRemove);
    const why = d.removeRule ? d.removeRule(rec) : null;
    return why ? say(why) : null;
  }

  /** Joins errors into one readable line: "lines[0].qty must be a whole number...". */
  function errorText(errors) {
    const e = (errors || [])[0];
    return !e ? say('ui.data.err.invalid') : e.field ? say('ui.data.err.field', { field: e.field, message: e.message }) : e.message;
  }

  ns.schema = {
    COLLECTIONS, MAX_MINOR: MAX, META, ENUM, ACCT, DEFAULT_CHART, DEFAULT_SETTINGS, DEFAULT_SEQUENCES, FLOWS,
    def: (name) => DEFS[name] || null, prepare, validate, checkTransition, removable, derive, movementError, journalErrors, fxErrors, errorText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
