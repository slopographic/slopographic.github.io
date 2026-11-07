// SlopVector clipping masks: the tree logic in slopvector/js/core/clipmask.js (which objects a clip shape clips,
// making and releasing the group, the SVG clipPath strings and the PDF clip operators). Loaded in a vm context.
// Run with: node tests/run.mjs vector
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'slopvector', 'js', 'core', 'clipmask.js'), 'utf8'), ctx, { filename: 'clipmask.js' });
const CM = ctx.SV.clipMask;
const J = (v) => JSON.parse(JSON.stringify(v)); // vm-realm values compare as plain data
const same = (a, b, msg) => assert.deepEqual(J(a), b, msg);
const obj = (id) => ({ id, type: 'rect' });
/** A group factory like SV.mk.group: children and a name. */
const mkGroup = (kids, name) => ({ id: 'g-' + kids.map((k) => k.id).join(''), type: 'group', name, hidden: false, locked: false, children: kids });
const ids = (arr) => arr.map((o) => o.id);

test('the clip shape clips the selected objects below it in the same stack', () => {
  const arr = ['a', 'b', 'c', 'd'].map(obj);
  same(CM.plan(arr, ['c']), { clip: 2, content: [0, 1] }, 'one selected: every sibling below it');
  same(CM.plan(arr, ['a', 'd']), { clip: 3, content: [0] }, 'several selected: the topmost is the shape');
  same(CM.plan(arr, ['b', 'd', 'a']), { clip: 3, content: [0, 1] }, 'selected objects below the shape only');
  assert.equal(CM.plan(arr, ['a']), null, 'nothing below the bottom object');
  assert.equal(CM.plan(arr, ['zz']), null, 'no selected object in this stack');
});

test('making a clipping mask puts one group in place of the lowest member, with the shape on top', () => {
  const arr = ['a', 'b', 'c', 'd'].map(obj);
  const plan = CM.plan(arr, ['c']);
  const g = CM.apply(arr, plan, mkGroup);
  assert.equal(arr.length, 2);
  assert.equal(arr[0], g);
  assert.equal(arr[1].id, 'd', 'objects above the shape are not touched');
  assert.equal(g.clip, true);
  same(ids(g.children), ['a', 'b', 'c'], 'the clipped objects keep their order, the shape last');
  assert.equal(CM.isClip(g), true);
  assert.equal(CM.shape(g).id, 'c');
  same(ids(CM.content(g)), ['a', 'b']);
});

test('non-adjacent members join one group, and the rest of the stack keeps its order', () => {
  const arr = ['a', 'b', 'c', 'd', 'e'].map(obj);
  const g = CM.apply(arr, CM.plan(arr, ['a', 'c', 'e']), mkGroup);
  same(ids(g.children), ['a', 'c', 'e']);
  same(ids(arr), [g.id, 'b', 'd'], 'the group takes the lowest member\'s place; b and d keep their order');
});

test('releasing gives the objects back in their places with the shape still on top', () => {
  const arr = ['x', 'a', 'b', 'c', 'y'].map(obj);
  const g = CM.apply(arr, CM.plan(arr, ['c']), mkGroup); // one selected: everything below c is clipped -> [G(x a b c), y]
  same(ids(g.children), ['x', 'a', 'b', 'c']);
  const kids = CM.release(arr, 0);
  same(ids(kids), ['x', 'a', 'b', 'c']);
  same(ids(arr), ['x', 'a', 'b', 'c', 'y']);
  assert.equal(arr.includes(g), false);
  assert.equal(CM.isClip(arr[3]), false, 'the shape is an ordinary object again');
});

test('a plain group is not a clipping mask, and a clip with no content still reports its shape', () => {
  assert.equal(CM.isClip({ type: 'group', children: [obj('a')] }), false);
  assert.equal(CM.isClip({ type: 'group', clip: true, children: [] }), false);
  assert.equal(CM.isClip(obj('a')), false);
  assert.equal(CM.shape({ type: 'group', clip: true, children: [obj('only')] }).id, 'only');
});

test('the SVG output is a clipPath in defs and a group that clips its content (editable, not flattened)', () => {
  const out = CM.svg('sv-clip-g1', '<rect x="1" y="2" width="3" height="4"/>', '<path d="M0 0"/>', ' transform="matrix(1 0 0 1 5 6)"');
  assert.equal(out.def, '<clipPath id="sv-clip-g1"><rect x="1" y="2" width="3" height="4"/></clipPath>');
  assert.equal(out.markup, '<g transform="matrix(1 0 0 1 5 6)"><g clip-path="url(#sv-clip-g1)"><path d="M0 0"/></g></g>');
});

test('the PDF clip is the path followed by W n, or an empty clip when there is no path', () => {
  assert.equal(CM.pdfClip('0 0 m 10 0 l 10 10 l h'), '0 0 m 10 0 l 10 10 l h W n');
  assert.equal(CM.pdfClip(''), '0 0 0 0 re W n');
  assert.equal(CM.pdfClip(null), '0 0 0 0 re W n');
});
