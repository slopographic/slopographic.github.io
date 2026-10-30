// Node unit tests for shared/presets: built-ins are valid, save and load round-trip, the .slop.json envelope, invalid
// presets are refused without touching the store, the shared 'preset' config kind, and the motion conversions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './presets-env.mjs';

const { SlopPresets: SP, SlopConfig: C, SlopMotion: MO } = await load();
const strip = (p) => { const { id, builtin, created, modified, ...data } = p; return data; };
const text = (r) => r.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
/** A store that counts writes, so a refused save can be shown to write nothing. */
function counting() {
  const base = SP.memoryStore(), log = { puts: 0, removes: 0 };
  return { log, store: { list: base.list, put: async (r) => { log.puts++; return base.put(r); }, remove: async (id) => { log.removes++; return base.remove(id); } } };
}
const goodEffect = () => ({ kind: 'effect', label: 'Brand glow', description: 'Lime halo', apps: ['photoslop'],
  params: { effects: [{ type: 'glow', p: { color: '#d4ff3a', op: 80, spread: 3, size: 20 } }] } });
const goodMotion = () => ({ kind: 'motion', label: 'Quick rise', apps: ['slides', 'remix'],
  params: { duration: 0.4, tracks: { y: [{ t: 0, value: 0.1, ease: 'easeOutCubic' }, { t: 0.4, value: 0 }], opacity: [{ t: 0, value: 0 }, { t: 0.4, value: 1 }] } } });

test('every built-in preset is valid and ids are unique and reserved', () => {
  const all = SP.builtins();
  assert.ok(all.length >= 25, `expected at least 25 built-ins, got ${all.length}`);
  const ids = new Set();
  for (const b of all) {
    assert.ok(!ids.has(b.id), `duplicate id ${b.id}`);
    ids.add(b.id);
    assert.ok(!b.id.startsWith(SP.ID_PREFIX), `${b.id} uses the reserved user prefix`);
    const r = SP.validate(strip(b));
    assert.ok(r.ok, `${b.id}: ${text(r)}`);
  }
});

test('built-ins cover the requested effects and motions', () => {
  const types = new Set(SP.builtins().filter((b) => b.kind === 'effect').flatMap((b) => b.params.effects.map((e) => e.type)));
  for (const t of ['drop-shadow', 'glow', 'blur', 'sharpen', 'grain', 'vignette', 'colour-shift', 'glitch', 'stroke', 'bevel', 'colour-look']) assert.ok(types.has(t), `no built-in uses ${t}`);
  const motion = new Set(SP.builtins().filter((b) => b.kind === 'motion').map((b) => b.id));
  for (const id of ['fade-in', 'slide-up', 'slide-left', 'zoom-in', 'bounce', 'pop', 'shake', 'pulse', 'spin-in']) assert.ok(motion.has(id), `missing motion ${id}`);
});

test('every motion built-in ends at its rest pose, so it leaves the object as it was', () => {
  const rest = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 };
  for (const b of SP.builtins().filter((x) => x.kind === 'motion')) {
    for (const [prop, keys] of Object.entries(b.params.tracks)) {
      const last = keys[keys.length - 1];
      if (prop === 'opacity' || prop === 'scale') assert.equal(last.value, rest[prop], `${b.id} ${prop}`);
      else assert.equal(last.value, 0, `${b.id} ${prop}`);
    }
  }
});

test('save then load round-trips a preset through the store', async () => {
  const { log, store } = counting();
  SP.setStore(store);
  const saved = await SP.save(goodEffect());
  assert.equal(saved.ok, true, saved.errors && text(saved));
  assert.ok(saved.id.startsWith(SP.ID_PREFIX));
  assert.equal(log.puts, 1);
  assert.deepEqual(plain(strip(SP.get(saved.id))), plain(strip(goodEffect())));
  assert.ok(SP.list({ kind: 'effect', app: 'photoslop' }).some((p) => p.id === saved.id));
  assert.ok(!SP.list({ kind: 'effect', app: 'slides' }).some((p) => p.id === saved.id), 'a photoslop effect is not listed for slides');

  // A fresh registry over the same store sees the same preset.
  SP.setStore(store);
  assert.equal(SP.isLoaded(), false);
  assert.equal(await SP.load(), 1);
  assert.equal(SP.isLoaded(), true);
  assert.equal(SP.get(saved.id).label, 'Brand glow');
  assert.equal(SP.get(saved.id).builtin, false);
});

test('saving over an existing id keeps the id and the created time', async () => {
  SP.setStore(SP.memoryStore());
  const a = await SP.save(goodEffect());
  const b = await SP.save(Object.assign(goodEffect(), { label: 'Renamed glow' }), { id: a.id });
  assert.equal(b.id, a.id);
  assert.equal(SP.list({ kind: 'effect' }).filter((p) => !p.builtin).length, 1);
  assert.equal(SP.get(a.id).label, 'Renamed glow');
});

test('the .slop.json envelope round-trips and imports as a new preset', async () => {
  SP.setStore(SP.memoryStore());
  const saved = await SP.save(goodMotion());
  const file = SP.exportFile(saved.id);
  assert.equal(file.name, 'Quick rise.slop.json');
  const env = JSON.parse(SP.exportText(saved.id));
  assert.equal(env.format, 'slop-config');
  assert.equal(env.kind, 'preset');
  assert.equal(env.app, 'slop');
  const v = SP.fromEnvelope(env);
  assert.equal(v.ok, true, text(v));
  assert.deepEqual(plain(v.value), plain(strip(goodMotion())));

  const imp = await SP.importText(SP.exportText(saved.id));
  assert.equal(imp.ok, true, text(imp));
  assert.notEqual(imp.id, saved.id, 'an import is a new preset');
  assert.equal(SP.get(imp.id).kind, 'motion');
});

test('the shared config kind accepts the preset envelope and refuses a broken one', async () => {
  const env = SP.toEnvelope({ ...goodEffect(), id: 'u-x', created: 0 });
  const ok = C.validate(env, { app: 'photoslop' });
  assert.equal(ok.ok, true, text(ok));
  const bad = JSON.parse(JSON.stringify(env));
  bad.data.params.effects[0].p.op = 500;
  const r = C.validate(bad, { app: 'photoslop' });
  assert.equal(r.ok, false);
  assert.match(text(r), /op/);
});

test('invalid presets are refused and nothing is written', async () => {
  const { log, store } = counting();
  SP.setStore(store);
  const cases = {
    'unknown effect type': () => { const p = goodEffect(); p.params.effects[0].type = 'sparkle'; return p; },
    'out-of-range value': () => { const p = goodEffect(); p.params.effects[0].p.size = 900; return p; },
    'missing setting': () => { const p = goodEffect(); delete p.params.effects[0].p.spread; return p; },
    'unknown setting': () => { const p = goodEffect(); p.params.effects[0].p.wobble = 2; return p; },
    'colour not hex': () => { const p = goodEffect(); p.params.effects[0].p.color = 'red'; return p; },
    'effect not in this app': () => { const p = goodEffect(); p.apps = ['slopedit']; return p; },
    'unknown app': () => { const p = goodEffect(); p.apps = ['nope']; return p; },
    'empty label': () => { const p = goodEffect(); p.label = '   '; return p; },
    'unknown top key': () => { const p = goodEffect(); p.id = 'u-hand-made'; return p; },
    'zero duration': () => { const p = goodMotion(); p.params.duration = 0; return p; },
    'keys out of order': () => { const p = goodMotion(); p.params.tracks.y = [{ t: 0.3, value: 0 }, { t: 0.1, value: 1 }]; return p; },
    'key past the duration': () => { const p = goodMotion(); p.params.tracks.y[1].t = 0.9; return p; },
    'unknown motion property': () => { const p = goodMotion(); p.params.tracks.translateX = p.params.tracks.y; return p; },
    'unknown ease': () => { const p = goodMotion(); p.params.tracks.y[0].ease = 'wobble'; return p; },
    'motion in a photo app': () => { const p = goodMotion(); p.apps = ['photoslop']; return p; },
  };
  for (const [name, make] of Object.entries(cases)) {
    const r = await SP.save(make());
    assert.equal(r.ok, false, `${name} should be refused`);
    assert.ok(r.errors.length >= 1 && r.errors[0].message, `${name} needs a reason`);
  }
  assert.equal(log.puts, 0, 'no refused preset reaches the store');
  assert.equal(SP.list({ kind: 'effect' }).filter((p) => !p.builtin).length, 0);
});

test('a bad file is refused on import, and built-ins cannot be changed or removed', async () => {
  SP.setStore(SP.memoryStore());
  assert.equal((await SP.importText('{not json')).ok, false);
  assert.equal((await SP.importText(JSON.stringify({ format: 'slop-config', version: 1, kind: 'template', app: 'tables', name: 'x', created: '2026-01-01T00:00:00Z', data: {} }))).ok, false);
  const bad = SP.toEnvelope({ ...goodMotion(), created: 0 });
  bad.data.params.duration = -1;
  const r = await SP.importText(JSON.stringify(bad));
  assert.equal(r.ok, false);
  assert.match(SP.errorText(r.errors), /duration/);
  assert.equal((await SP.save(goodEffect(), { id: 'glow' })).ok, true, 'a new preset is not built-in');
  assert.equal((await SP.save(goodEffect(), { id: 'soft-shadow' })).ok, false, 'a built-in id cannot be overwritten');
  assert.equal((await SP.remove('soft-shadow')).ok, false);
});

test('motion conversions: Slides px, Cut px keys, Remix poses', () => {
  const slide = SP.get('slide-left');
  const r = SP.motion.toSlides(slide.params, { at: 1, timeScale: 2, frame: { w: 1280, h: 720 } });
  assert.equal(r.props.translateX[0].value, -1280, 'x fraction scales by the frame width');
  assert.equal(r.props.translateX[0].t, 1, 'starts at the given time');
  assert.equal(r.end, 2, 'duration stretches by timeScale');
  const up = SP.motion.toSlides(SP.get('slide-up').params, {});
  assert.equal(Math.round(up.props.translateY[0].value), 40, 'slide-up is 40 px on the default 960 x 540 slide');

  const tl = MO.timeline.create({ duration: 0 });
  const tl2 = SP.motion.applyToTimeline(tl, SP.get('fade-in').params, 'slide-1#a', { at: 0, timeScale: 1 });
  assert.equal(tl2.duration, 0.4);
  assert.ok(tl2.tracks['slide-1#a'].opacity, 'opacity track on the target');

  const cut = SP.motion.toCut(SP.get('slide-right').params, 1920, 1080, 0.25);
  assert.equal(cut.x[0].value, 1920, 'Cut stores x in px');
  assert.equal(cut.x[cut.x.length - 1].t, 0.25, 'cut short at the clip length');
  assert.equal(cut.x[cut.x.length - 1].value, 0, 'and settled at neutral there');

  const keys = SP.motion.toRemixKeys(SP.get('pop').params, 0.25);
  assert.equal(keys[0].pose.scale, 0);
  assert.equal(keys[keys.length - 1].t, 0.25, 'fitted to the slot');
  assert.equal(keys[keys.length - 1].pose.scale, 1);
});

test('built-in names, descriptions and effect type labels come from the ui tables, in Swedish too, and still validate', async () => {
  const { context, plain: copy } = await import('./ui-tables-env.mjs');
  assert.equal(SP.get('soft-shadow').label, 'Soft shadow', 'read from the en table (shared/i18n/ui/en/presets.js), no English kept in the list');
  const files = ['shared/motion/easing.js', 'shared/motion/track.js', 'shared/presets/core.js', 'shared/presets/builtins-effect.js', 'shared/presets/builtins-motion.js'];
  const sv = context(files, 'sv').SlopPresets;
  assert.equal(sv.get('bw-look').label, 'Svartvitt');
  assert.equal(sv.get('spin-in').description, 'Gör ett helt varv medan den växer in');
  assert.equal(sv.EFFECT_TYPES.bevel.label, 'Avfasning och relief');
  for (const b of sv.builtins()) assert.equal(sv.validate(strip(copy(b))).ok, true, b.id);
  const en = context(files, 'en').SlopPresets;
  assert.equal(en.get('soft-shadow').label, 'Soft shadow');
  assert.equal(en.isBuiltin('pulse'), true);
});
