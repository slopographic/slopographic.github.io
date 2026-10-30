// Slop EML: many messages at once — mailbox splitting (eml/js/mbox.js) and the list helpers (eml/js/batch.js): safe and
// unique names, sorting, search, shift-click ranges, CSV. Run: node --test tests/node/eml-batch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const X = require('../../eml/js/mbox.js');
const B = require('../../eml/js/batch.js');
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

test('an mbox is told apart by its name or its first line', () => {
  assert.equal(X.isMbox('Inbox.mbox', enc('x')), true);
  assert.equal(X.isMbox('mail.bin', enc('From ann@x Mon Jan 1 2026\n')), true);
  assert.equal(X.isMbox('mail.eml', enc('From: ann@x\n')), false);
});

test('split: one message per separator, the separator dropped, >From unquoted, a From inside the text kept', () => {
  const box = 'From a@x Mon Mar 16 10:00:00 2026\nFrom: a@x\nSubject: One\n\nHello\nFrom here on, a sentence.\n>From quoted\n>>From twice\n\n' +
    'From b@x Tue Mar 17 10:00:00 2026\r\nFrom: b@x\r\nSubject: Two\r\n\r\nBye\r\n';
  const parts = X.split(enc(box)).map(dec);
  assert.equal(parts.length, 2);
  assert.ok(parts[0].startsWith('From: a@x\nSubject: One'));
  assert.ok(parts[0].includes('\nFrom here on, a sentence.\nFrom quoted\n>From twice'));
  assert.ok(parts[0].endsWith('>From twice\n'), JSON.stringify(parts[0].slice(-20)));
  assert.ok(parts[1].startsWith('From: b@x\r\n'));
  assert.ok(parts[1].endsWith('Bye\r\n'));
});

test('split: a file with no separator is one message; an empty one is none', () => {
  assert.equal(X.split(enc('From: a@x\n\nhi')).length, 1);
  assert.equal(X.split(new Uint8Array(0)).length, 0);
});

test('split: the fixture mailbox holds the ten messages and the quoted one', async () => {
  const bytes = new Uint8Array(await readFile(path.join(HERE, '../eml/fixtures/batch/batch.mbox')));
  const parts = X.split(bytes);
  assert.equal(parts.length, 11);
  assert.ok(dec(parts[10]).includes('\nFrom the start of a line'));
});

test('safe names: no path or reserved characters, no Windows device names, not empty, not too long', () => {
  assert.equal(B.safeName('a/b\\c:d*?"<>|e.pdf'), 'a_b_c_d_e.pdf');
  assert.equal(B.safeName('  ..hidden. '), 'hidden');
  assert.equal(B.safeName('CON'), '_CON');
  assert.equal(B.safeName('', 'message'), 'message');
  const long = B.safeName('x'.repeat(300) + '.pdf');
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('.pdf'));
});

test('unique names ignore case and keep the extension', () => {
  assert.deepEqual(B.uniqueNames(['a.txt', 'A.txt', 'a (2).txt']), ['a.txt', 'A (2).txt', 'a (2) (2).txt']);
});

const item = (id, from, subject, date, atts = []) => ({ id, name: id + '.eml', summary: { from, subject, to: 'me@x' }, time: date ? Date.parse(date) : null, attachments: atts.map((n) => ({ name: n })) });
const ITEMS = [
  item(1, 'Örjan <o@x>', 'Re: Budget', '2026-03-02T10:00:00Z'),
  item(2, '"Anna" <a@x>', 'Fika', '2026-01-05T10:00:00Z', ['meny.csv']),
  item(3, 'zed@x', 'Agenda', null),
  item(4, 'Ben <b@x>', 'budget plan', '2026-02-01T10:00:00Z'),
];
const ids = (l) => l.map((x) => x.id);

test('person: the display name, or the address', () => {
  assert.equal(B.person('"Anna L" <a@x>'), 'Anna L');
  assert.equal(B.person('<a@x>'), 'a@x');
  assert.equal(B.person('a@x'), 'a@x');
});

test('sort by date (undated last either way), sender and subject (Re: ignored)', () => {
  assert.deepEqual(ids(B.sort(ITEMS, 'date', 'desc')), [1, 4, 2, 3]);
  assert.deepEqual(ids(B.sort(ITEMS, 'date', 'asc')), [2, 4, 1, 3]);
  assert.deepEqual(ids(B.chrono(ITEMS)), [2, 4, 1, 3]);
  assert.deepEqual(ids(B.sort(ITEMS, 'from', 'asc')), [2, 4, 1, 3]);   // Ö sorts with O (the default collation)
  assert.deepEqual(ids(B.sort(ITEMS, 'subject', 'asc')), [3, 1, 4, 2]);
});

test('search needs every word, in sender, subject or attachment names', () => {
  assert.deepEqual(ids(B.search(ITEMS, 'budget')), [1, 4]);
  assert.deepEqual(ids(B.search(ITEMS, 'budget ben')), [4]);
  assert.deepEqual(ids(B.search(ITEMS, 'MENY')), [2]);
  assert.equal(B.search(ITEMS, '  ').length, 4);
});

test('range: shift-click from either end', () => {
  assert.deepEqual(B.range([5, 6, 7, 8], 6, 8), [6, 7, 8]);
  assert.deepEqual(B.range([5, 6, 7, 8], 8, 5), [5, 6, 7, 8]);
  assert.deepEqual(B.range([5, 6], 9, 6), [6]);
});

test('stems: date and subject, unique; CSV quotes what needs it', () => {
  assert.deepEqual(B.stems([ITEMS[3], item(9, 'x', 'budget plan', '2026-02-01T12:00:00Z'), ITEMS[2]]), ['2026-02-01 budget plan', '2026-02-01 budget plan (2)', 'Agenda']);
  const rows = B.csvRows([ITEMS[1]]);
  assert.deepEqual(rows[0], ['Date', 'From', 'To', 'Subject', 'Attachments']);
  assert.deepEqual(rows[1], ['2026-01-05 10:00', '"Anna" <a@x>', 'me@x', 'Fika', 'meny.csv']);
  assert.equal(B.csv([['a,b', 'say "hi"', 'x']]), '"a,b","say ""hi""",x\r\n');
});

test('typeOf: the extension decides when the mail says only octet-stream', () => {
  assert.equal(B.typeOf('a.pdf', 'application/octet-stream'), 'application/pdf');
  assert.equal(B.typeOf('a.xlsx', ''), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(B.typeOf('a.png', 'image/png'), 'image/png');
  assert.equal(B.typeOf('noext', ''), 'application/octet-stream');
});
