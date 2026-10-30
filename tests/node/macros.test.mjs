// App macros: the macro format and files, the one replay, the one recorder (on a fake SlopCmd), the store (on a fake
// SlopDb wrapper) and the macros as Slop Workflows steps (registry provide, the one runner).
// Run: node --test tests/node/macros.test.mjs
// Covers: shared/macros/core.js, shared/macros/store.js, shared/ops/macros.js, shared/ops/all.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from './ui-i18n-en.mjs';   // the shared components' words (shared/i18n/ui), as a page has them
import { createRequire } from 'node:module';
import * as R from '../../shared/ops/all.js';
import { macroOp, loadMacros, onMacros, HOSTS, foldOptions } from '../../shared/ops/macros.js';
import { plan } from '../../workflows/js/core/plan.js';

const require = createRequire(import.meta.url);
const M = require('../../shared/macros/core.js');
const ST = require('../../shared/macros/store.js');

test('a macro is normalized: bad steps are left out with a reason, args keep plain values and JSON data (a json argument)', () => {
  const { macro, errors } = M.normalize({ app: 'photoslop', name: '  Auto  levels ', steps: [
    { cmd: 'ps.ai.levels', args: { preset: 'auto', list: { x: 1 }, n: 2, f: Infinity, fn: () => 1 }, title: 'Levels' }, { cmd: 'no spaces allowed' }, 'x'] });
  assert.equal(macro.name, 'Auto levels');
  assert.equal(macro.app, 'photoslop');
  assert.deepEqual(macro.steps, [{ cmd: 'ps.ai.levels', args: { preset: 'auto', list: { x: 1 }, n: 2 }, title: 'Levels' }]);
  assert.equal(errors.length, 2);
  assert.match(macro.id, /^m/);
  assert.equal(M.normalize({ kind: 'slopflow' }).macro, null);
  assert.equal(M.opId('photoslop', 'm1'), 'macro:photoslop:m1');
});

test('.slopmacro files: one macro or several, round trip, and a file from another app says so', () => {
  const a = M.normalize({ app: 'photoslop', name: 'A', steps: [{ cmd: 'ps.ai.sharpen', args: { amount: 80 } }] }).macro;
  const b = M.normalize({ app: 'photoslop', name: 'B', steps: [{ cmd: 'ps.ai.crop', args: { ratio: '1:1' } }] }).macro;
  const one = M.fromText(M.toText([a], 'photoslop'), 'photoslop');
  assert.deepEqual(one.macros.map((m) => [m.id, m.name, m.steps[0].args.amount]), [[a.id, 'A', 80]]);
  assert.equal(JSON.parse(M.toText([a, b], 'photoslop')).kind, 'slopmacros');
  assert.deepEqual(M.fromText(M.toText([a, b], 'photoslop')).macros.map((m) => m.name), ['A', 'B']);
  assert.match(M.fromText(M.toText([a]), 'watermark').errors[0], /made in photoslop/);
  assert.match(M.fromText('nope').errors[0], /not JSON/);
});

test('replay runs every step in order through exec, stops at the first that does not work, and can be cancelled', async () => {
  const ran = [];
  const exec = async (cmd, args) => { ran.push([cmd, args]); return cmd === 'bad' ? { ok: false, error: 'There is no layer' } : { ok: true, value: cmd }; };
  let prepared = 0;
  assert.deepEqual(await M.replay([{ cmd: 'a', args: { x: 1 } }, { cmd: 'b' }], { exec, prepare: () => { prepared++; } }), ['a', 'b']);
  assert.deepEqual(ran, [['a', { x: 1 }], ['b', {}]]);
  assert.equal(prepared, 1);
  await assert.rejects(M.replay([{ cmd: 'a' }, { cmd: 'bad', title: 'Sharpen' }, { cmd: 'c' }], { exec }), /Step 2 of 3 \(Sharpen\) did not work: There is no layer/);
  assert.ok(!ran.some(([c]) => c === 'c'));
  const ac = new AbortController(); ac.abort();
  await assert.rejects(M.replay([{ cmd: 'a' }], { exec, signal: ac.signal }), (e) => e.name === 'AbortError');
  await assert.rejects(M.replay([], { exec }), /no steps/);
});

// Covers: shared/i18n/ui/en/macros.js, shared/i18n/ui/sv/macros.js
test('the replay and the file checks speak the chosen language (keys ui.macro.*, read when the message is made)', async () => {
  const exec = async (cmd) => (cmd === 'bad' ? { ok: false, error: 'x' } : { ok: true, value: cmd });
  setLang('sv');
  try {
    await assert.rejects(M.replay([{ cmd: 'a' }, { cmd: 'bad', title: 'Skärpa' }], { exec }), /^Error: Steg 2 av 2 \(Skärpa\) fungerade inte: x$/);
    await assert.rejects(M.replay([], { exec }), /Makrot har inga steg/);
    assert.deepEqual(M.fromText('{', 'photoslop').errors, ['Filen är inte ett makro (den är inte JSON).']);
    assert.equal(M.normalize({ app: 'photoslop', steps: [{ cmd: 'a' }] }).macro.name, 'Namnlöst makro');
  } finally { setLang('en'); }
  await assert.rejects(M.replay([], { exec }), /This macro has no steps/);
});

/** A small stand-in for SlopCmd: exec checks nothing and emits 'run' like the real one. */
function fakeCmd() {
  const cmds = new Map(), on = [];
  const C = {
    register: (l) => l.forEach((c) => cmds.set(c.id, c)), get: (id) => cmds.get(id) || null,
    on: (t, fn) => on.push(fn),
    async exec(id, args, ctx = {}) { const c = cmds.get(id); const value = await c.run(args || {}); on.forEach((fn) => fn({ id, source: ctx.source || 'api', args })); return { ok: true, value, args: args || {} }; },
    key(id) { cmds.get(id).run(null); on.forEach((fn) => fn({ id, source: 'key' })); },
  };
  return C;
}

test('the recorder keeps the outermost commands with args and what the app notes, never its own steps twice', async () => {
  const C = fakeCmd();
  let rec;
  C.register([
    { id: 'ps.ai.sharpen', title: 'Sharpen', args: [{ name: 'amount' }], run: () => rec.note('ps.ai.filter', { filter: 'unsharp' }, 'inner') },
    { id: 'ps.ai.export', title: 'Export', args: [], macro: false, run: () => {} },
    { id: 'ps.view-zoom', title: 'Zoom in', run: () => {} },
    { id: 'ps.ai.flip', title: 'Flip', args: [{ name: 'direction' }], run: () => {} },
    { id: 'macro.play', title: 'Play', args: [{ name: 'name' }], run: () => {} },
  ]);
  const seen = [];
  rec = M.createRecorder(C, { onChange: (s) => seen.push(s && s.length) });
  await C.exec('ps.ai.sharpen', { amount: 80 });
  assert.equal(rec.steps(), null, 'nothing is kept before Record');
  rec.start();
  await C.exec('ps.ai.sharpen', { amount: 80 });
  await C.exec('ps.ai.export', {});
  await C.exec('ps.view-zoom', {});
  await C.exec('macro.play', { name: 'x' });
  C.key('ps.ai.flip');
  rec.note('ps.ai.filter', { filter: 'autocontrast', params: '{}' }, 'Auto Contrast');
  await rec.playing(async () => { await C.exec('ps.ai.sharpen', { amount: 1 }); rec.note('ps.ai.crop', {}); });
  assert.deepEqual(rec.steps().map((s) => [s.cmd, s.title]), [['ps.ai.sharpen', 'Sharpen'], ['ps.ai.flip', 'Flip'], ['ps.ai.filter', 'Auto Contrast']]);
  assert.deepEqual(rec.steps()[0].args, { amount: 80 });
  rec.remove(1);
  assert.deepEqual(rec.stop().map((s) => s.cmd), ['ps.ai.sharpen', 'ps.ai.filter']);
  assert.equal(rec.recording, false);
  assert.ok(seen.length >= 4);
});

/** An in-memory SlopDb wrapper. */
function memDb() {
  const rows = new Map();
  return { getAll: async () => [...rows.values()].map((r) => structuredClone(r)), get: async (_, id) => structuredClone(rows.get(id)) || null,
    put: async (_, v) => { rows.set(v.id, structuredClone(v)); }, remove: async (_, id) => { rows.delete(id); } };
}

test('the store keeps macros per app, newest first, and tells who listens', async () => {
  ST.use(memDb());
  const told = [];
  const off = ST.onChange((app) => told.push(app));
  const a = await ST.save(M.normalize({ app: 'photoslop', name: 'A', steps: [{ cmd: 'x' }] }).macro);
  await new Promise((r) => setTimeout(r, 5));
  await ST.save(M.normalize({ app: 'photoslop', name: 'B', steps: [{ cmd: 'y' }] }).macro);
  await ST.save(M.normalize({ app: 'watermark', name: 'W', steps: [{ cmd: 'z' }] }).macro);
  assert.deepEqual((await ST.list('photoslop')).map((m) => m.name), ['B', 'A']);
  assert.equal((await ST.get(a.id)).name, 'A');
  assert.equal(await ST.remove(a.id), true);
  assert.deepEqual((await ST.list('photoslop')).map((m) => m.name), ['B']);
  assert.deepEqual(told, ['photoslop', 'photoslop', 'watermark', 'photoslop']);
  off();
});

test('saved macros are Workflows steps under their app: kinds, options, and they run on the one runner', async () => {
  ST.use(memDb());
  const m = await ST.save(M.normalize({ app: 'photoslop', name: 'Auto levels + square + sharpen', steps: [
    { cmd: 'ps.ai.filter', args: { filter: 'autocontrast', params: '{}' }, title: 'Auto Contrast' }, { cmd: 'ps.ai.crop', args: { ratio: '1:1' }, title: 'Crop' }] }).macro);
  let changed = 0;
  onMacros(() => changed++);
  await loadMacros(ST);
  assert.ok(changed >= 1);
  const op = R.byId(M.opId('photoslop', m.id));
  assert.ok(op, 'the macro is an operation');
  assert.equal(op.kind, 'macro'); assert.equal(op.app, 'photoslop'); assert.equal(op.macroId, m.id);
  assert.equal(op.label, 'Auto levels + square + sharpen');
  assert.ok(R.apps().find((g) => g.label === 'PhotoSlop').ops.includes(op) || R.apps().find((g) => g.label === 'PhotoSlop').ops.some((o) => o.id === op.id));
  assert.equal(R.outOf(op, 'jpg', { format: 'same' }), 'jpg');
  assert.equal(R.outOf(op, 'psd', { format: 'same' }), 'png');
  assert.equal(R.outOf(op, 'png', { format: 'webp' }), 'webp');
  assert.ok(R.accepts(op, 'psd') && R.accepts(op, 'png') && !R.accepts(op, 'pdf'));
  assert.equal(R.validateOptions(op, { quality: 300 }).options.quality, 100);
  assert.ok(HOSTS.photoslop.url.includes('macro-host=1'));
  const doc = { steps: [{ kind: 'macro', id: op.id, app: 'photoslop', macroId: m.id, options: { format: 'jpg' } }] };
  const p = plan(doc, R);
  assert.deepEqual(p.errors, []);
  assert.equal(p.steps[0].conv.id, op.id);
  assert.equal(p.steps[0].to('png', p.options[0]), 'jpg');
  assert.equal(macroOp('photoslop', m).description, 'Your PhotoSlop macro: Auto Contrast → Crop.');
  await ST.remove(m.id); await loadMacros(ST);
  assert.equal(R.byId(op.id), null);
  assert.match(plan(doc, R).errors[0], /not available/);
});

test('a SlopIsolate macro folds its look steps into Remove background\'s options; any other step says it needs the app', async () => {
  const f = await foldOptions('slopisolate', [{ cmd: 'co.look', args: { background: 'color', color: '#00ff00' } }, { cmd: 'co.look', args: { shadow: true, model: 'portrait' } }]);
  assert.equal(f.op.id, 'slopisolate.remove-bg');
  assert.deepEqual([f.options.background, f.options.color, f.options.shadow, f.options.model, f.options.crop], ['color', '#00ff00', true, 'portrait', false]);
  await assert.rejects(foldOptions('slopisolate', [{ cmd: 'co.view-fit', title: 'Fit' }]), /Step 1 of 1 \(Fit\).*only works in SlopIsolate itself/);
  const op = macroOp('slopisolate', M.normalize({ app: 'slopisolate', name: 'Green', steps: [{ cmd: 'co.look', args: {} }] }).macro);
  assert.equal(op.ext, 'png'); assert.equal(op.options.length, 0); assert.equal(op.notice, 'slopisolate');
});
