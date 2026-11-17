// Node unit tests for shared/motion: easing, cubic-bezier and track sampling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './motion-env.mjs';

const M = await load();
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
// Errors and arrays made inside the vm context come from another realm, so compare by name and by plain copies.
const isRange = (e) => e.name === "RangeError";
const plain = (v) => JSON.parse(JSON.stringify(v));

test('every named easing hits 0 at the start and 1 at the end', () => {
  for (const name of M.easing.names()) {
    const f = M.easing.resolve(name);
    near(f(0), 0);
    near(f(1), 1);
  }
  assert.ok(M.easing.names().length >= 19, 'quad/cubic/quart, back, elastic, bounce and linear');
});

test('easeIn/Out/InOut families are monotonic for quad, cubic and quart', () => {
  for (const fam of ['Quad', 'Cubic', 'Quart']) {
    for (const kind of ['easeIn', 'easeOut', 'easeInOut']) {
      const f = M.easing[kind + fam];
      let prev = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const v = f(i / 100);
        assert.ok(v >= prev - 1e-12, `${kind}${fam} is not monotonic at ${i}`);
        prev = v;
      }
    }
  }
});

test('back and elastic overshoot, bounce stays inside [0, 1]', () => {
  let maxBack = -Infinity;
  let maxElastic = -Infinity;
  let minBounce = Infinity;
  let maxBounce = -Infinity;
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000;
    maxBack = Math.max(maxBack, M.easing.easeOutBack(t));
    maxElastic = Math.max(maxElastic, M.easing.easeOutElastic(t));
    minBounce = Math.min(minBounce, M.easing.easeOutBounce(t));
    maxBounce = Math.max(maxBounce, M.easing.easeOutBounce(t));
  }
  assert.ok(maxBack > 1.05, 'easeOutBack overshoots');
  assert.ok(maxElastic > 1.05, 'easeOutElastic overshoots');
  assert.ok(minBounce >= -1e-12 && maxBounce <= 1 + 1e-9, 'easeOutBounce stays in range');
});

test('cubic-bezier with linear control points returns t', () => {
  for (const pts of [[1 / 3, 1 / 3, 2 / 3, 2 / 3], [0, 0, 1, 1]]) {
    const f = M.easing.cubicBezier(...pts);
    for (let i = 0; i <= 20; i++) near(f(i / 20), i / 20, 1e-6);
  }
});

test('cubic-bezier matches known CSS values (ease, ease-in-out)', () => {
  near(M.easing.cubicBezier(0.25, 0.1, 0.25, 1)(0.5), 0.8024, 1e-4); // CSS "ease" at x = 0.5
  near(M.easing.cubicBezier(0.25, 0.1, 0.25, 1)(0.25), 0.4085, 1e-4);
  near(M.easing.cubicBezier(0.42, 0, 0.58, 1)(0.5), 0.5, 1e-6); // symmetric curve
  near(M.easing.cubicBezier(0.42, 0, 0.58, 1)(0.25), 0.1292, 1e-4);
});

test('cubic-bezier rejects x outside [0, 1] and non-finite points', () => {
  assert.throws(() => M.easing.cubicBezier(-0.1, 0, 0.5, 1), isRange);
  assert.throws(() => M.easing.cubicBezier(0, 0, 1.5, 1), isRange);
  assert.throws(() => M.easing.cubicBezier(0, NaN, 1, 1), isRange);
  assert.equal(M.easing.isValid([0.1, 0, 0.9, 1]), true);
  assert.equal(M.easing.isValid([0.1, 0, 0.9]), false);
  assert.equal(M.easing.isValid('nope'), false);
});

test('resolve clamps input and rejects unknown specs', () => {
  const f = M.easing.resolve('easeOutQuad');
  near(f(-5), 0);
  near(f(5), 1);
  assert.throws(() => M.easing.resolve('wobble'), isRange);
  assert.throws(() => M.easing.resolve(42), isRange);
  near(M.easing.resolve(undefined)(0.3), 0.3);
});

test('track holds before the first key and after the last key', () => {
  const keys = [{ t: 1, value: 10 }, { t: 2, value: 20 }];
  assert.equal(M.track.sample(keys, 0), 10);
  assert.equal(M.track.sample(keys, 1), 10);
  assert.equal(M.track.sample(keys, 2), 20);
  assert.equal(M.track.sample(keys, 99), 20);
  assert.equal(M.track.sample([], 1), undefined);
});

test('number track interpolates with the start key ease', () => {
  const keys = [{ t: 0, value: 0, ease: 'easeInQuad' }, { t: 2, value: 8 }];
  near(M.track.sample(keys, 1), 2); // easeInQuad(0.5) = 0.25, times 8
  const lin = [{ t: 0, value: 0 }, { t: 2, value: 8 }];
  near(M.track.sample(lin, 0.5), 2);
});

test('point and colour tracks interpolate per channel and return copies', () => {
  const pts = [{ t: 0, value: [0, 10] }, { t: 1, value: [100, 20] }];
  assert.deepEqual(plain(M.track.sample(pts, 0.5)), [50, 15]);
  const cols = [{ t: 0, value: { r: 0, g: 0, b: 0, a: 0 } }, { t: 1, value: { r: 200, g: 100, b: 50, a: 1 } }];
  assert.deepEqual(plain(M.track.sample(cols, 0.25)), { r: 50, g: 25, b: 12.5, a: 0.25 });
  const out = M.track.sample(pts, 0);
  out[0] = 999;
  assert.equal(pts[0].value[0], 0, 'sampling does not expose the stored array');
});

test('step (string) values and hold segments switch exactly at the key', () => {
  const enumKeys = [{ t: 0, value: 'a' }, { t: 1, value: 'b' }, { t: 2, value: 'c' }];
  assert.equal(M.track.sample(enumKeys, 0), 'a');
  assert.equal(M.track.sample(enumKeys, 0.999), 'a');
  assert.equal(M.track.sample(enumKeys, 1), 'b');
  assert.equal(M.track.sample(enumKeys, 1.5), 'b');
  const hold = [{ t: 0, value: 5, ease: 'hold' }, { t: 1, value: 9 }];
  assert.equal(M.track.sample(hold, 0.5), 5);
  assert.equal(M.track.sample(hold, 1), 9);
});

test('loop and ping-pong remap time for a track', () => {
  const keys = [{ t: 0, value: 0 }, { t: 2, value: 10 }];
  near(M.track.sample(keys, 2.5, { mode: 'loop', duration: 2 }), 2.5); // wraps to 0.5 -> 2.5
  near(M.track.sample(keys, 2.5, { mode: 'pingpong', duration: 2 }), 7.5); // reflects to 1.5 -> 7.5
  near(M.track.sample(keys, 2.5, { mode: 'none', duration: 2 }), 10); // none: keys hold past the last key
  near(M.track.mapTime(2.5, 2, 'pingpong'), 1.5);
  near(M.track.mapTime(-0.5, 2, 'loop'), 1.5);
  near(M.track.mapTime(3, 2, 'none'), 3);
  assert.throws(() => M.track.mapTime(1, 2, 'bounce'), isRange);
});

test('validateKeys flags order, kinds, times and eases', () => {
  assert.equal(M.track.validateKeys([{ t: 0, value: 1 }, { t: 1, value: 2 }]).length, 0);
  assert.ok(M.track.validateKeys([{ t: 1, value: 1 }, { t: 0, value: 2 }]).length > 0, 'unsorted');
  assert.ok(M.track.validateKeys([{ t: 0, value: 1 }, { t: 0, value: 2 }]).length > 0, 'duplicate time');
  assert.ok(M.track.validateKeys([{ t: -1, value: 1 }]).length > 0, 'negative time');
  assert.ok(M.track.validateKeys([{ t: Infinity, value: 1 }]).length > 0, 'infinite time');
  assert.ok(M.track.validateKeys([{ t: 0, value: 1 }, { t: 1, value: 'x' }]).length > 0, 'mixed kinds');
  assert.ok(M.track.validateKeys([{ t: 0, value: NaN }]).length > 0, 'NaN value');
  assert.ok(M.track.validateKeys([{ t: 0, value: 1, ease: 'wobble' }]).length > 0, 'unknown ease');
  assert.ok(M.track.validateKeys([{ t: 0, value: { r: 300, g: 0, b: 0 } }]).length > 0, 'colour out of range');
});
