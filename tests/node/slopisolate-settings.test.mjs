// SlopIsolate bulk editing, the pure parts: the settings as data (slopisolate/js/core/settings.js: merge with mixed
// values, copy and paste, which changes need the model again), one undo step for a bulk change
// (slopisolate/js/core/history.js groups) and the one code path that writes settings (slopisolate/js/ui/edit.js), each
// loaded in a vm context so the browser files run unchanged. Run with: node tests/run.mjs slopisolate
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (ctx, f) => vm.runInContext(readFileSync(path.join(ROOT, 'slopisolate', 'js', f), 'utf8'), ctx, { filename: f });

/** A context with the app's state, history, settings and edit modules; the model runs and events are recorded. */
function app() {
  const events = [], reruns = [], pins = [];
  const ctx = { console, JSON, Object, Array, Set, Map, Math };
  ctx.window = ctx;
  vm.createContext(ctx);
  const items = [];
  ctx.CO = {
    util: {},
    emit: (type, data) => events.push([type, data]),
    on: () => () => {},
    process: { rerun: (it) => reruns.push(it.id), pin: (list, id) => { list.forEach((it) => { it.model = id; }); pins.push([list.map((it) => it.id), id]); } },
  };
  ctx.CO.state = {
    items, sel: new Set(), activeId: null, model: 'fast',
    get: (id) => items.find((it) => it.id === id) || null,
    current: () => items.find((it) => it.id === ctx.CO.state.activeId) || null,
    modelOf: (it) => (it && it.model) || ctx.CO.state.model,
    targets: () => (ctx.CO.state.sel.size >= 2 ? items.filter((it) => ctx.CO.state.sel.has(it.id)) : [ctx.CO.state.current()].filter(Boolean)),
    rememberLook: () => {},
  };
  load(ctx, 'core/settings.js');
  load(ctx, 'core/history.js');
  load(ctx, 'ui/edit.js');
  const add = (id, over = {}) => {
    const it = {
      id, status: 'done', model: null, hist: { undo: [], redo: [] },
      s: { threshold: 0.5, softness: 1, feather: 0, decontaminate: true, refine: true },
      bg: { mode: 'transparent', color: '#ffffff', blur: 24, image: null, gradA: '#d4ff3a', gradB: '#2b6cff', angle: 135 },
      shadow: { on: false, opacity: 0.45, blur: 3, x: 0, y: 2, color: '#000000' },
      crop: { mode: 'original', pad: 8 },
    };
    for (const [p, v] of Object.entries(over)) ctx.CO.settings.set(it, p, v);
    items.push(it);
    return it;
  };
  return { CO: ctx.CO, items, add, events, reruns, pins };
}

test('merge: a shared value is shown, a value that differs is mixed', () => {
  const { CO, add } = app();
  const a = add('a', { 's.threshold': 0.3 }), b = add('b', { 's.threshold': 0.7 }), c = add('c', { 's.threshold': 0.3 });
  const M = CO.settings.merge([a, b, c], CO.state.modelOf);
  assert.equal(M.n, 3);
  assert.equal(M.mixed('s.threshold'), true);
  assert.equal(M.mixed('bg.mode'), false);
  assert.equal(M.value('bg.mode'), 'transparent');
  assert.equal(M.mixed('model'), false);
  assert.equal(M.value('model'), 'fast');           // they follow the app's model
  b.model = 'quality';
  assert.equal(CO.settings.merge([a, b], CO.state.modelOf).mixed('model'), true);
  assert.equal(CO.settings.merge([a], CO.state.modelOf).mixed('s.threshold'), false);
});

test('copy and paste: a plain copy, no background picture, unknown keys dropped', () => {
  const { CO, add } = app();
  const a = add('a', { 'bg.mode': 'color', 'bg.color': '#ff0000', 'shadow.on': true });
  a.bg.image = { big: true };
  const c = CO.settings.copy(a, CO.state.modelOf);
  assert.equal(c.bg.image, undefined);
  assert.equal(c.model, 'fast');
  c.bg.color = '#00ff00';
  assert.equal(a.bg.color, '#ff0000');              // a copy, not the image's own object
  const p = CO.settings.patchOf({ ...c, junk: 1, s: { ...c.s, nope: 3 } });
  assert.equal(p['bg.color'], '#00ff00');
  assert.equal(p['shadow.on'], true);
  assert.equal('s.nope' in p || 'junk' in p, false);
  assert.deepEqual(CO.settings.changes(a, p, CO.state.modelOf), ['bg.color']);
});

test('which changes run the model again: the model and edge refinement only', () => {
  const { CO } = app();
  assert.equal(CO.settings.needsModel(['model']), true);
  assert.equal(CO.settings.needsModel(['s.refine']), true);
  for (const p of CO.settings.PATHS.filter((x) => x !== 'model' && x !== 's.refine')) assert.equal(CO.settings.needsModel([p]), false, p);
});

test('agreed: the shared values, a mixed one from the fallback image', () => {
  const { CO, add } = app();
  const a = add('a', { 'bg.mode': 'color', 's.threshold': 0.2 }), b = add('b', { 'bg.mode': 'color', 's.threshold': 0.8 });
  const g = CO.settings.agreed([a, b], b, CO.state.modelOf);
  assert.equal(g.bg.mode, 'color');
  assert.equal(g.s.threshold, 0.8);
});

test('a bulk change: every image changes, looks re-finish without the model, one undo restores all', () => {
  const { CO, add, events, reruns } = app();
  const imgs = ['a', 'b', 'c'].map((id, i) => add(id, { 's.threshold': 0.4 + i * 0.1 }));
  const before = imgs.map((it) => JSON.stringify([it.s, it.bg, it.shadow]));
  const ses = CO.edit.begin(imgs);
  ses.change({ 's.threshold': 0.6 });
  ses.change({ 's.threshold': 0.65 });              // a drag: many inputs, one step
  assert.equal(ses.commit('Threshold'), 3);
  CO.edit.apply(imgs, { 'bg.mode': 'color', 'bg.color': '#ff00ff' }, 'Background');
  CO.edit.apply(imgs, { 'shadow.on': true }, 'Shadow');
  assert.deepEqual(imgs.map((it) => [it.s.threshold, it.bg.color, it.shadow.on]), imgs.map(() => [0.65, '#ff00ff', true]));
  assert.deepEqual(reruns, []);                     // no model run for looks
  assert.ok(events.filter(([t]) => t === 'look').length >= 9);
  assert.equal(imgs[0].hist.undo.length, 3);
  CO.history.undo(imgs[1]); CO.history.undo(imgs[1]); CO.history.undo(imgs[1]);   // undo on any one of them
  assert.deepEqual(imgs.map((it) => JSON.stringify([it.s, it.bg, it.shadow])), before);
  CO.history.redo(imgs[2]);
  assert.deepEqual(imgs.map((it) => it.s.threshold), [0.65, 0.65, 0.65]);
  assert.deepEqual(imgs.map((it) => it.bg.mode), ['transparent', 'transparent', 'transparent']);
});

test('an undo of one image alone stays alone (not grouped)', () => {
  const { CO, add } = app();
  const a = add('a'), b = add('b');
  CO.edit.apply([a], { 's.feather': 3 }, 'Feather');
  CO.edit.apply([a, b], { 's.feather': 5 }, 'Feather');
  CO.history.undo(a);
  assert.deepEqual([a.s.feather, b.s.feather], [3, 0]);
  CO.history.undo(a);
  assert.deepEqual([a.s.feather, b.s.feather], [0, 0]);
});

test('refinement re-runs the model; a model change pins only the images with another model', () => {
  const { CO, add, reruns, pins } = app();
  const a = add('a'), b = add('b', { model: 'quality' }), c = add('c');
  CO.edit.apply([a, b], { 's.refine': false }, 'Refine edges');
  assert.deepEqual(reruns, ['a', 'b']);
  CO.edit.apply([a, b, c], { model: 'quality' }, 'Model');
  assert.deepEqual(pins, [[['a', 'c'], 'quality']]);
});

test('copy settings, paste on a selection, apply to all: the same code path', () => {
  const { CO, add } = app();
  const a = add('a', { 'bg.mode': 'blur', 'bg.blur': 40, 'crop.mode': 'subject' }), b = add('b'), c = add('c'), d = add('d');
  CO.state.activeId = 'a';
  CO.edit.copy();
  CO.state.sel = new Set(['b', 'c']);
  CO.edit.paste();
  assert.deepEqual([b, c, d].map((it) => [it.bg.mode, it.bg.blur, it.crop.mode]), [['blur', 40, 'subject'], ['blur', 40, 'subject'], ['transparent', 24, 'original']]);
  assert.equal(b.hist.undo[0].label, 'Paste settings');
  assert.equal(b.hist.undo[0].group, c.hist.undo[0].group);
  CO.state.sel = new Set();
  CO.edit.applyToAll();
  assert.equal(d.bg.mode, 'blur');
  CO.history.undo(d);
  assert.equal(d.bg.mode, 'transparent');
  assert.equal(b.bg.mode, 'blur');                  // b's step was a no-op for apply-to-all: its paste stays
});
