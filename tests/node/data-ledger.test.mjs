// Unit tests for shared/data: numbering, ledger, stock, invoice journal lines and bundle checks (pure logic only).
// Run: node tests/run.mjs data
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './data-env.mjs';

const D = await load();
const { schema, numbering, ledger, stock, billing, bundleCheck, money } = D;
const A = schema.ACCT;
const INV = { id: 'i1', number: 'INV-0001', customerId: 'c1', date: '2026-10-11', status: 'issued', lines: [] };

/** A stored-shape record: prepared, given an id and timestamps, as the store would save it. */
function stored(name, input, id) {
  const r = schema.prepare(name, { ...input, id }, { deferNumber: name === 'orders' || name === 'invoices' });
  assert.equal(r.ok, true, `${name} fixture: ${JSON.stringify(r.errors)}`);
  return { ...r.value, id, createdAt: 1, updatedAt: 1, version: 1 };
}
const jentry = (id, lines, source = `src:${id}`) => stored('journal', { date: '2026-10-11', source, lines }, id);

test('format and parse invoice numbers', () => {
  assert.equal(numbering.format({ prefix: 'INV-', pad: 4 }, 7), 'INV-0007');
  assert.equal(numbering.format({ prefix: 'ORD-', pad: 4 }, 12345), 'ORD-12345');
  assert.deepEqual(plain(numbering.parse('INV-0007')), { prefix: 'INV-', n: 7 });
  assert.equal(numbering.parse('nothing'), null);
});

test('take returns the next number and advances the sequence', () => {
  const t = numbering.take({ id: 'invoice', prefix: 'INV-', pad: 4, next: 3 });
  assert.equal(t.n, 3);
  assert.equal(t.seq.next, 4);
  assert.equal(t.seq.id, 'invoice');
});

test('entry validation: balance, positive whole amounts and known accounts', () => {
  const good = { date: '2026-10-11', source: 's:1', lines: [{ account: A.CASH, debit: 500 }, { account: A.REVENUE, credit: 500 }] };
  assert.equal(ledger.validateEntry(good, schema.DEFAULT_CHART).length, 0);
  const unknown = { ...good, lines: [{ account: '9999', debit: 500 }, { account: A.REVENUE, credit: 500 }] };
  assert.ok(ledger.validateEntry(unknown, schema.DEFAULT_CHART).some((e) => /unknown account 9999/.test(e.message)));
  const zero = { ...good, lines: [{ account: A.CASH, debit: 0 }, { account: A.REVENUE, credit: 0 }] };
  assert.ok(ledger.validateEntry(zero, null).length > 0);
  const unbalanced = { ...good, lines: [{ account: A.CASH, debit: 500 }, { account: A.REVENUE, credit: 499 }] };
  assert.ok(ledger.validateEntry(unbalanced, null).some((e) => /do not balance/.test(e.message)));
  const decimal = { ...good, lines: [{ account: A.CASH, debit: 5.5 }, { account: A.REVENUE, credit: 5.5 }] };
  assert.ok(ledger.validateEntry(decimal, null).length > 0);
  assert.ok(ledger.validateEntry({ ...good, lines: [{ account: A.CASH, debit: -5 }, { account: A.REVENUE, credit: -5 }] }, null).length > 0);
});

test('reverseLines swaps the sides', () => {
  assert.deepEqual(plain(ledger.reverseLines([{ account: '1000', debit: 5, credit: 0 }, { account: '4000', debit: 0, credit: 5 }])),
    [{ account: '1000', debit: 0, credit: 5 }, { account: '4000', debit: 5, credit: 0 }]);
});

test('summarize: balances follow each account type and the totals agree', () => {
  const entries = [
    jentry('e1', [{ account: A.AR, debit: 2520 }, { account: A.REVENUE, credit: 2100 }, { account: A.TAX_PAYABLE, credit: 420 }]),
    jentry('e2', [{ account: A.BANK, debit: 1000 }, { account: A.AR, credit: 1000 }]),
  ];
  const s = ledger.summarize(entries, schema.DEFAULT_CHART);
  assert.equal(s.balanced, true);
  assert.equal(s.debit, 3520);
  assert.equal(s.credit, 3520);
  const row = (c) => s.rows.find((r) => r.code === c);
  assert.equal(row(A.AR).balance, 1520);
  assert.equal(row(A.REVENUE).balance, 2100);
  assert.equal(row(A.TAX_PAYABLE).balance, 420);
  assert.equal(row(A.BANK).balance, 1000);
});

test('summarize reports an unbalanced entry and a bad account', () => {
  const bad = { id: 'x', lines: [{ account: A.CASH, debit: 100, credit: 0 }, { account: '9999', debit: 0, credit: 90 }] };
  const s = ledger.summarize([bad], schema.DEFAULT_CHART);
  assert.equal(s.balanced, false);
  assert.ok(s.errors.some((e) => /unknown account 9999/.test(e)));
  assert.ok(s.errors.some((e) => /does not balance/.test(e)));
});

test('invoice journal: AR for the total, revenue and tax credited, zero total posts nothing', () => {
  const inv = { subtotal: 2100, tax: 420, total: 2520 };
  const lines = billing.invoiceLines(inv);
  assert.deepEqual(plain(lines), [
    { account: A.AR, debit: 2520, credit: 0 },
    { account: A.REVENUE, debit: 0, credit: 2100 },
    { account: A.TAX_PAYABLE, debit: 0, credit: 420 },
  ]);
  assert.equal(ledger.validateEntry({ date: '2026-10-11', source: 'invoice:i1:issue', lines }, schema.DEFAULT_CHART).length, 0);
  assert.equal(billing.invoiceLines({ subtotal: 0, tax: 0, total: 0 }).length, 0);
  assert.equal(billing.invoiceLines({ subtotal: 500, tax: 0, total: 500 }).length, 2);
});

test('payments: paid total and balance due', () => {
  const pays = [{ amount: 1000 }, { amount: 520 }];
  assert.equal(billing.paidOn(pays), 1520);
  assert.equal(billing.balanceDue({ total: 2520 }, pays), 1000);
});

test('on-hand is the sum of movements, per product and per location', () => {
  const mv = [
    { productId: 'p1', location: 'main', qty: 10 }, { productId: 'p1', location: 'back', qty: 4 },
    { productId: 'p1', location: 'main', qty: -3 }, { productId: 'p2', location: 'main', qty: 2 },
  ];
  assert.equal(stock.onHandOf(mv, 'p1'), 11);
  assert.equal(stock.onHandOf(mv, 'p1', 'main'), 7);
  assert.equal(stock.onHandOf(mv, 'p3'), 0);
  assert.deepEqual(plain(stock.levelsOf(mv, 'p1')), { main: 7, back: 4 });
});

test('low stock: below threshold, products with no movements count as zero, lowest first', () => {
  const products = [{ id: 'p1', sku: 'A', name: 'A' }, { id: 'p2', sku: 'B', name: 'B' }, { id: 'p3', sku: 'C', name: 'C' }];
  const mv = [{ productId: 'p1', location: 'main', qty: 3 }, { productId: 'p2', location: 'main', qty: 9 }];
  const rows = plain(stock.lowStockRows(products, mv, 5));
  assert.deepEqual(rows.map((r) => [r.sku, r.onHand]), [['C', 0], ['A', 3]]);
});

test('count rows: expected from the book, diff = counted minus expected', () => {
  const mv = [{ productId: 'p1', location: 'main', qty: 10 }, { productId: 'p1', location: 'back', qty: 5 }];
  const rows = plain(stock.countRows([{ productId: 'p1', counted: 8 }], mv, 'main'));
  assert.deepEqual(rows, [{ productId: 'p1', expected: 10, counted: 8, diff: -2 }]);
});

test('movement sign rules are enforced by the schema', () => {
  assert.match(schema.movementError('receipt', -1), /must add stock/);
  assert.equal(schema.movementError('adjustment', -4), null);
});

/** A small, complete and valid export bundle, built with the same prepare() the store uses. */
function bundle() {
  const cols = {};
  for (const n of schema.COLLECTIONS) cols[n] = [];
  cols.accounts = schema.DEFAULT_CHART.map((a) => ({ ...a, createdAt: 1, updatedAt: 1, version: 1 }));
  cols.settings = [stored('settings', schema.DEFAULT_SETTINGS, 'main')];
  cols.numbering = [{ ...schema.DEFAULT_SEQUENCES[0], next: 2 }, { ...schema.DEFAULT_SEQUENCES[1], next: 1 }];
  cols.customers = [stored('customers', { name: 'Ada' }, 'c1')];
  cols.products = [stored('products', { sku: 'B-1', name: 'Bolt', price: 1050, taxRate: 2000, ean: '4006381333931' }, 'p1')];
  const inv = stored('invoices', { customerId: 'c1', date: '2026-10-11', status: 'issued', number: 'INV-0001', lines: [{ description: 'Bolt', qty: 2, unitPrice: 1050, taxRate: 2000 }] }, 'i1');
  cols.invoices = [inv];
  cols.payments = [];
  cols.journal = [jentry('j1', billing.invoiceLines(inv), 'invoice:i1:issue')];
  cols.stockMovements = [stored('stockMovements', { productId: 'p1', qty: 10, reason: 'receipt', date: '2026-10-01' }, 'm1')];
  return { format: 'slop-data', version: 1, exportedAt: '2026-10-11T00:00:00.000Z', collections: cols };
}

test('a valid bundle passes', () => {
  const r = bundleCheck.validateBundle(bundle());
  assert.equal(r.errors.length, 0);
  assert.equal(r.ok, true);
});

test('bundle: wrong format and missing collections are refused', () => {
  assert.equal(bundleCheck.validateBundle({ format: 'other' }).ok, false);
  assert.equal(bundleCheck.validateBundle({ format: 'slop-data', version: 2, collections: {} }).ok, false);
  const b = bundle();
  delete b.collections.payments;
  assert.ok(bundleCheck.validateBundle(b).errors.some((e) => /payments: missing/.test(e)));
});

test('bundle: an unbalanced journal, a duplicate SKU and a dangling reference are caught', () => {
  const unbal = bundle();
  unbal.collections.journal[0].lines[0].debit += 1;
  assert.ok(bundleCheck.validateBundle(unbal).errors.some((e) => /ledger: /.test(e) || /do not balance/.test(e)));

  const dup = bundle();
  const p2 = stored('products', { sku: 'B-1', name: 'Nut', price: 10, taxRate: 0 }, 'p2');
  dup.collections.products.push(p2);
  assert.ok(bundleCheck.validateBundle(dup).errors.some((e) => /sku B-1 is used twice/.test(e)));

  const dangling = bundle();
  dangling.collections.payments.push(stored('payments', { invoiceId: 'nope', amount: 5, date: '2026-10-11' }, 'pay1'));
  assert.ok(bundleCheck.validateBundle(dangling).errors.some((e) => /invoiceId nope does not exist/.test(e)));
});

test('bundle: invoice numbers must run 1..n and the counter must be past the last one', () => {
  const gap = bundle();
  const inv2 = stored('invoices', { customerId: 'c1', date: '2026-10-11', status: 'void', number: 'INV-0003', lines: [{ description: 'x', qty: 1, unitPrice: 100, taxRate: 0 }] }, 'i2');
  gap.collections.invoices.push(inv2);
  const r = bundleCheck.validateBundle(gap);
  assert.ok(r.errors.some((e) => /gap or a wrong prefix at INV-0003/.test(e)));

  const behind = bundle();
  behind.collections.numbering[0].next = 1;
  assert.ok(bundleCheck.validateBundle(behind).errors.some((e) => /counter is behind/.test(e)));
});

test('bundle: a record that breaks the schema is reported with its position', () => {
  const b = bundle();
  b.collections.customers[0].stage = 'won';
  const r = bundleCheck.validateBundle(b);
  assert.ok(r.errors.some((e) => e.startsWith('customers[0] stage')));
  assert.equal(money.formatMinor(0), '$0.00');
});
