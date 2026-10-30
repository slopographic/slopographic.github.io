// Random sample documents for Slop Invoices and Slop Orders. Pure: SlopDocs.samples.plan(seed, env) draws a plan from one
// seeded generator, SlopSample.rng (shared/sample, loaded first: its names and goods are the one source of sample words). The same seed and the same environment always give the same plan. No storage, no Math.random in plan().
// The plan is saved by samples-run.js through the app's own functions, so every rule of the data layer still applies.
// Money is integer minor units; tax rates and discounts are basis points (SlopDocs.model rules). Classic script.
(function (g) {
  'use strict';
  const NS = (g.SlopDocs = g.SlopDocs || {});
  const M = NS.model;
  const samples = (NS.samples = NS.samples || {});

  const X = g.SlopSample;   // shared/sample: the seeded generator, the names and the goods (the one source of sample words)

  const MAX_DOCS = 50, MAX_LINES = 6, MAX_QTY = 12, MAX_SEED = 40;
  const TAX_RATES = [0, 500, 700, 1000, 2000];         // 0%, 5%, 7%, 10%, 20%
  const DISCOUNTS = [500, 1000, 1500, 2000, 2500];     // 5% to 25% off the line net

  const hashSeed = (text) => X.hashSeed(text);
  /** A generator seeded from a string: next() in [0, 1), int(lo, hi) inclusive, pick(list), chance(p) (SlopSample.rng). */
  const rng = (seed) => X.rng(seed);
  /** A new seed (SlopSample.newSeed). The caller may pass rand (Math.random by default). */
  const newSeed = (rand) => X.newSeed(rand);

  const pad = (n, w) => String(n).padStart(w, '0');
  /** A catalogue price in minor units, 1.00 to 250.00 in steps of 0.50. */
  const randomPrice = (r) => r.int(2, 500) * 50;
  const dayCount = (from, to) => X.dayCount(from, to);
  /** Something to sell, by name (SlopSample's goods, in the person's language). */
  const thing = (r, locale) => X.item(r, { locale }).name;

  /** A customer record for the customers collection (a sample, so it can be deleted with the others). */
  function customerRecord(r, locale) {
    const c = X.customer(r.seed + '/' + r.int(0, 1e9), { locale });
    return { name: c.name, email: c.email, phone: c.phone, address: c.address, stage: 'customer', sample: true };
  }

  /** A product record. The SKU is the first SMP-nnn that the catalogue does not use (taken is updated). */
  function productRecord(r, taken, locale) {
    const name = thing(r, locale);
    const price = randomPrice(r);
    const taxRate = r.pick(TAX_RATES);
    let n = 1;
    while (taken.has(`SMP-${pad(n, 3)}`)) n++;
    const sku = `SMP-${pad(n, 3)}`;
    taken.add(sku);
    return { sku, name, price, taxRate, unit: 'each', sample: true };
  }

  /** Why the options are not usable, or null. Checked before anything is saved. */
  function checkOptions(o) {
    const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    if (!Number.isInteger(o.count) || o.count < 1 || o.count > MAX_DOCS) return t('biz.sm.bad_count', { max: String(MAX_DOCS) });
    if (String(o.seed ?? '').length > MAX_SEED) return t('biz.sm.bad_seed', { max: String(MAX_SEED) });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(o.to || '')) return t('biz.sm.both_dates');
    if (o.from > o.to) return t('biz.sm.range_order');
    if (dayCount(o.from, o.to) > 3650) return t('biz.sm.range_long');
    if (!/^[A-Z]{3}$/.test(o.currency || '')) return t('biz.sm.currency_need');
    return null;
  }

  /**
   * One sample document as a plan (no ids yet). env: { kind: 'invoice' | 'order', currency, base, from, to, paymentTermsDays,
   * missing: { customers, products }, customers: [{ id, name }], products: [{ id, sku, name, price, taxRate }], skus: Set }.
   * Returns { seed, customerId | newCustomer, newProducts: [record], lines: [line], date, dueDate?, notes, currency } or { error }.
   * A line's ref is { id } for a catalogue product, { n } for newProducts[n], or null for a custom line.
   */
  function plan(seed, env) {
    const r = rng(String(seed));
    const customers = env.customers || [];
    const u = r.next();   // the customer draw comes first, whatever the list holds
    const out = { seed: String(seed), customerId: null, newCustomer: null, newProducts: [], lines: [], date: '', dueDate: undefined, notes: '', currency: env.currency };
    if (customers.length) out.customerId = customers[Math.floor(u * customers.length)].id;
    else if (env.missing && env.missing.customers) out.newCustomer = customerRecord(r, env.locale);
    else return { error: g.SlopI18n ? g.SlopI18n.t('biz.sm.no_customers') : 'biz.sm.no_customers' };

    out.date = M.addDays(env.from, r.int(0, dayCount(env.from, env.to)));
    if (env.kind === 'invoice') out.dueDate = M.addDays(out.date, env.paymentTermsDays);
    out.notes = r.pick(X.locale(env.locale).notes[env.kind] || X.locale(env.locale).notes.invoice);

    const pool = (env.products || []).map((p) => ({ ref: { id: p.id }, sku: p.sku, name: p.name, price: p.price, taxRate: p.taxRate }));
    const sameCurrency = env.currency === env.base;
    const taken = new Set(env.skus || []);
    const lineCount = r.int(1, MAX_LINES);
    for (let i = 0; i < lineCount; i++) {
      if (!pool.length && env.missing && env.missing.products) {
        const rec = productRecord(r, taken, env.locale);
        out.newProducts.push(rec);
        pool.push({ ref: { n: out.newProducts.length - 1 }, sku: rec.sku, name: rec.name, price: rec.price, taxRate: rec.taxRate });
      }
      const custom = thing(r, env.locale);
      const unit = randomPrice(r);
      const rate = r.pick(TAX_RATES);
      const qty = r.int(1, MAX_QTY);
      const discount = r.chance(0.25) ? r.pick(DISCOUNTS) : 0;
      const p = pool.length ? r.pick(pool) : null;
      // A catalogue price is used only in the base currency: the prices of another currency are drawn fresh.
      const line = p
        ? { ref: p.ref, sku: p.sku, description: p.name, qty, unitPrice: sameCurrency ? p.price : unit, taxRate: p.taxRate }
        : { ref: null, description: custom, qty, unitPrice: unit, taxRate: rate };
      if (discount) line.discount = discount;
      out.lines.push(line);
    }
    return out;
  }

  Object.assign(samples, { MAX_DOCS, MAX_LINES, MAX_QTY, TAX_RATES, DISCOUNTS, hashSeed, rng, newSeed, checkOptions, plan, dayCount, randomPrice, customerRecord, productRecord });
  samples.normalizeSeed = (s, rand) => X.normSeed(s, rand);
})(typeof window !== 'undefined' ? window : globalThis);
