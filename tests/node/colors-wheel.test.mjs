// Slop Colors' colour wheel maths: HSB and the artist's RYB wheel (colors/js/core/convert.js), the harmony rules on each
// wheel (colors/js/core/harmony.js) and the wheel's places and handle rules (colors/js/core/wheel.js).
// Covers: colors/js/core/convert.js, colors/js/core/harmony.js, colors/js/core/wheel.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, H, WH } from './colors-env.mjs';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≈ ${b}`);
const adiff = (a, b) => { const d = Math.abs((((a - b) % 360) + 540) % 360 - 180); return d; };
const hueOf = (hex) => C.rgbToHsl(...C.rgbOf(hex))[0];
let seed = 11;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const randomHex = () => '#' + Math.floor(rand() * 16777216).toString(16).padStart(6, '0');

test('HSB: known values and a round trip through every colour sampled', () => {
  assert.deepEqual(C.rgbToHsv(51, 102, 204).map((x) => Math.round(x)), [220, 75, 80]);
  assert.equal(C.hexOf(C.hsvToRgb(0, 100, 100)), '#ff0000');
  assert.equal(C.hexOf(C.hsvToRgb(360, 100, 100)), '#ff0000');
  assert.equal(C.hexOf(C.hsvToRgb(-120, 100, 100)), '#0000ff');
  for (let i = 0; i < 5000; i++) { const hex = randomHex(); assert.equal(C.hexOf(C.hsvToRgb(...C.rgbToHsv(...C.rgbOf(hex)))), hex); }
});

test('RYB: the primaries and secondaries sit where an artist expects, and the angle round trips', () => {
  for (const [ryb, rgb] of C.RYB_STOPS) { near(C.rybToHue(ryb), rgb % 360, 1e-9, 'ryb ' + ryb); near(C.hueToRyb(rgb), ryb % 360, 1e-9, 'hue ' + rgb); }
  near(C.hueToRyb(60), 120, 1e-9, 'yellow is a third of the way round');
  near(C.hueToRyb(240), 240, 1e-9, 'blue');
  for (let h = 0; h < 360; h += 0.5) near(C.rybToHue(C.hueToRyb(h)), h, 1e-9, 'hue ' + h);
  for (let a = 1; a < 360; a++) assert.ok(C.rybToHue(a) > C.rybToHue(a - 1), 'monotonic at ' + a);
  near(C.rybToHue(-60), C.rybToHue(300), 1e-9, 'wraps');
});

test('each rule gives the right number of colours, the base first, on every wheel', () => {
  const N = { complementary: 2, analogous: 4, triadic: 3, split: 3, tetradic: 4, square: 4, monochrome: 5, brightness: 5, custom: 1 + H.CUSTOM_N };
  assert.deepEqual(H.HARMONIES.map((x) => x[0]).sort(), Object.keys(N).sort());
  for (let i = 0; i < 40; i++) {
    const hex = randomHex();
    for (const [w] of H.WHEELS) for (const [id] of H.HARMONIES) {
      const out = H.harmony(hex, id, { wheel: w });
      assert.equal(out.length, N[id], `${id} on ${w} for ${hex}`);
      assert.equal(out[0], hex);
      for (const x of out) assert.match(x, /^#[0-9a-f]{6}$/);
    }
  }
  assert.deepEqual(H.harmony('#3366cc', 'custom', { custom: ['#ff0000', 'rgb(0 255 0)', 'nope'] }), ['#3366cc', '#ff0000', '#00ff00']);
});

test('the rules turn the hue by their angles on each wheel', () => {
  // RGB: a turn of the HSL hue, as before (the existing results are kept)
  assert.deepEqual(H.harmony('#ff0000', 'square', { wheel: 'rgb' }), ['#ff0000', '#80ff00', '#00ffff', '#8000ff']);
  assert.deepEqual(H.harmony('#ff0000', 'triadic'), H.harmony('#ff0000', 'triadic', { wheel: 'rgb' }));
  // RYB: complements are red–green, yellow–violet, blue–orange
  assert.deepEqual(H.harmony('#ff0000', 'complementary', { wheel: 'ryb' }), ['#ff0000', '#00ff00']);
  assert.equal(H.harmony('#0000ff', 'complementary', { wheel: 'ryb' })[1], '#ff8000');
  near(hueOf(H.harmony('#ffff00', 'complementary', { wheel: 'ryb' })[1]), 280, 0.5, 'yellow → violet');
  for (let i = 0; i < 30; i++) {
    const hex = C.hexOf(C.hsvToRgb(rand() * 360, 40 + rand() * 60, 40 + rand() * 60));
    for (const [id, turns] of Object.entries(H.TURNS)) {
      const out = H.harmony(hex, id, { wheel: 'ryb' }), a0 = C.hueToRyb(hueOf(hex)), rest = turns.filter((x) => x !== 0);
      out.slice(1).forEach((x, k) => assert.ok(adiff(C.hueToRyb(hueOf(x)), a0 + rest[k]) < 2.5, `${id} ${hex} → ${x}`));
      const ok = H.harmony(hex, id, { wheel: 'oklch' }), [L0, , h0] = C.rgbToOklch(...C.rgbOf(hex));
      ok.slice(1).forEach((x, k) => { const [L, Ch, h] = C.rgbToOklch(...C.rgbOf(x)); near(L, L0, 0.02, 'oklch L ' + x); if (Ch > 0.03) assert.ok(adiff(h, h0 + rest[k]) < 3, `oklch ${id} ${hex} → ${x}`); });
    }
  }
});

test('monochrome and shades keep the hue; shades steps the brightness', () => {
  const sh = H.harmony('#3366cc', 'brightness');
  for (const x of sh) near(hueOf(x), 220, 1.5, x);
  const vs = sh.map((x) => C.rgbToHsv(...C.rgbOf(x))[2]);
  assert.equal(new Set(vs.map(Math.round)).size, 5);
  for (const x of H.harmony('#3366cc', 'monochrome', { wheel: 'oklch' })) near(C.rgbToOklch(...C.rgbOf(x))[2], C.rgbToOklch(51, 102, 204)[2], 2, x);
});

test('customFrom keeps the rule\'s colours and makes them up to CUSTOM_N', () => {
  assert.deepEqual(H.customFrom('#ff0000', 'triadic').slice(0, 2), ['#00ff00', '#0000ff']);
  assert.equal(H.customFrom('#ff0000', 'triadic').length, H.CUSTOM_N);
  assert.equal(H.customFrom('#ff0000', 'monochrome').length, 4);
});

test('a place on the wheel and its colour are each other\'s inverse, on every wheel', () => {
  for (let i = 0; i < 2000; i++) {
    const hex = randomHex();
    for (const w of ['rgb', 'ryb']) assert.equal(WH.colour(WH.point(hex, w), w), hex, w + ' ' + hex);
    const back = WH.colour(WH.point(hex, 'oklch'), 'oklch'), d = C.rgbOf(back).map((v, k) => Math.abs(v - C.rgbOf(hex)[k]));
    assert.ok(Math.max(...d) <= 1, 'oklch ' + hex + ' → ' + back);
  }
  assert.deepEqual(WH.point('#ff0000', 'rgb'), { a: 0, r: 1, v: 1 });
  near(WH.point('#ffff00', 'ryb').a, 120, 1e-9);
  near(WH.point('#ffff00', 'rgb').a, 60, 1e-9);
  const [x, y] = WH.toXY({ a: 90, r: 0.5 }, 100);   // 0 at the top, clockwise
  near(x, 50, 1e-9); near(y, 0, 1e-9);
  const p = WH.fromXY(0, 100, 100);
  near(p.a, 180, 1e-9); near(p.r, 1, 1e-9);
});

test('handles: places follow the rule; dragging the base moves the set, another handle turns it, custom ones move alone', () => {
  const s = { current: '#3366cc', harmony: 'triadic', wheel: 'rgb', custom: null };
  const at = WH.places(s);
  assert.equal(at.length, 3);
  near(at[1].a, 340, 1e-6); near(at[2].a, 100, 1e-6);
  let r = WH.drag(s, 0, { a: 0, r: 1, v: 1 });
  assert.equal(r.patch.current, '#ff0000');
  assert.deepEqual(WH.colours(Object.assign({}, s, r.patch)), ['#ff0000', '#00ff00', '#0000ff']);
  r = WH.drag(s, 1, { a: 350, r: 0.75, v: 0.8 });   // handle 2 turned by 10°: the base turns by 10° too
  near(WH.point(r.patch.current, 'rgb').a, 230, 1);
  const c = { current: '#3366cc', harmony: 'custom', wheel: 'ryb', custom: ['#ff0000', '#00ff00'] };
  r = WH.drag(c, 2, { a: 240, r: 1, v: 1 });
  assert.deepEqual(r.patch, { custom: ['#ff0000', '#0000ff'] });
  assert.equal(r.base, null);
  const g = { current: '#808080', harmony: 'complementary', wheel: 'rgb' };   // a grey keeps the page's hue
  near(WH.places(g, { a: 40, r: 0, v: 0.5 })[1].a, 220, 1e-9);
});

test('keys: arrows turn and saturate, Shift is ten, Page keys the slider, others are not the wheel\'s', () => {
  const p = { a: 355, r: 0.5, v: 0.5 };
  near(WH.nudge(p, 'ArrowRight').a, 356, 1e-9);
  near(WH.nudge(p, 'ArrowRight', true).a, 5, 1e-9);
  near(WH.nudge(p, 'ArrowUp').r, 0.51, 1e-9);
  near(WH.nudge(p, 'ArrowDown', true).r, 0.4, 1e-9);
  near(WH.nudge(p, 'PageUp').v, 0.55, 1e-9);
  assert.equal(WH.nudge({ a: 0, r: 1, v: 1 }, 'ArrowUp').r, 1);
  assert.equal(WH.nudge(p, 'End').r, 1);
  assert.equal(WH.nudge(p, 'Enter'), null);
});
