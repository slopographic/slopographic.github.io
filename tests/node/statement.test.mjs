// Customer statements (shared/data/statement.js): events in order with a running balance, the opening balance before a
// period, ageing by days past due, the currencies of a customer, the CSV, and the payment reminder in the document's language
// (SlopBiz.docLang.words: the English or Swedish biz.pr.rm_* texts and dates, whatever the page's language).
// Covers: shared/biz/i18n/en/print2.js, shared/biz/i18n/sv/print2.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;   // the string tables add themselves to window.SlopI18n
require('../../shared/i18n/i18n.js');
globalThis.SlopI18n = globalThis.SlopI18n.create({ defaultLang: 'en', profile: null });   // the page in English in any build
require('../../shared/biz/biz.js');
for (const f of ['en/print2.js', 'sv/print2.js']) require(`../../shared/biz/i18n/${f}`);
require('../../shared/data/money.js');
require('../../shared/data/statement.js');
const words = (code) => globalThis.SlopBiz.docLang.words(code, 'en-US');
const ST = globalThis.SlopData.statement;
const plain = (m) => globalThis.SlopData.money.plainMinor(m, 'USD');

const INV = [
  { id: 'a', customerId: 'c', number: 'INV-1', date: '2026-06-01', dueDate: '2026-07-01', total: 10000, currency: 'USD', status: 'paid' },
  { id: 'b', customerId: 'c', number: 'INV-2', date: '2026-08-01', dueDate: '2026-08-31', total: 5000, currency: 'USD', status: 'issued' },
  { id: 'd', customerId: 'c', number: 'INV-3', date: '2026-10-01', dueDate: '2026-10-31', total: 2000, currency: 'USD', status: 'issued' },
  { id: 'e', customerId: 'c', number: 'INV-4', date: '2026-04-01', dueDate: '2026-05-01', total: 900, currency: 'USD', status: 'issued' },
  { id: 'v', customerId: 'c', number: 'INV-5', date: '2026-09-01', total: 7777, currency: 'USD', status: 'void' },
  { id: 'x', customerId: 'c', date: '2026-09-02', total: 1, currency: 'USD', status: 'draft' },
  { id: 'eur', customerId: 'c', number: 'INV-6', date: '2026-09-03', total: 3000, currency: 'EUR', status: 'issued' },
  { id: 'other', customerId: 'z', number: 'INV-7', date: '2026-09-03', total: 3000, currency: 'USD', status: 'issued' },
];
const PAY = [
  { invoiceId: 'a', date: '2026-06-20', amount: 10000 },
  { invoiceId: 'b', date: '2026-09-15', amount: 2000 },
  { invoiceId: 'other', date: '2026-09-15', amount: 5 },
];

test('lines: issued and paid invoices and their payments, oldest first, with a running balance; drafts, voids and others left out', () => {
  const st = ST.build(INV, PAY, 'c', { currency: 'USD', today: '2026-10-24' });
  assert.deepEqual(st.lines.map((l) => [l.date, l.kind, l.ref, l.debit, l.credit, l.balance]), [
    ['2026-04-01', 'invoice', 'INV-4', 900, 0, 900],
    ['2026-06-01', 'invoice', 'INV-1', 10000, 0, 10900],
    ['2026-06-20', 'payment', 'INV-1', 0, 10000, 900],
    ['2026-08-01', 'invoice', 'INV-2', 5000, 0, 5900],
    ['2026-09-15', 'payment', 'INV-2', 0, 2000, 3900],
    ['2026-10-01', 'invoice', 'INV-3', 2000, 0, 5900],
  ]);
  assert.equal(st.closing, 5900);
  assert.equal(st.opening, 0);
});

test('a period: the opening balance carries what was owed before it', () => {
  const st = ST.build(INV, PAY, 'c', { currency: 'USD', from: '2026-08-01', today: '2026-10-24' });
  assert.equal(st.opening, 900);
  assert.deepEqual(st.lines.map((l) => l.ref), ['INV-2', 'INV-2', 'INV-3']);
  assert.equal(st.closing, 5900);
});

test('ageing: what is still owed by days past the due date', () => {
  const st = ST.build(INV, PAY, 'c', { currency: 'USD', today: '2026-10-24' });
  assert.deepEqual(st.ageing, { current: 2000, d30: 0, d60: 3000, d90: 0, over90: 900 });
  assert.deepEqual(st.owed.map((o) => [o.ref, o.left, o.late]), [['INV-4', 900, 176], ['INV-2', 3000, 54], ['INV-3', 2000, 0]]);
});

test('currencies: the ones a customer was invoiced in, most used first', () => {
  assert.deepEqual(ST.currencies(INV, 'c'), ['USD', 'EUR']);
  assert.deepEqual(ST.currencies(INV, 'nobody'), []);
});

test('CSV: a header, the opening balance for a period, one line per event with plain amounts', () => {
  const lines = ST.csv(ST.build(INV, PAY, 'c', { currency: 'USD', from: '2026-08-01', today: '2026-10-24' }), plain).trim().split('\r\n');
  assert.equal(lines[0], 'Date,What,Invoice,Due,Charged,Paid,Balance');
  assert.equal(lines[1], ',Opening balance,,,,,9.00');
  assert.equal(lines[3], '2026-09-15,Payment,INV-2,,,20.00,39.00');
});

test('reminder: the tone follows the most overdue invoice; the text lists each open invoice and the balance', () => {
  const money = (m) => `$${(m / 100).toFixed(2)}`;
  const who = { customer: 'Ada Ltd', company: 'Slop Studio' };
  const st = ST.build(INV, PAY, 'c', { currency: 'USD', today: '2026-10-24' });
  const r = ST.reminder(st, who, money, words('en'));
  assert.equal(r.tone, 'final');
  assert.equal(r.subject, 'Final reminder: $59.00 overdue');
  assert.ok(r.body.startsWith('Hello Ada Ltd,'));
  assert.ok(r.body.includes('- INV-4, due 05/01/2026: $9.00 (176 days late)'));
  assert.ok(r.body.includes('- INV-3, due 10/31/2026: $20.00\n'));
  assert.ok(r.body.endsWith('Balance owed: $59.00\n\nThank you,\nSlop Studio'));
  const sv = ST.reminder(st, who, money, words('sv'));
  assert.equal(globalThis.SlopI18n.get(), 'en', 'the page stays English');
  assert.equal(sv.subject, 'Sista påminnelse: $59.00 förfallet');
  assert.ok(sv.body.startsWith('Hej Ada Ltd,'));
  assert.ok(sv.body.includes('- INV-4, förfallodatum 2026-05-01: $9.00 (176 dagar sent)'));
  assert.ok(sv.body.endsWith('Att betala: $59.00\n\nMed vänliga hälsningar\nSlop Studio'));
  const recent = ST.build(INV.filter((i) => i.id !== 'e'), PAY, 'c', { currency: 'USD', today: '2026-09-10' });
  assert.equal(ST.reminder(recent, who, money).tone, 'friendly');
  const firm = ST.build(INV.filter((i) => i.id !== 'e'), PAY, 'c', { currency: 'USD', today: '2026-10-24' });
  assert.equal(ST.reminder(firm, who, money).tone, 'firm');
  assert.ok(ST.reminder(st, { customer: 'Ada Ltd', company: '' }, money, words('en')).body.endsWith('Balance owed: $59.00\n\nThank you.'));
  const none = ST.build(INV, PAY, 'nobody', { currency: 'USD', today: '2026-10-24' });
  assert.deepEqual(ST.reminder(none, who, money), { tone: 'none', subject: '', body: '' });
});
