// Ratio maths for shared/transform/aspect.js (window.SlopAspect). Loaded as a classic script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', '..', 'shared', 'transform', 'aspect.js'), 'utf8');
const win = {};
new Function('window', src)(win);
const { ratio, restore } = win.SlopAspect;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('ratio is the width over height of the source', () => {
  near(ratio({ src: { w: 1200, h: 800 } }), 1.5);
  near(ratio({ src: { w: 300, h: 600 } }), 0.5);
});

test('no source size, or a non-positive one, gives null (the item is disabled)', () => {
  assert.equal(ratio({}), null);
  assert.equal(ratio(null), null);
  assert.equal(ratio({ src: { w: 0, h: 10 } }), null);
  assert.equal(ratio({ src: { w: 10, h: NaN } }), null);
  assert.equal(ratio({ src: { w: '10', h: 5 } }), null);
});

test('a cropped object keeps the ratio of the un-cropped source', () => {
  const cropped = { src: { w: 1200, h: 800 }, crop: { l: 0.25, r: 0.25, t: 0, b: 0.5 } };
  near(ratio(cropped), 1.5);
  // a crop without a known source cannot be restored
  assert.equal(ratio({ crop: { l: 0.1, r: 0.1, t: 0.1, b: 0.1 } }), null);
});

test('a rotated object keeps its own ratio, so a quarter turn does not invert it', () => {
  const flat = { src: { w: 1200, h: 800 }, rot: 0 };
  near(ratio(flat), 1.5);
  near(ratio({ src: { w: 1200, h: 800 }, rot: 90 }), 1.5);
  near(ratio({ src: { w: 1200, h: 800 }, rot: -90 }), 1.5);
  near(ratio({ src: { w: 1200, h: 800 }, rot: 37 }), 1.5);
});

test('restore keeps the width and sets the height from the ratio', () => {
  assert.deepEqual(restore({ w: 200, h: 50 }, 2), { w: 200, h: 100 });
  assert.deepEqual(restore({ w: 60, h: 60 }, { src: { w: 120, h: 60 } }), { w: 60, h: 30 });
});

test('restore keeps the height when asked and sets the width', () => {
  assert.deepEqual(restore({ w: 200, h: 50 }, 2, 'h'), { w: 100, h: 50 });
});

test('restore of a rotated, cropped object uses the source ratio, not the box as it sits', () => {
  // A 1200 x 800 source, cropped to a 400 x 800 box and turned 90°: the box is 800 wide and 400 tall on screen,
  // but the object's own ratio is still 1.5, so keeping the width gives a 800 x 533.33 box.
  const obj = { src: { w: 1200, h: 800 }, crop: { l: 0.33, r: 0.33, t: 0, b: 0 }, rot: 90 };
  const r = restore({ w: 800, h: 400 }, obj);
  near(r.w, 800); near(r.h, 800 / 1.5);
});

test('without a usable ratio the box is returned unchanged', () => {
  assert.deepEqual(restore({ w: 30, h: 10 }, null), { w: 30, h: 10 });
  assert.deepEqual(restore({ w: 30, h: 10 }, {}), { w: 30, h: 10 });
  assert.deepEqual(restore({ w: 30, h: 10 }, 0), { w: 30, h: 10 });
});

test('a zero-size box stays zero', () => {
  assert.deepEqual(restore({ w: 0, h: 0 }, 2), { w: 0, h: 0 });
});
