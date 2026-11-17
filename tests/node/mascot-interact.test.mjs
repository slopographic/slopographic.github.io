// Covers: shared/mascot/interact.js
// The mascot slot's interaction logic: where it may sit (clear of the edges, the header and the safe areas), a press as a
// tap, a long press or a drag (with how hard it shakes), where the eyes look, and the helper menu. The page side:
// tests/buddy/slot.test.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPos, defaultPos, otherSide, sideOf, createPress, lookAt, menuItems, TIPS, nextGlance, DRAG_PX, LONG_MS, MARGIN } from '../../shared/mascot/interact.js';

const SIZE = { w: 70, h: 84 };
const VIEW = { w: 1440, h: 900, top: 61, safe: { top: 0, right: 0, bottom: 20, left: 0 } };

test('a position stays inside the window, below the header and above the safe area, with a margin', () => {
  assert.deepEqual(clampPos({ right: 30, bottom: 40 }, SIZE, VIEW), { right: 30, bottom: 40 });
  assert.deepEqual(clampPos({ right: -50, bottom: -50 }, SIZE, VIEW), { right: MARGIN, bottom: 20 + MARGIN });
  const far = clampPos({ right: 5000, bottom: 5000 }, SIZE, VIEW);
  assert.equal(far.right, VIEW.w - SIZE.w - MARGIN);
  assert.equal(far.bottom, VIEW.h - SIZE.h - VIEW.top - MARGIN);   // its top edge never goes under the header
  assert.deepEqual(clampPos({ right: NaN, bottom: undefined }, SIZE, VIEW), { right: MARGIN, bottom: 20 + MARGIN });
  // a window too small for it: the bottom right corner, never a negative size
  assert.deepEqual(clampPos({ right: 100, bottom: 100 }, SIZE, { w: 60, h: 60, top: 0 }), { right: MARGIN, bottom: MARGIN });
});

test('until moved it sits in the bottom corner on its side, above a footer bar', () => {
  assert.deepEqual(defaultPos(SIZE, VIEW), { right: MARGIN, bottom: 20 + MARGIN });
  assert.deepEqual(defaultPos(SIZE, VIEW, 1, 64), { right: MARGIN, bottom: 64 });
  const left = defaultPos(SIZE, VIEW, -1);
  assert.equal(left.right, VIEW.w - SIZE.w - MARGIN);
  assert.equal(sideOf(defaultPos(SIZE, VIEW), SIZE, VIEW), 1);
  assert.equal(sideOf(left, SIZE, VIEW), -1);
});

test('the other side keeps the height and mirrors the distance from the edge', () => {
  const p = otherSide({ right: 30, bottom: 200 }, SIZE, VIEW);
  assert.deepEqual(p, { right: VIEW.w - SIZE.w - 30, bottom: 200 });
  assert.deepEqual(otherSide(p, SIZE, VIEW), { right: 30, bottom: 200 });
});

test('a press: a tap, a long press, or a drag past the threshold (a short wobble is still a tap)', () => {
  let p = createPress(100, 100, 0);
  assert.equal(p.move(100 + DRAG_PX - 2, 101, 50), null);
  assert.equal(p.up(120), 'tap');
  p = createPress(100, 100, 0);
  assert.equal(p.isLong(LONG_MS - 1), false);
  assert.equal(p.isLong(LONG_MS), true);
  assert.equal(p.up(LONG_MS + 10), 'long');
  p = createPress(100, 100, 0);
  const m = p.move(80, 90, 30);
  assert.deepEqual([m.dx, m.dy, m.ox, m.oy], [-20, -10, -20, -10]);
  assert.equal(p.dragging, true);
  assert.equal(p.isLong(LONG_MS + 100), false);          // a drag is never a long press
  assert.equal(p.move(70, 90, 40).dx, -10);
  assert.equal(p.up(50), 'drag');
});

test('a drag that keeps changing direction shakes; a steady one does not', () => {
  let p = createPress(0, 0, 0), m = null;
  for (let i = 1; i <= 10; i++) m = p.move(i * 20, 0, i * 16);
  assert.equal(m.shake, 0);
  p = createPress(0, 0, 0);
  for (let i = 1; i <= 10; i++) m = p.move(i % 2 ? 30 : -30, 0, i * 40);
  assert.equal(m.shake, 1);
  m = p.move(200, 0, 5000);                               // long after: the old turns are forgotten
  assert.ok(m.shake < 0.5);
});

test('the eyes: towards the pointer nearby, ahead when it is far; each axis -1..1', () => {
  assert.deepEqual(lookAt({ x: 0, y: 0 }, { x: 0, y: 0 }), [0, 0]);
  assert.deepEqual(lookAt({ x: 0, y: 0 }, { x: 1000, y: 0 }), [0, 0]);
  assert.deepEqual(lookAt({ x: 0, y: 0 }, { x: 200, y: 0 }), [1, 0]);
  assert.deepEqual(lookAt({ x: 0, y: 0 }, { x: 0, y: -200 }), [0, -1]);
  const [dx, dy] = lookAt({ x: 0, y: 0 }, { x: 30, y: 40 });
  assert.ok(dx > 0 && dx < 1 && dy > 0 && dy < 1 && dy > dx);
});

test('the helper menu offers what the page has, then Tips, Move and Hide; labels go through the text function', () => {
  assert.deepEqual(menuItems({ ai: true, finder: true, tour: true }).map((i) => i.value), ['ai', 'search', 'tour', 'tips', 'move', 'hide']);
  assert.deepEqual(menuItems({}).map((i) => i.value), ['tips', 'move', 'hide']);
  const sv = menuItems({ ai: true }, (k) => `[${k}]`);
  assert.deepEqual(sv.map((i) => i.label), ['[mascot.ask]', '[mascot.tips]', '[mascot.move]', '[mascot.hide]']);
  assert.ok(TIPS.length >= 3 && TIPS.every(([k, en]) => k.startsWith('mascot.') && en.length > 10));
});

test('the idle glance comes every 20 to 45 seconds', () => {
  assert.equal(nextGlance(0), 20000);
  assert.equal(nextGlance(1), 45000);
});

test('the size: today\'s scale by default, the profile\'s px tall on a desktop and a phone when it sets one', async () => {
  const { dims, STAGE } = await import('../../shared/mascot/interact.js');
  assert.deepEqual(dims(null, 1), { desk: { w: 112, h: 136, k: 1, real: false }, phone: { w: 112, h: 136, k: 1, real: false } });
  const plain = dims(undefined, 0.62);                       // a plain-tone build: calm and small, smaller on a phone
  assert.deepEqual([plain.desk.w, plain.desk.h, plain.desk.real], [69, 84, false]);
  assert.deepEqual([plain.phone.w, plain.phone.h], [52, 63]);
  const big = dims({ desktop: 200, phone: 64 }, 0.62);
  assert.deepEqual(big.desk, { w: Math.round(200 * STAGE.w / STAGE.h), h: 200, k: 200 / 136, real: true });
  assert.equal(big.phone.h, 64); assert.equal(big.phone.real, true);
  const deskOnly = dims({ desktop: 190 }, 0.62);             // no phone size: a phone keeps today's
  assert.equal(deskOnly.desk.h, 190); assert.equal(deskOnly.phone.h, 63);
  assert.equal(dims({ desktop: 5000 }, 1).desk.h, 136);      // out of range: ignored
});
