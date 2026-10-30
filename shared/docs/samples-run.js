// Creates and removes random sample documents. The apps pass an `io` object (see invoices/js/core/samples.js and
// orders/js/core/samples.js), so every write goes through the app's own functions and the data layer's rules.
//   io: { base, terms, locale, today, customers(), products(), addCustomer(rec), addProduct(rec), saveDocument(draft),
//         sampleDocuments(), removeDocument(doc) }   each async call returns a Result ({ ok, value } or { ok: false, ... }).
// Each document is one save (one record, one transaction). The batch has no undo stack of its own: Delete all samples
// is the way back. Classic script. Exposes SlopDocs.samples.run and SlopDocs.samples.removeSamples.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopDocs = g.SlopDocs || {});
  const M = NS.model;
  const samples = (NS.samples = NS.samples || {});

  /** The reason in plain words from a failed Result. */
  function why(r) {
    const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
    if (r && Array.isArray(r.errors) && r.errors.length) return r.errors[0].message ? `${r.errors[0].field || ''} ${r.errors[0].message}`.trim() : t('biz.sm.not_valid');
    return (r && (r.message || r.code)) || t('biz.sm.went_wrong');
  }

  /** Looks up the stored customer and product ids for one plan, saving any new records first. Returns a Result. */
  async function saveNew(io, p, out) {
    let customerId = p.customerId;
    if (p.newCustomer) {
      const c = await io.addCustomer(p.newCustomer);
      if (!c.ok) return c;
      customerId = c.value.id;
      out.newCustomers++;
    }
    const productIds = [];
    for (const rec of p.newProducts) {
      const pr = await io.addProduct(rec);
      if (!pr.ok) return pr;
      productIds.push(pr.value.id);
      out.newProducts++;
    }
    return S.result.ok({ customerId, productIds });
  }

  /** One document: plan, save the new customer and products, check every line and total, then save the document. */
  async function one(index, o, out) {
    const io = o.io;
    const cs = await io.customers();
    if (!cs.ok) return cs;
    const ps = await io.products();
    if (!ps.ok) return ps;
    const p = NS.samples.plan(`${o.seed}#${index}`, {
      kind: o.kind, currency: o.currency, base: io.base, from: o.from, to: o.to, paymentTermsDays: io.terms, locale: io.locale,
      missing: o.missing, customers: cs.value.map((c) => ({ id: c.id, name: c.name })), products: ps.value,
      skus: new Set(ps.value.map((x) => x.sku)),
    });
    if (p.error) return S.result.fail('invalid', p.error);
    const saved = await saveNew(io, p, out);
    if (!saved.ok) return saved;
    const lines = p.lines.map((l) => M.cleanLine({
      description: l.description, qty: l.qty, unitPrice: l.unitPrice, taxRate: l.taxRate, discount: l.discount,
      productId: l.ref ? (l.ref.id ?? saved.value.productIds[l.ref.n]) : undefined, sku: l.sku,
    }));
    const bad = lines.map((l) => M.lineErrors(l)).find((e) => e.length);
    if (bad) return S.result.fail('invalid', `generated line is not valid: ${bad[0]}`);
    const totals = M.totals(lines);
    if (!totals || totals.total > S.money.MAX_MINOR) return S.result.fail('invalid', 'generated total is out of range');   // i18n-ignore: checks for developers: a generated sample that the model refuses
    const draft = { customerId: saved.value.customerId, date: p.date, notes: p.notes, currency: p.currency, lines, sample: true };
    if (p.dueDate) draft.dueDate = p.dueDate;
    const doc = await io.saveDocument(draft);
    if (!doc.ok) return doc;
    if (doc.value.total !== totals.total) return S.result.fail('invalid', 'the saved total differs from the model total');   // i18n-ignore: checks for developers: a generated sample that the model refuses
    const customer = (cs.value.find((c) => c.id === saved.value.customerId) || {}).name || (p.newCustomer && p.newCustomer.name) || '';
    out.created.push({ id: doc.value.id, number: doc.value.number || '', total: doc.value.total, currency: p.currency, customer, lines: lines.length, seed: p.seed });
    return S.result.ok(doc.value);
  }

  /**
   * Makes count sample documents. opts: { kind: 'invoice' | 'order', count, seed, from, to, currency, missing: { customers,
   * products }, io, onProgress(done, count) }. Options are checked first; nothing is saved when they are not usable.
   * Returns a Result: { seed, created: [{ id, number, total, currency, customer, lines, seed }], failed: [{ index, message }],
   * newCustomers, newProducts }. A failed document does not stop the batch.
   */
  async function run(opts) {
    const seed = samples.normalizeSeed(opts.seed);
    const bad = samples.checkOptions({ count: opts.count, seed, from: opts.from, to: opts.to, currency: opts.currency });
    if (bad) return S.result.fail('invalid', bad);
    const o = { ...opts, seed, missing: { customers: !!(opts.missing && opts.missing.customers), products: !!(opts.missing && opts.missing.products) } };
    const out = { seed, created: [], failed: [], newCustomers: 0, newProducts: 0 };
    for (let i = 0; i < o.count; i++) {
      if (o.onProgress) o.onProgress(i, o.count);
      const r = await one(i, o, out);
      if (!r.ok) out.failed.push({ index: i + 1, message: why(r) });
    }
    if (o.onProgress) o.onProgress(o.count, o.count);
    return S.result.ok(out);
  }

  /**
   * Deletes every live sample of one kind (io.sampleDocuments and io.removeDocument), then the sample customers and
   * products that no live invoice or order uses. Records the data layer refuses stay, and the reasons are listed in kept.
   * Returns a Result: { documents, customers, products, kept: [string] }.
   */
  async function removeSamples(io) {
    const out = { documents: 0, customers: 0, products: 0, kept: [] };
    const docs = await io.sampleDocuments();
    if (!docs.ok) return docs;
    for (const d of docs.value) {
      const r = await io.removeDocument(d);
      if (r.ok) out.documents++;
      else out.kept.push(`${d.number || 'draft'}: ${why(r)}`);
    }
    const used = new Set(), usedProducts = new Set();
    for (const name of ['invoices', 'orders']) {
      const rows = await S.store.list(name);
      if (!rows.ok) return rows;
      for (const x of rows.value) {
        used.add(x.customerId);
        for (const l of x.lines || []) if (l.productId) usedProducts.add(l.productId);
      }
    }
    const cs = await S.store.list('customers');
    if (!cs.ok) return cs;
    for (const c of cs.value.filter((x) => x.sample && !used.has(x.id))) {
      const r = await S.store.remove('customers', c.id);
      if (r.ok) out.customers++;
    }
    const ps = await S.store.list('products');
    if (!ps.ok) return ps;
    for (const p of ps.value.filter((x) => x.sample && !usedProducts.has(x.id))) {
      const r = await S.store.remove('products', p.id);
      if (r.ok) out.products++;
    }
    return S.result.ok(out);
  }

  Object.assign(samples, { run, removeSamples, why });
})(typeof window !== 'undefined' ? window : globalThis);
