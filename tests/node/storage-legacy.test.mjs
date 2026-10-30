// Upgrade tests for the small localStorage stores. Each test writes the OLD shape as a fixture, then loads the
// current code and checks the data is read and nothing is lost. Run: node tests/run.mjs storage
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeStorage, loadClassic } from './storage-env.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));

test('consent: an old policy record asks again, keeps the earlier choice as the default, and turns nothing on', async () => {
  const old = JSON.stringify({ version: 1, timestamp: 5, categories: { necessary: true, analytics: true, ads: false, rates: true } });
  const store = fakeStorage({ 'slop-consent': old });
  const ctx = await loadClassic(['shared/consent/config.js', 'shared/consent/state.js'], { localStorage: store });
  const S = ctx.SlopConsentState;
  assert.equal(S.needsChoice(), true);
  assert.deepEqual(plain(S.current()), { necessary: true, analytics: false, ads: false, rates: false });
  assert.deepEqual(plain(S.previous()), { necessary: true, analytics: true, ads: false, rates: true });
  assert.equal(store.getItem('slop-consent'), old, 'reading must not rewrite or drop the old record');
});

test('consent: a current record is read as a choice, and previous() is null', async () => {
  const cur = JSON.stringify({ version: 2, timestamp: 9, categories: { analytics: true, ads: false, rates: false } });
  const ctx = await loadClassic(['shared/consent/config.js', 'shared/consent/state.js'], { localStorage: fakeStorage({ 'slop-consent': cur }) });
  assert.equal(ctx.SlopConsentState.needsChoice(), false);
  assert.equal(ctx.SlopConsentState.current().analytics, true);
  assert.equal(ctx.SlopConsentState.previous(), null);
});

test('consent: a corrupt record is treated as no choice, without throwing', async () => {
  const ctx = await loadClassic(['shared/consent/config.js', 'shared/consent/state.js'], { localStorage: fakeStorage({ 'slop-consent': '{nope' }) });
  assert.equal(ctx.SlopConsentState.needsChoice(), true);
  assert.equal(ctx.SlopConsentState.previous(), null);
});

test('profile: the flat shape from before the envelope is still read', async () => {
  const flat = JSON.stringify({ drive: { view: 'list' }, gallery: { tiles: 3 } });
  const store = fakeStorage({ 'slop-profile': flat });
  const ctx = await loadClassic(['shared/profile/profile.js']);
  const P = ctx.SlopProfile.create({ storage: store, options: { drive: { view: { type: 'enum', values: ['grid', 'list'], default: 'grid' } }, gallery: { tiles: { type: 'number', min: 1, max: 9, default: 2 } } } });
  assert.equal(P.get('drive', 'view'), 'list');
  assert.equal(P.get('gallery', 'tiles'), 3);
  assert.equal(store.getItem('slop-profile'), flat, 'reading never rewrites the old value');
});

test('profile: a write goes out as { v: 1, data } and round-trips, keeping other apps', async () => {
  const store = fakeStorage({ 'slop-profile': JSON.stringify({ drive: { view: 'list' } }) });
  const ctx = await loadClassic(['shared/profile/profile.js']);
  const P = ctx.SlopProfile.create({ storage: store, options: { drive: { view: { type: 'enum', values: ['grid', 'list'], default: 'grid' } }, gallery: { tiles: { type: 'number', min: 1, max: 9, default: 2 } } } });
  assert.equal(P.set('gallery', 'tiles', 5).ok, true);
  const raw = JSON.parse(store.getItem('slop-profile'));
  assert.equal(raw.v, 1);
  assert.deepEqual(raw.data, { drive: { view: 'list' }, gallery: { tiles: 5 } });
  assert.equal(P.get('drive', 'view'), 'list');
});

test('drive prefs: an object from before sorts and cols existed still loads, with the old sort moved to its view', async () => {
  const old = JSON.stringify({ view: 'list', usageMode: 'sunburst', sort: { key: 'size', dir: -1 }, info: false, tree: ['d:1'], collapsed: [] });
  const store = fakeStorage({ 'slop-drive.prefs': old });
  const ctx = await loadClassic(['drive/js/core/util.js'], { localStorage: store, innerWidth: 1200 });
  const S = ctx.DR.S;
  assert.equal(S.view, 'list');
  assert.equal(S.usageMode, 'sunburst');
  assert.deepEqual(plain(S.sorts), { list: { key: 'size', dir: -1 } });
  assert.deepEqual(plain(S.sort), { key: 'size', dir: -1 });
  assert.deepEqual(plain(S.cols), {});
  assert.equal(S.info, false);
  assert.equal(S.tree.has('d:1'), true);
});

test('drive prefs: a prefs object with no sorts, cols or view falls back to the defaults', async () => {
  const ctx = await loadClassic(['drive/js/core/util.js'], { localStorage: fakeStorage({ 'slop-drive.prefs': '{}' }), innerWidth: 1200 });
  assert.equal(ctx.DR.S.view, 'grid');
  assert.deepEqual(plain(ctx.DR.S.sort), { key: 'name', dir: 1 });
});

test('drive prefs: save writes { v: 1, data } and a reload gets the same values back', async () => {
  const store = fakeStorage();
  const ctx = await loadClassic(['drive/js/core/util.js'], { localStorage: store, innerWidth: 1200 });
  ctx.DR.S.view = 'compact';
  ctx.DR.S.sorts = { compact: { key: 'date', dir: 1 } };
  ctx.DR.savePrefs();
  const raw = JSON.parse(store.getItem('slop-drive.prefs'));
  assert.equal(raw.v, 1);
  assert.equal(raw.data.view, 'compact');
  const again = await loadClassic(['drive/js/core/util.js'], { localStorage: store, innerWidth: 1200 });
  assert.equal(again.DR.S.view, 'compact');
  assert.deepEqual(plain(again.DR.S.sort), { key: 'date', dir: 1 });
});

test('gallery library: a photo record with no tags field loads with tags = [] and nothing else changes', async () => {
  const oldPhoto = { id: 'p1', name: 'beach.jpg', type: 'image/jpeg', size: 1234, sha: 'abc', takenAt: 1000, addedAt: 2000 };
  const G = { db: { all: async (store) => (store === 'photos' ? [oldPhoto] : []) } };
  const ctx = await loadClassic(['gallery/js/core/library.js'], { SlopGallery: G });
  await ctx.SlopGallery.library.load();
  const p = ctx.SlopGallery.library.photo('p1');
  assert.deepEqual(plain(p.tags), []);
  assert.equal(p.fav, false);
  assert.equal(p.liked, null);
  assert.equal(p.name, 'beach.jpg');
  assert.equal(p.sha, 'abc');
  assert.equal(ctx.SlopGallery.library.hasSha('abc'), true);
});

test('nav store: a v1 record still reads, an unknown preset id falls back to Slop without rewriting storage', async () => {
  const raw = JSON.stringify({ v: 1, apps: { drive: { preset: 'figma', custom: null }, gallery: { preset: 'retired-preset', custom: null } } });
  const store = fakeStorage({ 'slop-nav': raw });
  const ctx = await loadClassic(['shared/nav/validate.js', 'shared/nav/presets.js', 'shared/nav/store.js'], { localStorage: store });
  const N = ctx.SlopNav;
  assert.equal(N.store.get('drive').preset, 'figma');
  assert.equal(N.store.resolve('gallery').id, 'slop');
  assert.equal(store.getItem('slop-nav'), raw, 'reading never rewrites storage');
  assert.equal(N.store.setPreset('drive', 'slop').ok, true);
  assert.equal(JSON.parse(store.getItem('slop-nav')).apps.drive.preset, 'slop');
});
