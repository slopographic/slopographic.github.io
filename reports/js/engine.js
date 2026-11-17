/* Slop Reports: the report engine. Pure: no storage and no DOM. A report is a small JSON query:
 *   id, title, note?           the id is text; the title and note are shown above the table
 *   from                       the collection to read: customers | invoices | payments | customerGroups | customerTags |
 *                              expenses | accounts | journal | timeEntries | quotes
 *   where?                     [[field, op, value]] on the source rows (query.js ops; "$today", "$today+14" are dates)
 *   enrich?                    names from enrich.js added to the source rows first
 *   unwind?                    a list field: one row per item (a row with no item keeps one row with the field empty)
 *   join?                      { from, on: [sourceField, joinedField], type: inner|left, prefix?, ci?, where? }
 *   by?, count?, sum?, avg?    group and total (by: a field or a list; none = one total row)
 *   orderBy?, desc?, limit?    sort the result rows; a grouped report sorts by its output names (sum_total, count)
 *   columns                    [{ field, label, type?: text|number|money|date|duration|percent, currency?: 'base' }]
 *                              duration cells are minutes, shown as h:mm (CSV: decimal hours); percent cells are a
 *                              share from 0 to 1, shown as 42% (CSV: 42.0); an empty share shows nothing.
 *                              money cells are minor units; the currency is the row's, or the base currency.
 * Soft-deleted rows are removed by the loader (data.js), not here. Classic script: sets window.SlopReports.engine. */
(function (g) {
  'use strict';
  const ns = (g.SlopReports = g.SlopReports || {});
  const Q = g.SlopDbQuery;
  const SOURCES = ['customers', 'invoices', 'payments', 'customerGroups', 'customerTags', 'expenses', 'accounts', 'journal', 'timeEntries', 'quotes'];
  const TYPES = ['text', 'number', 'money', 'date', 'duration', 'percent'];
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /** "$today" is the local day; "$today+14" and "$today-3" move it by whole days. Any other value is returned as it is. */
  function resolveToken(v, now) {
    if (typeof v !== 'string' || !v.startsWith('$today')) return v;
    const m = /^\$today(?:([+-])(\d{1,5}))?$/.exec(v);
    if (!m) return v;
    const days = m[2] ? Number(m[2]) * (m[1] === '-' ? -1 : 1) : 0;
    return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  }
  const resolveAny = (v, now) => (Array.isArray(v) ? v.map((x) => resolveToken(x, now)) : resolveToken(v, now));
  const resolveWhere = (where, now) => (where || []).map(([f, op, v]) => [f, op, resolveAny(v, now)]);

  const isStrings = (v, n) => Array.isArray(v) && v.length === n && v.every((s) => typeof s === 'string' && s);
  const isStringList = (v) => v === undefined || (Array.isArray(v) && v.every((s) => typeof s === 'string' && s));
  const ENRICH_NAMES = () => Object.keys(ns.enrich || {});

  /** The problems with a report definition, as sentences. An empty list means it can run. */
  function validate(def) {
    if (!def || typeof def !== 'object' || Array.isArray(def)) return ['a report is a JSON object'];
    const e = [];
    if (typeof def.id !== 'string' || !def.id.trim()) e.push('id is needed');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    if (typeof def.title !== 'string' || !def.title.trim()) e.push('title is needed');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    if (!SOURCES.includes(def.from)) e.push(`from must be one of ${SOURCES.join(', ')}`);
    try { Q.checkWhere(def.where || []); } catch (err) { e.push(`where: ${err.message}`); }
    if (def.enrich !== undefined && (!Array.isArray(def.enrich) || def.enrich.some((n) => !ENRICH_NAMES().includes(n)))) {
      e.push(`enrich must name some of ${ENRICH_NAMES().join(', ')}`);
    }
    if (def.unwind !== undefined && (typeof def.unwind !== 'string' || !def.unwind)) e.push('unwind must be a field name');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    if (def.join !== undefined) {
      const j = def.join || {};
      if (!SOURCES.includes(j.from)) e.push('join.from must be a collection');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
      if (!isStrings(j.on, 2)) e.push('join.on needs two field names');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
      if (j.type !== undefined && !['inner', 'left'].includes(j.type)) e.push('join.type is inner or left');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
      try { Q.checkWhere(j.where || []); } catch (err) { e.push(`join.where: ${err.message}`); }
    }
    if (!isStringList(def.by)) e.push('by must be a list of fields');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    if (!isStringList(def.sum)) e.push('sum must be a list of fields');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    if (!isStringList(def.avg)) e.push('avg must be a list of fields');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    if (def.count !== undefined && typeof def.count !== 'boolean') e.push('count is true or false');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    if (def.orderBy !== undefined && typeof def.orderBy !== 'string') e.push('orderBy is a field name');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    if (def.limit !== undefined && !(Number.isInteger(def.limit) && def.limit >= 0)) e.push('limit is a whole number');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    if (!Array.isArray(def.columns) || !def.columns.length) e.push('columns needs at least one column');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
    else {
      for (const c of def.columns) {
        if (!c || typeof c.field !== 'string' || typeof c.label !== 'string') e.push('each column needs a field and a label');   // i18n-ignore: the definition checker's words name JSON keys (the report language)
        else if (c.type !== undefined && !TYPES.includes(c.type)) e.push(`column ${c.field}: type is ${TYPES.join(', ')}`);
      }
    }
    return e;
  }

  /** One row per item of a list field. A row with no items keeps one row, with the field empty. */
  function unwind(rows, field) {
    return rows.flatMap((r) => {
      const v = r[field];
      if (!Array.isArray(v) || !v.length) return [{ ...r, [field]: undefined }];
      return v.map((x) => ({ ...r, [field]: x }));
    });
  }

  /** Runs a definition over data ({ customers, invoices, payments, customerGroups, customerTags, settings } as row lists).
   * opts: { now, baseCurrency, locale }. Never changes data. Resolves to { ok, columns, rows, title, note } or { ok: false, errors }. */
  function run(def, data, opts = {}) {
    const errors = validate(def);
    if (errors.length) return { ok: false, errors };
    const now = opts.now || new Date();
    try {
      let rows = (data[def.from] || []).slice();
      for (const name of def.enrich || []) rows = ns.enrich[name](rows, data);
      if (def.unwind) rows = unwind(rows, def.unwind);
      rows = Q.filterRows(rows, resolveWhere(def.where, now));
      if (def.join) {
        const j = def.join;
        const right = Q.filterRows(data[j.from] || [], resolveWhere(j.where, now));
        rows = Q.join(rows, right, { on: j.on, type: j.type || 'inner', prefix: j.prefix, ci: !!j.ci });
      }
      const grouped = !!(def.by || def.count || (def.sum && def.sum.length) || (def.avg && def.avg.length));
      if (grouped) rows = Q.aggregate(rows, { by: def.by || [], count: !!def.count, sum: def.sum || [], avg: def.avg || [] });
      rows = Q.run(rows, { orderBy: def.orderBy, desc: !!def.desc, limit: def.limit });
      const groupFields = def.by || [];
      const columns = def.columns.map((c) => ({ field: c.field, label: c.label, type: c.type || 'text', currency: c.currency, group: groupFields.includes(c.field) }));
      return { ok: true, title: def.title, note: def.note || '', columns, rows };
    } catch (err) {
      return { ok: false, errors: [err.message || String(err)] };
    }
  }

  /** Decimal places of a currency's minor unit (2 for USD, 0 for JPY). */
  function minorDigits(cur) {
    try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits; } catch (e) { return 2; }
  }

  const currencyOf = (row, col, ctx) => (col.currency === 'base' ? ctx.baseCurrency || 'USD' : row.currency || ctx.baseCurrency || 'USD');

  /** A money amount in minor units, as the currency's text. */
  function formatMoney(minor, cur, locale) {
    const d = minorDigits(cur);
    try { return new Intl.NumberFormat(locale || undefined, { style: 'currency', currency: cur }).format(minor / 10 ** d); } catch (e) { return `${(minor / 10 ** d).toFixed(d)} ${cur}`; }
  }

  /** What a cell shows. Empty grouping values read as (none); other empty cells are blank. ctx: { baseCurrency, locale }. */
  function cellText(row, col, ctx = {}) {
    const v = row[col.field];
    if (v === undefined || v === null) return col.group ? '(none)' : '';
    if (col.type === 'money') return isNum(v) ? formatMoney(v, currencyOf(row, col, ctx), ctx.locale) : '';
    if (col.type === 'duration') return isNum(v) ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : '';
    if (col.type === 'percent') return isNum(v) ? `${Math.round(v * 100)}%` : '';
    return String(v);
  }

  /** The text of a cell for export: money as a plain decimal, otherwise what the cell shows. */
  function exportText(row, col, ctx = {}) {
    if (col.type === 'duration') return isNum(row[col.field]) ? (row[col.field] / 60).toFixed(2) : '';
    if (col.type === 'percent') return isNum(row[col.field]) ? (row[col.field] * 100).toFixed(1) : '';
    if (col.type !== 'money') return cellText(row, col, ctx);
    const v = row[col.field];
    if (!isNum(v)) return '';
    const cur = currencyOf(row, col, ctx), d = minorDigits(cur);
    return (v / 10 ** d).toFixed(d);
  }

  const csvCell = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

  /** CSV text: a header row of labels, then one line per row. */
  function toCsv(columns, rows, ctx = {}) {
    const lines = [columns.map((c) => csvCell(c.label)).join(',')];
    for (const r of rows) lines.push(columns.map((c) => csvCell(exportText(r, c, ctx))).join(','));
    return `${lines.join('\r\n')}\r\n`;
  }

  ns.engine = { SOURCES, TYPES, validate, run, resolveToken, resolveWhere, unwind, minorDigits, formatMoney, cellText, exportText, toCsv };
})(typeof window !== 'undefined' ? window : globalThis);
