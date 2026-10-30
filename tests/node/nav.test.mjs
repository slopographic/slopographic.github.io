// Node unit tests for shared/nav: presets validate, wheel and key decisions, clashes, the store
// round trip (Custom bindings saved per app) and rejection of bad bindings. No DOM needed.
// Covers: shared/nav/presets.js, shared/nav/validate.js, shared/nav/logic.js, shared/nav/describe.js, shared/nav/store.js, shared/nav/engine.js, shared/nav/pad.js, shared/nav/modal.js, shared/nav/index.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const NAV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'nav');
const FILES = ['presets.js', 'validate.js', 'logic.js', 'describe.js', 'store.js', 'engine.js', 'pad.js', 'modal.js', 'index.js'];

/** A Map-like localStorage stand-in. Pass the same object to two loads to simulate a reload. */
function fakeStorage() {
  const data = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}
const I18N = path.join(NAV, '..', 'i18n');
/** Loads the classic scripts into a fresh vm context and returns window.SlopNav. The words (shared/i18n/ui/<code>/print.js)
 * come first, as on a page: English, or Swedish with lang 'sv'. */
async function load(storage, lang = 'en') {
  const ctx = { console, addEventListener() {} };
  ctx.window = ctx;
  if (storage) ctx.localStorage = storage;
  vm.createContext(ctx);
  vm.runInContext(await readFile(path.join(I18N, 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
  vm.runInContext(`window.SlopI18n = window.SlopI18n.create({ defaultLang: '${lang}', profile: null });`, ctx);
  for (const f of ['en.js', 'en/print.js', ...(lang === 'en' ? [] : [lang + '.js', lang + '/print.js'])]) vm.runInContext(await readFile(path.join(I18N, 'ui', f), 'utf8'), ctx, { filename: f });
  for (const f of FILES) vm.runInContext(await readFile(path.join(NAV, f), 'utf8'), ctx, { filename: f });
  return ctx.SlopNav;
}
const plain = (v) => JSON.parse(JSON.stringify(v)); // copies vm-realm values so deepEqual compares plain data
const wheel = (o) => Object.assign({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, o);
const key = (o) => Object.assign({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, o);

const N = await load();
const PS = N.presets.get('photoshop').bindings;
const SLOP = N.presets.get('slop').bindings;

test('every built-in preset validates and has the same keys', () => {
  const keys = plain(N.validate.KEYS.slice().sort());
  for (const p of N.presets.list()) {
    const r = N.validate.validate(p.bindings);
    assert.equal(r.ok, true, `${p.id}: ${r.errors.join('; ')}`);
    assert.deepEqual(plain(Object.keys(p.bindings).sort()), keys, p.id);
  }
  assert.deepEqual(plain(N.presets.list().map((p) => p.id)), ['slop', 'photoshop', 'illustrator', 'figma', 'custom']);
});

test('Photoshop-style: Alt + wheel zooms, plain wheel does not', () => {
  const alt = N.logic.wheelAction(PS, wheel({ deltaY: -100, altKey: true }));
  assert.equal(alt.kind, 'zoom');
  assert.ok(alt.factor > 1, 'wheel up with Alt zooms in');
  const plainWheel = N.logic.wheelAction(PS, wheel({ deltaY: -100 }));
  assert.notEqual(plainWheel && plainWheel.kind, 'zoom', 'plain wheel must not zoom');
  assert.equal(plainWheel.kind, 'pan', 'plain wheel scrolls under Photoshop-style');
});

test('Slop: plain wheel zooms around the pointer, Shift + wheel pans sideways', () => {
  assert.equal(N.logic.wheelAction(SLOP, wheel({ deltaY: 120 })).kind, 'zoom');
  const h = N.logic.wheelAction(SLOP, wheel({ deltaY: 40, shiftKey: true }));
  assert.deepEqual([h.kind, h.dx, h.dy], ['pan', -40, 0]);
});

test('Figma-style and Illustrator-style: Ctrl or Cmd + wheel zooms, wheel pans, trackpad pinch zooms', () => {
  const F = N.presets.get('figma').bindings, I = N.presets.get('illustrator').bindings;
  for (const b of [F, I]) {
    assert.equal(N.logic.wheelAction(b, wheel({ deltaY: -30, ctrlKey: true })).kind, 'zoom');
    assert.equal(N.logic.wheelAction(b, wheel({ deltaY: -30, metaKey: true })).kind, 'zoom');
    assert.equal(N.logic.wheelAction(b, wheel({ deltaX: 5, deltaY: 9 })).kind, 'pan');
  }
  assert.equal(N.logic.wheelAction(F, wheel({ deltaY: -2, ctrlKey: true })).kind, 'zoom', 'a small ctrl-wheel delta is a pinch');
});

test('wheel decisions use the lines and pages delta modes', () => {
  const a = N.logic.wheelAction(SLOP, wheel({ deltaY: 3, deltaMode: 1 }));
  const b = N.logic.wheelAction(SLOP, wheel({ deltaY: 48 }));
  assert.equal(a.factor, b.factor, '3 lines equal 48 px');
});

test('key actions match the presets, with Mod meaning Ctrl or Cmd', () => {
  assert.deepEqual(plain(N.logic.keyAction(PS, key({ key: '0', code: 'Digit0', ctrlKey: true }))), { action: 'fit' });
  assert.deepEqual(plain(N.logic.keyAction(PS, key({ key: '1', code: 'Digit1', metaKey: true }))), { action: 'actual' });
  assert.deepEqual(plain(N.logic.keyAction(PS, key({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true }))), { action: 'zoomIn' }, 'Ctrl+Shift+= is zoom in');
  assert.deepEqual(plain(N.logic.keyAction(PS, key({ key: '-', code: 'Minus', ctrlKey: true }))), { action: 'zoomOut' });
  assert.equal(N.logic.keyAction(PS, key({ key: '0', code: 'Digit0' })), null, 'a bare 0 does nothing');
  const F = N.presets.get('figma').bindings;
  assert.deepEqual(plain(N.logic.keyAction(F, key({ key: '!', code: 'Digit1', shiftKey: true }))), { action: 'fit' }, 'Shift+1 fits in Figma-style');
  const I = N.presets.get('illustrator').bindings;
  assert.deepEqual(plain(N.logic.keyAction(I, key({ key: 'h', code: 'KeyH' }))), { action: 'hand' });
});

test('clashes: a preset key that another command uses is reported, the same action is not', () => {
  const shortcuts = [
    { combo: 'Ctrl+0', title: 'Fit on Screen', action: 'fit' },
    { combo: 'Ctrl+1', title: '100%', action: 'actual' },
    { combo: 'H', title: 'Hand Tool', action: 'handTool' },
  ];
  assert.equal(N.logic.clashes(PS, shortcuts).length, 0, 'Photoshop-style Ctrl+0 and Ctrl+1 are the same actions');
  const I = N.presets.get('illustrator').bindings;
  const c = N.logic.clashes(I, shortcuts);
  assert.equal(c.length, 1, 'Illustrator-style H clashes with the Hand Tool key');
  assert.equal(c[0].binding, 'handKey');
  assert.equal(c[0].title, 'Hand Tool');
  assert.equal(c[0].action, 'hand');
  const clash = N.logic.clashes(PS, [{ combo: 'Shift+Ctrl+=', title: 'Zoom In (other)', action: 'fit' }]);
  assert.equal(clash.length, 1, 'Shift+Ctrl+= is the same key as Mod+= and does clash with a different action');
});

test('validate rejects unknown keys and bad values without throwing', () => {
  const bad = [
    { ...SLOP, zoomWheel: 'super' },
    { ...SLOP, nope: true },
    { ...SLOP, spacePan: 'yes' },
    { ...SLOP, fitKey: 'Hyper+0' },
    { ...SLOP, zoomInKeys: ['Mod++'] },
    { ...SLOP, zoomInKeys: ['a', 'b', 'c', 'd', 'Mod+='] },
    { ...SLOP, zoomWheel: 'plain', panWheel: 'plain' },
    { ...SLOP, fitKey: 'Mod+0', actualKey: 'Mod+0' },
    (() => { const b = { ...SLOP }; delete b.pinch; return b; })(),
  ];
  for (const b of bad) {
    let r;
    assert.doesNotThrow(() => { r = N.validate.validate(b); });
    assert.equal(r.ok, false, JSON.stringify(b).slice(0, 80));
    assert.ok(r.errors.length > 0);
  }
  for (const junk of [null, undefined, 'x', 3, [], () => 1]) {
    let r;
    assert.doesNotThrow(() => { r = N.validate.validate(junk); });
    assert.equal(r.ok, false);
  }
  const loose = N.validate.validate({ ...SLOP, fitKey: 'mod+0', zoomInKeys: ['Shift+Mod+='] });
  assert.equal(loose.ok, true);
  assert.equal(loose.value.fitKey, 'Mod+0', 'combos are normalised');
  assert.deepEqual(plain(loose.value.zoomInKeys), ['Mod+='], 'Shift is dropped for = and -');
});

test('setCustom rejects invalid bindings and saves nothing', () => {
  const storage = fakeStorage();
  const n = load(storage);
  return n.then((S) => {
    const r = S.store.setCustom('photoslop', { ...SLOP, zoomWheel: 'warp' }, 'slop');
    assert.equal(r.ok, false);
    assert.equal(storage.data['slop-nav'], undefined, 'nothing written');
    assert.equal(S.store.resolve('photoslop').id, 'slop');
  });
});

test('a Custom binding round trips through the store, per app, across a reload', async () => {
  const storage = fakeStorage();
  const first = await load(storage);
  const mine = { ...first.presets.get('photoshop').bindings, zoomWheel: 'shift', panWheel: 'plain', fitKey: 'Alt+0' };
  const saved = first.store.setCustom('photoslop', mine, 'photoshop');
  assert.equal(saved.ok, true, saved.errors.join('; '));
  assert.equal(first.store.setPreset('photoslop', 'custom').ok, true);
  assert.equal(first.store.setPreset('photoslop', 'custom').ok, true);
  assert.ok(storage.data['slop-nav'], 'written to slop-nav');
  assert.equal(first.store.setPreset('photoslop', 'nope').ok, false, 'unknown preset rejected');

  const second = await load(storage); // a new page load reads the same storage
  const r = second.store.resolve('photoslop');
  assert.equal(r.id, 'custom');
  assert.deepEqual(plain(r.bindings), plain(second.validate.validate(mine).value));
  assert.equal(second.store.resolve('figma').id, 'slop', 'other apps keep their own preset');
  assert.equal(second.store.get('photoslop').custom.from, 'photoshop');

  second.store.clearCustom('photoslop');
  assert.equal(second.store.resolve('photoslop').id, 'slop');
});

test('the store survives corrupt storage and a throwing storage object', async () => {
  const storage = fakeStorage();
  storage.data['slop-nav'] = '{not json';
  const a = await load(storage);
  assert.equal(a.store.resolve('photoslop').id, 'slop');
  const boom = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const b = await load(boom);
  assert.equal(b.store.setPreset('photoslop', 'figma').ok, true);
  assert.equal(b.store.resolve('photoslop').id, 'figma', 'memory fallback works');
});

test('describe lines cover every binding and say when a key is unbound', () => {
  const lines = N.describe.describe(N.presets.get('slop').bindings);
  assert.equal(lines.length, N.validate.KEYS.length);
  assert.ok(lines.find((x) => x.name === 'fitKey').text === 'Not bound');
  assert.match(N.describe.describe(PS).find((x) => x.name === 'zoomWheel').text, /Alt/);
});

test('in Swedish the presets, the descriptions and the errors are Swedish (they were English in every language)', async () => {
  const N = await load(null, 'sv');
  assert.deepEqual(plain(N.presets.list().map((p) => p.name)), ['Slop', 'Photoshop-stil', 'Illustrator-stil', 'Figma-stil', 'Anpassad']);
  const lines = N.describe.describe(N.presets.get('photoshop').bindings);
  assert.equal(lines.find((x) => x.name === 'zoomWheel').text, 'Alt + hjul zoomar runt pekaren');
  assert.equal(lines.find((x) => x.name === 'handKey').text, 'Ingen tangent');
  assert.equal(N.describe.title('fitKey'), 'Tangent för Anpassa till skärm');
  const bad = N.validate.validate(Object.assign({}, N.presets.get('slop').bindings, { panWheel: 'plain' }));
  assert.deepEqual(plain(bad.errors), ['Hjulzoom och hjulpanorering använder samma kombinationstangent']);
});
