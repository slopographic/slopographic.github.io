// The one watermark spec (shared/watermark/spec.js), its layout maths (spec-layout.js) and its conversions
// (spec-convert.js): defaults and checks, ranges and time windows, the layer list, the position and tile maths, and the
// shapes saved before the spec (Slop Watermark's setup, PhotoSlop and SlopCut settings, Slop PDF layers, Workflows options).
// Run with: node --test tests/node/watermark-spec.test.mjs
// Covers: shared/watermark/spec.js, shared/watermark/spec-layout.js, shared/watermark/spec-convert.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui-i18n-en.mjs';   // the shared components' words (shared/i18n/ui), as a page has them
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../../shared/watermark/spec.js');
require('../../shared/watermark/spec-layout.js');
require('../../shared/watermark/spec-convert.js');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
/** Fixed-width text: half the letter height per character. */
const measure = (t, px) => t.length * px * 0.5;

test('the default spec is one text layer, ready to draw', () => {
  const sp = S.defaults();
  assert.equal(sp.v, 1);
  assert.equal(sp.layers.length, 1);
  const L = sp.layers[0];
  assert.deepEqual([L.kind, L.text, L.position, L.size, L.opacity, L.margin, L.font, L.bold], ['text', '© Your name', 'br', 0.045, 0.5, 0.03, 'sans', true]);
  assert.equal(S.check(sp), '');
});

test('normalize keeps every value in range and of its type, and never throws', () => {
  const sp = S.normalize({ layers: [{ kind: 'image', size: 9, opacity: 3, rotate: 999, colour: 'red', position: 'nowhere', logo: 'javascript:x', from: 5, to: 2, extra: 1 }] });
  const L = sp.layers[0];
  assert.deepEqual([L.kind, L.size, L.opacity, L.rotate, L.colour, L.position, L.logo, L.from, L.to], ['logo', 1, 1, 180, '#ffffff', 'br', '', 5, 0]);
  assert.equal('extra' in L, false);
  assert.deepEqual(S.normalize('not json').layers.length, 1, 'bad text gives the defaults');
  assert.deepEqual(S.normalize(JSON.stringify({ layers: [{ text: 'J' }] })).layers[0].text, 'J', 'JSON text is read');
  assert.equal(S.normalize({ layers: Array.from({ length: 30 }, () => ({})) }).layers.length, S.MAX_LAYERS);
  const dup = S.normalize({ layers: [{ id: 'x' }, { id: 'x' }] });
  assert.notEqual(dup.layers[0].id, dup.layers[1].id, 'ids are unique');
});

test('check says what to fix, in plain words', () => {
  assert.equal(S.check(S.normalize({ layers: [] })), 'Add some text or a logo.');
  assert.equal(S.check(S.normalize({ layers: [{ text: ' ' }] })), 'Type the watermark text.');
  assert.equal(S.check(S.normalize({ layers: [{ kind: 'logo' }] })), 'Choose a logo picture.');
  assert.equal(S.check(S.normalize({ layers: [{ text: 'A', show: false }] })), 'Every layer is hidden. Show one to add it.');
  assert.match(S.check(S.normalize({ layers: [{ text: 'A', pages: 'x' }] })), /not a page number/);
});

test('a layer is active on its pages and in its time window only', () => {
  const L = S.normalizeLayer({ text: 'A', pages: '2-3', from: 1, to: 4 });
  assert.equal(S.active(L, {}), true, 'a picture has no pages and no time');
  assert.equal(S.active(L, { page: 0, pages: 5 }), false);
  assert.equal(S.active(L, { page: 2, pages: 5 }), true);
  assert.equal(S.active(L, { time: 0.5 }), false);
  assert.equal(S.active(L, { time: 1 }), true);
  assert.equal(S.active(L, { time: 4 }), false, 'until is not included');
  assert.equal(S.active(S.normalizeLayer({ text: 'A', from: 2 }), { time: 1e5 }), true, 'until 0 is the end');
  assert.deepEqual(S.parsePages('1-3, 5, last', 8), [0, 1, 2, 4, 7]);
  assert.deepEqual(S.parsePages('even', 5), [1, 3]);
});

test('anchors: the margin and the move are fractions of the shorter side', () => {
  const L = S.normalizeLayer({ text: 'ABCD', size: 0.1, margin: 0.05, position: 'br' });
  const item = S.itemSize(L, 400, 200, measure);   // shorter side 200: 20 px letters, 24 px tall, 40 px wide
  assert.deepEqual([item.w, item.h, item.px], [40, 24, 20]);
  assert.deepEqual(S.anchorBox(L, 400, 200, item), { x: 400 - 10 - 40, y: 200 - 10 - 24 });
  assert.deepEqual(S.anchorBox(Object.assign({}, L, { position: 'tl', dx: 0.1, dy: -0.05 }), 400, 200, item), { x: 10 + 20, y: 10 - 10 });
  assert.deepEqual(S.anchorBox(Object.assign({}, L, { position: 'mc' }), 400, 200, item), { x: 180, y: 88 });
  const one = S.placements(L, 400, 200, item);
  assert.deepEqual(one, { rot: 0, items: [{ cx: 370, cy: 178 }] });
  const logo = S.normalizeLayer({ kind: 'logo', size: 0.5, logoW: 200, logoH: 100 });
  assert.deepEqual(S.itemSize(logo, 400, 200), { w: 100, h: 50 }, 'a logo keeps its aspect');
});

test('tiles cover the frame, turned with the layer, and none lies wholly outside', () => {
  const L = S.normalizeLayer({ text: 'TILE', size: 0.05, tile: true, rotate: 30 });
  const item = S.itemSize(L, 600, 400, measure);
  const { rot, items } = S.placements(L, 600, 400, item);
  assert.equal(rot, 30);
  assert.ok(items.length > 20, 'many tiles: ' + items.length);
  const reach = Math.hypot(item.w, item.h) / 2;
  assert.ok(items.every((p) => p.cx > -reach && p.cx < 600 + reach && p.cy > -reach && p.cy < 400 + reach));
  assert.ok(items.some((p) => p.cx < 60) && items.some((p) => p.cx > 540) && items.some((p) => p.cy < 40) && items.some((p) => p.cy > 360), 'the corners are reached');
});

test('the layer list changes return a new spec each time', () => {
  const sp = S.normalize({ layers: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] });
  const up = S.updateLayer(sp, 'a', { text: 'Z', id: 'nope' });
  assert.equal(up.layers[0].text, 'Z'); assert.equal(up.layers[0].id, 'a'); assert.equal(sp.layers[0].text, 'A');
  assert.equal(S.getLayer(sp, 'b').text, 'B');
  assert.equal(S.label(sp.layers[0]), '“A”');
  assert.equal(S.label(S.normalizeLayer({ kind: 'logo', logoName: 'brand.png' })), 'Logo: brand.png');
});

test('Slop Watermark, PhotoSlop and SlopCut settings from before the spec load as one layer', () => {
  const sp = S.fromCfg({ kind: 'text', text: 'Old', font: 'Georgia, serif', weight: 600, colour: '#ff0000', shadow: false, size: 0.06, logoScale: 0.3, opacity: 0.7, position: 'tl', tile: true, rotate: 15, margin: 0.02 });
  const L = sp.layers[0];
  assert.deepEqual([L.kind, L.text, L.font, L.bold, L.colour, L.shadow, L.size, L.opacity, L.position, L.tile, L.rotate, L.margin], ['text', 'Old', 'serif', true, '#ff0000', false, 0.06, 0.7, 'tl', true, 15, 0.02]);
  const logo = S.fromCfg({ kind: 'logo', logoScale: 0.3, logo: PNG, logoName: 'l.png' }).layers[0];
  assert.deepEqual([logo.kind, logo.size, logo.logo, logo.logoName], ['logo', 0.3, PNG, 'l.png']);
  assert.equal(S.normalize({ kind: 'text', text: 'raw cfg' }).layers[0].text, 'raw cfg', 'normalize reads an old setup too');
  const c = S.toCfg(L);
  assert.deepEqual([c.kind, c.font, c.size, c.weight, c.position], ['text', 'Georgia, serif', 0.06, 600, 'tl']);
  assert.equal(S.fontKey('ui-monospace, Menlo, Consolas, monospace'), 'mono');
  assert.equal(S.fontKey('Courier'), 'mono');
});

test('Slop PDF layers become the spec on their page, and the spec becomes PDF layers on any page', () => {
  const pdf = [{ id: 'p1', kind: 'text', text: 'DRAFT', font: 'Times', bold: true, colour: '#888888', size: 61.2, opacity: 0.25, rot: 45, anchor: 'mc', dx: 6.12, dy: 0, pages: '2', show: true },
    { id: 'p2', kind: 'image', asset: 'img1', size: 122.4, opacity: 1, rot: 0, anchor: 'tr', dx: -10, dy: 10, pages: '', show: false }];
  const sp = S.fromPdfLayers(pdf, { w: 612, h: 792, asset: (id) => (id === 'img1' ? { url: PNG, w: 40, h: 20, name: 'logo.png' } : null) });
  const [T, Lg] = sp.layers;
  assert.deepEqual([T.kind, T.font, T.size, T.rotate, T.position, T.dx, T.pages, T.shadow], ['text', 'serif', 0.1, -45, 'mc', 0.01, '2', false]);
  assert.deepEqual([Lg.kind, Lg.logo, Lg.logoW, Lg.logoH, Lg.size, Lg.show], ['logo', PNG, 40, 20, 0.2, false]);
  // back on the same page: the same layer (the hidden one is left out)
  const back = S.toPdfLayers(sp, 612, 792, { measure: (f, t, px) => measure(t, px) });
  assert.equal(back.length, 1);
  assert.deepEqual([back[0].kind, back[0].font, back[0].anchor, back[0].rot, back[0].pages], ['text', 'Times', 'mc', 45, '2']);
  assert.ok(Math.abs(back[0].size - 61.2) < 1e-9 && Math.abs(back[0].dx - 6.12) < 1e-9);
  // a corner layer: the margin becomes the offset from that corner; a page twice the size gets a layer twice the size
  const corner = S.normalize({ layers: [{ text: 'A', position: 'br', margin: 0.05, size: 0.05 }] });
  const a4 = S.toPdfLayers(corner, 600, 800, {}), big = S.toPdfLayers(corner, 1200, 1600, {});
  assert.deepEqual([a4[0].dx, a4[0].dy, a4[0].size], [-30, -30, 30]);
  assert.equal(big[0].size, 60);
  // tiles: one layer per tile, each centred on its place
  const tiles = S.toPdfLayers(S.normalize({ layers: [{ text: 'T', tile: true, size: 0.05 }] }), 600, 800, { measure: (f, t, px) => measure(t, px) });
  assert.ok(tiles.length > 10 && tiles.every((x) => x.anchor === 'mc'));
});

test('Workflows options are made from the spec’s table, and map to and from the spec', () => {
  const keys = S.OPTIONS.map((o) => o.key);
  assert.deepEqual(keys, ['mark', 'text', 'logo', 'font', 'colour', 'shadow', 'size', 'logoSize', 'opacity', 'position', 'margin', 'rotate', 'tile', 'pages', 'from', 'to', 'spec']);
  const size = S.OPTIONS.find((o) => o.key === 'size');
  assert.deepEqual([size.min, size.max, size.value], [S.SIZE.text.min * 100, S.SIZE.text.max * 100, S.SIZE.text.value * 100]);
  const old = { mark: 'text', text: '© Old flow', font: 'Georgia, serif', size: 6, opacity: 80, position: 'tl', margin: 2.5, rotate: 10, tile: false };
  const L = S.fromOptions(old).layers[0];
  assert.deepEqual([L.text, L.font, L.size, L.opacity, L.position, L.margin, L.rotate], ['© Old flow', 'serif', 0.06, 0.8, 'tl', 0.025, 10]);
  const both = S.fromOptions({ mark: 'both', logo: PNG, text: 'T', logoSize: 20, size: 4, position: 'br' }, { logoAspect: 0.5 });
  assert.deepEqual(both.layers.map((x) => x.kind), ['logo', 'text']);
  assert.ok(Math.abs(both.layers[1].dy - -(0.1 + 0.01)) < 1e-9, 'the text sits above the logo at the bottom');
  assert.deepEqual(S.toOptions(S.defaults()).text, '© Your name');
  const multi = S.normalize({ layers: [{ text: 'A' }, { text: 'B' }] });
  const o = S.toOptions(multi);
  assert.deepEqual(Object.keys(o), ['spec']);
  assert.deepEqual(S.fromOptions(o).layers.map((x) => x.text), ['A', 'B'], 'a saved watermark wins over the flat settings');
});
