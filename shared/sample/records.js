/* SlopSample, records: one sample record for a business app's store (shared/data/schema-defs.js shapes: money in minor
 * units, rates in basis points, dates 'YYYY-MM-DD'), marked sample: true where the collection has that field. Pure; after
 * rng.js, the language files, people.js and goods.js. The caller saves it (shared/biz/sample.js), so every rule of the store
 * still applies.
 *   COLLECTIONS                       the collections a sample can be made for
 *   record(collection, seed, ctx)     -> { record, customer? }  customer: the customer (or supplier) record the document,
 *                                        time entry or event is for; the caller finds it by name or saves it first.
 *   ctx: { locale, currency, digits, today ('YYYY-MM-DD'), from, to (the date range, the last 60 days by default),
 *          terms (days to pay, 30), accounts (expense account codes), skus (a Set of SKUs in use), tz }
 * A timed event's start is that day and hour on this computer's clock (the same seed gives the same event here). */
(function (g) {
  'use strict';
  const NS = g.SlopSample;
  if (!NS || !NS.item || NS.record) return;
  const DOCS = { quotes: 'quote', invoices: 'invoice', orders: 'order', purchases: 'purchase' };
  const COLLECTIONS = ['quotes', 'invoices', 'orders', 'purchases', 'customers', 'products', 'expenses', 'timeEntries', 'tasks', 'events'];
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));

  function range(ctx) {
    const to = ctx.to || ctx.today || '2026-01-31';
    return { from: ctx.from || NS.addDays(to, -60), to };
  }
  /** A customer (or a supplier: o.supplier) as the customers collection keeps it. */
  function customer(seed, ctx, o) {
    const r = NS.rng(seed), id = NS.identity(r.fork('who'), ctx), w = NS.locale(ctx.locale);
    const asCompany = (o && o.supplier) || r.chance(0.6);
    const rec = { name: asCompany ? id.company : id.name, company: id.company, title: id.title, email: id.email, phone: id.phone,
      address: id.address, website: id.website, stage: o && o.supplier ? 'customer' : r.pick(w.stages), sample: true };
    if (!asCompany) rec.department = id.department;
    if (o && o.supplier) rec.supplier = true;
    return rec;
  }
  function product(r, ctx) {
    const it = NS.item(r.fork('item'), Object.assign({}, ctx, { kind: 'product' })), taken = ctx.skus || new Set();
    let n = r.int(100, 999);
    while (taken.has(`SMP-${n}`)) n = n >= 9999 ? 100 : n + 1;
    taken.add(`SMP-${n}`);
    return { record: { sku: `SMP-${n}`, name: it.name, price: it.price, taxRate: r.pick(NS.locale(ctx.locale).taxRates), unit: it.unit,
      reorderLevel: r.pick([0, 5, 10, 20]), sample: true } };
  }
  function doc(collection, r, ctx) {
    const kind = DOCS[collection], w = NS.locale(ctx.locale), span = range(ctx);
    const rec = { date: NS.day(r.fork('date'), span.from, span.to), lines: NS.lines(r.fork('lines'), ctx), notes: r.fork('notes').pick(w.notes[kind]), sample: true };
    if (ctx.currency) rec.currency = ctx.currency;
    if (kind === 'quote') rec.validUntil = NS.addDays(rec.date, 30);
    if (kind === 'invoice') rec.dueDate = NS.addDays(rec.date, ctx.terms == null ? 30 : ctx.terms);
    if (kind === 'purchase') rec.expectedDate = NS.addDays(rec.date, r.int(3, 21));
    return { record: rec, customer: customer(r.seed + '/customer', ctx, { supplier: kind === 'purchase' }) };
  }
  function expense(r, ctx) {
    const w = NS.locale(ctx.locale), [what, trade] = r.pick(w.expenses), span = range(ctx);
    const amount = NS.price(r, 4, 240, ctx), rate = r.pick(w.taxRates);
    const rec = { date: NS.day(r.fork('date'), span.from, span.to), supplier: `${r.pick(w.supplierWords)} ${trade}`, description: what,
      account: ctx.accounts && ctx.accounts.length ? r.pick(ctx.accounts) : '5000', amount, tax: Math.round((amount * rate) / (10000 + rate)),
      method: r.pick(['card', 'card', 'bank', 'cash']), sample: true };
    if (ctx.currency) rec.currency = ctx.currency;
    return { record: rec };
  }
  function time(r, ctx) {
    const w = NS.locale(ctx.locale), span = range(ctx), [, , lo, hi] = w.services[1];   // the hourly service sets the rate
    const rec = { date: NS.day(r.fork('date'), span.from, span.to), project: r.pick(w.projects), description: r.pick(w.work),
      minutes: 15 * r.int(2, 32), rate: NS.price(r, lo, hi, ctx), billable: r.chance(0.8), sample: true };
    if (ctx.currency) rec.currency = ctx.currency;
    return { record: rec, customer: rec.billable ? customer(r.seed + '/customer', ctx) : undefined };
  }
  function task(r, ctx) {
    const w = NS.locale(ctx.locale), who = NS.identity(r.fork('who'), ctx), today = ctx.today || range(ctx).to;
    const rec = { title: fill(r.pick(w.tasks), { name: who.first, company: who.companyShort, n: 1000 + r.int(1, 400) }), list: 'Inbox',
      priority: r.pick(['none', 'none', 'low', 'high']), tags: [] };
    if (r.chance(0.7)) rec.due = NS.addDays(today, r.int(0, 21));
    return { record: rec };
  }
  function event(r, ctx) {
    const w = NS.locale(ctx.locale), who = NS.identity(r.fork('who'), ctx), today = ctx.today || range(ctx).to;
    const d = NS.addDays(today, r.int(-7, 21)), h = r.int(8, 16), m = r.pick([0, 0, 30]), mins = r.pick([30, 45, 60, 60, 90]);
    const start = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h, m).getTime();
    const title = fill(r.pick(w.events), { name: who.name, company: who.companyShort });
    return { record: { title, allDay: false, start, end: start + mins * 60000, tz: ctx.tz || 'UTC', location: r.pick(w.places),
      kind: /call|samtal/i.test(title) ? 'call' : 'meeting', color: r.pick(['blue', 'green', 'amber', 'violet', 'teal']) } };
  }

  /** One sample record. An unknown collection is an Error naming the ones there are. */
  function record(collection, seed, ctx) {
    const c = Object.assign({}, ctx), r = NS.rng(`${collection}:${seed}`);
    if (DOCS[collection]) return doc(collection, r, c);
    if (collection === 'customers') return { record: customer(r.seed, c) };
    if (collection === 'products') return product(r, c);
    if (collection === 'expenses') return expense(r, c);
    if (collection === 'timeEntries') return time(r, c);
    if (collection === 'tasks') return task(r, c);
    if (collection === 'events') return event(r, c);
    throw new Error(`No samples for “${collection}”; there are samples for ${COLLECTIONS.join(', ')}`);
  }

  Object.assign(NS, { COLLECTIONS, record, customer });
})(typeof window !== 'undefined' ? window : globalThis);
