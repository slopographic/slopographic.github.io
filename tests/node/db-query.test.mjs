// SlopDb's pure query logic (shared/db/query.js): where clauses, sorting, paging, joins, aggregates and index planning.
// Run: node tests/run.mjs db-query
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const Q = createRequire(import.meta.url)('../../shared/db/query.js');

const CUSTOMERS = [
  { id: 'c1', name: 'Ada Lovelace', email: 'ADA@example.com', stage: 'lead', followUp: '2026-10-14', groupIds: ['g1', 'g2'] },
  { id: 'c2', name: 'Grace Hopper', email: 'grace@example.com', stage: 'customer', followUp: '2026-10-30', groupIds: ['g2'] },
  { id: 'c3', name: 'alan turing', email: '', stage: 'lead', groupIds: [] },
  { id: 'c4', name: 'Linus', stage: 'lost', groupIds: ['g1'], tags: 'Hot' },
];

test('= and != compare values exactly', () => {
  assert.deepEqual(Q.run(CUSTOMERS, { where: [['stage', '=', 'lead']] }).map((r) => r.id), ['c1', 'c3']);
  assert.deepEqual(Q.run(CUSTOMERS, { where: [['stage', '!=', 'lead']] }).map((r) => r.id), ['c2', 'c4']);
});

test('< <= > >= on numbers and on ISO dates, and missing values never match', () => {
  const ids = (where) => Q.run(CUSTOMERS, { where }).map((r) => r.id);
  assert.deepEqual(ids([['followUp', '>=', '2026-10-14']]), ['c1', 'c2']);
  assert.deepEqual(ids([['followUp', '<', '2026-10-30']]), ['c1']);
  assert.deepEqual(ids([['followUp', '<=', '2026-10-30']]), ['c1', 'c2']);
  assert.deepEqual(ids([['followUp', '>', '2026-10-30']]), []);
  assert.deepEqual(ids([['followUp', '>', 5]]), []); // text against a number never matches
});

test('in takes a list; contains and starts ignore case', () => {
  const ids = (where) => Q.run(CUSTOMERS, { where }).map((r) => r.id);
  assert.deepEqual(ids([['stage', 'in', ['lost', 'customer']]]), ['c2', 'c4']);
  assert.deepEqual(ids([['name', 'contains', 'LOVE']]), ['c1']);
  assert.deepEqual(ids([['name', 'starts', 'ALAN']]), ['c3']);
  assert.deepEqual(ids([['tags', 'contains', 'hot']]), ['c4']);
});

test('an array value matches when one item does; != means no item equals', () => {
  const ids = (where) => Q.run(CUSTOMERS, { where }).map((r) => r.id);
  assert.deepEqual(ids([['groupIds', '=', 'g2']]), ['c1', 'c2']);
  assert.deepEqual(ids([['groupIds', '!=', 'g1']]), ['c2', 'c3']);
  assert.deepEqual(ids([['groupIds', 'in', ['g1']]]), ['c1', 'c4']);
});

test('every clause must match, and a bad clause throws a TypeError', () => {
  assert.deepEqual(Q.run(CUSTOMERS, { where: [['stage', '=', 'lead'], ['followUp', '>=', '2026-10-01']] }).map((r) => r.id), ['c1']);
  assert.throws(() => Q.run(CUSTOMERS, { where: [['stage', 'like', 'x']] }), TypeError);
  assert.throws(() => Q.checkWhere([['stage', '=']]), TypeError);
  assert.throws(() => Q.checkWhere('stage'), TypeError);
});

test('dotted fields read nested values', () => {
  const rows = [{ id: 1, meta: { size: 5 } }, { id: 2, meta: { size: 9 } }, { id: 3 }];
  assert.deepEqual(Q.run(rows, { where: [['meta.size', '>', 6]] }).map((r) => r.id), [2]);
});

test('sort is stable, empty values go last in both directions, and no field keeps the order', () => {
  const rows = [{ n: 'b', v: 2 }, { n: 'a', v: 10 }, { n: 'c' }, { n: 'd', v: 2 }];
  assert.deepEqual(Q.sortRows(rows, 'v').map((r) => r.n), ['b', 'd', 'a', 'c']);
  assert.deepEqual(Q.sortRows(rows, 'v', true).map((r) => r.n), ['a', 'b', 'd', 'c']);
  assert.deepEqual(Q.sortRows(rows).map((r) => r.n), ['b', 'a', 'c', 'd']);
  assert.deepEqual(Q.sortRows(['x10', 'x9', 'x1'].map((s) => ({ s })), 's').map((r) => r.s), ['x1', 'x9', 'x10']);
});

test('offset and limit page the sorted rows', () => {
  const rows = [1, 2, 3, 4, 5].map((v) => ({ v }));
  assert.deepEqual(Q.run(rows, { orderBy: 'v', desc: true, offset: 1, limit: 2 }).map((r) => r.v), [4, 3]);
  assert.deepEqual(Q.page(rows, 4).map((r) => r.v), [5]);
  assert.deepEqual(Q.page(rows, 0, 0), []);
});

test('run does not change the rows it is given', () => {
  const copy = JSON.parse(JSON.stringify(CUSTOMERS));
  Q.run(CUSTOMERS, { where: [['stage', '=', 'lead']], orderBy: 'name', desc: true, limit: 1 });
  assert.deepEqual(CUSTOMERS, copy);
});

test('left join keeps unmatched left rows, inner join drops them, and matching ignores case', () => {
  const invoices = [{ id: 'i1', customerId: 'c1', total: 100 }, { id: 'i2', customerId: 'zz', total: 5 }, { id: 'i3', total: 7 }];
  const left = Q.join(invoices, CUSTOMERS, { on: ['customerId', 'id'], type: 'left', prefix: 'customer_' });
  assert.equal(left.length, 3);
  assert.equal(left[0].customer_name, 'Ada Lovelace');
  assert.equal(left[1].customer_name, undefined);
  assert.equal(left[1].total, 5);
  assert.equal(Q.join(invoices, CUSTOMERS, { on: ['customerId', 'id'], type: 'inner' }).length, 1);
  const byEmail = Q.join([{ email: 'ada@EXAMPLE.com' }], CUSTOMERS, { on: ['email', 'email'], type: 'inner', ci: true, prefix: 'c_' });
  assert.equal(byEmail.length, 1);
  assert.equal(byEmail[0].c_name, 'Ada Lovelace');
  assert.equal(Q.join([{ email: '' }], CUSTOMERS, { on: ['email', 'email'], type: 'left', ci: true }).length, 1);
});

test('join gives one row per match, and without a prefix the left row keeps its own fields', () => {
  const groups = [{ id: 'g1', name: 'Friends' }, { id: 'g2', name: 'Clients' }];
  const flat = Q.join(CUSTOMERS.map((c) => ({ ...c, groupIds: undefined, gid: c.groupIds && c.groupIds[0] })), groups, { on: ['gid', 'id'], type: 'left' });
  assert.equal(flat.length, 4);
  const one2many = Q.join([{ id: 'x', g: 'g1', name: 'mine' }], groups, { on: ['g', 'id'], type: 'inner' });
  assert.equal(one2many[0].name, 'mine');
  assert.equal(one2many[0].id, 'x');
});

test('aggregate totals each group with count, sum and avg', () => {
  const rows = [
    { stage: 'lead', total: 100, cur: 'USD' },
    { stage: 'lead', total: 50, cur: 'USD' },
    { stage: 'customer', total: 7, cur: 'EUR' },
    { stage: 'lead', total: 'n/a', cur: 'USD' },
  ];
  const out = Q.aggregate(rows, { by: 'stage', count: true, sum: ['total'], avg: ['total'] });
  assert.deepEqual(out, [
    { stage: 'lead', count: 3, sum_total: 150, avg_total: 75 },
    { stage: 'customer', count: 1, sum_total: 7, avg_total: 7 },
  ]);
});

test('aggregate by several fields, and a single total when there is no by', () => {
  const rows = [{ a: 1, b: 'x', n: 2 }, { a: 1, b: 'y', n: 3 }, { a: 1, b: 'x', n: 4 }];
  assert.deepEqual(Q.aggregate(rows, { by: ['a', 'b'], count: true, sum: ['n'] }), [
    { a: 1, b: 'x', count: 2, sum_n: 6 },
    { a: 1, b: 'y', count: 1, sum_n: 3 },
  ]);
  assert.deepEqual(Q.aggregate(rows, { count: true, sum: ['n'] }), [{ count: 3, sum_n: 9 }]);
});

test('aggregate of no rows gives one total row of zeros, and avg of nothing is null', () => {
  assert.deepEqual(Q.aggregate([], { count: true, sum: ['n'], avg: ['n'] }), [{ count: 0, sum_n: 0, avg_n: null }]);
  assert.deepEqual(Q.aggregate([], { by: 'stage', count: true }), []);
});

test('an aggregate by a field some rows lack keeps those rows in one group', () => {
  const out = Q.aggregate([{ g: 'a' }, {}, { g: null }, {}], { by: 'g', count: true });
  assert.equal(out.length, 2); // 'a', and one group for the missing and the null values
  assert.equal(out.reduce((s, r) => s + r.count, 0), 4);
});

test('rangeSpec turns = < <= > >= on keys into an index range, and nothing else', () => {
  assert.deepEqual(Q.rangeSpec('=', 'lead'), { only: 'lead' });
  assert.deepEqual(Q.rangeSpec('<', 5), { upper: 5, open: true });
  assert.deepEqual(Q.rangeSpec('>=', '2026-01-01'), { lower: '2026-01-01', open: false });
  assert.equal(Q.rangeSpec('contains', 'x'), null);
  assert.equal(Q.rangeSpec('=', null), null);
  assert.equal(Q.rangeSpec('=', { a: 1 }), null);
});

test('planIndex uses an index on the first clause only', () => {
  const indexes = [{ name: 'stage', keyPath: 'stage' }, { name: 'followUp', keyPath: 'followUp' }];
  assert.deepEqual(Q.planIndex([['stage', '=', 'lead']], indexes), { index: 'stage', range: { only: 'lead' } });
  assert.equal(Q.planIndex([['name', '=', 'x'], ['stage', '=', 'lead']], indexes), null);
  assert.equal(Q.planIndex([['stage', 'in', ['lead']]], indexes), null);
  assert.equal(Q.planIndex([], indexes), null);
  assert.equal(Q.planIndex([['stage', '=', 'lead']], []), null);
});
