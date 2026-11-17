// Slop Colors: colour spaces (colors/js/core/convert.js), palettes from one colour (colors/js/core/harmony.js) and the
// shared WCAG contrast maths (shared/color/contrast.js), against published reference values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, H, M } from './colors-env.mjs';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≈ ${b}`);

test('known values: red, white, a mid blue in every format', () => {
  assert.deepEqual(C.all('#ff0000'), { hex: '#ff0000', rgb: 'rgb(255 0 0)', hsl: 'hsl(0 100% 50%)', oklch: 'oklch(62.796% 0.25768 29.234)', cmyk: 'cmyk(0% 100% 100% 0%)' });
  assert.equal(C.format('#ffffff', 'oklch'), 'oklch(100% 0 0)');
  assert.equal(C.format('#000000', 'cmyk'), 'cmyk(0% 0% 0% 100%)');
  assert.equal(C.format('#3366cc', 'hsl'), 'hsl(220 60% 50%)');
  assert.equal(C.format('#3366cc', 'cmyk'), 'cmyk(75% 50% 0% 20%)');
  const [L, Ch, h] = C.rgbToOklch(0, 0, 255);   // CSS Color 4: blue is oklch(45.2% 0.313 264.05)
  near(L, 0.452, 0.001); near(Ch, 0.313, 0.001); near(h, 264.05, 0.05);
});

test('every format reads back to the same colour (20 000 random colours)', () => {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 20000; i++) {
    const hex = '#' + Math.floor(rand() * 16777216).toString(16).padStart(6, '0');
    for (const k of C.KINDS) assert.equal(C.parse(C.format(hex, k)), hex, `${k} ${C.format(hex, k)}`);
  }
});

test('parse takes the usual ways of writing a colour, and refuses the rest', () => {
  assert.equal(C.parse('F00'), '#ff0000');
  assert.equal(C.parse('#ff000080'), '#ff0000');
  assert.equal(C.parse('rgb(255, 128, 0)'), '#ff8000');
  assert.equal(C.parse('rgba(100% 0% 0% / 50%)'), '#ff0000');
  assert.equal(C.parse('hsl(120deg 100% 25%)'), '#008000');
  assert.equal(C.parse('cmyk(0, 100, 100, 0)'), '#ff0000');
  assert.equal(C.parse('12 34 56'), '#0c2238');
  for (const bad of ['', 'nope', '#12', 'rgb(1,2)', 'hsl(a b c)']) assert.equal(C.parse(bad), null, bad);
});

test('OKLCH outside sRGB is gamut mapped: lightness and hue kept, chroma reduced', () => {
  assert.equal(C.outOfGamut(0.7, 0.4, 150), true);
  const hex = C.parse('oklch(70% 0.4 150)'), [L, Ch, h] = C.rgbToOklch(...C.rgbOf(hex));
  near(L, 0.7, 0.01, 'L'); near(h, 150, 1.5, 'h'); assert.ok(Ch < 0.4 && Ch > 0.1, 'chroma ' + Ch);
  assert.equal(C.outOfGamut(0.5, 0.05, 30), false);
});

test('WCAG contrast: the reference pairs and the levels', () => {
  assert.equal(M.ratioHex('#000000', '#ffffff'), 21);
  assert.equal(M.ratioHex('#777777', '#777777'), 1);
  near(M.ratioHex('#767676', '#ffffff'), 4.54, 0.01, 'the lightest grey for AA on white');
  near(M.ratioHex('#777777', '#ffffff'), 4.48, 0.01);
  near(M.ratioHex('#0000ff', '#ffffff'), 8.59, 0.01);
  near(M.luminance([255, 255, 255]), 1, 1e-9);
  assert.deepEqual(M.levels(4.5), { aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true, ui: true });
  assert.deepEqual(M.levels(3.2), { aaNormal: false, aaLarge: true, aaaNormal: false, aaaLarge: false, ui: true });
  assert.equal(M.large(24, 400), true); assert.equal(M.large(19, 700), true); assert.equal(M.large(19, 400), false);
});

test('harmonies turn the hue on the colour wheel; monochrome keeps it', () => {
  assert.deepEqual(H.harmony('#ff0000', 'complementary'), ['#ff0000', '#00ffff']);
  assert.deepEqual(H.harmony('#ff0000', 'triadic'), ['#ff0000', '#00ff00', '#0000ff']);
  assert.deepEqual(H.harmony('#ff0000', 'square'), ['#ff0000', '#80ff00', '#00ffff', '#8000ff']);
  assert.equal(H.harmony('#ff0000', 'split').length, 3);
  assert.equal(H.harmony('#ff0000', 'analogous').length, 4);
  const mono = H.harmony('#3366cc', 'monochrome');
  assert.equal(mono[0], '#3366cc');
  for (const x of mono) near(C.rgbToHsl(...C.rgbOf(x))[0], 220, 1.5, x);
  for (const [id] of H.HARMONIES) assert.equal(H.harmony('#3366cc', id)[0], '#3366cc', id);
});

test('tints, shades and tones step towards white, black and grey', () => {
  assert.deepEqual(H.scale('#ff0000', 'tints', 4), ['#ff0000', '#ff4040', '#ff8080', '#ffbfbf']);
  assert.deepEqual(H.scale('#ff0000', 'shades', 2), ['#ff0000', '#800000']);
  assert.equal(H.scale('#ff0000', 'tones', 3)[2], '#aa5555');
  const r = H.ramp('#3b82f6');
  assert.deepEqual(Object.keys(r).map(Number), H.RAMP_KEYS);
  assert.ok(Object.values(r).includes('#3b82f6'), 'the colour itself is on the ramp');
  const Ls = Object.values(r).map((x) => C.rgbToOklch(...C.rgbOf(x))[0]);
  for (let i = 1; i < Ls.length; i++) assert.ok(Ls[i] < Ls[i - 1], 'darker at each step');
});

test('suggest finds the nearest colour that passes, or keeps one that already does', () => {
  assert.equal(H.suggest('#000000', '#ffffff', 4.5), '#000000');
  const s = H.suggest('#999999', '#ffffff', 4.5);
  assert.ok(M.ratioHex(s, '#ffffff') >= 4.5 && M.ratioHex(s, '#ffffff') < 4.8, s);
  const t = H.suggest('#3366cc', '#000000', 7);
  assert.ok(M.ratioHex(t, '#000000') >= 7, t);
});
