// Local or network folder provider (shared/sync/providers/local.js) with a fake File System Access directory.
// No network: fetch is a recording stub and must never be called. Run: node tests/run.mjs sync
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, memBackend, textOf } from './sync-helpers.mjs';

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
      abort: async () => { next = null; }
    };
  }
}
// A fake FileSystemDirectoryHandle with a permission state the test controls.
class FakeDir {
  constructor(name, perm = { query: 'granted', request: 'granted' }) { this.kind = 'directory'; this.name = name; this.items = new Map(); this.perm = perm; this.asked = []; }
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
  async queryPermission(opts) { this.asked.push(['query', opts.mode]); return this.perm.query; }
  async requestPermission(opts) { this.asked.push(['request', opts.mode]); return this.perm.request; }
}

async function setup({ dir = new FakeDir('NAS-backups'), supported = true } = {}) {
  const env = await makeEnv();
  const store = memBackend();
  const L = env.ctx.SlopSyncProviders.local;
  L.setHandleStore(store);
  const picks = [];
  if (supported) env.ctx.showDirectoryPicker = async (opts) => { picks.push(opts); return dir; };
  return { env, L, store, dir, picks, S: env.S };
}

test('no showDirectoryPicker: the connector says it needs Chrome or Edge, and nothing is chosen', async () => {
  const { S, L, env } = await setup({ supported: false });
  assert.equal(L.supported(), false);
  const r = await S.connect('local');
  assert.equal(r.ok, false);
  assert.equal(r.unsupported, true);
  assert.match(r.error, /Chrome or Edge/);
  assert.match(r.error, /Download backup file/, 'offers the download-and-upload fallback');
  const st = await S.status('local');
  assert.equal(st.supported, false);
  assert.equal(st.connected, false);
  assert.equal(env.calls.length, 0);
});

test('picking a folder keeps its handle in the store and shows its name in status', async () => {
  const { S, store, picks, env } = await setup();
  const r = await S.connect('local');
  assert.equal(r.ok, true);
  assert.equal(r.folder, 'NAS-backups');
  assert.equal(picks.length, 1);
  assert.equal(picks[0].mode, 'readwrite');
  assert.ok(store.m.get('dir') instanceof FakeDir, 'the directory handle is persisted for the next visit');
  const st = await S.status('local');
  assert.equal(st.connected, true);
  assert.equal(st.folder, 'NAS-backups');
  assert.equal(st.configured, true, 'no client ID is needed');
  assert.equal(env.calls.length, 0);
});

test('cancelling the picker is not an error and connects nothing', async () => {
  const { S, env, store } = await setup();
  env.ctx.showDirectoryPicker = async () => { throw dom('AbortError'); };
  const r = await S.connect('local');
  assert.equal(r.ok, false);
  assert.equal(r.cancelled, true);
  assert.equal(store.m.has('dir'), false);
});

test('write: the backup is written as a file in the folder, with no network request', async () => {
  const { S, dir, env } = await setup();
  await S.connect('local');
  const r = await S.pushBackup('local');
  assert.equal(r.ok, true, r.error);
  const f = dir.items.get('slopographic-backup.json');
  assert.ok(f, 'the backup file exists in the folder');
  assert.equal(await textOf(f.bytes), '{"docs":[1]}');
  assert.ok(r.at > 0);
  assert.equal(env.calls.length, 0, 'fetch is never called');
});

test('read: a restore reads the file back and hands it to importAll after confirmation', async () => {
  const { S, dir, env, L } = await setup();
  await S.connect('local');
  await S.pushBackup('local');
  const refused = await S.pullBackup('local');
  assert.equal(refused.ok, false, 'no restore without confirmation');
  const r = await S.pullBackup('local', { confirmed: true });
  assert.equal(r.ok, true, r.error);
  assert.equal(env.imported.length, 1);
  assert.equal(await textOf(env.imported[0]), '{"docs":[1]}');
  const back = await L.download({}, 'slopographic-backup.json');
  assert.equal(await textOf(back), '{"docs":[1]}');
  assert.equal(dir.items.has('slopographic-backup.json'), true);
});

test('list: returns the plain files with the prefix, skipping subfolders', async () => {
  const { dir, L, S } = await setup();
  await S.connect('local');
  dir.items.set('pre-a.txt', Object.assign(new FakeFile('pre-a.txt'), { bytes: new Blob(['abc']) }));
  dir.items.set('pre-b.txt', Object.assign(new FakeFile('pre-b.txt'), { bytes: new Blob(['d']) }));
  dir.items.set('other.txt', new FakeFile('other.txt'));
  dir.items.set('pre-folder', new FakeDir('pre-folder'));
  const list = await L.list({}, 'pre-');
  // Arrays built inside the vm context have another realm's Array prototype, so copy into this realm first.
  const rows = list.map((f) => f.name + ':' + f.size).sort();
  assert.equal(rows.join(','), 'pre-a.txt:3,pre-b.txt:1');
});

test('subfolder option: app files go under Apps, which is created on write and not on read', async () => {
  const { S, dir } = await setup();
  await S.connect('local');
  const r = await S.pushAppFile('local', 'notes.txt', new Blob(['hi'], { type: 'text/plain' }));
  assert.equal(r.ok, true, r.error);
  assert.equal(dir.items.get('Apps').items.get('notes.txt').bytes.size, 2);
  const miss = await S.pullAppFile('local', 'missing.txt');
  assert.equal(miss.ok, false);
  assert.match(miss.error, /not in the Apps folder/);
  assert.equal(dir.items.has('Apps'), true);
  const none = await S.pullAppFile('local', 'notes.txt');
  assert.equal(none.ok, true);
});

test('permission denied: nothing is written, the person is told, and the browser was asked once', async () => {
  const dir = new FakeDir('Share', { query: 'prompt', request: 'denied' });
  const { S, env } = await setup({ dir });
  await S.connect('local');
  const r = await S.pushBackup('local');
  assert.equal(r.ok, false);
  assert.match(r.error, /Permission to use this folder was not granted/);
  assert.equal(dir.items.has('slopographic-backup.json'), false, 'no partial file');
  assert.deepEqual(dir.asked, [['query', 'readwrite'], ['request', 'readwrite']]);
  const d = await S.pullBackup('local', { confirmed: true });
  assert.equal(d.ok, false);
  assert.match(d.error, /Permission/);
  assert.equal(env.calls.length, 0);
});

test('permission lost since last visit: asked again, then the write goes ahead when granted', async () => {
  const dir = new FakeDir('Share', { query: 'prompt', request: 'granted' });
  const { S } = await setup({ dir });
  await S.connect('local');
  const r = await S.pushBackup('local');
  assert.equal(r.ok, true, r.error);
  assert.equal(dir.items.has('slopographic-backup.json'), true);
  assert.deepEqual(dir.asked, [['query', 'readwrite'], ['request', 'readwrite']]);
});

test('an already granted folder is used without asking again', async () => {
  const { S, dir } = await setup();
  await S.connect('local');
  await S.pushBackup('local');
  assert.deepEqual(dir.asked.filter((x) => x[0] === 'request'), [], 'queryPermission says granted, so no request');
});

test('no folder chosen: a clear message, no write', async () => {
  const { S, L } = await setup();
  const r = await S.pushBackup('local');
  assert.equal(r.ok, false);
  assert.match(r.error, /No folder chosen/);
  await assert.rejects(L.list({}, ''), /No folder chosen/);
});

test('file names that would leave the folder are refused', async () => {
  const { S, dir } = await setup();
  await S.connect('local');
  for (const bad of ['../x.json', 'a/b.json', '..', '']) {
    const r = await S.pushAppFile('local', bad, new Blob(['x']));
    assert.equal(r.ok, false, bad);
  }
  assert.equal(dir.items.size, 0);
});

test('disconnect forgets the folder on this device and leaves the files in it', async () => {
  const { S, dir, store, env } = await setup();
  await S.connect('local');
  await S.pushBackup('local');
  const r = await S.disconnect('local');
  assert.equal(r.ok, true);
  assert.match(r.note, /Files in the folder are not deleted/);
  assert.equal(store.m.has('dir'), false);
  assert.equal(dir.items.has('slopographic-backup.json'), true);
  assert.equal((await S.status('local')).connected, false);
  assert.equal(env.calls.length, 0);
});

test('a client ID cannot be set for the local folder', async () => {
  const { S } = await setup();
  const r = S.configure('local', { clientId: 'abcd1234' });
  assert.equal(r.ok, false);
});
