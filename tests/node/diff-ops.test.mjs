// Slop Compare's Workflows step (shared/ops/diff.js, diff.report): two text files in, the HTML report or the .patch out, with
// the page's own comparison (diff/js/io/files.js) and options; the step refuses one file, and a .patch of pictures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui-i18n-en.mjs';   // the shared components' words (shared/i18n/ui), as a page has them
import { byId, outOf, validateOptions, argsOf } from '../../shared/ops/registry.js';
import { reportOf } from '../../shared/ops/diff.js';
import { applyPatch } from '../../diff/js/core/patch.js';
import { sideKind } from '../../diff/js/io/files.js';

const f = (name, text, type = 'text/plain') => ({ name, file: new File([text], name, { type }), kind: name.split('.').pop() });

test('the step is registered for Slop Compare, takes the whole set, and makes what its format says', () => {
  const op = byId('diff.report');
  assert.equal(op.app, 'diff');
  assert.equal(op.mode, 'combine');
  assert.equal(outOf(op, 'txt', { format: 'patch' }), 'patch');
  assert.equal(outOf(op, 'txt', {}), 'html');
  assert.deepEqual(validateOptions(op, { format: 'pdf', ignoreCase: 'true' }).options.ignoreCase, true);
  assert.ok(argsOf(op).some((a) => a.name === 'mode' && a.type === 'enum'));
});

test('two texts → an HTML report with the changed words, and a .patch that turns A into B', async () => {
  const a = f('old.txt', 'alpha\nbeta\ngamma\n'), b = f('new.txt', 'alpha\nBETA\ngamma\ndelta\n');
  const html = await reportOf([a, b], { format: 'html' });
  assert.equal(html.name, 'compare-old-vs-new.html');
  const page = await html.blob.text();
  assert.match(page, /<del>beta<\/del>/);
  assert.match(page, /<ins>BETA<\/ins>/);
  assert.match(html.summary, /^2 changes/);
  const patch = await reportOf([a, b], { format: 'patch' });
  assert.equal(applyPatch('alpha\nbeta\ngamma\n', await patch.blob.text()), 'alpha\nBETA\ngamma\ndelta\n');
  assert.match((await reportOf([a, b], { format: 'html', ignoreCase: true })).summary, /^1 change/);
});

test('JSON files are compared by key, whatever the order', async () => {
  const r = await reportOf([f('a.json', '{"x":1,"y":[1,2]}', 'application/json'), f('b.json', '{"y":[1,2],"x":2}', 'application/json')], {});
  assert.match(r.summary, /^1 difference: 0 added, 0 removed, 1 changed/);
  assert.match(await r.blob.text(), /\$\.x/);
});

test('refusals: one file, a picture and a text, a .patch of pictures', async () => {
  await assert.rejects(reportOf([f('a.txt', 'x')], {}), /two files/);
  await assert.rejects(reportOf([f('a.txt', 'x'), f('b.pdf', '%PDF', 'application/pdf')], {}), /cannot be compared/);
  assert.equal(sideKind({ text: '{"a": 1}' }), 'json');
  assert.equal(sideKind({ text: 'plain words' }), 'text');
});
