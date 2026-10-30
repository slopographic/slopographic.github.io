/* Slop Reports for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js). A report is the engine's
 * own JSON query (js/engine.js: from, where, join, enrich, unwind, by, count, sum, avg, orderBy, desc, limit, columns),
 * checked by engine.validate and kept by js/saved.js like the page's editor does; it runs over the records in this browser
 * (read only) through app.js. Exports: CSV of the rows (engine.toCsv) or the report's JSON, to Slop Drive (through
 * shared/commands/sources.js and shared/hub.js, loaded on demand) and/or a download. Loaded by js/commands.js on demand. */
(function (g) {
  'use strict';
  const R = g.SlopReports, E = R.engine, C = g.SlopCmd;
  const Str = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 500, description }, extra);
  const REPORT = Str('report', 'a report id or title (list_reports); the open one when empty');
  const list = [];
  const add = (tool, title, args, run, extra) => list.push(Object.assign({ id: 'reports.ai.' + tool.replace(/_/g, '-'), tool, title, group: 'AI', hidden: true, destructive: false, args,
    run: (a) => run(a || g.SlopCmdArgs.defaults(args)) }, extra));
  const all = () => R.BUILTIN.map((d) => ({ def: d, saved: false })).concat(R.saved.list().map((d) => ({ def: d, saved: true })));
  function find(q) {
    if (!q) { const c = R.app.current(); return { def: c.def, saved: c.saved }; }
    const s = String(q).toLowerCase(), hit = all().find((x) => x.def.id === q) || all().find((x) => x.def.title.toLowerCase() === s) || all().find((x) => x.def.title.toLowerCase().includes(s));
    if (!hit) throw new Error(`No report “${q}”. list_reports shows them.`);
    return hit;
  }
  /** Runs a report on screen and says what it shows: rows, columns and the first rows as text. */
  async function show(id) {
    R.app.choose(id);
    await R.app.run();
    const c = R.app.current();
    if (!c.result || !c.result.ok) throw new Error(`The report cannot run: ${(c.result && c.result.errors || []).join('; ')}`);
    const cols = c.result.columns, rows = c.result.rows;
    return { report: c.def.title, id: c.def.id, rows: rows.length, columns: cols.map((x) => x.label),
      first: rows.slice(0, 20).map((r) => Object.fromEntries(cols.map((x) => [x.label, E.cellText(r, x, c.ctx)]))) };
  }
  /** Saves a definition (a built-in is copied first under a new id) after the engine's check, and shows it. */
  async function keep(def) {
    if (Array.isArray(def.columns)) def.columns = def.columns.map((c) => (c && typeof c === 'object' ? Object.assign({}, c, { label: c.label || c.field }) : c));
    const errors = E.validate(def);
    if (errors.length) throw new Error(errors.join('. '));
    const r = R.saved.save(def);
    if (!r.ok) throw new Error(r.error);
    R.app.fillPicker();
    return show(def.id);
  }
  const editable = (q) => { const h = find(q); return h.saved ? JSON.parse(JSON.stringify(h.def)) : Object.assign(JSON.parse(JSON.stringify(h.def)), { id: `${h.def.id}-copy`, title: `${h.def.title} (copy)` }); };
  const one = (src) => new Promise((res, rej) => { const s = Object.assign(g.document.createElement('script'), { src: new URL(src, g.location.href).href, async: false }); s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); g.document.head.append(s); });
  async function toDrive(blob, name) {
    if (!g.SLOP_APPS) await one('../shared/apps.js');
    if (!g.SlopHub) await one('../shared/hub.js');
    if (!g.SlopCmdSources) await one('../shared/commands/sources.js');
    return g.SlopCmdSources.put(blob, name, 'reports');
  }
  const ARR = (name, description) => ({ name, type: 'array', items: {}, maxItems: 50, description });

  add('list_reports', 'List the reports', [], () => all().map((x) => ({ id: x.def.id, title: x.def.title, from: x.def.from, saved: x.saved })), { macro: false });   // i18n-ignore: the assistant's tools and replies (English: API)
  add('describe_sources', 'Describe the data', [{ name: 'from', type: 'enum', values: E.SOURCES, description: 'one collection; all when empty' }], (a) => {   // i18n-ignore: the assistant's tools and replies (English: API)
    const defs = (g.SlopData && g.SlopData.schemaDefs && g.SlopData.schemaDefs.DEFS) || {};
    return (a.from ? [a.from] : E.SOURCES).map((s) => ({ from: s, fields: Object.keys((defs[s] || {}).fields || {}) }));
  }, { macro: false, description: 'The collections a report can read and their fields, and the enrich names: ' + Object.keys(R.enrich || {}).join(', ') });   // i18n-ignore: the assistant's tools and replies (English: API)

  add('create_report', 'Create a report', [Str('title', 'the report title', { required: true, maxLength: 120 }), { name: 'from', type: 'enum', values: E.SOURCES, required: true },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'columns', type: 'array', required: true, maxItems: 30, items: { type: 'object', properties: { field: { type: 'string' }, label: { type: 'string' }, type: { type: 'string', enum: E.TYPES } } }, description: '[{ field, label, type }] (grouped totals are count, sum_<field>, avg_<field>)' },
    ARR('where', 'filters [[field, op, value]], e.g. [["status", "=", "issued"]]; "$today" and "$today+14" are dates'), ARR('by', 'group by these fields'),   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'count', type: 'boolean', description: 'count the rows of each group' }, ARR('sum', 'fields to total'), ARR('avg', 'fields to average'), ARR('enrich', 'extra fields to add first'),   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'join', type: 'object', description: '{ from, on: [field, joinedField], type: "left", prefix }' }, Str('unwind', 'a list field: one row per item'),   // i18n-ignore: the assistant's tools and replies (English: API)
    Str('order_by', 'output field to sort by'), { name: 'desc', type: 'boolean' }, { name: 'limit', type: 'number', min: 1, max: 100000, integer: true }, Str('note', 'a line shown above the table')],   // i18n-ignore: the assistant's tools and replies (English: API)
  async (a) => {
    const def = { id: `report-${Date.now().toString(36)}`, title: a.title, from: a.from, columns: a.columns };
    for (const [k, v] of [['where', a.where], ['by', a.by], ['count', a.count], ['sum', a.sum], ['avg', a.avg], ['enrich', a.enrich], ['join', a.join], ['unwind', a.unwind], ['orderBy', a.order_by], ['desc', a.desc], ['limit', a.limit], ['note', a.note]]) {
      if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) def[k] = v;
    }
    return keep(def);
  }, { description: 'Make and save a report over the business records (contacts, invoices, payments, expenses, ledger, time, quotes), and show it.' });   // i18n-ignore: the assistant's tools and replies (English: API)

  add('add_column', 'Add a column', [REPORT, Str('field', 'the field', { required: true, maxLength: 80 }), Str('label', 'the heading', { maxLength: 80 }),   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'type', type: 'enum', values: E.TYPES, default: 'text' }],
  (a) => { const def = editable(a.report); def.columns = def.columns.concat([{ field: a.field, label: a.label || a.field, type: a.type }]); return keep(def); },
  { description: 'Add a column to a saved report (a built-in one is copied first).' });   // i18n-ignore: the assistant's tools and replies (English: API)
  add('set_filter', 'Set the filters', [REPORT, Object.assign(ARR('where', '[[field, op, value]]; empty removes every filter'), { required: false })],   // i18n-ignore: the assistant's tools and replies (English: API)
    (a) => { const def = editable(a.report); if (a.where && a.where.length) def.where = a.where; else delete def.where; return keep(def); });
  add('set_grouping', 'Set the grouping and totals', [REPORT, ARR('by', 'group by'), { name: 'count', type: 'boolean' }, ARR('sum', 'fields to total'), Str('order_by', 'sort field'), { name: 'desc', type: 'boolean' }],   // i18n-ignore: the assistant's tools and replies (English: API)
    (a) => { const def = editable(a.report); for (const [k, v] of [['by', a.by], ['count', a.count], ['sum', a.sum], ['orderBy', a.order_by], ['desc', a.desc]]) if (v != null) def[k] = v; return keep(def); });
  add('open_report', 'Show a report', [Object.assign({}, REPORT, { required: true })], (a) => show(find(a.report).def.id), { description: 'Run a report and read its first rows.' });   // i18n-ignore: the assistant's tools and replies (English: API)
  add('delete_report', 'Delete a saved report', [Object.assign({}, REPORT, { required: true })], (a) => {   // i18n-ignore: the assistant's tools and replies (English: API)
    const h = find(a.report);
    if (!h.saved) throw new Error('Built-in reports cannot be deleted');
    R.saved.remove(h.def.id); R.app.fillPicker(); R.app.choose(R.BUILTIN[0].id);
    return `Deleted the saved report “${h.def.title}”.`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }, { destructive: true });

  add('export_report', 'Export a report', [REPORT, { name: 'format', type: 'enum', values: ['csv', 'json'], default: 'csv', description: 'csv: the rows; json: the report itself' },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
  async (a) => {
    const h = find(a.report);
    if (h.def.id !== (R.app.current().def || {}).id) await show(h.def.id);
    const c = R.app.current();
    if (a.format === 'csv' && (!c.result || !c.result.ok)) throw new Error('The report cannot run');
    const blob = a.format === 'json' ? new Blob([JSON.stringify(h.def, null, 2)], { type: 'application/json' })
      : new Blob(['﻿', E.toCsv(c.result.columns, c.result.rows, c.ctx)], { type: 'text/csv;charset=utf-8' });
    const name = `${h.def.id}.${a.format}`, out = [];
    if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await toDrive(blob, name)})`);   // i18n-ignore: the assistant's tools and replies (English: API)
    if (a.to !== 'drive') { const el = Object.assign(g.document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); g.document.body.append(el); el.click(); el.remove(); out.push(`downloaded ${name}`); }
    return out.join(' and ') + '.';
  }, { description: 'The rows as CSV, or the report as JSON, to Slop Drive and/or a download.' });   // i18n-ignore: the assistant's tools and replies (English: API)

  C.register(list);
  C.provide({
    state: () => { const c = R.app.current(); return { app: 'Slop Reports', report: c.def && { id: c.def.id, title: c.def.title, saved: c.saved }, rows: c.result && c.result.ok ? c.result.rows.length : null, saved: R.saved.list().map((d) => d.id) }; },   // i18n-ignore: the assistant's tools and replies (English: API)
    checkpoint: () => {
      const before = JSON.stringify(R.saved.list()), open = (R.app.current().def || {}).id;
      return () => {
        for (const d of R.saved.list()) R.saved.remove(d.id);
        for (const d of JSON.parse(before)) R.saved.save(d);
        R.app.fillPicker(); R.app.choose(R.app.findDef(open) ? open : R.BUILTIN[0].id);
        return true;
      };
    },
  });
})(window);
