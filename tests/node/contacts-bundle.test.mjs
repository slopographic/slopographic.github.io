// Slop Contacts: the Slop Drive bundle (contacts.vcf, core/bundle.js). The write and read round trip (every standard field
// and the X-SLOP properties: id, groups, stage, follow-up date and tags), the file's layout (vCard 4.0, CRLF, folded
// lines, no photo), and importing the same bundle twice changes nothing (matched on X-SLOP-ID, phone or e-mail).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContacts } from '../contacts/contacts.node-env.mjs';

const SC = loadContacts();
const octets = (s) => new TextEncoder().encode(s).length;
const make = (over) => SC.model.normalise(Object.assign(SC.model.blank(), over));
const one = (lines) => lines.join('\r\n') + '\r\n';

/** Contacts with every field the bundle carries, and a few edge values (a comma, a semicolon, a backslash, non-ASCII). */
function sample() {
  return [
    make({ id: 'b-1', name: { prefix: 'Dr.', given: 'Maria', additional: 'J.', family: 'Mueller', suffix: 'PhD' },
      fn: 'Dr. Maria J. Mueller PhD', org: 'Acme; Ltd', dept: 'Sales, EMEA', title: 'Head of sales',
      phones: [{ value: '+49 170 1234567', types: ['CELL'] }, { value: '+49 30 555 0100', types: ['WORK', 'FAX'] }],
      emails: [{ value: 'maria@example.com', types: ['WORK'] }],
      adr: [{ types: ['HOME'], street: 'Long Street 1, Apt 2', locality: 'Berlin', postal: '10115', country: 'Germany' }],
      bday: '1980-02-29', url: 'https://example.com/maria', note: 'Line one\nline two, with a comma; and a backslash \\ end',
      groups: ['Friends', 'Club, North'], stage: 'customer', followUp: '2026-11-05', tagIds: ['tag-a', 'tag, b'] }),
    make({ id: 'b-2', fn: 'Lone Star', emails: [{ value: 'lone@example.com', types: [] }], groups: [], stage: 'lead' }),
    make({ id: 'b-3', fn: 'Ünïcödé Ärger', org: 'Zürich AG', stage: 'lost' }), // no phone or e-mail: matched on id only
  ];
}

test('write, then read: every field and every X-SLOP property (id, groups, stage, follow-up, tags) comes back', () => {
  const list = sample();
  const back = SC.bundle.read(SC.bundle.write(list));
  assert.equal(back.length, list.length);
  back.forEach((c, i) => assert.deepEqual(c, list[i]));
  assert.deepEqual(back[0].groups, ['Friends', 'Club, North']);
  assert.equal(back[0].stage, 'customer');
  assert.equal(back[0].followUp, '2026-11-05');
  assert.deepEqual(back[0].tagIds, ['tag-a', 'tag, b']);
});

test('the file is vCard 4.0 in CRLF lines, one block per contact, with one X-SLOP-GROUP per group and no photo or CATEGORIES', () => {
  const text = SC.bundle.write(sample());
  const lines = text.split('\r\n');
  assert.ok(text.startsWith('BEGIN:VCARD\r\nVERSION:4.0\r\n'));
  assert.equal(text.split('BEGIN:VCARD').length - 1, 3);
  assert.ok(!/(^|[^\r])\n/.test(text), 'every line ends in CRLF');
  for (const l of lines) assert.ok(octets(l) <= 75, `line is longer than 75 octets: ${l}`);
  assert.ok(lines.includes('X-SLOP-ID:b-1'));
  assert.ok(lines.includes('X-SLOP-GROUP:Friends'));
  assert.ok(lines.includes('X-SLOP-GROUP:Club\\, North'));
  assert.ok(lines.includes('X-SLOP-STAGE:customer'));
  assert.ok(lines.includes('X-SLOP-FOLLOWUP:2026-11-05'));
  assert.ok(lines.includes('X-SLOP-TAGS:tag-a,tag\\, b'));
  assert.ok(lines.includes('TEL;TYPE=CELL:+49 170 1234567'));
  assert.ok(lines.includes('BDAY:1980-02-29'));
  assert.ok(!lines.some((l) => /^(CATEGORIES|UID|PHOTO)[:;]/.test(l)), 'the Slop properties replace CATEGORIES, UID and PHOTO');
});

test('the bundle goes through the .vcf importer as well (the same reader the drops use)', async () => {
  const file = new File([SC.bundle.write(sample())], 'contacts.vcf', { type: 'text/vcard' });
  const r = await SC.importPlan.readFile(file);
  assert.equal(r.kind, 'vcard');
  assert.equal(r.contacts[0].stage, 'customer');
  assert.deepEqual(r.contacts[0].groups, ['Friends', 'Club, North']);
});

test('a stage that is not a pipeline stage, and a follow-up that is not a date, are dropped on read; the rest is kept', () => {
  const [c] = SC.bundle.read(one(['BEGIN:VCARD', 'VERSION:4.0', 'FN:Odd Value', 'X-SLOP-ID:odd-1', 'X-SLOP-STAGE:maybe',
    'X-SLOP-FOLLOWUP:next week', 'X-SLOP-GROUP:Kept', 'END:VCARD']));
  assert.equal(c.id, 'odd-1');
  assert.equal(c.stage, undefined);
  assert.equal(c.followUp, undefined);
  assert.deepEqual(c.groups, ['Kept']);
});

test('importing the same bundle twice changes nothing: the second time every contact matches by id, and skip or merge leave it as it was', () => {
  const bundle = SC.bundle.write(sample());
  // The first import keeps the ids the file carries (keepIds in the preview), so the second one can match them.
  const first = SC.importPlan.apply([], SC.importPlan.plan([], SC.bundle.read(bundle), ''), 'skip', (c) => c.id, '');
  assert.equal(first.added, 3);
  const rows = SC.importPlan.plan(first.list, SC.bundle.read(bundle), '');
  assert.ok(rows.every((r) => r.match && r.why[0] === 'the same id'));
  const skipped = SC.importPlan.apply(first.list, rows, 'skip', () => 'unused', '');
  assert.equal(skipped.added, 0);
  assert.deepEqual(skipped.list, first.list);
  const merged = SC.importPlan.apply(first.list, rows, 'merge', () => 'unused', '');
  assert.equal(merged.added, 0);
  assert.equal(merged.list.length, first.list.length);
  merged.list.forEach((c, i) => assert.ok(SC.model.sameContent(c, first.list[i]), `merge changed ${c.id}`));
});

test('an incoming contact with the same id matches the existing one, even when its phone has changed', () => {
  const [a] = sample();
  const changed = SC.model.normalise({ ...a, phones: [{ value: '+1 555 0100', types: ['CELL'] }] });
  const [row] = SC.importPlan.plan([a], SC.bundle.read(SC.bundle.write([changed])), '');
  assert.equal(row.match.id, 'b-1');
  assert.equal(row.why[0], 'the same id');
});
