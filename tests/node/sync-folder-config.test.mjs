// The Slopographic config in a chosen folder (shared/config/folder.js) over the local provider
// (shared/sync/providers/local.js) with a fake File System Access directory: save, read back through validation,
// list the changes, apply, and the refusals. No network: fetch throws if anything calls it. Run: node tests/run.mjs sync
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInto, plain } from './fx-env.mjs';
import { fakeStore, APPS } from './config-env.mjs';
import { memBackend } from './sync-helpers.mjs';

const dom = (name) => Object.assign(new Error(name), { name });

// A fake FileSystemFileHandle: createWritable replaces the bytes only on close, like the browser.
class FakeFile {
  constructor(name) { this.kind = 'file'; this.name = name; this.bytes = new Blob([]); this.mtime = 1700000000000; }
  async getFile() { return Object.assign(this.bytes.slice(0, this.bytes.size, this.bytes.type), { name: this.name, lastModified: this.mtime }); }
  async createWritable() {
    let next = null;
    return {
      write: async (data) => { next = data; },
      close: async () => { if (next != null) this.bytes = next instanceof Blob ? next : new Blob([next]); },
      abort: async () => { next = null; },
    };
  }
}
// A fake FileSystemDirectoryHandle whose permission the test controls.
class FakeDir {
  constructor(name, perm = { query: 'granted', request: 'granted' }) { this.kind = 'directory'; this.name = name; this.items = new Map(); this.perm = perm; }
  async getFileHandle(name, { create = false } = {}) {
    let h = this.items.get(name);
    if (!h) { if (!create) throw dom('NotFoundError'); h = new FakeFile(name); this.items.set(name, h); }
    if (h.kind !== 'file') throw dom('TypeMismatchError');
    return h;
  }
  async getDirectoryHandle(name, { create = false } = {}) {
    let h = this.items.get(name);
    if (!h) { if (!create) throw dom('NotFoundError'); h = new FakeDir(name, this.perm); this.items.set(name, h); }
    if (h.kind !== 'directory') throw dom('TypeMismatchError');
    return h;
  }
  async *entries() { for (const [n, h] of this.items) yield [n, h]; }
  async queryPermission() { return this.perm.query; }
  async requestPermission() { return this.perm.request; }
}

async function setup({ dir = new FakeDir('Config'), store = fakeStore() } = {}) {
  const ctx = await loadInto(
    ['config/schema.js', 'config/validate.js', 'config/io.js', 'config/kinds.js', 'sync/providers/local.js', 'config/folder.js'],
    { SLOP_APPS: APPS, SlopData: { store }, Blob, File, SlopI18n: globalThis.SlopI18n, fetch: () => { throw new Error('no network'); } },
  );
  const handles = memBackend();
  await handles.put('dir', dir);
  ctx.SlopSyncProviders.local.setHandleStore(handles);
  return { F: ctx.SlopConfigFolder, C: ctx.SlopConfig, L: ctx.SlopSyncProviders.local, dir, store };
}

// Writes a settings file into the folder the way another machine would have.
async function putConfig(dir, data, over = {}) {
  const env = { format: 'slop-config', version: 1, kind: 'settings', app: 'slop', name: 'Slopographic', created: '2026-10-11T09:00:00Z', data, ...over };
  const f = new FakeFile('slopographic.slop.json');
  f.bytes = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
  dir.items.set('slopographic.slop.json', f);
}

test('save writes slopographic.slop.json at the folder root, in the shared envelope, and nothing else', async () => {
  const { F, dir } = await setup();
  const r = await F.save();
  assert.equal(r.ok, true, r.error);
  assert.equal(r.name, 'slopographic.slop.json');
  assert.deepEqual([...dir.items.keys()], ['slopographic.slop.json'], 'no other file or folder is created');
  const env = JSON.parse(await dir.items.get('slopographic.slop.json').bytes.text());
  assert.equal(env.format, 'slop-config');
  assert.equal(env.version, 1);
  assert.equal(env.kind, 'settings');
  assert.equal(env.app, 'slop');
  assert.deepEqual(plain(env.data), { defaultCurrency: 'USD', locale: 'en-US', defaultTaxRate: 0 });
});

test('round trip: the file that was saved validates and reads back as the same value', async () => {
  const { F, C, dir } = await setup();
  await F.save();
  const saved = JSON.parse(await dir.items.get('slopographic.slop.json').bytes.text());
  const p = await F.preview();
  assert.equal(p.ok, true, p.error);
  assert.deepEqual(JSON.parse(JSON.stringify(p.value)), saved);
  assert.deepEqual(plain(p.changes), [], 'nothing changes when the file matches the settings');
  assert.equal(C.validate(await dir.items.get('slopographic.slop.json').bytes.text(), { app: 'slop' }).ok, true);
});

test('load lists what would change, and apply writes the store in one transaction', async () => {
  const { F, dir, store } = await setup();
  await putConfig(dir, { defaultCurrency: 'EUR', locale: 'en-US', defaultTaxRate: 20 });
  const p = await F.preview();
  assert.equal(p.ok, true, p.error);
  assert.deepEqual(plain(p.changes.map((c) => [c.label, c.from, c.to])), [
    ['Default currency', 'USD', 'EUR'],
    ['Default tax rate', '0%', '20%'],
  ], 'the unchanged locale is not listed');
  assert.equal(store.rows.settings.get('main').defaultCurrency, 'USD', 'preview changes nothing');
  const r = await F.apply(p);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.applied, 2);
  assert.equal(store.transactions, 1);
  assert.equal(store.rows.settings.get('main').defaultCurrency, 'EUR');
  assert.equal(store.rows.settings.get('main').defaultTaxRate, 2000, 'stored as basis points, as the settings kind does');
});

test('a file that fails validation is refused before anything is applied', async () => {
  const { F, dir, store } = await setup();
  await putConfig(dir, { defaultCurrency: 'usd', locale: 'en-US', defaultTaxRate: 0 });
  const bad = await F.preview();
  assert.equal(bad.ok, false);
  assert.match(bad.error, /not a valid config/);
  assert.match(bad.error, /defaultCurrency/);
  await putConfig(dir, { defaultCurrency: 'EUR' }, { format: 'other-format' });
  assert.equal((await F.preview()).ok, false, 'a wrong format is refused');
  await putConfig(dir, { defaultCurrency: 'EUR', extra: 1 });
  assert.match((await F.preview()).error, /not a known key|is not/);
  assert.equal(store.transactions, 0);
  assert.equal(store.rows.settings.get('main').defaultCurrency, 'USD');
});

test('a folder with no config says so, and does not guess', async () => {
  const { F } = await setup();
  const p = await F.preview();
  assert.equal(p.ok, false);
  assert.match(p.error, /has no slopographic\.slop\.json yet/);
});

test('without permission nothing is written; allow() asks again and then save works', async () => {
  const dir = new FakeDir('Config', { query: 'prompt', request: 'denied' });
  const { F, L } = await setup({ dir });
  assert.equal(await L.permission(), 'prompt');
  const r = await F.save();
  assert.equal(r.ok, false);
  assert.match(r.error, /Permission to use this folder was not granted/);
  assert.equal(dir.items.size, 0, 'a refused permission writes nothing');

  dir.perm = { query: 'prompt', request: 'granted' };
  assert.equal(await L.allow(), 'granted');
  assert.equal((await F.save()).ok, true);
  assert.equal(dir.items.has('slopographic.slop.json'), true);
});

test('the folder is only read and written through the picked handle: no other folder is touched', async () => {
  const { F, L, dir } = await setup();
  await F.save();
  await F.preview();
  assert.equal(L.supported(), false, 'no showDirectoryPicker in Node, so the picker is never used');
  assert.deepEqual([...dir.items.keys()], ['slopographic.slop.json']);
});
