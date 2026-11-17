// SlopLabel built-in presets (label/js/core/presets.js): every preset is a valid config, its sheet grid fits its page, the
// label count per sheet is right, the sizes match the stock library and the measurements given, and the preview has one
// box per label slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelEnv, plain } from './label-env.mjs';

const env = await labelEnv();
const G = (n) => env.get(n);
const PRESETS = G('PRESETS');
const byId = (id) => G('presetById')(id);

test('the built-in presets are the ones asked for, each with a unique id', () => {
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  for (const id of ['stock-avery-l7651', 'stock-avery-l7159', 'stock-avery-l7160', 'stock-roll-4x6', 'stock-roll-62x29', 'product-40x30', 'file-folder', 'round-50']) {
    assert.ok(byId(id), `preset ${id}`);
  }
});

test('every preset is a valid config and its labels fit the page without overlapping', () => {
  for (const p of PRESETS) {
    const v = G('validateConfig')(plain(p.body));
    assert.equal(v.ok, true, `${p.id}: ${v.errors.join('; ')}`);
    assert.equal(G('presetFits')(p.body), true, `${p.id} does not fit its sheet`);
  }
});

test('Avery-style A4 sheets hold 21 to 65 labels, with the library sizes', () => {
  const expect = { 'stock-avery-l7651': [65, 38.1, 21.2, 5, 13], 'stock-avery-l7159': [24, 63.5, 33.9, 3, 8], 'stock-avery-l7160': [21, 63.5, 38.1, 3, 7] };
  for (const [id, [slots, w, h, cols, rows]] of Object.entries(expect)) {
    const b = byId(id).body;
    assert.equal(b.stock.kind, 'sheet');
    assert.equal(G('presetSlots')(b), slots, id);
    assert.equal(b.label.w, w, id);
    assert.equal(b.label.h, h, id);
    assert.equal(b.stock.cols, cols, id);
    assert.equal(b.stock.rows, rows, id);
    assert.equal(b.stock.pageW, 210, id);
    assert.equal(b.stock.pageH, 297, id);
    assert.equal(b.unit, 'mm', id);
  }
});

test('the sheet grid of a preset sits inside the sheet: the last label ends before the page edge', () => {
  for (const id of ['stock-avery-l7651', 'stock-avery-l7159', 'stock-avery-l7160']) {
    const { boxes, pageW, pageH } = G('presetLayout')(byId(id).body);
    const right = Math.max(...boxes.map((b) => b.x + b.w)), bottom = Math.max(...boxes.map((b) => b.y + b.h));
    assert.ok(right <= pageW && pageW - right > 0, `${id} right edge ${right}`);
    assert.ok(bottom <= pageH && pageH - bottom > 0, `${id} bottom edge ${bottom}`);
  }
});

test('the shipping, address, product, file folder and round presets have their measurements', () => {
  const shipping = byId('stock-roll-4x6').body;
  assert.equal(shipping.label.w, 101.6);
  assert.equal(shipping.label.h, 152.4);
  assert.equal(byId('stock-roll-62x29').body.label.w, 62);
  assert.equal(byId('stock-roll-62x29').body.label.h, 29);
  const product = byId('product-40x30').body;
  assert.equal(product.label.w, 40);
  assert.equal(product.label.h, 30);
  assert.equal(product.stock.kind, 'roll');
  const folder = byId('file-folder').body;
  assert.equal(folder.label.w, 87.3125, '3 7/16 in');
  assert.equal(folder.label.h, 16.9333, '2/3 in');
  assert.equal(folder.unit, 'in');
  const round = byId('round-50').body;
  assert.equal(round.label.w, 50);
  assert.equal(round.label.h, 50);
  assert.equal(round.label.radius, 25, 'a round label has the corner radius of half its side');
});

test('a preset opens as a document with its layout and no objects', () => {
  const d = G('docFromConfig')(plain(byId('stock-avery-l7160').body), 'Sheet test');
  assert.equal(d.name, 'Sheet test');
  assert.equal(d.stock.kind, 'sheet');
  assert.equal(d.objects.length, 0);
  assert.equal(G('slotsPerPage')(G('stockOf')(d)), 21);
});

test('a sheet preset whose grid overruns its page is not a fit', () => {
  const body = plain(byId('stock-avery-l7160').body);
  body.stock.cols = 4;
  assert.equal(G('validateConfig')(body).ok, false);
  assert.equal(G('presetFits')(body), false);
});

test('the preview draws one box per label slot and a page for a sheet', () => {
  for (const p of PRESETS) {
    const svg = G('presetPreviewSvg')(plain(p.body), p.name);
    const labels = (svg.match(/class="pv-label"/g) || []).length;
    assert.equal(labels, G('presetSlots')(p.body), p.id);
    assert.equal(/class="pv-page"/.test(svg), p.body.stock.kind === 'sheet', p.id);
    assert.match(svg, /^<svg /);
  }
});

test('the preview escapes the name it is labelled with', () => {
  const svg = G('presetPreviewSvg')(plain(PRESETS[0].body), '<img onerror=x>');
  assert.equal(svg.includes('<img'), false);
  assert.match(svg, /aria-label="&lt;img/);
});
