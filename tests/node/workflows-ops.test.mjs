// Slop Workflows: the one operation registry (File convert's catalog plus the apps' headless operations), the option
// schema checks, output kinds, app groups, an app host adapter's macros, and the mappings from the apps' own settings.
// Run: node --test tests/node/workflows-ops.test.mjs
// Covers: shared/ops/registry.js, shared/ops/all.js, shared/ops/isolate.js, shared/ops/watermark.js, shared/ops/resize.js
// Covers: shared/ops/upscale.js, shared/ops/clean.js, shared/ops/ocr.js, shared/ops/files.js, shared/ops/load.js, convert/js/core/catalog.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui-i18n-en.mjs';   // the shared components' words (shared/i18n/ui), as a page has them
import * as R from '../../shared/ops/all.js';
import { CONVERSIONS } from '../../convert/js/core/catalog.js';
import { toLook, fromLook } from '../../shared/ops/isolate.js';
import { fromApp, specOf as wmSpecOf } from '../../shared/ops/watermark.js';
import { specOf } from '../../shared/ops/resize.js';
import { removeOf } from '../../shared/ops/clean.js';
import { renameAll } from '../../shared/ops/files.js';

test('one registry: every File convert conversion is in it, and File convert still lists only its own', () => {
  for (const c of CONVERSIONS) assert.equal(R.byId(c.id), c);
  assert.deepEqual(R.all({ app: 'convert' }).map((c) => c.id), CONVERSIONS.map((c) => c.id));
  assert.ok(!CONVERSIONS.some((c) => c.app !== 'convert'));
  for (const id of ['slopisolate.remove-bg', 'slopisolate.background', 'watermark.apply', 'resize.image', 'upscale.image', 'clean.metadata', 'ocr.read', 'files.rename', 'pdf.compress']) {
    const op = R.byId(id);
    assert.ok(op && typeof op.run === 'function' && op.kind === 'op', id);
    assert.ok(!CONVERSIONS.includes(op), id + ' is not a File convert entry');
  }
});

test('the step menu groups operations by app, File convert first', () => {
  const g = R.apps();
  assert.equal(g[0].label, 'File convert');
  for (const l of ['SlopIsolate', 'Slop Watermark', 'Slop Resize', 'Slop Upscale', 'SlopClean', 'Slop OCR', 'Files', 'Slop PDF']) assert.ok(g.some((x) => x.label === l), l);
});

test('options are checked with the SlopCmd argument rules: typed numbers, clamping, choices, unknown keys', () => {
  const v = R.validateOptions(R.byId('resize.image'), { width: '1080px', height: 99999, fit: 'Fill', format: 'JPG', nope: 1 });
  assert.equal(v.ok, true);
  assert.equal(v.options.width, 1080);
  assert.equal(v.options.height, 16384);
  assert.equal(v.options.fit, 'cover');
  assert.equal(v.options.format, 'jpg');
  assert.ok(v.notes.some((n) => /above the maximum/.test(n)) && v.notes.some((n) => /nope/.test(n)));
  assert.equal(R.validateOptions(R.byId('upscale.image'), { scale: '4' }).options.scale, 4);   // a select keeps its own type
  assert.equal(R.validateOptions(R.byId('watermark.apply'), { colour: 'red' }).options.colour, '#ff0000');
  assert.equal(R.validateOptions(R.byId('watermark.apply'), { tile: 'maybe' }).ok, false);
  const args = R.argsOf(R.byId('pdf.compress'));
  assert.deepEqual(args.map((a) => [a.name, a.type]), [['mode', 'enum'], ['dpi', 'enum'], ['quality', 'number']]);
});

test('the kind a step makes: fixed, from a format option, or the input kept', () => {
  assert.equal(R.outOf(R.byId('slopisolate.remove-bg'), 'jpg', {}), 'png');
  assert.equal(R.outOf(R.byId('watermark.apply'), 'jpg', {}), 'jpg');
  assert.equal(R.outOf(R.byId('watermark.apply'), 'bmp', {}), 'png');
  assert.equal(R.outOf(R.byId('resize.image'), 'png', { format: 'webp' }), 'webp');
  assert.equal(R.outOf(R.byId('resize.image'), 'jpg', { format: 'keep' }), 'jpg');
  assert.equal(R.outOf(R.byId('pdf-to-images'), 'pdf', { format: 'jpg' }), 'jpg');
  assert.equal(R.outOf(R.byId('ocr.read'), 'png', { output: 'txt' }), 'txt');
  assert.equal(R.outOf(R.byId('files.rename'), 'pdf', {}), 'pdf');
  assert.ok(R.accepts(R.byId('files.rename'), 'anything'));
  assert.ok(R.accepts(R.byId('watermark.apply'), 'pdf') && R.accepts(R.byId('watermark.apply'), 'mp4'));   // one call for every kind
  assert.equal(R.outOf(R.byId('watermark.apply'), 'pdf', {}), 'pdf');
  assert.equal(R.outOf(R.byId('watermark.apply'), 'mov', {}), 'mov');
  assert.equal(R.outOf(R.byId('watermark.apply'), 'heic', {}), 'jpg');
});

test('an app host adapter adds its macros under its app (kind macro), read each time', () => {
  let macros = [{ id: 'macro:photoslop:m1', label: 'Sepia and frame', from: ['png', 'jpg'], ext: 'png', macroId: 'm1', run: async () => [] }];
  R.provide('photoslop', { label: 'PhotoSlop', list: () => macros });
  const op = R.byId('macro:photoslop:m1');
  assert.equal(op.kind, 'macro'); assert.equal(op.app, 'photoslop');
  assert.ok(R.apps().find((g) => g.label === 'PhotoSlop').ops.some((o) => o.id === 'macro:photoslop:m1'));
  macros = [];
  assert.equal(R.byId('macro:photoslop:m1'), null);
});

test('the apps’ own settings become step options and back', () => {
  const look = toLook({ background: 'color', color: '#ff0000', crop: true, pad: 12, shadow: true });
  assert.deepEqual([look.bg.mode, look.bg.color, look.crop.mode, look.crop.pad, look.shadow.on], ['color', '#ff0000', 'subject', 12, true]);
  assert.deepEqual(fromLook({ model: 'quality', ...look }), { model: 'quality', background: 'color', color: '#ff0000', blur: 24, shadow: true, crop: true, pad: 12 });
  assert.equal(fromLook({ bg: { mode: 'gradient', gradA: '#123456' } }).color, '#123456');
  // Slop Watermark's setup from before the spec, and a spec, become the step's options; the options become the spec again
  const o = fromApp({ cfg: { kind: 'text', text: '© Me', size: 0.06, opacity: 0.8, position: 'tl', margin: 0.025, logoScale: 0.3 } });
  assert.deepEqual([o.mark, o.text, o.size, o.opacity, o.position, o.margin], ['text', '© Me', 6, 80, 'tl', 2.5]);
  const L = wmSpecOf(o).layers[0];
  assert.deepEqual([L.kind, L.size, L.opacity, L.margin, L.position], ['text', 0.06, 0.8, 0.025, 'tl']);
  assert.equal(R.byId('watermark.apply').fromApp({ cfg: { kind: 'logo' }, logo: 'data:image/png;base64,AA' }).logo, 'data:image/png;base64,AA');
  const two = { layers: [{ kind: 'text', text: 'A' }, { kind: 'text', text: 'B', position: 'tl' }] };
  assert.deepEqual(wmSpecOf(fromApp({ spec: two })).layers.map((x) => x.text), ['A', 'B'], 'a spec of two layers rides as one spec option');
  assert.deepEqual(specOf({ mode: 'size', width: 1080, height: 1080, fit: 'fit', background: 'color', bgColor: '#ffffff' }),
    { mode: 'size', w: 1080, h: 1080, long: 0, scale: 50, keepRatio: true, fill: 'fit', anchor: 'center', bg: '#ffffff', resample: 'best' });
  assert.equal(specOf({ mode: 'size', width: 100, maxKB: 50 }).mode, 'bytes');
  assert.equal(specOf({ fit: 'stretch' }).keepRatio, false);
});

test('SlopClean choices and Rename patterns', () => {
  const cats = [{ id: 'location', def: true }, { id: 'camera', def: true }, { id: 'icc', def: false }];
  assert.deepEqual(removeOf('app', cats), { location: true, camera: true, icc: false });
  assert.deepEqual(removeOf('location', cats), { location: true, camera: false, icc: false });
  assert.deepEqual(removeOf('all', cats), { location: true, camera: true, icc: true });
  assert.deepEqual(renameAll(['a.jpg', 'b.png', 'c.jpg'], 'shop-{n}', { start: 1, digits: 3 }), ['shop-001.jpg', 'shop-002.png', 'shop-003.jpg']);
  assert.deepEqual(renameAll(['x.pdf', 'y.pdf'], 'same', {}), ['same.pdf', 'same-2.pdf']);
  assert.deepEqual(renameAll(['p.tar.gz'], '{name} {date}', { date: '2026-10-24' }), ['p.tar 2026-10-24.gz']);
  assert.deepEqual(renameAll(['a/b.txt'], 'a/b:{name}', {}), ['a_b_a_b.txt']);
});
