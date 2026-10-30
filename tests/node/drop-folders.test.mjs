// Node tests for shared/drop/folders.js (SlopDrop.folders.read): a drop with folders is walked whole (every readEntries
// batch, sub-folders too) and each file keeps its path from the dropped folder, as the "Choose a folder" input gives it;
// loose files keep their name; without entries it falls back to dt.files; unreadable entries are skipped.
// Run: node --test tests/node/drop-folders.test.mjs
// Covers: shared/drop/folders.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = vm.createContext({ setTimeout });
ctx.window = ctx;
vm.runInContext(readFileSync(path.join(ROOT, 'shared/drop/folders.js'), 'utf8'), ctx);
const FD = ctx.SlopDrop.folders;

const file = (name) => new File(['x'], name, { type: 'image/png' });
const fileEntry = (f) => ({ isFile: true, isDirectory: false, name: f.name, file: (ok) => setTimeout(() => ok(f), 1) });
const badEntry = (name) => ({ isFile: true, isDirectory: false, name, file: (ok, fail) => fail(new Error('gone')) });
const dirEntry = (name, batches) => ({ isFile: false, isDirectory: true, name, createReader: () => { let i = 0; return { readEntries: (ok) => setTimeout(() => ok(batches[i++] || []), 1) }; } });
const item = (entry, f = null) => ({ kind: 'file', webkitGetAsEntry: () => entry, getAsFile: () => f });
const pathOf = (f) => f.slopPath || f.name;
const paths = (list) => Array.from(list, pathOf);   // a plain array of this realm (the vm has its own Array)

test('a folder is walked through every batch and sub-folder; paths start at the dropped folder', async () => {
  const day = dirEntry('Day 1', [[fileEntry(file('a.png'))], [fileEntry(file('b.png')), badEntry('lost.png')]]);
  const trip = dirEntry('Trip', [[day, fileEntry(file('c.png'))], [dirEntry('Empty', [])]]);
  const loose = file('loose.png');
  const got = await FD.read({ files: [loose], items: [item(trip), item(fileEntry(loose), loose)] });
  assert.deepEqual(paths(got), ['Trip/Day 1/a.png', 'Trip/Day 1/b.png', 'Trip/c.png', 'loose.png']);
  assert.equal(got[0].webkitRelativePath, 'Trip/Day 1/a.png');   // as the folder input gives it
  assert.equal(got[3].slopPath, undefined);                       // a loose file is just the file
  assert.ok(got.every((f) => f instanceof File));
});

test('the entries are taken synchronously, before the first await (the drop event is over after it)', async () => {
  let open = true;
  const dt = { files: [], items: [{ kind: 'file', webkitGetAsEntry: () => (open ? dirEntry('A', [[fileEntry(file('x.png'))]]) : null), getAsFile: () => null }] };
  const p = FD.read(dt);
  open = false;   // as after the drop event: items are no longer readable
  assert.deepEqual(paths(await p), ['A/x.png']);
});

test('without entries (older browsers, synthetic drops) the plain files come back; no drop gives none', async () => {
  const a = file('a.png');
  assert.deepEqual(paths(await FD.read({ files: [a], items: [] })), ['a.png']);
  assert.deepEqual(paths(await FD.read({ files: [a] })), ['a.png']);
  assert.deepEqual(paths(await FD.read({ files: [a], items: [{ kind: 'file', getAsFile: () => a }] })), ['a.png']);
  assert.equal((await FD.read(null)).length, 0);
});

test('string items are ignored and hasFolder tells a folder drop apart', async () => {
  const dt = { files: [], items: [{ kind: 'string', webkitGetAsEntry: () => null }, item(dirEntry('F', [[fileEntry(file('y.png'))]]))] };
  assert.equal(FD.hasFolder(dt), true);
  assert.equal(FD.hasFolder({ items: [item(fileEntry(file('z.png')))] }), false);
  assert.deepEqual(paths(await FD.read(dt)), ['F/y.png']);
});
