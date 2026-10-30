// Covers: shared/mascot/moments.js
// The mascot slot's moments without a browser: the moment table and the trackers that turn page states into moments.
// The slot on a page: tests/buddy/slot.test.html; the build side: tests/node/whitelabel-mascot-slot.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOMENTS, animationFor, stateOf, workTracker, idleTracker, sideOf, DONE_AFTER_MS } from '../../shared/mascot/moments.js';

test('every buddy moment has a named animation; an overlay may map or lack one', () => {
  assert.deepEqual(Object.keys(MOMENTS).sort(), ['done', 'error', 'greeting', 'idle', 'point', 'wake', 'working']);
  assert.equal(animationFor('done'), 'celebrate');
  assert.equal(animationFor('done', { animations: ['hello'] }), null);
  assert.equal(animationFor('done', { animations: ['bounce'], moments: { done: 'bounce' } }), 'bounce');
  assert.equal(animationFor('nope', {}), null);
});

test('page states: SlopFlow tiles and aria-busy regions', () => {
  const el = (attrs, cls = '') => ({ getAttribute: (k) => (k in attrs ? attrs[k] : null), classList: { contains: (c) => cls.split(' ').includes(c) } });
  assert.equal(stateOf(el({ 'data-state': 'run' }, 'sflow')), 'run');
  assert.equal(stateOf(el({ 'data-state': 'idle' }, 'sflow')), 'end');
  assert.equal(stateOf(el({ 'data-state': 'run' })), null);           // another widget's data-state is not a task
  assert.equal(stateOf(el({ 'aria-busy': 'true' })), 'run');
  assert.equal(stateOf(el({ 'aria-busy': 'false' })), 'end');
  assert.equal(stateOf(null), null);
});

test('work: a task works at once, done when the last one ends, error at once', () => {
  let now = 0;
  const out = [], w = workTracker((m) => out.push(m), () => now);
  w.update('a', 'run', true); w.update('b', 'run', true);
  assert.deepEqual(out, ['working']);
  w.update('a', 'done');
  assert.deepEqual(out, ['working']);                                // b still runs
  w.update('b', 'error');
  assert.deepEqual(out, ['working', 'error']);
  w.update('c', 'run', true); now += 10; w.update('c', 'end');      // a task that stopped: the working loop still ends
  assert.deepEqual(out, ['working', 'error', 'working', 'done']);
  assert.equal(w.busy, 0);
});

test('work: a busy region works only once it has been busy a while, and its end always ends the loop', () => {
  let now = 0;
  const out = [], w = workTracker((m) => out.push(m), () => now);
  w.update('c', 'run'); now = DONE_AFTER_MS - 1; w.tick(now); w.update('c', 'end');
  assert.deepEqual(out, []);                                          // a short busy spell (a page drawing): nothing
  w.update('c', 'run'); now += DONE_AFTER_MS; w.tick(now);
  assert.deepEqual(out, ['working']);
  w.tick(now + 5000);
  assert.deepEqual(out, ['working']);                                 // once
  w.update('d', 'run'); w.update('c', 'end'); now += 100; w.update('d', 'end');
  assert.deepEqual(out, ['working', 'done']);                         // the last one was short, but the loop had started
  w.update('x', 'end'); w.update('x', 'done');
  assert.deepEqual(out, ['working', 'done']);                         // never busy: no moment
});

test('work: a region that leaves the page while busy ends at the next tick', () => {
  let now = 0;
  const out = [], w = workTracker((m) => out.push(m), () => now);
  const el = { isConnected: true };
  w.update(el, 'run'); now = DONE_AFTER_MS; w.tick(now);
  assert.deepEqual(out, ['working']);
  el.isConnected = false; now += 100; w.tick(now);
  assert.deepEqual(out, ['working', 'done']);
  assert.equal(w.busy, 0);
});

test('idle: sleep once after the quiet time, wake on the next input', () => {
  const out = [], t = idleTracker((m) => out.push(m), 1000, 0);
  t.tick(999); assert.deepEqual(out, []);
  t.tick(1000); t.tick(5000); assert.deepEqual(out, ['idle']);
  assert.equal(t.asleep, true);
  t.activity(5001); t.activity(5002);
  assert.deepEqual(out, ['idle', 'wake']);
  assert.equal(sideOf({ left: 500, width: 100 }, { left: 10, width: 20 }), -1);
  assert.equal(sideOf({ left: 0, width: 100 }, { left: 400, width: 20 }), 1);
});
