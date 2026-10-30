import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extract } = require('../../pdf/js/editor/block-text.js');

const span = (text, left, top, width = 40, height = 12) => ({ text, rect: { left, top, right: left + width, bottom: top + height } });

test('words in a box come out line by line, left to right', () => {
  const spans = [span('World', 60, 10), span('Hello', 10, 10), span('Second', 10, 30)];
  assert.equal(extract(spans, { left: 0, top: 0, right: 200, bottom: 100 }), 'Hello World\nSecond');
});

test('a word whose centre is outside the box is left out, not cut in half', () => {
  const spans = [span('Inside', 10, 10), span('Edge', 190, 10)];
  assert.equal(extract(spans, { left: 0, top: 0, right: 200, bottom: 100 }), 'Inside');
});

test('a box dragged in any direction gives the same text', () => {
  const spans = [span('One', 10, 10), span('Two', 60, 10)];
  assert.equal(extract(spans, { left: 200, top: 100, right: 0, bottom: 0 }), 'One Two');
});

test('touching spans join without a space, separated words get one', () => {
  const spans = [span('Hel', 10, 10, 20), span('lo', 30, 10, 14), span('there', 60, 10, 30)];
  assert.equal(extract(spans, { left: 0, top: 0, right: 200, bottom: 100 }), 'Hello there');
});

test('empty or blank spans and an empty box give an empty string', () => {
  assert.equal(extract([span('   ', 10, 10)], { left: 0, top: 0, right: 200, bottom: 100 }), '');
  assert.equal(extract([], { left: 0, top: 0, right: 10, bottom: 10 }), '');
});

const { units, toPx } = require('../../pdf/js/editor/block-text.js');

test('a box is kept in layout units, whatever the corners order, and is drawn at the zoom', () => {
  const u = units({ x: 40, y: 30 }, { x: 10, y: 5 });
  assert.deepEqual(u, { x0: 10, y0: 5, x1: 40, y1: 30 });
  assert.deepEqual(toPx(u, 2), { left: 20, top: 10, width: 60, height: 50 });
  assert.deepEqual(toPx(u, 0.5), { left: 5, top: 2.5, width: 15, height: 12.5 });
});

test('the same words are in the box at any zoom: the spans scale with the page, and so does the box', () => {
  const page = [span('Alpha', 10, 10), span('Beta', 70, 10), span('Gamma', 10, 40)];
  const u = units({ x: 0, y: 0 }, { x: 60, y: 30 });
  const first = extract(page, { left: 0, top: 0, right: 60, bottom: 30 });
  for (const z of [0.25, 0.5, 1, 1.5, 2, 4]) {
    const scaled = page.map((s) => ({ text: s.text, rect: { left: s.rect.left * z, top: s.rect.top * z, right: s.rect.right * z, bottom: s.rect.bottom * z } }));
    const px = toPx(u, z);
    const box = { left: px.left, top: px.top, right: px.left + px.width, bottom: px.top + px.height };
    assert.equal(extract(scaled, box), first, `zoom ${z}`);
  }
  assert.equal(first, 'Alpha');
});
