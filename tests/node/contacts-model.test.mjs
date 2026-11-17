// Slop Contacts: the import plan (duplicates matched on phone or e-mail; skip, merge and add), the sidebar filters
// (AND of the facets, date ranges in local days, the URL form and the chips) and the table (sorting with empties last,
// cell edits and their errors).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContacts } from '../contacts/contacts.node-env.mjs';

const SC = loadContacts();
const C = (over) => SC.model.normalise({ id: 'x', ...over });
let n = 0;
const newId = () => 'new-' + (++n);

test('plan: a contact matches an existing one on a phone (E.164 with the default country) or an e-mail (any case)', () => {
  const existing = [C({ id: 'e1', fn: 'Ann', phones: [{ value: '07700 900123', types: [] }] }), C({ id: 'e2', fn: 'Bo', emails: [{ value: 'Bo@Example.com', types: [] }] })];
  const incoming = [
    C({ fn: 'Ann again', phones: [{ value: '+44 7700 900123', types: [] }] }),
    C({ fn: 'Bo again', emails: [{ value: 'bo@example.com', types: [] }] }),
    C({ fn: 'Nobody', emails: [{ value: 'none@example.com', types: [] }] }),
  ];
  const rows = SC.importPlan.plan(existing, incoming, '44');
  assert.equal(rows[0].match.id, 'e1');
  assert.deepEqual(rows[0].why, ['phone +447700900123']);
  assert.equal(rows[1].match.id, 'e2');
  assert.deepEqual(rows[1].why, ['e-mail bo@example.com']);
  assert.equal(rows[2].match, null);
});

test('a merge (dedupe.mergeGroup) keeps the stage, the follow-up date and the shared tags', () => {
  const a = C({ id: 'm1', fn: 'Mo', stage: 'customer', followUp: '2026-04-01', tagIds: ['t1'], emails: [{ value: 'm@x.io', types: [] }] });
  const b = C({ id: 'm2', fn: 'Mo Lee', stage: 'lead', tagIds: ['t2', 't1'], phones: [{ value: '+1 555 0100', types: [] }] });
  const m = SC.dedupe.mergeGroup([a, b], '1');
  assert.equal(m.stage, 'customer');
  assert.equal(m.followUp, '2026-04-01');
  assert.deepEqual(m.tagIds.sort(), ['t1', 't2']);
  assert.equal(m.phones.length, 1);
});

test('apply: skip keeps the existing contact; add makes a new one with a new id; merge keeps the id, stage, follow-up and tags', () => {
  const existing = [C({ id: 'e1', fn: 'Ann', stage: 'customer', followUp: '2026-02-01', tagIds: ['t-vip'], groups: ['A'],
    emails: [{ value: 'ann@example.com', types: [] }] })];
  const incoming = [C({ fn: 'Ann', emails: [{ value: 'ann@example.com', types: [] }], phones: [{ value: '+1 555 0100', types: ['CELL'] }], groups: ['B'] }),
    C({ fn: 'Fresh', emails: [{ value: 'fresh@example.com', types: [] }] })];
  const rows = SC.importPlan.plan(existing, incoming, '1');
  const skipped = SC.importPlan.apply(existing, rows, 'skip', newId, '1');
  assert.deepEqual([skipped.added, skipped.merged, skipped.skipped], [1, 0, 1]);
  assert.equal(skipped.list.length, 2);
  assert.equal(skipped.list[0].phones.length, 0);

  const merged = SC.importPlan.apply(existing, rows, 'merge', newId, '1');
  assert.deepEqual([merged.added, merged.merged, merged.skipped], [1, 1, 0]);
  const m = merged.list[0];
  assert.equal(m.id, 'e1');
  assert.equal(m.stage, 'customer');
  assert.equal(m.followUp, '2026-02-01');
  assert.deepEqual(m.tagIds, ['t-vip']);
  assert.deepEqual(m.groups.sort(), ['A', 'B']);
  assert.equal(m.phones[0].value, '+1 555 0100');

  const added = SC.importPlan.apply(existing, rows, 'add', newId, '1');
  assert.equal(added.list.length, 3);
  assert.equal(added.list[0].fn, 'Ann');
  assert.notEqual(added.list[1].id, 'e1');
  assert.deepEqual(new Set(added.list.map((c) => c.id)).size, 3);
  assert.equal(existing.length, 1, 'the input list is not changed');
});

test('filters: facets combine with AND; organisation ignores case; email and phone are yes or no', () => {
  const list = [
    C({ id: 'a', fn: 'A', org: 'Acme', groups: ['Team', 'Club'], emails: [{ value: 'a@x.io', types: [] }], phones: [], tagIds: ['t1'] }),
    C({ id: 'b', fn: 'B', org: 'acme', groups: ['Team'], emails: [], phones: [{ value: '+1 555 0100', types: [] }], tagIds: [] }),
    C({ id: 'c', fn: 'C', org: 'Other', groups: ['Club'], emails: [{ value: 'c@x.io', types: [] }], phones: [{ value: '+1 555 0111', types: [] }], tagIds: ['t1'] }),
  ];
  const ids = (f) => SC.filters.apply(list, f, {}).map((c) => c.id);
  assert.deepEqual(ids({ org: 'ACME' }), ['a', 'b']);
  assert.deepEqual(ids({ group: ['Team', 'Club'] }), ['a']);
  assert.deepEqual(ids({ email: 'yes', org: 'Acme' }), ['a']);
  assert.deepEqual(ids({ email: 'no' }), ['b']);
  assert.deepEqual(ids({ phone: 'yes', tag: ['t1'] }), ['c']);
  assert.deepEqual(ids({}), ['a', 'b', 'c']);
  assert.deepEqual(ids({ tag: [] }), ['a', 'b', 'c']);
});

test('filters: a created or updated range is inclusive, in local days; a contact with no date is left out of a range', () => {
  const list = [C({ id: 'd1', fn: 'D1' }), C({ id: 'd2', fn: 'D2' }), C({ id: 'd3', fn: 'D3' })];
  const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
  const created = new Map([['d1', at(2026, 1, 5)], ['d2', at(2026, 2, 10, 23)], ['d3', 0]]);
  const updated = new Map([['d1', at(2026, 6, 1)], ['d2', at(2026, 6, 2)], ['d3', at(2026, 6, 3)]]);
  const ids = (f) => SC.filters.apply(list, f, { created, updated }).map((c) => c.id);
  assert.deepEqual(ids({ date: 'created', from: '2026-01-05', to: '2026-02-10' }), ['d1', 'd2']);
  assert.deepEqual(ids({ date: 'created', from: '2026-02-11' }), []);
  assert.deepEqual(ids({ date: 'updated', to: '2026-06-02' }), ['d1', 'd2']);
  assert.equal(SC.filters.dayOf(at(2026, 3, 4, 0)), '2026-03-04');
});

test('filters: the URL form keeps only set facets and reads back the same; bad text gives an empty filter', () => {
  const f = { group: ['Team'], org: ' Acme ', email: 'bogus', date: 'updated', from: '2026-01-02', to: 'nope', tag: ['t1'] };
  const clean = SC.filters.clean(f);
  assert.equal(clean.email, '');
  assert.equal(clean.to, '');
  const text = SC.filters.toParam(f);
  assert.deepEqual(JSON.parse(text), { group: ['Team'], org: 'Acme', date: 'updated', from: '2026-01-02', tag: ['t1'] });
  assert.deepEqual(SC.filters.fromParam(text), clean);
  assert.equal(SC.filters.toParam(SC.filters.clean({})), '');
  assert.deepEqual(SC.filters.fromParam('{not json'), SC.filters.clean({}));
  assert.equal(SC.filters.active(SC.filters.clean({ date: 'updated' })), false, 'a date field alone is not a filter');
});

test('chips: one per set facet, named tags, and removing one chip leaves the others', () => {
  const f = SC.filters.clean({ group: ['Team'], org: 'Acme', email: 'no', from: '2026-01-01', tag: ['t1', 't2'] });
  const chips = SC.filters.chips(f, { t1: 'VIP' });
  assert.deepEqual(chips.map((c) => c.label), ['Group: Team', 'Organisation: Acme', 'No e-mail', 'Created from 2026-01-01', 'Tag: VIP', 'Tag: t2']);
  const after = SC.filters.without(f, 'tag:t1');
  assert.deepEqual(after.tag, ['t2']);
  assert.equal(SC.filters.without(f, 'date').from, '');
  assert.deepEqual(SC.filters.without(f, 'group:Team').group, []);
});

test('table: sorting by a column puts empty values last both ways; name is the tie break', () => {
  const list = [C({ id: '1', fn: 'Zed', org: 'Beta' }), C({ id: '2', fn: 'Amy', org: '' }), C({ id: '3', fn: 'Bob', org: 'Acme' }), C({ id: '4', fn: 'Cy', org: 'acme' })];
  const names = (dir) => SC.tableModel.sortBy(list, 'org', dir).map((c) => c.fn);
  assert.deepEqual(names('asc'), ['Bob', 'Cy', 'Zed', 'Amy']);
  assert.deepEqual(names('desc'), ['Zed', 'Bob', 'Cy', 'Amy']);
  assert.deepEqual(SC.tableModel.sortBy(list, 'name', 'asc').map((c) => c.fn), ['Amy', 'Bob', 'Cy', 'Zed']);
});

test('table: a cell edit returns a contact; an invalid e-mail is an error; a multi-value cell keeps the labels of entries in place', () => {
  const c = C({ id: 'k', fn: 'Ken Park', name: { given: 'Ken', family: 'Park' }, emails: [{ value: 'k@x.io', types: ['WORK'] }], phones: [] });
  const ok = SC.tableModel.edit(c, 'email', 'k@x.io, k2@x.io; k3@x.io');
  assert.deepEqual(ok.contact.emails.map((e) => [e.value, e.types]), [['k@x.io', ['WORK']], ['k2@x.io', []], ['k3@x.io', []]]);
  const bad = SC.tableModel.edit(c, 'email', 'not-an-address');
  assert.match(bad.error, /not an e-mail address/);
  assert.equal(bad.contact, undefined);
  const name = SC.tableModel.edit(c, 'name', 'Kim  Lo Park');
  assert.equal(name.contact.fn, 'Kim Lo Park');
  assert.equal(name.contact.name.family, 'Park');
  assert.equal(SC.tableModel.edit(c, 'name', '   ').error, 'A name cannot be empty.');
  assert.equal(SC.tableModel.edit(c, 'groups', 'Team, Club').contact.groups.join('|'), 'Team|Club');
  assert.equal(SC.tableModel.edit(c, 'note', 'a\nb').contact.note, 'a\nb');
  assert.ok(SC.tableModel.edit(c, 'fn', 'x').error, 'a column that is not editable says so');
});
