// Node tests for the SlopCut transition library terms (render/transitions.js) and the title exit animations
// (render/text.js). Browser files run in a vm context with a small SE stub. Run with: node tests/run.mjs slopcut
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = {
  console,
  window: null,
  SE: null
};
ctx.window = ctx;
ctx.SE = {
  util: {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    store: { get: (k, d) => d, set: () => {} }
  },
  model: { TRANSITIONS: [['cross', 'Cross dissolve'], ['blur', 'Blur dissolve'], ['black', 'Dip to black'], ['white', 'Dip to white'], ['wipe', 'Wipe right'], ['wipe-left', 'Wipe left'], ['wipe-up', 'Wipe up'], ['wipe-down', 'Wipe down'], ['slide', 'Slide'], ['push', 'Push'], ['zoom-in', 'Zoom in'], ['zoom-out', 'Zoom out'], ['spin', 'Spin'], ['glitch', 'Glitch']] }
};
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'slopcut/js/render/transitions.js'), 'utf8'), ctx, { filename: 'transitions.js' });
const TR = ctx.SE.transitions;
const W = 1920, H = 1080;
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

test('the library lists every transition the spec asks for, with ids that stay stable', () => {
  const ids = TR.list().map((x) => x[0]);
  for (const id of ['cross', 'blur', 'black', 'white', 'wipe', 'wipe-left', 'wipe-up', 'wipe-down', 'slide', 'push', 'zoom-in', 'zoom-out', 'spin', 'glitch']) assert.ok(ids.includes(id), id);
  assert.equal(TR.label('wipe'), 'Wipe right');
  assert.equal(TR.label('nope'), 'nope', 'an unknown id is shown as it is');
});
test('duration is clamped to 0.2 to 3 s and stored with the default', () => {
  TR.setDur(9); assert.equal(TR.dur, 3);
  TR.setDur(0); assert.equal(TR.dur, 0.2);
  TR.setDur(1.5); assert.equal(TR.dur, 1.5);
});
test('cross dissolve fades the arriving clip and leaves the outgoing one alone', () => {
  assert.equal(TR.params('cross', 'in', 0.25, W, H).alpha, 0.25);
  assert.equal(TR.params('cross', 'out', 0.25, W, H).alpha, 1);
});
test('wipes reveal the arriving clip from its edge: right, left, up, down', () => {
  same(TR.params('wipe', 'in', 0.5, W, H).clip, [0, 0, W * 0.5, H]);
  same(TR.params('wipe-left', 'in', 0.5, W, H).clip, [W * 0.5, 0, W * 0.5, H]);
  same(TR.params('wipe-up', 'in', 0.5, W, H).clip, [0, H * 0.5, W, H * 0.5]);
  same(TR.params('wipe-down', 'in', 0.5, W, H).clip, [0, 0, W, H * 0.5]);
  assert.equal(TR.params('wipe-down', 'out', 0.5, W, H).clip, null);
});
test('dip to black: the outgoing clip hides after the midpoint; the arriving one shows after it', () => {
  const out1 = TR.params('black', 'out', 0.25, W, H), out2 = TR.params('black', 'out', 0.75, W, H);
  assert.equal(out1.hide, false); assert.equal(out1.overlay.col, '#000'); assert.equal(out1.overlay.a, 0.5);
  assert.equal(out2.hide, true);
  assert.equal(TR.params('white', 'in', 0.25, W, H).hide, true);
  assert.equal(TR.params('white', 'in', 0.75, W, H).overlay.col, '#fff');
});
test('solo dip (no clip underneath) fades in from the colour over the track below', () => {
  assert.equal(TR.params('black', 'in', 0.2, W, H, true).overlay.a, 0.8);
});
test('slide and push move in pixels across the frame; push also moves the outgoing clip the other way', () => {
  assert.equal(TR.params('slide', 'in', 0, W, H).dx, W);
  assert.equal(TR.params('slide', 'in', 1, W, H).dx, 0);
  assert.equal(TR.params('push', 'out', 1, W, H).dx, -W);
  assert.equal(TR.params('push', 'in', 0, W, H).dx, W);
});
test('zoom in and out scale the arriving clip from small or big, and fade the outgoing one', () => {
  assert.ok(near(TR.params('zoom-in', 'in', 0, W, H).sc, 0.5));
  assert.ok(near(TR.params('zoom-in', 'in', 1, W, H).sc, 1));
  assert.ok(near(TR.params('zoom-in', 'out', 1, W, H).alpha, 0));
  assert.ok(near(TR.params('zoom-out', 'in', 0, W, H).sc, 1.5));
  assert.ok(near(TR.params('zoom-out', 'out', 1, W, H).sc, 0.5));
});
test('spin turns the arriving clip into place (-90 to 0 degrees) and the outgoing one away (0 to 90)', () => {
  assert.ok(near(TR.params('spin', 'in', 0, W, H).rot, -90));
  assert.ok(near(TR.params('spin', 'in', 1, W, H).rot, 0));
  assert.ok(near(TR.params('spin', 'out', 1, W, H).rot, 90));
});
test('blur dissolve blurs both clips at the middle of the cut, in project pixels', () => {
  assert.ok(TR.params('blur', 'in', 0.5, W, H).blur > 0);
  assert.equal(TR.params('blur', 'in', 1, W, H).blur, 0);
  assert.equal(TR.params('blur', 'out', 0, W, H).blur, 0);
  assert.ok(TR.params('blur', 'out', 1, W, H).blur > TR.params('blur', 'out', 0.5, W, H).blur);
});
test('glitch: outgoing bands shift and cut at q 0.5; the arriving clip settles from bands', () => {
  const o = TR.params('glitch', 'out', 0.3, W, H);
  assert.equal(o.hide, false);
  assert.equal(o.slices.length, 8);
  assert.ok(o.slices.some((s) => s.dx !== 0));
  assert.equal(TR.params('glitch', 'out', 0.6, W, H).hide, true);
  assert.equal(TR.params('glitch', 'in', 0.4, W, H).hide, true);
  assert.equal(TR.params('glitch', 'in', 0.6, W, H).slices.length, 8);
  same(TR.params('glitch', 'in', 0.6, W, H), TR.params('glitch', 'in', 0.6, W, H), 'same q, same bands');
});
test('an unknown transition id falls back to a cross dissolve', () => {
  assert.equal(TR.params('nope', 'in', 0.4, W, H).alpha, 0.4);
});
function near(a, b) { return Math.abs(a - b) < 1e-9; }

// Title exit animations (render/text.js), with the same stub.
const textCtx = { console, window: null, document: {}, SE: { util: ctx.SE.util } };
textCtx.window = textCtx;
vm.createContext(textCtx);
vm.runInContext(readFileSync(path.join(ROOT, 'slopcut/js/render/text.js'), 'utf8'), textCtx, { filename: 'text.js' });
const TX = textCtx.SE.text;
const title = (anim, out) => ({ dur: 4, text: { str: 'hi', anim, out } });

test('titles: no exit when out is none; the default out repeats the entrance (as before)', () => {
  assert.equal(TX.animAt(title('fade', 'none'), 3.9).alpha, 1);
  assert.ok(TX.animAt(title('fade', 'same'), 3.9).alpha < 0.5);
  assert.equal(TX.animAt(title('fade', undefined), 3.9).alpha, TX.animAt(title('fade', 'fade'), 3.9).alpha);
});
test('titles: an entrance and an exit can differ (slide in, blur out)', () => {
  const mid = TX.animAt(title('slide', 'rise'), 2);
  assert.equal(mid.alpha, 1);
  assert.equal(mid.blur, 0);
  const end = TX.animAt(title('slide', 'rise'), 3.9);
  assert.ok(end.blur > 0 && end.alpha < 0.5);
  assert.ok(TX.OUTS.some(([v]) => v === 'same') && TX.OUTS.some(([v]) => v === 'rise'));
});
