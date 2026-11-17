// Slop Colors: dominant colours by seeded k-means (colors/js/core/kmeans.js), and palettes as files and back
// (colors/js/core/formats.js: CSS, Tailwind, JSON, GIMP .gpl; colors/js/core/ase.js: Adobe Swatch Exchange).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { C, K, F, A } from './colors-env.mjs';

/** RGBA bytes: blocks of flat colours with the given pixel counts, some noise pixels near each, a few transparent. */
function picture(blocks, noise = 0) {
  const px = [];
  const rand = K.rng(42);
  for (const [hex, n] of blocks) {
    const [r, g, b] = C.rgbOf(hex);
    for (let i = 0; i < n; i++) px.push(r, g, b, 255);
    for (let i = 0; i < noise; i++) px.push(...[r, g, b].map((v) => Math.max(0, Math.min(255, v + Math.round((rand() - 0.5) * 8)))), 255);
  }
  for (let i = 0; i < 500; i++) px.push(255, 0, 255, 0);   // transparent: skipped
  return new Uint8ClampedArray(px);
}

test('k-means finds the flat colours of a picture, the largest first, with their shares', () => {
  const rgba = picture([['#1e3a8a', 6000], ['#f59e0b', 3000], ['#10b981', 1000]]);
  const d = K.dominant(rgba, { k: 3, seed: 1 });
  assert.deepEqual(d.map((x) => x.hex), ['#1e3a8a', '#f59e0b', '#10b981']);
  assert.ok(Math.abs(d[0].share - 0.6) < 0.01, 'share ' + d[0].share);
  assert.ok(!d.some((x) => x.hex === '#ff00ff'), 'transparent pixels are left out');
});

test('noise around each colour still gives one cluster per colour, and the same seed gives the same answer', () => {
  const rgba = picture([['#e11d48', 2000], ['#0ea5e9', 2000], ['#fafafa', 2000], ['#171717', 2000]], 1500);
  const a = K.dominant(rgba, { k: 4, seed: 9 }), b = K.dominant(rgba, { k: 4, seed: 9 });
  assert.deepEqual(a, b);
  for (const want of ['#e11d48', '#0ea5e9', '#fafafa', '#171717']) {
    const [r, g, bl] = C.rgbOf(want);
    assert.ok(a.some((x) => { const [r2, g2, b2] = C.rgbOf(x.hex); return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(bl - b2) <= 6; }), want + ' in ' + a.map((x) => x.hex));
  }
});

test('asking for more colours than the picture has gives what it has; an empty picture gives none', () => {
  assert.deepEqual(K.dominant(picture([['#000000', 10], ['#ffffff', 30]]), { k: 8 }).map((x) => x.hex), ['#ffffff', '#000000']);
  assert.deepEqual(K.dominant(new Uint8ClampedArray(16), { k: 3 }), []);
});

const P = { name: 'Sea Side', colors: [{ hex: '#0b3d91', name: 'Deep sea' }, { hex: '#4fb3bf' }, { hex: '#f4e1c1', name: 'Sand' }, { hex: '#ff6f61', name: 'Coral' }] };

test('CSS variables and the Tailwind config name each colour once, in code-safe names', () => {
  const css = F.toCss(P);
  assert.match(css, /--sea-side-deep-sea: #0b3d91;/);
  assert.match(css, /--sea-side-200: #4fb3bf;/);
  assert.deepEqual(F.fromCss(css).colors.map((c) => c.hex), P.colors.map((c) => c.hex));
  const tw = F.toTailwind(P), mod = { exports: null };
  vm.runInNewContext(tw, { module: mod });
  assert.deepEqual(JSON.parse(JSON.stringify(mod.exports.theme.extend.colors['sea-side'])), { 'deep-sea': '#0b3d91', 200: '#4fb3bf', sand: '#f4e1c1', coral: '#ff6f61' });
  assert.deepEqual(F.names({ colors: [{ hex: '#000000', name: 'A' }, { hex: '#111111', name: 'a' }] }), ['a', 'a-2']);
});

test('JSON and GIMP palettes round trip: names and colours come back', () => {
  for (const [write, read] of [[F.toJson, F.fromJson], [F.toGpl, F.fromGpl]]) {
    const back = read(write(P));
    assert.equal(back.name, 'Sea Side');
    assert.deepEqual(back.colors.map((c) => c.hex), P.colors.map((c) => c.hex));
    assert.equal(back.colors[0].name, 'Deep sea');
  }
  assert.match(F.toGpl(P), /^GIMP Palette\nName: Sea Side\nColumns: 4\n#\n 11  61 145\tDeep sea\n/);
  assert.deepEqual(F.fromJson('["#f00", "rgb(0 255 0)"]').colors, [{ hex: '#ff0000' }, { hex: '#00ff00' }]);
  assert.deepEqual(F.fromJson('{"primary": "#123456"}').colors, [{ hex: '#123456', name: 'primary' }]);
  assert.throws(() => F.fromGpl('hello'), /not a GIMP palette/);
  assert.throws(() => F.fromJson('{'), /not valid JSON/);
  assert.throws(() => F.fromJson('[]'), /No colours/);
});

test('ASE: written as Adobe lays it out, and read back exactly', () => {
  const bytes = A.write(P), dv = new DataView(bytes.buffer);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'ASEF');
  assert.deepEqual([dv.getUint16(4), dv.getUint16(6), dv.getUint32(8)], [1, 0, P.colors.length + 2]);
  assert.equal(dv.getUint16(12), 0xc001);
  const back = A.read(bytes);
  assert.equal(back.name, 'Sea Side');
  assert.deepEqual(back.colors.map((c) => c.hex), P.colors.map((c) => c.hex));
  assert.deepEqual(back.colors.map((c) => c.name), ['Deep sea', undefined, 'Sand', 'Coral']);
  assert.throws(() => A.read(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), /not an Adobe Swatch/);
});

test('ASE: CMYK, Lab and Gray swatches from other tools are read as sRGB', () => {
  const units = (s) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  function swatch(name, model, vals) {
    const u = units(name), body = new DataView(new ArrayBuffer(2 + u.length * 2 + 4 + vals.length * 4 + 2));
    body.setUint16(0, u.length); u.forEach((x, i) => body.setUint16(2 + i * 2, x));
    [...model].forEach((c, i) => body.setUint8(2 + u.length * 2 + i, c.charCodeAt(0)));
    vals.forEach((v, i) => body.setFloat32(2 + u.length * 2 + 4 + i * 4, v));
    const b = new Uint8Array(6 + body.byteLength), dv = new DataView(b.buffer);
    dv.setUint16(0, 1); dv.setUint32(2, body.byteLength); b.set(new Uint8Array(body.buffer), 6);
    return b;
  }
  const blocks = [swatch('Red', 'CMYK', [0, 1, 1, 0]), swatch('Mid', 'Gray', [0.5]), swatch('White', 'LAB ', [1, 0, 0])];
  const head = new Uint8Array(12), hv = new DataView(head.buffer);
  head.set([65, 83, 69, 70]); hv.setUint16(4, 1); hv.setUint32(8, blocks.length);
  const all = new Uint8Array(12 + blocks.reduce((s, b) => s + b.length, 0));
  all.set(head); let at = 12; for (const b of blocks) { all.set(b, at); at += b.length; }
  assert.deepEqual(A.read(all).colors.map((c) => c.hex), ['#ff0000', '#808080', '#ffffff']);
});
