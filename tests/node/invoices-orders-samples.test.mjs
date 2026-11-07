// Random samples for Slop Invoices and Slop Orders (shared/docs/samples*.js), in a vm context with the real schema.
// A fixed seed gives the same documents; every sample validates against the schema; the saved totals equal the model's.
// No IndexedDB here: the runner is driven by an in-memory io that saves through SlopData.schema.prepare, the same rules
// the store applies. The browser test (tests/invoices/samples.test.html) covers the store itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const PIN = "window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: null });";   // English in any build (a white-label build may choose another language first)

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// shared/i18n with the English business tables first, so messages read as on the page
const FILES = ['shared/i18n/i18n.js', 'shared/biz/i18n/en/biz.js', 'shared/biz/i18n/en/docs.js', 'shared/data/money.js', 'shared/data/barcode.js', 'shared/data/schema-checks.js', 'shared/data/schema-defs.js', 'shared/data/schema.js',
  'shared/data/currency.js', 'shared/data/ledger.js', 'shared/docs/model.js',
  'shared/sample/rng.js', 'shared/sample/en.js', 'shared/sample/sv.js', 'shared/sample/people.js', 'shared/sample/goods.js', 'shared/sample/records.js', 'shared/docs/samples.js', 'shared/docs/samples-run.js'];

async function load() {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES) { vm.runInContext(await readFile(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); if (f === 'shared/i18n/i18n.js') vm.runInContext(PIN, ctx); }
  return ctx;
}
const plain = (v) => JSON.parse(JSON.stringify(v));

/** An in-memory io: saves through schema.prepare (what the store checks), with the totals the schema derives. */
function memoryIO(ctx, { base = 'USD', terms = 30 } = {}) {
  const S = ctx.SlopData;
  const rows = { customers: [], products: [], invoices: [], orders: [] };
  let seq = 0;
  const put = (name, rec) => {
    const p = S.schema.prepare(name, rec, name === 'orders' ? { deferNumber: true } : {});
    if (!p.ok) return S.result.fail('invalid', S.schema.errorText(p.errors));
    const v = { ...p.value, id: `${name}-${++seq}` };
    rows[name].push(v);
    return S.result.ok(v);
  };
  return {
    rows,
    io: {
      base, terms, locale: 'en-US', today: '2026-07-01',
      customers: async () => S.result.ok(rows.customers.slice()),
      products: async () => S.result.ok(rows.products.slice()),
      addCustomer: async (rec) => put('customers', rec),
      addProduct: async (rec) => put('products', rec),
      saveDocument: async (draft) => put('invoices', draft),
    },
  };
}

const OPTS = { from: '2026-01-01', to: '2026-06-30', currency: 'USD' };
const SAMPLES = (ctx) => ctx.SlopDocs.samples;

test('the same seed and environment give the same plan; another seed gives another one', async () => {
  const ctx = await load();
  const env = { kind: 'invoice', currency: 'USD', base: 'USD', from: OPTS.from, to: OPTS.to, paymentTermsDays: 30,
    missing: { customers: true, products: true }, customers: [], products: [], skus: new Set() };
  const a = plain(SAMPLES(ctx).plan('fixed-2026', env));
  const b = plain(SAMPLES(ctx).plan('fixed-2026', env));
  const c = plain(SAMPLES(ctx).plan('other-2026', env));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.newCustomer && a.newCustomer.sample === true);
  assert.ok(a.lines.length >= 1 && a.lines.length <= 6);
  assert.ok(a.dueDate >= a.date, 'due date after the invoice date');
});

test('a plan refuses to make an invoice with no customer when none may be created', async () => {
  const ctx = await load();
  const p = SAMPLES(ctx).plan('x', { kind: 'invoice', currency: 'USD', base: 'USD', from: OPTS.from, to: OPTS.to, paymentTermsDays: 30,
    missing: { customers: false, products: false }, customers: [], products: [], skus: new Set() });
  assert.match(p.error, /Create missing customers/);
});

test('custom lines (no product list, products not created) carry no product reference', async () => {
  const ctx = await load();
  const p = plain(SAMPLES(ctx).plan('custom', { kind: 'order', currency: 'USD', base: 'USD', from: OPTS.from, to: OPTS.to, paymentTermsDays: 30,
    missing: { customers: true, products: false }, customers: [{ id: 'c1', name: 'Acme' }], products: [], skus: new Set() }));
  assert.equal(p.customerId, 'c1');
  assert.equal(p.newCustomer, null);
  assert.ok(p.lines.every((l) => l.ref === null));
  assert.equal(p.dueDate, undefined, 'orders have no due date');
});

test('300 seeds: every line is valid, the totals agree with the schema, and the amounts are whole minor units', async () => {
  const ctx = await load();
  const S = ctx.SlopData, M = ctx.SlopDocs.model, SM = SAMPLES(ctx);
  for (let seed = 0; seed < 300; seed++) {
    const env = { kind: seed % 2 ? 'invoice' : 'order', currency: 'USD', base: 'USD', from: OPTS.from, to: OPTS.to, paymentTermsDays: 30,
      missing: { customers: true, products: true }, customers: [{ id: 'c1', name: 'Acme' }],
      products: [{ id: 'p1', sku: 'A-1', name: 'Widget', price: 1999, taxRate: 2000 }, { id: 'p2', sku: 'A-2', name: 'Cable', price: 350, taxRate: 0 }],
      skus: new Set(['A-1', 'A-2']) };
    const p = plain(SM.plan(`s${seed}`, env));
    assert.equal(p.error, undefined);
    assert.ok(p.lines.length >= 1 && p.lines.length <= SM.MAX_LINES, `line count ${p.lines.length}`);
    const lines = p.lines.map((l) => M.cleanLine({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, taxRate: l.taxRate, discount: l.discount, sku: l.sku }));
    for (const l of lines) {
      assert.equal(M.lineErrors(l).length, 0, JSON.stringify(l));
      assert.ok(l.qty >= 1 && l.qty <= SM.MAX_QTY);
    }
    const t = M.totals(lines);
    assert.ok(t, 'totals');
    assert.equal(t.total, t.subtotal + t.tax);
    assert.equal(t.tax, t.byRate.reduce((s, r) => s + r.tax, 0));
    assert.ok(Number.isSafeInteger(t.total) && t.total <= S.money.MAX_MINOR);
    const rec = S.schema.prepare(env.kind === 'invoice' ? 'invoices' : 'orders',
      { customerId: 'c1', date: p.date, ...(p.dueDate ? { dueDate: p.dueDate } : {}), notes: p.notes, currency: 'USD', lines, status: 'draft', sample: true },
      { deferNumber: true });
    assert.ok(rec.ok, JSON.stringify(rec.errors));
    assert.equal(rec.value.total, t.total, 'schema total equals model total');
    assert.equal(rec.value.sample, true);
  }
});

test('a batch in memory: validates, totals match, and the same seed and count give the same documents', async () => {
  const runOnce = async () => {
    const ctx = await load();
    const m = memoryIO(ctx);
    const res = await SAMPLES(ctx).run({ kind: 'invoice', count: 12, seed: 'fixed-batch', ...OPTS, missing: { customers: true, products: true }, io: m.io });
    assert.equal(res.ok, true, res.message);
    return { res: plain(res.value), rows: plain(m.rows) };
  };
  const a = await runOnce();
  const b = await runOnce();
  assert.equal(a.res.created.length, 12);
  assert.deepEqual(a.res.failed, []);
  assert.equal(a.res.newCustomers, 1, 'one customer is made, then the batch reuses it');
  assert.ok(a.res.newProducts >= 1);
  assert.deepEqual(a.res.created.map((c) => [c.total, c.lines, c.customer, c.currency]), b.res.created.map((c) => [c.total, c.lines, c.customer, c.currency]));
  assert.deepEqual(a.rows.invoices.map((r) => [r.date, r.lines, r.total, r.notes]), b.rows.invoices.map((r) => [r.date, r.lines, r.total, r.notes]));
  for (const inv of a.rows.invoices) {
    assert.equal(inv.status, 'draft');
    assert.equal(inv.number, undefined, 'drafts take no number');
    assert.equal(inv.sample, true);
  }
});

test('the options are checked before anything is saved', async () => {
  const ctx = await load();
  const m = memoryIO(ctx);
  const bad = [
    { count: 0 }, { count: 51 }, { count: 2.5 },
    { count: 1, from: '2026-07-01', to: '2026-06-01' },
    { count: 1, currency: 'usd' },
  ];
  for (const o of bad) {
    const r = await SAMPLES(ctx).run({ kind: 'invoice', seed: 's', ...OPTS, ...o, missing: { customers: true, products: true }, io: m.io });
    assert.equal(r.ok, false, JSON.stringify(o));
  }
  assert.equal(m.rows.invoices.length, 0);
});

test('a missing customer list with creation off refuses each document and saves nothing', async () => {
  const ctx = await load();
  const m = memoryIO(ctx);
  const r = await SAMPLES(ctx).run({ kind: 'order', count: 3, seed: 's', ...OPTS, missing: { customers: false, products: true }, io: m.io });
  assert.equal(r.ok, true);
  assert.equal(r.value.created.length, 0);
  assert.equal(r.value.failed.length, 3);
  assert.match(r.value.failed[0].message, /no customers/);
  assert.equal(m.rows.orders.length + m.rows.invoices.length + m.rows.customers.length, 0);
});
