// Slop Drive: the local folder provider (drive/js/core/prov-dir.js) and the transfer engine (drive/js/core/transfer.js),
// run on a fake File System Access directory. No network, no browser. Run: node tests/run.mjs drive
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DR = {};
const ctx = { window: { DR }, console };
vm.createContext(ctx);
for (const f of ['drive/js/core/prov-dir.js', 'drive/js/core/transfer.js']) {
  vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}

const dom = (name) => Object.assign(new Error(name), { name });
class FakeFile {
  constructor(name) { this.kind = 'file'; this.name = name; this.bytes = ''; this.mtime = 1700000000000; }
  async getFile() { return { size: this.bytes.length, name: this.name, lastModified: this.mtime, text: async () => this.bytes }; }
  async createWritable() {
    let next = null;
    return {
      write: async (d) => { next = d; },
      close: async () => { if (next != null) this.bytes = typeof next === 'string' ? next : await next.text(); },
      abort: async () => { next = null; },
    };
  }
}
class FakeDir {
  constructor(name, perm = { query: 'granted', request: 'granted' }) { this.kind = 'directory'; this.name = name; this.items = new Map(); this.perm = perm; }
  async getFileHandle(n, { create = false } = {}) {
    let h = this.items.get(n);
    if (!h) { if (!create) throw dom('NotFoundError'); h = new FakeFile(n); this.items.set(n, h); }
    if (h.kind !== 'file') throw dom('TypeMismatchError');
    return h;
  }
  async getDirectoryHandle(n, { create = false } = {}) {
    let h = this.items.get(n);
    if (!h) { if (!create) throw dom('NotFoundError'); h = new FakeDir(n, this.perm); this.items.set(n, h); }
    if (h.kind !== 'directory') throw dom('TypeMismatchError');
    return h;
  }
  async removeEntry(n) { if (!this.items.has(n)) throw dom('NotFoundError'); this.items.delete(n); }
  async *entries() { for (const [n, h] of this.items) yield [n, h]; }
  async queryPermission() { return this.perm.query; }
  async requestPermission() { this.perm.query = this.perm.request; return this.perm.request; }
}

const provider = (id, dir) => DR.makeDirProvider(id, id, async () => dir);
const blob = (s) => s;   // the provider writes whatever it is given; a string stands in for a Blob here
// The vm context has its own Array, so compare plain copies (strict deepEqual checks the prototype).
const plain = (x) => JSON.parse(JSON.stringify(x));
/** Reads a fake folder into a plain tree: { name: 'text' | {subtree} }. */
async function tree(d) {
  const out = {};
  for (const [n, h] of d.items) out[n] = h.kind === 'file' ? h.bytes : await tree(h);
  return out;
}
/** A top-level folder with a file and a subfolder holding another file. */
function sample() {
  const root = new FakeDir('src');
  const a = new FakeDir('Photos'); root.items.set('Photos', a);
  a.items.set('one.txt', Object.assign(new FakeFile('one.txt'), { bytes: 'ONE' }));
  const b = new FakeDir('2026'); a.items.set('2026', b);
  b.items.set('two.txt', Object.assign(new FakeFile('two.txt'), { bytes: 'TWO' }));
  root.items.set('note.txt', Object.assign(new FakeFile('note.txt'), { bytes: 'NOTE' }));
  return root;
}

test('folder provider: lists folders first, then files, sorted; a subfolder lists its own children', async () => {
  const p = provider('a', sample());
  const top = await p.list('');
  assert.deepEqual(plain(top.folders.map((f) => f.ref)), ['Photos']);
  assert.deepEqual(plain(top.files.map((f) => f.ref)), ['note.txt']);
  const sub = await p.list('Photos');
  assert.deepEqual(plain(sub.folders.map((f) => f.ref)), ['Photos/2026']);
  assert.deepEqual(plain(sub.files.map((f) => f.ref)), ['Photos/one.txt']);
  assert.equal(top.files[0].size, 4);
});

test('folder provider: reads a file by its ref and writes one into a subfolder', async () => {
  const root = sample(), p = provider('a', root);
  assert.equal(await (await p.readBlob('Photos/one.txt')).text(), 'ONE');
  const ref = await p.write('Photos/2026', 'new.txt', blob('NEW'));
  assert.equal(ref, 'Photos/2026/new.txt');
  assert.equal(root.items.get('Photos').items.get('2026').items.get('new.txt').bytes, 'NEW');
});

test('folder provider: a name that is already used gets " (2)", ignoring case, and a file keeps its extension', async () => {
  const p = provider('a', sample());
  assert.equal(await p.uniqueName('', 'note.txt', false), 'note (2).txt');
  assert.equal(await p.uniqueName('', 'NOTE.TXT', false), 'NOTE (2).TXT');
  assert.equal(await p.uniqueName('', 'fresh.txt', false), 'fresh.txt');
  assert.equal(await p.uniqueName('', 'Photos', true), 'Photos (2)');
});

test('folder provider: a name with a slash, a dot-dot or a control character is refused', async () => {
  const p = provider('a', sample());
  for (const bad of ['a/b', '..', '.', '', 'x\u0001y']) await assert.rejects(p.mkdir('', bad), (e) => e.code === 'name');
});

test('folder provider: a folder that is not granted is refused until access is given', async () => {
  const dir = sample();
  dir.perm = { query: 'prompt', request: 'granted' };
  const p = provider('a', dir);
  await assert.rejects(p.list(''), (e) => e.code === 'permission');
  assert.equal(await DR.dirPermission(dir), 'prompt');
  assert.equal(await DR.dirAllow(dir), 'granted');
  assert.equal((await p.list('')).files.length, 1);
});

test('folder provider: a missing root reads as gone', async () => {
  const p = provider('a', null);
  await assert.rejects(p.list(''), (e) => e.code === 'gone');
  assert.equal(await DR.dirPermission(null), 'gone');
});

test('within: a folder is inside itself and its children, not a sibling with a longer name', () => {
  const p = provider('a', new FakeDir('x'));
  assert.equal(p.within('', 'anything'), true);
  assert.equal(p.within('Photos', 'Photos'), true);
  assert.equal(p.within('Photos', 'Photos/2026'), true);
  assert.equal(p.within('Photos', 'Photos2'), false);
});

test('copy: a folder tree is copied into another folder, and the source stays', async () => {
  const srcDir = sample(), dstDir = new FakeDir('dst');
  const src = provider('s', srcDir), dst = provider('d', dstDir);
  const { folders, files } = await src.list('');
  const res = await DR.copyTree([...folders, ...files].map((e) => Object.assign(e, { provider: src, parent: '' })), { provider: dst, ref: '' }, { move: false });
  assert.equal(res.done, 2);
  assert.equal(res.failed, 0);
  assert.deepEqual(plain(await tree(dstDir)), { Photos: { '2026': { 'two.txt': 'TWO' }, 'one.txt': 'ONE' }, 'note.txt': 'NOTE' });
  assert.deepEqual(plain(await tree(srcDir)), plain(await tree(sample())));
});

test('move: the original goes only after its copy is complete; the copy is at the destination', async () => {
  const srcDir = sample(), dstDir = new FakeDir('dst');
  const src = provider('s', srcDir), dst = provider('d', dstDir);
  const photos = { ...(await src.list('')).folders[0], provider: src, parent: '' };
  const res = await DR.copyTree([photos], { provider: dst, ref: '' }, { move: true });
  assert.equal(res.done, 1);
  assert.equal(srcDir.items.has('Photos'), false);
  assert.equal(dstDir.items.get('Photos').items.get('2026').items.get('two.txt').bytes, 'TWO');
});

test('a folder cannot be copied into itself, and nothing is created', async () => {
  const srcDir = sample(), dstDir = srcDir;
  const p = provider('s', srcDir);
  const photos = { ...(await p.list('')).folders[0], provider: p, parent: '' };
  const res = await DR.copyTree([photos], { provider: p, ref: 'Photos/2026' }, { move: false });
  assert.equal(res.done, 0);
  assert.equal(res.skipped, 1);
  assert.match(res.errors[0], /cannot go inside itself/);
  assert.deepEqual(plain(await tree(dstDir)), plain(await tree(sample())));
});

test('a move into the folder an item is already in does nothing; a copy there makes a second copy', async () => {
  const dir = sample(), p = provider('s', dir);
  const note = { ...(await p.list('')).files[0], provider: p, parent: '' };
  const moved = await DR.copyTree([note], { provider: p, ref: '' }, { move: true });
  assert.equal(moved.skipped, 1);
  assert.equal(dir.items.has('note.txt'), true);
  const copied = await DR.copyTree([note], { provider: p, ref: '' }, { move: false });
  assert.equal(copied.done, 1);
  assert.equal(dir.items.get('note (2).txt').bytes, 'NOTE');
});

test('a failed copy keeps the original: nothing is removed when the write fails', async () => {
  const srcDir = sample(), src = provider('s', srcDir);
  const dst = provider('d', new FakeDir('dst'));
  let removed = 0;
  dst.write = async () => { throw new Error('disk full'); };
  const wrapped = Object.assign({}, src, { remove: async (...a) => { removed++; return src.remove(...a); } });
  const note = { ...(await src.list('')).files[0], provider: wrapped, parent: '' };
  const res = await DR.copyTree([note], { provider: dst, ref: '' }, { move: true });
  assert.equal(res.failed, 1);
  assert.match(res.errors[0], /disk full/);
  assert.equal(removed, 0);
  assert.equal(srcDir.items.get('note.txt').bytes, 'NOTE');
});

test('remove deletes a folder with everything in it, and the root cannot be removed', async () => {
  const dir = sample(), p = provider('a', dir);
  await p.remove('Photos', true);
  assert.equal(dir.items.has('Photos'), false);
  await assert.rejects(p.remove(''), (e) => e.code === 'root');
});
