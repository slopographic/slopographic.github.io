// Slop Effects model: keyframe interpolation (through the shared motion engine), parenting maths, seeded random
// motion, animate in and out, copy and paste of keys, undo and redo, and the config round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEffects, plain } from './effects-env.mjs';

/** deepEqual on a value that may come from the vm context (copied to plain data first). */
const dEq = (a, b, msg) => assert.deepEqual(plain(a), b, msg);

const ctx = await loadEffects();
const E = ctx.SlopEffects;
const { core, layers, keys, values, motion, history, project, defs } = E;

/** A 1000 x 1000 document with one solid layer whose position is keyed from (0, 0) to (100, 0). */
function sample() {
  let doc = core.newDoc({ name: 'Test', comp: { width: 1000, height: 1000, fps: 10, duration: 2 } });
  const r = layers.addLayer(doc, 'solid');
  doc = r.doc;
  doc = keys.setKeyAt(doc, r.id, 'position', 0, [0, 0], 'linear');
  doc = keys.setKeyAt(doc, r.id, 'position', 1, [100, 0], 'linear');
  return { doc, id: r.id };
}
const layerOf = (doc, id) => core.findLayer(doc, id);
const posAt = (doc, id, t) => values.valuesAt(doc, layerOf(doc, id), t).position;

test('linear keys interpolate and hold before and after the ends', () => {
  const { doc, id } = sample();
  dEq(posAt(doc, id, 0.5), [50, 0]);
  dEq(posAt(doc, id, -1), [0, 0]);
  dEq(posAt(doc, id, 9), [100, 0]);
});

test('easing comes from the shared engine: ease in is quadratic, and a bezier curve is used', () => {
  let { doc, id } = sample();
  doc = keys.setEase(doc, id, 'position', 0, 'easeInQuad');
  assert.ok(Math.abs(posAt(doc, id, 0.5)[0] - 25) < 1e-9, 'easeInQuad at half time is a quarter');
  doc = keys.setEase(doc, id, 'position', 0, [0.42, 0, 0.58, 1]);
  const mid = posAt(doc, id, 0.5)[0];
  assert.ok(Math.abs(mid - 50) < 1e-3, 'an ease-in-out bezier is symmetric');
  assert.throws(() => keys.setEase(doc, id, 'position', 0, [2, 0, 0, 1]));
});

test('hold keeps the start value until the next key', () => {
  let { doc, id } = sample();
  doc = keys.setEase(doc, id, 'position', 0, 'hold');
  dEq(posAt(doc, id, 0.9), [0, 0]);
  dEq(posAt(doc, id, 1), [100, 0]);
});

test('a child follows its parent: translation, scale and rotation about the anchor', () => {
  let doc = core.newDoc({ comp: { width: 1000, height: 1000, fps: 30, duration: 1 } });
  const p = layers.addLayer(doc, 'null');
  doc = layers.setBase(p.doc, p.id, 'position', [300, 200]);
  const c = layers.addLayer(doc, 'solid', { w: 100, h: 100 });
  doc = layers.setBase(c.doc, c.id, 'position', [10, 0]);
  doc = layers.setBase(doc, c.id, 'anchor', [0, 0]);
  doc = layers.setParent(doc, c.id, p.id);
  let st = values.frameState(doc, 0);
  dEq(values.apply(st.get(c.id).world, 0, 0), [310, 200]);
  doc = layers.setBase(doc, p.id, 'scale', [200, 200]);
  st = values.frameState(doc, 0);
  dEq(values.apply(st.get(c.id).world, 0, 0), [320, 200], 'the parent scale doubles the offset');
  doc = layers.setBase(doc, p.id, 'rotation', 90);
  st = values.frameState(doc, 0);
  const [x, y] = values.apply(st.get(c.id).world, 0, 0);
  assert.ok(Math.abs(x - 300) < 1e-9 && Math.abs(y - 220) < 1e-9, `rotated child at (${x}, ${y})`);
});

test('parenting refuses a loop and a missing parent', () => {
  let doc = core.newDoc({ comp: { width: 500, height: 500, fps: 30, duration: 1 } });
  const a = layers.addLayer(doc, 'null'); doc = a.doc;
  const b = layers.addLayer(doc, 'null'); doc = b.doc;
  doc = layers.setParent(doc, b.id, a.id);
  assert.throws(() => layers.setParent(doc, a.id, b.id), /loop/);
  assert.throws(() => layers.setParent(doc, a.id, a.id), /loop/);
  assert.throws(() => layers.setParent(doc, a.id, 'l999'), /no layer/);
});

test('random motion with the same seed gives the same keys, another seed differs, and keys stay in bounds', () => {
  const { doc, id } = sample();
  const opts = { seed: 0xbeef, props: ['position', 'opacity'], every: 0.25, bounds: { x: [100, 200], y: [300, 400], opacity: [20, 30] } };
  const a = motion.randomMotion(doc, id, opts);
  const b = motion.randomMotion(doc, id, { ...opts });
  dEq(plain(a.tl.tracks), plain(b.tl.tracks), 'same seed, same result');
  const c = motion.randomMotion(doc, id, { ...opts, seed: 7 });
  assert.notDeepEqual(plain(a.tl.tracks[id].position), plain(c.tl.tracks[id].position), 'another seed moves differently');
  for (const k of a.tl.tracks[id].position) {
    assert.ok(k.value[0] >= 100 && k.value[0] <= 200 && k.value[1] >= 300 && k.value[1] <= 400, 'position within bounds');
  }
  for (const k of a.tl.tracks[id].opacity) assert.ok(k.value >= 20 && k.value <= 30, 'opacity within bounds');
  const last = a.tl.tracks[id].position.at(-1).t;
  assert.equal(last, 2, 'a key lands on the end of the range');
  assert.ok(a.tl.tracks[id].position.length >= 8, 'a key every 0.25 s');
});

test('animate in starts at an offset and ends at rest; animate out does the reverse at the end', () => {
  let { doc, id } = sample();
  doc = layers.setBase(doc, id, 'position', [500, 500]);
  doc = keys.clearTrack(doc, id, 'position');
  const inDoc = motion.animate(doc, id, 'in', 'slide-up');
  const first = values.valuesAt(inDoc, layerOf(inDoc, id), 0).position;
  dEq(first, [500, 540], 'slide-up starts 40 px below rest');
  dEq(values.valuesAt(inDoc, layerOf(inDoc, id), 1.5).position, [500, 500], 'then rests');
  const outDoc = motion.animate(doc, id, 'out', 'slide-up');
  dEq(values.valuesAt(outDoc, layerOf(outDoc, id), 0.5).position, [500, 500], 'still at rest before the out');
  dEq(values.valuesAt(outDoc, layerOf(outDoc, id), 2).position, [500, 540], 'ends 40 px below');
  const pop = motion.animate(doc, id, 'in', 'pop');
  assert.ok(Math.abs(values.valuesAt(pop, layerOf(pop, id), 0).scale[0]) < 1e-9, 'pop starts at scale zero');
  assert.throws(() => motion.animate(doc, id, 'in', 'shake'), /unknown preset/);
});

test('keys: copy and paste keeps relative times, skips effects the layer lacks, and refuses bad payloads', () => {
  let { doc, id } = sample();
  const refs = [{ layer: id, prop: 'position', t: 0 }, { layer: id, prop: 'position', t: 1 }];
  const { payload, count } = keys.copyKeys(doc, refs);
  assert.equal(count, 2);
  assert.equal(payload.items[0].keys[1].dt, 1);
  const other = layers.addLayer(doc, 'solid');
  const pasted = keys.pasteKeys(other.doc, other.id, payload, 0.5);
  assert.equal(pasted.count, 2);
  dEq(keys.keysOf(pasted.doc, other.id, 'position').map((k) => k.t), [0.5, 1.5]);
  assert.throws(() => keys.pasteKeys(doc, id, { kind: 'nope' }, 0), /does not hold keyframes/);
  const fxPayload = { kind: keys.PAYLOAD, v: 1, items: [{ prop: 'fx.e99.radius', keys: [{ dt: 0, value: 4, ease: 'linear' }] }] };
  assert.equal(keys.pasteKeys(doc, id, fxPayload, 0).skipped, 1);
});

test('moving keys lands them on the new times and removes the old ones', () => {
  const { doc, id } = sample();
  const moved = keys.moveKeys(doc, [{ layer: id, prop: 'position', t: 1 }], -0.5);
  dEq(keys.keysOf(moved, id, 'position').map((k) => k.t), [0, 0.5]);
  const clamped = keys.moveKeys(doc, [{ layer: id, prop: 'position', t: 1 }], 10);
  assert.equal(keys.keysOf(clamped, id, 'position').at(-1).t, 2, 'clamped to the composition end');
});

test('effects: a keyed parameter is sampled, and clamping keeps values in range', () => {
  let doc = core.newDoc({ comp: { width: 400, height: 400, fps: 10, duration: 1 } });
  const l = layers.addLayer(doc, 'solid'); doc = l.doc;
  const f = layers.addEffect(doc, l.id, 'blur'); doc = f.doc;
  doc = keys.setKeyAt(doc, l.id, `fx.${f.id}.radius`, 0, 0);
  doc = keys.setKeyAt(doc, l.id, `fx.${f.id}.radius`, 1, 10);
  assert.equal(values.valuesAt(doc, layerOf(doc, l.id), 0.5).fx[f.id].radius, 5);
  doc = layers.setEffectParam(doc, l.id, f.id, 'radius', 9999);
  assert.equal(layerOf(doc, l.id).effects[0].params.radius, 200);
  const sh = layers.addEffect(doc, l.id, 'shadow'); doc = sh.doc;
  assert.throws(() => layers.setEffectParam(doc, l.id, sh.id, 'colour', '#fff'), /#rrggbb/);
  assert.throws(() => keys.setKeyAt(doc, l.id, `fx.${sh.id}.colour`, 0, 1), /cannot key/);
  assert.equal(defs.clampParam('grain', 'amount', -3), 0);
});

test('undo and redo walk back and forth through whole-document snapshots', () => {
  let doc = core.newDoc({ comp: { width: 300, height: 300, fps: 10, duration: 1 } });
  let h = history.create();
  const before = doc;
  doc = layers.addLayer(doc, 'solid').doc;
  h = history.push(h, before);
  assert.equal(doc.layers.length, 1);
  const u = history.undo(h, doc);
  assert.equal(u.doc.layers.length, 0);
  const r = history.redo(u.h, u.doc);
  assert.equal(r.doc.layers.length, 1);
  assert.equal(history.undo(history.create(), doc), null);
});

test('config round trip: rows validate, rebuild the same document and flatten back to the same rows', () => {
  const C = ctx.SlopConfig;
  C.registerKind(project.KIND, project.APP, C.F && project.kindSchema(C.F), () => {}, { label: 'Effects project' });
  let { doc, id } = sample();
  const fx = layers.addEffect(doc, id, 'glow'); doc = fx.doc;
  doc = keys.setKeyAt(doc, id, `fx.${fx.id}.intensity`, 0.5, 1.2, [0.25, 0.1, 0.25, 1]);
  doc = layers.setSource(doc, id, { color: '#ff0080' });
  const nul = layers.addLayer(doc, 'null'); doc = nul.doc;
  doc = layers.setParent(doc, nul.id, id);
  doc = { ...doc, media: [{ id: 'm1', name: 'clip.mp4', kind: 'video', w: 1920, h: 1080, dur: 3, size: 1234 }] };
  const data = project.toData(doc);
  const checked = project.checkConfig(C, data);
  assert.equal(checked.ok, true, JSON.stringify(checked.errors));
  dEq(project.problems(data), []);
  const back = project.fromData(JSON.parse(JSON.stringify(data)));
  dEq(plain(project.toData(back)), plain(data));
  assert.equal(back.seq >= doc.seq, true, 'new ids will not clash with old ones');
  const bad = { ...data, layers: [{ ...data.layers[0], parent: 'l404' }, ...data.layers.slice(1)] };
  assert.match(project.problems(bad).join(' '), /not in the file/);
  assert.equal(project.checkConfig(C, { ...data, extra: 1 }).ok, false, 'unknown keys are refused');
  const file = project.fromFile(project.toFile(doc));
  assert.equal(file.name, 'Test');
  assert.throws(() => project.fromFile('{"format":"other"}'), /not a Slop Effects/);
});

test('duplicating a layer copies its keys and effect keys under new ids', () => {
  let { doc, id } = sample();
  doc = layers.addEffect(doc, id, 'blur').doc;
  const fxId = doc.layers[0].effects[0].id;
  doc = keys.setKeyAt(doc, id, `fx.${fxId}.radius`, 0.5, 3);
  const dup = layers.duplicateLayer(doc, id);
  const copy = dup.doc.layers[0];
  assert.notEqual(copy.id, id);
  assert.notEqual(copy.effects[0].id, fxId);
  assert.equal(keys.keysOf(dup.doc, copy.id, `fx.${copy.effects[0].id}.radius`).length, 1);
  assert.equal(keys.keysOf(dup.doc, copy.id, 'position').length, 2);
});
