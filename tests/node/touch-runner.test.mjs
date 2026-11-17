// The touch mode of the test runner (tests/touch.mjs): which pages run, on which device, and the CDP touches it sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchDevice, isTouchPage, cdpTouch, paced, DEFAULT_DEVICE } from '../touch.mjs';

const list = {
  'iPad Pro 11 landscape': { viewport: { width: 1194, height: 834 }, isMobile: true, hasTouch: true, defaultBrowserType: 'webkit' },
  'Galaxy Tab S4 landscape': { viewport: { width: 1138, height: 712 }, isMobile: true, hasTouch: true, defaultBrowserType: 'chromium' },
  'Phone': { viewport: { width: 400, height: 800 }, defaultBrowserType: 'chromium' },
};

test('only pages with the slop-test-touch meta run in touch mode', () => {
  assert.ok(isTouchPage('<head><meta name="slop-test-touch"></head>'));
  assert.ok(isTouchPage('<meta name="slop-test-touch" content="">'));
  assert.ok(!isTouchPage('<meta name="slop-test-limit" content="9">'));
  assert.ok(!isTouchPage(''));
});

test('WebKit runs as an iPad and Chromium as an Android tablet, with touch on; --device picks another', () => {
  assert.equal(touchDevice('webkit', null, list).name, DEFAULT_DEVICE.webkit);
  assert.equal(touchDevice('chromium', null, list).name, DEFAULT_DEVICE.chromium);
  const d = touchDevice('chromium', 'Phone', list);
  assert.equal(d.options.hasTouch, true);
  assert.equal(d.options.defaultBrowserType, undefined);
  assert.throws(() => touchDevice('webkit', 'Nokia 3310', list), /not a Playwright device/);
});

test('CDP touches: whole-pixel points for start and move, none for end and cancel', () => {
  assert.deepEqual(cdpTouch({ type: 'start', points: [{ id: 1, x: 10.4, y: 20.6 }] }).touchPoints.map((p) => [p.id, p.x, p.y]), [[1, 10, 21]]);
  assert.equal(cdpTouch({ type: 'move', points: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 5 }] }).type, 'touchMove');
  assert.deepEqual(cdpTouch({ type: 'end', points: [{ id: 1, x: 0, y: 0 }] }), { type: 'touchEnd', touchPoints: [] });
  assert.throws(() => cdpTouch({ type: 'wiggle' }));
});

test('a partial lift is a move with the fingers still down; a timestamp passes through', () => {
  assert.deepEqual(cdpTouch({ type: 'end', rest: [{ id: 2, x: 1, y: 2 }] }).touchPoints.map((p) => p.id), [2]);
  assert.equal(cdpTouch({ type: 'end', rest: [{ id: 2, x: 1, y: 2 }] }).type, 'touchMove');
  assert.equal(cdpTouch({ type: 'start', points: [{ id: 1, x: 0, y: 0 }] }, 12.5).timestamp, 12.5);
  assert.equal('timestamp' in cdpTouch({ type: 'end' }), false);
});

test('a paced gesture: each step at its own time from t0, stamped with it, never earlier than the step before', () => {
  const g = paced([{ type: 'start', points: [{ id: 1, x: 5, y: 5 }] }, { type: 'end', at: 40 }, { type: 'start', points: [{ id: 1, x: 5, y: 5 }], at: 30 }], 1000);
  assert.deepEqual(g.map((s) => s.when), [1000, 1040, 1040]);
  assert.deepEqual(g.map((s) => s.params.timestamp), [1, 1.04, 1.04]);
  assert.deepEqual(g.map((s) => s.params.type), ['touchStart', 'touchEnd', 'touchStart']);
});
