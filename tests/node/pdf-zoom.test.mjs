// Slop PDF zoom about a pointer (pdf/js/editor/zoom-math.js): the arithmetic the page view uses, with no DOM.
// Run with: node --test tests/node/pdf-zoom.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'pdf', 'js', 'editor', 'zoom-math.js'), 'utf8'), ctx, { filename: 'zoom-math.js' });
const Z = ctx.SlopPdfZoom;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('the percentage on the status bar maps to layout zoom (1 is 75%)', () => {
  near(Z.fromPercent(75), 1);
  near(Z.fromPercent(25), 0.25 * 96 / 72);
  assert.equal(Z.percent(Z.fromPercent(800)), 800);
  assert.equal(Z.percent(Z.fromPercent(25)), 25);
});

test('the zoom is clamped to 25% and 800%', () => {
  const lo = Z.fromPercent(25), hi = Z.fromPercent(800);
  near(Z.clamp(0.01, lo, hi), lo);
  near(Z.clamp(100, lo, hi), hi);
  near(Z.clamp(1.5, lo, hi), 1.5);
});

test('the document point under the pointer stays under it for any zoom step', () => {
  const pointer = { x: 412.5, y: 233.25 }, origin = { x: 100, y: 40 };
  let z = 1.2, o = origin;
  for (const k of [1.25, 1.25, 0.8, 1.1, 1 / 1.4, 2.5]) {
    const doc0 = Z.docPoint(pointer, o, z);
    const z1 = Z.clamp(z * k, Z.fromPercent(25), Z.fromPercent(800));
    o = Z.zoomAbout(pointer, o, z, z1);
    const doc1 = Z.docPoint(pointer, o, z1);
    near(doc1.x, doc0.x, 1e-9); near(doc1.y, doc0.y, 1e-9);
    z = z1;
  }
});

test('the origin moves by the pointer offset times the zoom change (zoom in about a corner)', () => {
  // at the top-left corner of the page the origin stays on the pointer
  const o = Z.zoomAbout({ x: 50, y: 60 }, { x: 50, y: 60 }, 1, 2);
  near(o.x, 50); near(o.y, 60);
  // at a point 100 px right and 40 px below the origin, zooming from 1 to 2 moves the origin left by 100 and up by 40
  const o2 = Z.zoomAbout({ x: 300, y: 240 }, { x: 200, y: 200 }, 1, 2);
  near(o2.x, 100); near(o2.y, 160);
});

test('a pointer outside the page still keeps its document point (the gap between pages)', () => {
  const pointer = { x: -20, y: 900 }, origin = { x: 0, y: 0 };
  const doc0 = Z.docPoint(pointer, origin, 0.5);
  const o = Z.zoomAbout(pointer, origin, 0.5, 0.75);
  near(Z.docPoint(pointer, o, 0.75).x, doc0.x, 1e-9);
  near(Z.docPoint(pointer, o, 0.75).y, doc0.y, 1e-9);
});
