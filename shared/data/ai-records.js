/* SlopDataAI: the business apps' records as assistant commands with arguments (SlopCmd; shared/commands/args.js), through
 * the one store (SlopData.store, schema.js checks every record) and the apps' own posting calls. Classic script, loaded on
 * demand by SlopBiz.commands' prepare (shared/biz/biz.js) or an app's own; ai-records-apps.js says which collections each
 * app works on and adds the app's own steps (issue an invoice, a document's PDF…).
 *   install(app)   registers <app>.ai.* for that app: describe_records, list_records, create_record, update_record,
 *                  delete_record (destructive), export_records, make_sample (shared/biz/sample.js), plus the app's own;
 *                  provide({ state, checkpoint })
 *   toRecord(collection, fields)  plain values → the store's shape: money "12.50" → 1250 minor units, a rate "20%" → 2000
 *                  basis points, lines the same way, customer: "name" → customerId (made when it does not exist yet)
 * Every write is remembered for "Undo all AI changes": created records are removed and changed ones put back. */
(function (g) {
  'use strict';
  const D = () => g.SlopData, A = () => g.SlopCmdArgs;
  const AI = (g.SlopDataAI = g.SlopDataAI || {});
  const log = [];   // { kind: 'created' | 'updated', collection, id, before }

  const fieldsOf = (c) => { const d = D().schema.def(c); if (!d) throw new Error(`No collection “${c}”`); return d.fields; };
  /** "12.50", 12.5, "$1,200" → minor units in the currency (2 decimals unless the currency says otherwise). Tool
   *  arguments are locale-independent: a dot is the decimal point and a comma only groups thousands, so "12,50" is refused
   *  rather than guessed (money.parseMinor, strict; never the page's language). */
  function minor(v, cur) {
    const s = String(v).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '');
    const m = D().money.parseMinor(s, cur);
    if (m == null) throw new Error(`“${v}” is not an amount`);
    return m;
  }
  /** "20%", 20, 0.2 → basis points (2000). */
  function rate(v) {
    const n = A().toNumber(v);
    if (!Number.isFinite(n)) throw new Error(`“${v}” is not a rate`);
    return Math.round((n > 0 && n < 1 && !/%/.test(String(v)) ? n * 100 : n) * 100);
  }
  /** The fields of one item of a list field: rows (its own), lines (document lines), jlines (journal lines), countLines. */
  const itemsOf = (s) => { const d = D().schemaDefs; return s.t === 'rows' ? s.of : s.t === 'lines' ? d.LINE : s.t === 'jlines' ? d.JLINE : s.t === 'countLines' ? d.COUNT : null; };
  function convert(spec, v, cur) {
    if (v == null) return v;
    if (spec.t === 'money') return minor(v, cur);
    if (spec.t === 'rate') return rate(v);
    if (spec.t === 'int') return Math.round(A().toNumber(v));
    if (spec.t === 'ts') { const t = typeof v === 'number' ? v : Date.parse(String(v)); if (!Number.isFinite(t)) throw new Error(`“${v}” is not a date and time`); return t; }
    if (spec.t === 'bool') return /^(true|yes|1|on)$/i.test(String(v));
    if (itemsOf(spec)) return [].concat(v).map((row) => convertAll(itemsOf(spec), row, cur));
    if (spec.t === 'strings') return [].concat(typeof v === 'string' ? v.split(/\s*,\s*/) : v).filter(Boolean).map(String);
    return v;
  }
  function convertAll(fields, raw, cur) {
    const out = {};
    for (const [k, v] of Object.entries(raw || {})) {
      const key = Object.keys(fields).find((f) => f.toLowerCase() === k.toLowerCase().replace(/_(\w)/g, (m, c) => c)) || k;
      out[key] = fields[key] ? convert(fields[key], v, cur) : v;
    }
    return out;
  }
  const unwrap = (r, what) => { if (!r || !r.ok) throw new Error(`${what}: ${(r && (r.message || (r.errors || []).map((e) => `${e.field} ${e.message}`).join('; '))) || 'refused'}`); return r.value; };

  /** A customer (or supplier) by id or name; made when the name is new. */
  async function customerId(q, extra = {}) {
    const S = D().store;
    const byId = await S.get('customers', String(q));
    if (byId && byId.ok && byId.value) return byId.value.id;
    const list = unwrap(await S.list('customers'), 'Customers'), s = String(q).trim().toLowerCase();
    const hit = list.find((c) => c.name.toLowerCase() === s) || list.find((c) => c.name.toLowerCase().includes(s));
    if (hit) return hit.id;
    const made = unwrap(await S.put('customers', Object.assign({ name: String(q).trim() }, extra)), 'New customer');
    log.push({ kind: 'created', collection: 'customers', id: made.id });
    return made.id;
  }
  AI.toRecord = async function (collection, raw) {
    const f = fieldsOf(collection), r = Object.assign({}, raw || {});
    if (r.customer != null && f.customerId && r.customerId == null) { r.customerId = await customerId(r.customer, r.supplier ? { supplier: true } : {}); delete r.customer; }
    if (r.supplier != null && f.customerId && r.customerId == null && typeof r.supplier === 'string') { r.customerId = await customerId(r.supplier, { supplier: true }); delete r.supplier; }
    if (f.tz && r.tz == null) r.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';   // events and tasks keep their time zone
    return convertAll(f, r, r.currency);
  };
  AI.customerId = customerId;
  AI.remember = (e) => log.push(e);
  AI.unwrap = unwrap;

  /** The fields of a collection for the assistant: name, type, required, choices. */
  function describe(collection) {
    return Object.entries(fieldsOf(collection)).filter(([k]) => !['id', 'sample', 'created', 'updated', 'deleted'].includes(k)).map(([k, s]) => {
      const o = { field: k, type: s.t === 'money' ? 'amount like 12.50' : s.t === 'rate' ? 'percent like 20' : s.t };
      if (s.req) o.required = true;
      if (s.values) o.choices = s.values;
      if (itemsOf(s)) o.items = Object.keys(itemsOf(s)).filter((x) => !['net', 'tax', 'total'].includes(x));
      return o;
    });
  }
  function csv(rows) {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const cell = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  }
  async function save(blob, name, to, app) {
    const out = [];
    if (to !== 'download') { if (!g.SlopHub) throw new Error('Slop Drive is not available here'); out.push(`Saved ${name} to Slop Drive (id ${await g.SlopHub.put(blob, { name, from: app })})`); }
    if (to !== 'drive') { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); out.push(`downloaded ${name}`); }
    return out.join(' and ') + '.';
  }
  AI.save = save;

  AI.install = function (app) {
    const C = g.SlopCmd, cfg = AI.APPS && AI.APPS[app];
    if (!C || !cfg || AI.installed === app) return;
    AI.installed = app;
    const COLL = { name: 'collection', type: 'enum', values: cfg.collections, default: cfg.collections[0], description: 'which records' };
    const list = [];
    const add = (tool, title, args, run, extra) => list.push(Object.assign({ id: `${app}.ai.${tool.replace(/_/g, '-')}`, tool, title, group: 'AI', hidden: true, destructive: false, args,
      run: (a) => run(a || A().defaults(args)) }, extra));
    const S = () => D().store;
    add('describe_records', 'Describe the records', [COLL], (a) => describe(a.collection), { description: `The fields of ${cfg.label}'s records (call before create_record).`, macro: false });
    add('list_records', 'List records', [COLL, { name: 'search', type: 'string', maxLength: 200, description: 'words in any field' }, { name: 'limit', type: 'number', min: 1, max: 200, default: 50, integer: true }],
      async (a) => {
        const rows = unwrap(await S().list(a.collection), 'List'), q = String(a.search || '').toLowerCase();
        return rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q)).slice(0, a.limit).map((r) => { const o = Object.assign({}, r); delete o.photo; return o; });
      }, { macro: false });
    add('create_record', 'Create a record', [COLL, { name: 'fields', type: 'object', required: true, description: 'field values (describe_records); amounts like 12.50, rates like 20 (%), customer by name' }],
      async (a) => {
        const rec = await AI.toRecord(a.collection, a.fields), post = cfg.post && cfg.post[a.collection];
        const made = unwrap(post ? await post(rec) : await S().put(a.collection, rec), `New ${a.collection}`);
        log.push({ kind: 'created', collection: a.collection, id: made.id });
        return { done: `Created a ${a.collection} record`, id: made.id, number: made.number, record: made };
      }, { description: `Add a record (${cfg.collections.join(', ')}) in ${cfg.label}.` });
    add('update_record', 'Change a record', [COLL, { name: 'id', type: 'string', required: true, maxLength: 100 }, { name: 'fields', type: 'object', required: true, description: 'the fields to change' }],
      async (a) => {
        const before = unwrap(await S().get(a.collection, a.id), 'Find');
        if (!before) throw new Error(`No ${a.collection} record ${a.id}`);
        const rec = Object.assign({}, before, await AI.toRecord(a.collection, a.fields));
        const saved = unwrap(await S().put(a.collection, rec), 'Save');
        log.push({ kind: 'updated', collection: a.collection, id: a.id, before });
        return { done: `Changed ${a.collection} ${saved.number || saved.name || a.id}`, record: saved };
      });
    add('delete_record', 'Delete a record', [COLL, { name: 'id', type: 'string', required: true, maxLength: 100 }],
      async (a) => { const before = unwrap(await S().get(a.collection, a.id), 'Find'); unwrap(await S().remove(a.collection, a.id), 'Delete'); log.push({ kind: 'deleted', collection: a.collection, id: a.id, before }); return `Deleted ${a.collection} ${a.id}.`; },
      { destructive: true });
    add('export_records', 'Export records', [Object.assign({}, COLL, { values: cfg.collections.concat(['all']) }), { name: 'format', type: 'enum', values: ['csv', 'json'], default: 'csv' },
      { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
      async (a) => {
        if (a.collection === 'all' || a.format === 'json' && a.collection === 'all') { const r0 = await D().exporter.exportFile(), f = r0 && r0.ok !== undefined ? AI.unwrap(r0, 'Backup') : r0; return save(f.blob, f.name, a.to, app); }
        const rows = unwrap(await S().list(a.collection), 'List'), day = new Date().toISOString().slice(0, 10);
        const blob = a.format === 'json' ? new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }) : new Blob([csv(rows)], { type: 'text/csv' });
        return save(blob, `${a.collection}-${day}.${a.format}`, a.to, app);
      }, { description: 'Save the records as CSV or JSON to Slop Drive and/or a download.' });
    if (g.SlopBiz && g.SlopBiz.sample) g.SlopBiz.sample.command(add, cfg, app);   // make_sample (shared/biz/sample.js)
    if (cfg.extra) cfg.extra(add, AI);
    C.register(list);
    C.provide({ state: () => AI.view(cfg), checkpoint });
  };
  /** One record in a few fields: its id, number or name, status, date, customer, total and lines. */
  const brief = (r) => {
    const o = {};
    for (const k of ['id', 'number', 'name', 'title', 'status', 'date', 'due', 'validUntil', 'customerId', 'email', 'qty', 'currency']) if (r[k] != null && r[k] !== '') o[k] = r[k];
    if (r.total != null) o.total = D().money.formatMinor(r.total, r.currency || 'USD');
    if (Array.isArray(r.lines)) o.lines = r.lines.slice(0, 20).map((l) => ({ description: l.description, qty: l.qty, unit_price: l.unitPrice != null ? D().money.formatMinor(l.unitPrice, r.currency || 'USD') : undefined }));
    return o;
  };
  /** The app right now (app_state): the record the page shows (its address names it: #q/<id>), the newest records of
   * each collection and how many there are. */
  AI.view = async function (cfg) {
    const out = { app: cfg.label, records: {}, recent: {}, hint: 'list_records to read more; describe_records before create_record' };
    const at = decodeURIComponent(String((g.location && g.location.hash) || '').replace(/^#/, '').split('/').pop() || '');
    for (const c of cfg.collections) {
      const r = await D().store.list(c);
      if (!r.ok) continue;
      const rows = r.value.slice().sort((x, y) => (y.updated || y.created || 0) - (x.updated || x.created || 0));
      out.records[c] = rows.length;
      out.recent[c] = rows.slice(0, 5).map(brief);
      const open = at && rows.find((x) => x.id === at);
      if (open) out.open = Object.assign({ collection: c }, brief(open));
    }
    if (out.open && out.open.customerId) { const cu = await D().store.get('customers', out.open.customerId); if (cu.ok && cu.value) out.open.customer = cu.value.name; }
    return out;
  };
  function checkpoint() {
    const mark = log.length;
    return () => {
      const undo = log.splice(mark).reverse();
      (async () => {
        for (const e of undo) {
          if (e.kind === 'created' && e.collection === 'journal') await D().ledger.reverseJournal(e.id, { memo: 'Undo of an AI change' });   // posted: reversed, never removed
          else if (e.kind === 'created') await D().store.remove(e.collection, e.id);
          else if (e.before) await D().store.put(e.collection, e.before);
        }
      })();
      return true;
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
