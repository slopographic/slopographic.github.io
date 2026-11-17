// Slop Timesheets, the pure parts (timesheets/js/core/time.js): typed durations, periods, the filter, totals and the CSV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../../timesheets/js/core/time.js');
require('../../shared/data/money.js');
const plain = (m, c) => globalThis.SlopData.money.plainMinor(m, c || 'USD');
const amountOf = (e) => Math.round((e.minutes * (e.rate || 0)) / 60);

test('durations: h:mm, decimal hours, minutes and hours with minutes; out of range or nonsense is null', () => {
  const cases = { '1:30': 90, '0:05': 5, '1.5': 90, '1,25': 75, '2': 120, '2h': 120, '2 hours': 120, '90m': 90, '45 min': 45,
    '2h 15m': 135, '2h15': 135, '24:00': 1440 };
  for (const [t, m] of Object.entries(cases)) assert.equal(T.parseDuration(t), m, t);
  for (const t of ['', '0', '0:00', '25', '24:01', 'abc', '1:75', '-1', '1500m']) assert.equal(T.parseDuration(t), null, t);
  assert.equal(T.hm(135), '2:15');
  assert.equal(T.hm(5), '0:05');
});

test('periods: this week runs Monday to Sunday; months and last month; all is open', () => {
  assert.deepEqual(T.periodRange('week', '2026-10-23'), ['2026-10-19', '2026-10-25']);   // a Friday
  assert.deepEqual(T.periodRange('week', '2026-10-25'), ['2026-10-19', '2026-10-25']);   // a Sunday
  assert.deepEqual(T.periodRange('lastweek', '2026-10-19'), ['2026-10-12', '2026-10-18']);
  assert.deepEqual(T.periodRange('month', '2026-02-10'), ['2026-02-01', '2026-02-28']);
  assert.deepEqual(T.periodRange('lastmonth', '2026-01-15'), ['2025-12-01', '2025-12-31']);
  assert.equal(T.periodRange('all', '2026-10-23'), null);
});

const R = [
  { id: 'a', date: '2026-10-20', customerId: 'c1', customerName: 'Ada', project: 'Web', description: 'Design', minutes: 90, rate: 8000, currency: 'USD', billable: true, state: 'open', createdAt: 1 },
  { id: 'b', date: '2026-10-22', customerId: 'c2', customerName: 'Bob', project: '', description: 'Call, "kickoff"', minutes: 30, rate: 6000, currency: 'EUR', billable: true, state: 'billed', createdAt: 2 },
  { id: 'c', date: '2026-10-22', customerId: '', customerName: '', project: 'Admin', description: 'Bookkeeping', minutes: 45, rate: 0, currency: 'USD', billable: false, state: 'internal', createdAt: 3 },
  { id: 'd', date: '2026-09-30', customerId: 'c1', customerName: 'Ada', project: 'Web', description: 'Hosting setup', minutes: 60, rate: 8000, currency: 'USD', billable: true, state: 'open', createdAt: 4 },
];

test('filter: period, customer, state and search; newest first', () => {
  const ids = (o) => T.filter(R, o, '2026-10-23').map((r) => r.id);
  assert.deepEqual(ids({}), ['c', 'b', 'a', 'd']);
  assert.deepEqual(ids({ period: 'week' }), ['c', 'b', 'a']);
  assert.deepEqual(ids({ customerId: 'c1' }), ['a', 'd']);
  assert.deepEqual(ids({ state: 'open' }), ['a', 'd']);
  assert.deepEqual(ids({ search: 'web' }), ['a', 'd']);
  assert.deepEqual(ids({ search: 'bob' }), ['b']);
});

test('summary: all minutes, billable minutes, and the billable amount per currency', () => {
  assert.deepEqual(T.summary(R, amountOf), { count: 4, minutes: 225, billableMinutes: 180, amounts: { USD: 20000, EUR: 3000 } });
});

test('CSV: oldest first, decimal hours and h:mm, plain money, quoted text', () => {
  const lines = T.csv(R, amountOf, plain).trim().split('\r\n');
  assert.equal(lines[0], 'Date,Customer,Project,Description,Hours,Time,Rate,Amount,Currency,Billable,State');
  assert.equal(lines[1], '2026-09-30,Ada,Web,Hosting setup,1.00,1:00,80.00,80.00,USD,yes,open');
  assert.equal(lines.find((l) => l.includes('kickoff')), '2026-10-22,Bob,,"Call, ""kickoff""",0.50,0:30,60.00,30.00,EUR,yes,billed');
  assert.ok(lines.some((l) => l.endsWith(',0.00,0.00,USD,no,internal')));
});
