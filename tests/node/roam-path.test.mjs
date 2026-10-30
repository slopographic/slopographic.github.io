// Covers: shared/roam/path.js
// The paths both page mascots move along: the buddy's glide and hop (their old formulas, unchanged), and the float of a
// roaming slotted mascot (gentle curves, ease in and out, bob, lean; no jumps). The DOM side: tests/buddy/roam.test.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../shared/roam/path.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('easing: ends fixed, the glide eases out, the float in and out', () => {
  for (const f of [P.easeOut, P.easeInOut]) { near(f(0), 0); near(f(1), 1); }
  assert.ok(P.easeOut(0.5) > 0.8);                          // fast start
  near(P.easeInOut(0.5), 0.5);
  assert.ok(P.easeInOut(0.1) < 0.01 && P.easeInOut(0.9) > 0.99);   // soft start and stop
});

test('the buddy\'s glide and hop keep their timing and arc', () => {
  near(P.glideTime(0), 0.22); near(P.glideTime(10000), 0.6);
  near(P.hopTime(0), 0.38); near(P.hopTime(10000), 0.95); near(P.hopTime(170), 0.46);
  near(P.hopLift(0), 46); near(P.hopLift(10000), 220); near(P.hopLift(100, 30), 92);
  near(P.arcY(100, 100, 50, 0), 100); near(P.arcY(100, 200, 50, 1), 200);
  near(P.arcY(100, 100, 50, 0.5), 50);                      // the top: lift px over the higher end
  const a = P.arc({ x: 0, y: 100 }, { x: 200, y: 100 });
  near(a(0.5).x, 100); assert.ok(a(0.5).y < 100 - 40);
});

test('a float: slow and calm, along a gentle curve that starts and ends in place and never jumps', () => {
  assert.ok(P.floatTime(0) >= 1.4 && P.floatTime(1e5) <= 4.2);
  assert.ok(P.floatTime(600, true) > P.floatTime(600));
  const from = { x: 0, y: 300 }, to = { x: 400, y: 300 };
  for (const bend of [-1, 0, 1]) {
    const c = P.curve(from, to, bend);
    assert.deepEqual(c(0), from); near(c(1).x, 400); near(c(1).y, 300);
    let prev = c(0), top = 300;
    for (let i = 1; i <= 100; i++) {                         // small steps all the way: no hop, no jump
      const p = c(i / 100);
      assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) < 12);
      top = Math.min(top, p.y); prev = p;
    }
    assert.ok(300 - top < 140, 'it rises a little, it does not leap');
  }
  assert.ok(P.curve(from, to, 1)(0.5).y > P.curve(from, to, -1)(0.5).y);   // bend bows it either way
});

test('bob, drift, lean and easing towards a value', () => {
  near(P.bob(0), 0); near(P.bob(0.8, 3, 3.2), 3); near(P.bob(2.4, 3, 3.2), -3);
  const d = P.drift(10, 5); assert.ok(Math.abs(d.x) <= 5 && Math.abs(d.y) <= 2.5);
  near(P.leanOf(0), 0); near(P.leanOf(6000), 7); near(P.leanOf(-6000, 5), -5); near(P.leanOf(120), 2);
  near(P.approach(0, 10, 1 / 60, 0.5), 5); assert.ok(P.approach(0, 10, 1, 0.12) > 9.9);
});

test('spots around: nearest first, away from the pointer when it can', () => {
  const s = P.ringSpots(100, 70, 50, 0);                   // the pointer to the right
  assert.equal(s.length, 48);
  assert.ok(s[0].dx < 0, 'the first choice is away from the pointer');
  const d = (o) => Math.hypot(o.dx, o.dy);
  assert.ok(d(s[0]) <= d(s[s.length - 1]));
});

test('choosing a resting spot: content edges first, never right here, null when nothing', () => {
  const from = { x: 0, y: 0 };
  assert.equal(P.chooseSpot([], from, 0.5), null);
  assert.equal(P.chooseSpot([{ x: 10, y: 0, edge: true }], from, 0.5), null);   // too close to move to
  const list = [{ x: 300, y: 0, edge: false }, { x: 0, y: 300, edge: true }];
  const picks = [0.1, 0.3, 0.5, 0.7, 0.9].map((r) => P.chooseSpot(list, from, r));
  assert.ok(picks.filter((p) => p.edge).length >= 3);
  assert.equal(P.chooseSpot(list, from, 1), list[1]);
});

test('boxes, rests', () => {
  const b = { l: 0, t: 0, r: 100, b: 100 };
  assert.ok(P.within({ l: 10, t: 10, r: 50, b: 50 }, b)); assert.ok(!P.within({ l: -1, t: 10, r: 50, b: 50 }, b));
  assert.ok(P.overlaps({ l: 90, t: 90, r: 120, b: 120 }, b)); assert.ok(!P.overlaps({ l: 101, t: 0, r: 120, b: 10 }, b));
  assert.ok(P.overlaps({ l: 101, t: 0, r: 120, b: 10 }, b, 4));
  assert.ok(P.restMs(0) >= 5000 && P.restMs(1) <= 10000 && P.restMs(0, true) >= 9000);
  near(P.clamp(5, 0, 3), 3);
});

test('following after a scroll: waits for quiet or too long out of view, starts just past the edge, a quick trip', () => {
  assert.equal(P.followDue(100, 0), false);
  assert.equal(P.followDue(700, 0), true);
  assert.equal(P.followDue(100, 1500), true);
  assert.equal(P.followDue(100, 900, 700, 1000), false);
  assert.deepEqual(P.entry({ x: 900, y: 300 }, 100, 120, 1440, 800), { x: 900, y: 300 });     // near: from its own place
  assert.deepEqual(P.entry({ x: 900, y: -5000 }, 100, 120, 1440, 800), { x: 900, y: -128 });  // far above: just past the top
  assert.deepEqual(P.entry({ x: 2000, y: 9000 }, 100, 120, 1440, 800), { x: 1448, y: 808 });
  near(P.followTime(0), 0.7); near(P.followTime(100000), 1.5);
  assert.ok(P.followTime(800) < P.floatTime(800));
  assert.ok(P.followTime(400, true) > P.followTime(400));
  assert.equal(P.outOf(0, -120, 100, 120, 1440, 800), true);
  assert.equal(P.outOf(0, -119, 100, 120, 1440, 800), false);
  assert.equal(P.outOf(0, 800, 100, 120, 1440, 800), true);
  assert.equal(P.outOf(-100, 10, 100, 120, 1440, 800), true);
});
