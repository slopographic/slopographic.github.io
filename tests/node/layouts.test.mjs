// Workspace layouts: the presets are valid data, every category has a preset, the arrangement is right, and the
// stored envelope resets to the defaults. Loads the classic scripts into a sandbox, as the browser does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['shared/layouts/presets.js', 'shared/layouts/core.js']) {
  vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const L = sandbox.SlopLayouts;

/** A small in-memory localStorage. */
function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), size: () => m.size };
}

test('every preset is valid and points at a category', () => {
  for (const p of L.PRESETS) assert.equal(L.validate(p).length, 0, p.id);
  assert.equal(new Set(L.PRESETS.map((p) => p.id)).size, L.PRESETS.length, 'preset ids are unique');
});

test('every category has at least one preset', () => {
  for (const c of L.CATEGORIES) assert.ok(L.PRESETS.some((p) => p.category === c.id), `category ${c.id} has a preset`);
});

test('every app named by a category has a default preset', () => {
  for (const c of L.CATEGORIES) for (const app of c.apps) assert.ok(L.defaultFor(app), `${app} has a default`);
});

test('validate reports bad data', () => {
  const good = L.PRESETS[0];
  assert.ok(L.validate({ ...good, category: 'nope' }).length > 0);
  assert.ok(L.validate({ ...good, panels: { x: { show: true, side: 'diagonal', size: 10 } } }).length > 0);
  assert.ok(L.validate({ ...good, panels: { x: { show: true, side: 'left', size: -4 } } }).length > 0);
  assert.ok(L.validate({ ...good, panels: { x: { show: false, side: 'left', size: 10 } } }).length > 0, 'no visible panel');
});

test('video preset: preview large, timeline bottom, bin left, properties right', () => {
  const p = L.preset('video-edit');
  const a = L.arrange(p, ['preview', 'bin', 'insp', 'timeline'], { fixedTop: 1, fixedBottom: 1 });
  assert.equal(a.columns, '280px minmax(0, 1fr) 300px');
  assert.equal(a.placements.timeline.row, '3 / 4', 'after the top bar and the band');
  assert.equal(a.placements.timeline.column, '1 / -1');
  assert.equal(a.placements.bin.column, '1 / 2');
  assert.equal(a.placements.insp.column, '3 / 4');
  assert.equal(a.placements.preview.column, '2 / 3');
  assert.equal(a.fixedBottomStart, 4);
  assert.equal(a.rows, 'auto minmax(0, 1fr) 300px auto');
  const v = L.arrange(p, ['preview', 'bin', 'insp', 'timeline'], { fixedTop: 1, fixedBottom: 1, sizeVars: { timeline: '--tl-h' } });
  assert.equal(v.rows, 'auto minmax(0, 1fr) var(--tl-h, 300px) auto', 'the app drives the timeline height');
  const c = L.arrange(p, ['preview', 'bin', 'insp', 'timeline'], { fixedTop: 1, fixedBottom: 1, sizeVars: { insp: '--insp-w' } });
  assert.ok(/var\(--insp-w, \d+px\)$/.test(c.columns), 'a side column holding one resizable panel follows its width: ' + c.columns);
});

test('a side with two panels splits the band; a missing panel is off', () => {
  const p = L.preset('image-edit');
  const a = L.arrange(p, ['canvas', 'tools', 'panels', 'nope'], {});
  assert.equal(a.placements.panels.row, '1 / 2');
  assert.deepEqual([...a.off], ["nope"]);
  const q = { ...p, panels: { ...p.panels, tools: { show: false, side: 'left', size: 56 } } };
  assert.deepEqual([...L.arrange(q, ["canvas", "tools", "panels"], {}).off], ["tools"]);
  const two = { ...p, panels: { canvas: { show: true, side: 'center', size: null }, a: { show: true, side: 'right', size: 200 }, b: { show: true, side: 'right', size: 200 } } };
  const b = L.arrange(two, ['canvas', 'a', 'b'], {});
  assert.equal(b.rows, 'minmax(0, 1fr) minmax(0, 1fr)');
  assert.equal(b.placements.a.row, '1 / 2');
  assert.equal(b.placements.b.row, '2 / 3');
});

test('a side with no centre panel and a free side gives the free side the space', () => {
  const a = L.arrange(L.preset('business-document'), ['list', 'document'], {});
  assert.equal(a.columns, '340px 0px minmax(0, 1fr)');
});

test('pick maps a category or preset id to this app only', () => {
  assert.equal(L.pick('slopcut', 'video').id, 'video-edit');
  assert.equal(L.pick('photoslop', 'video'), null);
  assert.equal(L.pick('crm', 'business').id, 'business-detail');
  assert.equal(L.pick('invoices', 'business-detail'), null);
  assert.equal(L.pick('3d', '3d').id, '3d-view');
});

test('reset returns the default when the stored envelope is removed, and ignores other versions', () => {
  const s = memStore();
  const key = L.storageKey('slopcut');
  s.setItem(key, L.envelope({ preset: 'video-edit' }));
  assert.deepEqual(JSON.parse(s.getItem(key)), { v: 1, data: { preset: 'video-edit' } });
  assert.equal(L.resolve('slopcut', s.getItem(key)).id, 'video-edit');
  s.removeItem(key);
  assert.equal(L.resolve('slopcut', s.getItem(key)).id, L.defaultFor('slopcut').id);
  assert.equal(L.readEnvelope(JSON.stringify({ v: 2, data: { preset: 'video-edit' } })), null);
  assert.equal(L.readEnvelope('{not json'), null);
  assert.equal(L.resolve('slopcut', JSON.stringify({ v: 1, data: { preset: 'image-edit' } })).id, 'video-edit', 'a preset of another app is not used');
});
