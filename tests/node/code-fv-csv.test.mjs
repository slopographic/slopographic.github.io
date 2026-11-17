// Covers: code/js/fv-csv.js
// The Formatted view, CSV and TSV as an aligned table. Run with: node --test tests/node/code-fv-csv.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatForView } from '../../code/js/formatview.js';

const csv = (text) => { const r = formatForView(text, 'text', 'a.csv'); assert.equal(r.ok, true, JSON.stringify(r)); return r.text; };
const tsv = (text) => { const r = formatForView(text, 'text', 'a.tsv'); assert.equal(r.ok, true, JSON.stringify(r)); return r.text; };
const lines = (...l) => l.join('\n');

test('csv: columns are padded to their widest cell, with a rule after the header row', () => {
  assert.equal(csv('name,age,city\nAnn,30,Oslo\nBob,4,Rome\n'), lines('name │ age │ city', '─'.repeat(17), 'Ann  │ 30  │ Oslo', 'Bob  │ 4   │ Rome'));
  assert.equal(csv('a'), lines('a', '─'));
  assert.equal(csv('a,b'), lines('a │ b', '─────'));
  assert.equal(csv(''), '');
  assert.equal(csv('\n\n'), '');
});

test('csv: messy input (CRLF, blank lines, no final newline, ragged rows) gives a clean table', () => {
  const out = csv('id,name,note\r\n\r\n1,Ann\r\n2,Bob,x,extra\r\n\r\n3\r\n4,"",');
  assert.equal(out, lines('id │ name │ note │', '─'.repeat(24), '1  │ Ann  │      │', '2  │ Bob  │ x    │ extra', '3  │      │      │', '4  │      │      │'));
});

test('csv: quotes hold commas, doubled quotes and line breaks', () => {
  const out = csv('a,b\n"x, y","say ""hi"""\n"line1\nline2","tab\there"\n"a""b",c');
  assert.equal(out, lines('a           │ b', '─'.repeat(22), 'x, y        │ say "hi"', 'line1↵line2 │ tab here', 'a"b         │ c'));
  assert.equal(csv('a,b\n"x"y,"z"'), lines('a  │ b', '─'.repeat(6), 'xy │ z'), 'text after a closing quote is kept');
});

test('csv: a cell is cut at 40 characters and ends with an ellipsis, and widths count characters', () => {
  const long = 'x'.repeat(60);
  const out = csv(`h,k\n${long},é😀\n${'y'.repeat(40)},plain`);
  const rows = out.split('\n');
  assert.equal(rows[2], 'x'.repeat(39) + '… │ é😀');
  assert.equal(rows[3], 'y'.repeat(40) + ' │ plain');
  assert.equal(rows[0], 'h' + ' '.repeat(39) + ' │ k');
  assert.equal(csv('a\n' + 'z'.repeat(41)).split('\n')[2], 'z'.repeat(39) + '…');
  assert.equal(csv('a\n' + 'z'.repeat(40)).split('\n')[2], 'z'.repeat(40));
  assert.equal(csv('a\n' + '😀'.repeat(41)).split('\n')[2], '😀'.repeat(39) + '…');
});

test('tsv: tabs separate the cells, commas do not', () => {
  assert.equal(tsv('a\tb\n1,5\t"2\t3"\n'), lines('a   │ b', '─'.repeat(9), '1,5 │ 2 3'));
  assert.equal(tsv('x\ty\r\nlong value\t\r\n'), lines('x          │ y', '─'.repeat(14), 'long value │'));
});

test('csv: an unterminated quote is an error with its line and column', () => {
  const r = formatForView('a,b\n1,"x\n2,3', 'text', 'a.csv');
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'csv');
  assert.equal(r.key, 'code.fv.err.open_quote');
  assert.deepEqual([r.line, r.col], [2, 3]);
  assert.deepEqual(['line' in formatForView('"abc', 'text', 'a.tsv'), formatForView('"abc', 'text', 'a.tsv').line], [true, 1]);
  assert.equal(formatForView('a\n"x""', 'text', 'a.csv').ok, false, 'a doubled quote at the end does not close the field');
  assert.equal(csv('a\n"x"""'), lines('a', '──', 'x"'));
});

test('csv: more than 20,000 rows shows the first 20,000 and a last line with the rest', () => {
  const src = 'n,sq\n' + Array.from({ length: 25000 }, (_, i) => `${i},${i * i}`).join('\n');
  const rows = csv(src).split('\n');
  assert.equal(rows.length, 20000 + 1 + 1, 'the rows, the rule and the last line');
  assert.equal(rows[rows.length - 1], '… 5001 more rows');
  assert.equal(rows[rows.length - 2], '19998 │ 399920004');
  const exact = csv('n\n' + Array.from({ length: 19999 }, (_, i) => i).join('\n')).split('\n');
  assert.equal(exact.length, 20000 + 1, '20,000 rows are all shown');
  assert.ok(!exact[exact.length - 1].includes('more rows'));
  assert.equal(csv('n\n' + Array.from({ length: 20000 }, (_, i) => i).join('\n')).split('\n').pop(), '… 1 more rows');
});

test('csv: a 1 MB file is formatted in under 2 seconds', () => {
  const row = 'a,b,"c d",e\n';
  const src = row.repeat(Math.ceil(1000000 / row.length));
  const t0 = performance.now();
  const r = formatForView(src, 'text', 'big.csv');
  assert.ok(performance.now() - t0 < 2000, 'took ' + (performance.now() - t0));
  assert.equal(r.ok, true);
  assert.ok(r.text.endsWith('more rows'));
});
