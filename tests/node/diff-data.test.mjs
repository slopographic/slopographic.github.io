// Slop Compare, the structured and picture comparisons: JSON by key path (diff/js/core/json.js), CSV by row and cell
// (table.js), pixels (image.js), what a pair is compared as (kind.js), the options and the text entry point (compare.js),
// and the drawing and the report (render.js, report.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffJson, matchKey, pathText } from '../../diff/js/core/json.js';
import { diffTable, findKey, tableOf } from '../../diff/js/core/table.js';
import { pixelDiff, boxesOf, paint, fit } from '../../diff/js/core/image.js';
import { kindOf, modeOf, changes, summary } from '../../diff/js/core/kind.js';
import { compareTexts, options, DEFAULTS } from '../../diff/js/core/compare.js';
import { textTable, jsonTable, csvTable, esc } from '../../diff/js/core/render.js';
import { reportHtml, reportName } from '../../diff/js/core/report.js';

test('JSON: key order and formatting do not count; added, removed and changed by path', () => {
  const a = { name: 'Ada', age: 36, tags: ['x', 'y'], address: { city: 'London', zip: 'N1' } };
  const b = { tags: ['x', 'y', 'z'], age: 37, name: 'Ada', address: { city: 'London' }, email: 'ada@example.com' };
  const r = diffJson(a, b);
  assert.deepEqual(r.entries.map((e) => [e.kind, e.path]).sort(), [['added', '$.email'], ['added', '$.tags[2]'], ['changed', '$.age'], ['removed', '$.address.zip']].sort());
  assert.deepEqual(r.stats, { added: 2, removed: 1, changed: 1, total: 4 });
  assert.equal(diffJson({ b: 1, a: [1, 2] }, { a: [1, 2], b: 1 }).entries.length, 0);
});

test('JSON: arrays of records are matched by their id, so a reorder is no change', () => {
  const a = [{ id: 1, price: 5 }, { id: 2, price: 7 }, { id: 3, price: 9 }];
  const b = [{ id: 3, price: 9 }, { id: 1, price: 6 }, { id: 4, price: 1 }];
  assert.equal(matchKey(a, b), 'id');
  const r = diffJson({ items: a }, { items: b });
  assert.deepEqual(r.entries.map((e) => `${e.kind} ${e.path}`), ['changed $.items[id=1].price', 'removed $.items[id=2]', 'added $.items[id=4]']);
  assert.equal(diffJson('A', 'a', { ignoreCase: true }).entries.length, 0);
  assert.equal(diffJson(1, '1').entries[0].kind, 'changed');   // a type change
  assert.equal(pathText(['a b', 0, 'c']), '$["a b"][0].c');
  // a list of plain values is aligned: one inserted item is one change, not a cascade
  assert.deepEqual(diffJson([1, 2, 3, 4], [1, 9, 2, 3, 4]).entries.map((e) => `${e.kind} ${e.path}`), ['added $[1]']);
});

test('CSV: columns matched by name, rows by a key column whatever their order', () => {
  const a = 'id,name,qty\n1,Pen,5\n2,Ink,3\n3,Pad,9\n';
  const b = 'name,id,qty,colour\nInk,2,4,blue\nPen,1,5,red\nCup,4,1,white\n';
  assert.equal(findKey(tableOf(a), tableOf(b)), 'id');
  const r = diffTable(a, b);
  assert.equal(r.key, 'id');
  assert.deepEqual(r.added, ['colour']);
  assert.deepEqual(r.rows.map((x) => x.t), ['eq', 'ins', 'mod', 'del']);   // Cup follows Pen in B
  assert.deepEqual(r.rows[2].changed, ['qty']);
  assert.deepEqual(r.stats, { same: 1, changed: 1, added: 1, removed: 1, cells: 1, columns: 1 });
});

test('CSV without a key: rows aligned in order, a changed row is one change', () => {
  const a = 'a,b\nx,1\nx,2\ny,3\n', b = 'a,b\nx,1\nz,9\nx,2\ny,4\n';
  const r = diffTable(a, b, { key: '' });
  assert.equal(r.key, '');
  assert.deepEqual(r.rows.map((x) => x.t), ['eq', 'ins', 'eq', 'mod']);
  assert.equal(diffTable('a;b\n1;X\n', 'a;b\n1;x\n', { ignoreCase: true }).stats.changed, 0);
});

test('pixels: the threshold, the count and the boxes around each changed area', () => {
  const w = 64, h = 32, a = new Uint8ClampedArray(w * h * 4).fill(255), b = a.slice();
  for (let y = 4; y < 10; y++) for (let x = 4; x < 10; x++) b.set([0, 0, 0, 255], (y * w + x) * 4);
  for (let y = 20; y < 24; y++) for (let x = 50; x < 60; x++) b.set([250, 250, 250, 255], (y * w + x) * 4);   // faint
  const r = pixelDiff(a, b, w, h, { threshold: 0.1 });
  assert.equal(r.count, 36);
  assert.equal(r.boxes.length, 1);
  assert.ok(r.boxes[0].x <= 4 && r.boxes[0].x + r.boxes[0].w >= 10);
  assert.equal(pixelDiff(a, b, w, h, { threshold: 0 }).count, 76);
  assert.equal(pixelDiff(a, b, w, h, { threshold: 0 }).boxes.length, 2);
  const out = paint(new Uint8ClampedArray(w * h * 4), a, r.mask, w, h);
  assert.deepEqual([...out.slice((5 * w + 5) * 4, (5 * w + 5) * 4 + 4)], [230, 30, 60, 255]);
  assert.equal(boxesOf(new Uint8Array(16), 4, 4).length, 0);
  assert.equal(fit(100, 50, 100, 50).scaled, false);
  assert.match(fit(100, 50, 80, 40).note, /differ in size/);
});

test('what a pair is compared as', () => {
  assert.equal(kindOf('a.JSON'), 'json');
  assert.equal(kindOf('data.tsv'), 'csv');
  assert.equal(kindOf('x.py'), 'text');
  assert.equal(kindOf('scan.pdf'), 'pdf');
  assert.equal(kindOf('p.webp'), 'image');
  assert.equal(kindOf('logo.svg'), 'text');
  assert.equal(kindOf('movie.mp4', 'video/mp4'), '');
  assert.equal(modeOf('json', 'json'), 'json');
  assert.equal(modeOf('json', 'text'), 'text');
  assert.equal(modeOf('text', 'text', 'csv'), 'csv');
  assert.equal(modeOf('pdf', 'image'), null);
});

test('options: checked against the one table; the text entry point by mode', () => {
  assert.equal(options({ context: 999, view: 'bogus', ignoreCase: 'true' }).context, 50);
  assert.equal(options({ view: 'bogus' }).view, DEFAULTS.view);
  assert.equal(options({ ignoreCase: 'true' }).ignoreCase, true);
  assert.equal(options({ key: 'none' }).key, 'none');
  assert.equal(compareTexts('k,v\n1,a\n', 'k,v\n1,b\n', 'csv', { key: 'none' }).csv.key, '');
  assert.throws(() => compareTexts('{"a":1}', '{"a":', 'json'), /^Error: B: This is not valid JSON/);
  const t = compareTexts('a\nb\n', 'a\nc\n', 'text');
  assert.equal(changes({ ...t }), 1);
  assert.match(summary(t), /^1 change: \+1 −1 lines/);
  assert.equal(summary(compareTexts('x', 'x', 'text')), 'The two texts are the same.');
});

test('the drawing marks changed words, escapes the text and folds the rest; the report is one page', () => {
  const r = compareTexts('<b>one</b>\nsame\nsame\nsame\nsame\nsame\nsame\nsame\nend', '<b>two</b>\nsame\nsame\nsame\nsame\nsame\nsame\nsame\nend', 'text');
  const html = textTable(r.text, { view: 'unified', context: 1 });
  assert.match(html, /<del>one<\/del>/);
  assert.match(html, /<ins>two<\/ins>/);
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /data-fold="2">7 unchanged lines/);
  assert.match(textTable(r.text, { view: 'split', context: -1 }), /df-split/);
  const j = compareTexts('{"a":1}', '{"a":2,"b":3}', 'json');
  assert.equal((jsonTable(j.json).match(/data-block/g) || []).length, 2);
  const c = compareTexts('id,v\n1,a\n2,b\n', 'id,v\n1,a\n2,c\n', 'csv');
  assert.match(csvTable(c.csv), /<del>b<\/del> <ins>c<\/ins>/);
  assert.equal(esc('"<&>\''), '&quot;&lt;&amp;&gt;&#39;');
  const page = reportHtml({ ...r, opts: { ignoreCase: true } }, { nameA: 'old.txt', nameB: 'new.txt', date: new Date(Date.UTC(2026, 0, 2, 3, 4)) });
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /old.txt compared with new.txt/);
  assert.match(page, /2026-01-02 03:04 UTC · case ignored/);
  assert.ok(!/<script/i.test(page));
  assert.equal(reportName('old notes.txt', 'new.md'), 'compare-old-notes-vs-new.html');
});
