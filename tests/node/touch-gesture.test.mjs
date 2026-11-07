// The touch layer's gesture recognizer (shared/input/gesture.js): taps, double taps, long presses and pinches from
// pointer samples, with their timings, distances and cancel rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { create, DEFAULTS } = createRequire(import.meta.url)('../../shared/input/gesture.js');
const types = (acts) => acts.map((a) => a.type);
/** A finger that touches at t and lifts at t + ms, at (x, y): returns every action it caused. */
function tapAt(g, id, x, y, t, ms = 60) { return [...g.down({ id, x, y, t }), ...g.tick(t + ms), ...g.up({ id, x, y, t: t + ms })]; }

test('the defaults are the platform conventions', () => {
  assert.equal(DEFAULTS.doubleMs, 300);
  assert.equal(DEFAULTS.doubleSlop, 24);
  assert.equal(DEFAULTS.longMs, 500);
});

test('a quick touch and lift is a tap', () => {
  const g = create();
  assert.deepEqual(types(tapAt(g, 1, 50, 50, 0)), ['tap']);
});

test('two taps within 300 ms and 24 px are a double tap; the second is not also a tap', () => {
  const g = create();
  assert.deepEqual(types(tapAt(g, 1, 50, 50, 0)), ['tap']);
  const second = tapAt(g, 2, 60, 62, 60 + 250);
  assert.deepEqual(types(second), ['doubletap']);
  assert.equal(second[0].x, 60);
});

test('a third tap after a double tap starts over (a single tap)', () => {
  const g = create();
  tapAt(g, 1, 50, 50, 0); tapAt(g, 2, 50, 50, 200);
  assert.deepEqual(types(tapAt(g, 3, 50, 50, 400)), ['tap']);
});

test('taps too far apart in time or space are two taps', () => {
  let g = create();
  tapAt(g, 1, 50, 50, 0);
  assert.deepEqual(types(tapAt(g, 2, 50, 50, 60 + 301)), ['tap']);
  g = create();
  tapAt(g, 1, 50, 50, 0);
  assert.deepEqual(types(tapAt(g, 2, 50, 80, 100)), ['tap']);
});

test('a finger that moves more than the slop is a drag: no tap, no long press', () => {
  const g = create();
  g.down({ id: 1, x: 0, y: 0, t: 0 });
  g.move({ id: 1, x: 15, y: 0, t: 50 });
  assert.deepEqual(g.tick(600), []);
  assert.deepEqual(g.up({ id: 1, x: 0, y: 0, t: 700 }), []);
  assert.equal(g.deadline(), Infinity);
});

test('a small wobble (within 10 px) still taps', () => {
  const g = create();
  g.down({ id: 1, x: 0, y: 0, t: 0 });
  g.move({ id: 1, x: 6, y: 5, t: 30 });
  assert.deepEqual(types(g.up({ id: 1, x: 6, y: 5, t: 80 })), ['tap']);
});

test('holding still for 500 ms is a long press, once, and the lift is not a tap', () => {
  const g = create();
  g.down({ id: 1, x: 10, y: 20, t: 0 });
  assert.equal(g.deadline(), 500);
  assert.deepEqual(g.tick(499), []);
  const lp = g.tick(500);
  assert.deepEqual(types(lp), ['longpress']);
  assert.deepEqual([lp[0].x, lp[0].y, lp[0].id], [10, 20, 1]);
  assert.deepEqual(g.tick(900), []);
  assert.deepEqual(g.up({ id: 1, x: 10, y: 20, t: 950 }), []);
});

test('a long press after a tap is not part of a double tap', () => {
  const g = create();
  tapAt(g, 1, 0, 0, 0);
  g.down({ id: 2, x: 0, y: 0, t: 100 });
  assert.deepEqual(types(g.tick(600)), ['longpress']);
  assert.deepEqual(g.up({ id: 2, x: 0, y: 0, t: 650 }), []);
});

test('skipLong (the browser opened its own menu) stops the long press', () => {
  const g = create();
  g.down({ id: 1, x: 0, y: 0, t: 0 });
  g.skipLong(1);
  assert.deepEqual(g.tick(800), []);
});

test('a cancelled pointer (the browser took it) is neither a tap nor a long press', () => {
  const g = create();
  g.down({ id: 1, x: 0, y: 0, t: 0 });
  assert.deepEqual(g.cancel({ id: 1, t: 50 }), []);
  assert.deepEqual(g.tick(800), []);
  assert.equal(g.size, 0);
});

test('two fingers start a pinch: scale and midpoint per move, no taps or long presses from either', () => {
  const g = create();
  g.down({ id: 1, x: 100, y: 100, t: 0 });
  const start = g.down({ id: 2, x: 200, y: 100, t: 10 });
  assert.deepEqual(types(start), ['pinchstart']);
  assert.deepEqual([start[0].cx, start[0].cy, start[0].ids], [150, 100, [1, 2]]);
  assert.ok(g.pinching);
  const m = g.move({ id: 2, x: 300, y: 100, t: 20 });
  assert.deepEqual(types(m), ['pinch']);
  assert.equal(m[0].scale, 2);
  assert.deepEqual([m[0].cx, m[0].dx, m[0].dy], [200, 50, 0]);
  const m2 = g.move({ id: 1, x: 200, y: 100, t: 30 }); // both now 100 apart, midpoint 250
  assert.equal(m2[0].scale, 0.5);
  assert.equal(m2[0].dx, 50);
  assert.deepEqual(g.tick(2000), []);
  assert.deepEqual(types(g.up({ id: 2, x: 300, y: 100, t: 40 })), ['pinchend']);
  assert.deepEqual(g.up({ id: 1, x: 200, y: 100, t: 50 }), []); // the finger left over is not a tap
});

test('a two-finger pan: the midpoint moves with the scale unchanged', () => {
  const g = create();
  g.down({ id: 1, x: 0, y: 0, t: 0 }); g.down({ id: 2, x: 100, y: 0, t: 0 });
  const m1 = g.move({ id: 1, x: 0, y: 30, t: 10 })[0], m2 = g.move({ id: 2, x: 100, y: 30, t: 10 })[0];
  assert.ok(Math.abs(m1.scale * m2.scale - 1) < 1e-9); // the fingers end as far apart as they began
  assert.equal(m1.dy + m2.dy, 30);
  assert.equal(m1.dx + m2.dx, 0);
});

test('after a pinch, a fresh tap is a tap again (not a double tap with the pinch fingers)', () => {
  const g = create();
  g.down({ id: 1, x: 0, y: 0, t: 0 }); g.down({ id: 2, x: 50, y: 0, t: 0 });
  g.up({ id: 1, x: 0, y: 0, t: 30 }); g.up({ id: 2, x: 50, y: 0, t: 40 });
  assert.deepEqual(types(tapAt(g, 3, 0, 0, 100)), ['tap']);
});

test('a pen is not a pinch finger: pen and touch together do not pinch', () => {
  const g = create();
  g.down({ id: 1, x: 0, y: 0, t: 0, kind: 'pen' });
  assert.deepEqual(g.down({ id: 2, x: 50, y: 0, t: 0, kind: 'touch' }), []);
  assert.equal(g.pinching, false);
});

test('a pen taps, double taps and long presses like a finger', () => {
  const g = create();
  const pen = (id, t) => [...g.down({ id, x: 5, y: 5, t, kind: 'pen' }), ...g.up({ id, x: 5, y: 5, t: t + 40 })];
  assert.deepEqual(types(pen(1, 0)), ['tap']);
  assert.deepEqual(types(pen(2, 150)), ['doubletap']);
});

test('reset forgets every finger', () => {
  const g = create();
  g.down({ id: 1, x: 0, y: 0, t: 0 });
  g.reset();
  assert.equal(g.size, 0);
  assert.equal(g.deadline(), Infinity);
});

test('options override the defaults', () => {
  const g = create({ longMs: 300 });
  g.down({ id: 1, x: 0, y: 0, t: 0 });
  assert.deepEqual(types(g.tick(300)), ['longpress']);
});

test('stroke pressure: a finger or a mouse paints at full pressure whatever it reports, a pen at its own', () => {
  const { pressure } = createRequire(import.meta.url)('../../shared/input/gesture.js');
  assert.equal(pressure({ pointerType: 'touch', pressure: 0 }), 1);   // iOS: a finger reports 0
  assert.equal(pressure({ pointerType: 'touch', pressure: 0.5 }), 1); // Chrome: 0.5 while pressed
  assert.equal(pressure({ pointerType: 'mouse', pressure: 0 }), 1);
  assert.equal(pressure({ pointerType: 'pen', pressure: 0.2 }), 0.2);
  assert.equal(pressure({ pointerType: 'pen', pressure: 0 }), 0.5);   // some pens report 0 on the first contact
  assert.equal(pressure({ pointerType: 'pen', pressure: 1.4 }), 1);
  assert.equal(pressure(null), 1);
});

test('stamp: when an event happened (its timeStamp on the performance.now clock), else now', () => {
  const { stamp } = createRequire(import.meta.url)('../../shared/input/gesture.js');
  assert.equal(stamp({ timeStamp: 900 }, 2900), 900);       // handled 2 s late on a busy page: still 900
  assert.equal(stamp({ timeStamp: 0 }, 2900), 2900);        // no stamp
  assert.equal(stamp({ timeStamp: 5000 }, 2900), 2900);     // not on this clock (later than now)
  assert.equal(stamp({ timeStamp: 1.7e12 }, 2900), 2900);   // an epoch time (old WebKit)
  assert.equal(stamp({ timeStamp: 10 }, 90000), 90000);     // a minute or more ago: not this event's
  assert.equal(stamp(null, 42), 42);
});

test('a touch the page got late: taps timed by when they happened, the long press from when the page got the touch', () => {
  const g = create();
  g.down({ id: 1, x: 0, y: 0, t: 1000, at: 1700 });                       // handled 700 ms late
  assert.equal(g.deadline(), 1700 + DEFAULTS.longMs);
  assert.deepEqual(g.tick(1710), []);                                       // no long press before its queued lift
  assert.deepEqual(types(g.up({ id: 1, x: 0, y: 0, t: 1040 })), ['tap']);  // a 40 ms tap, though handled late
  g.down({ id: 2, x: 0, y: 0, t: 1130, at: 1720 });
  assert.deepEqual(types(g.up({ id: 2, x: 0, y: 0, t: 1170 })), ['doubletap']);
});

test('clickAfter: a click tells of the fingers that touched before it, not of one that touched after (a late click)', () => {
  const { clickAfter } = createRequire(import.meta.url)('../../shared/input/gesture.js');
  assert.equal(clickAfter({ timeStamp: 1000 }, 900, 1500), true);   // the finger touched before the click: it lifted
  assert.equal(clickAfter({ timeStamp: 1000 }, 1090, 1500), false); // the next tap's finger, down after the click was made
  assert.equal(clickAfter({ timeStamp: 0 }, 1090, 1500), true);     // no stamp: the click is now, after every finger
});
