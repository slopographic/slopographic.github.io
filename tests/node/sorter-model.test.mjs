// Slop Photo Sorter, the model (sorter/js/model.js): photos in, decisions and tags, filters, counts and the CSV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({});
vm.runInContext(readFileSync(path.join(ROOT, 'sorter/js/model.js'), 'utf8'), ctx);
const M = ctx.SlopSorter.model;
const plain = (v) => JSON.parse(JSON.stringify(v));
const f = (name, type = 'image/jpeg', rel = '') => ({ name, type, size: 10, webkitRelativePath: rel });

test('only pictures a browser can show are added; folders keep their path', () => {
  const s = M.create();
  const added = s.add([f('a.jpg'), f('notes.txt', 'text/plain'), f('b.png', 'image/png', 'Trip/b.png'), f('c.HEIC', 'image/heic'), f('d.webp', '')]);
  assert.deepEqual(plain(added.map((x) => [x.name, x.path])), [['a.jpg', 'a.jpg'], ['b.png', 'Trip/b.png'], ['d.webp', 'd.webp']]);
  assert.equal(M.isImage(f('x.gif', '')), true);
});

test('decisions and tags, with a change event for each; remove and clear', async () => {
  const s = M.create(), seen = [];
  s.on((w) => seen.push(w));
  const [a, b] = s.add([f('a.jpg'), f('b.jpg')]);
  await s.setLiked(a.id, 'liked');
  await s.setLiked(b.id, 'disliked');
  await s.addTag(a.id, ' Beach '); await s.addTag(a.id, 'beach'); await s.addTag(b.id, 'beach'); await s.addTag(b.id, 'blurry');
  assert.deepEqual(plain(s.get(a.id).tags), ['beach']);
  await s.removeTag(b.id, 'blurry');
  assert.deepEqual(plain(s.get(b.id).tags), ['beach']);
  assert.deepEqual(seen.slice(0, 3), ['photos', 'tags', 'tags']);
  assert.equal(s.remove(b.id), true);
  assert.equal(s.items.length, 1);
  s.clear();
  assert.equal(s.items.length, 0);
});

test('filters, counts (tags most used first) and the CSV', async () => {
  const s = M.create();
  const [a, b, c] = s.add([f('a.jpg', 'image/jpeg', 'Trip/a.jpg'), f('b, 2.jpg'), f('c.jpg')]);
  await s.setLiked(a.id, 'liked'); await s.setLiked(b.id, 'disliked');
  await s.addTag(a.id, 'sea'); await s.addTag(c.id, 'sea'); await s.addTag(c.id, 'sky');
  assert.deepEqual(plain(M.filter(s.items, 'unsorted').map((x) => x.name)), ['c.jpg']);
  assert.deepEqual(plain(M.filter(s.items, 'liked').map((x) => x.name)), ['a.jpg']);
  assert.deepEqual(plain(M.filter(s.items, 'tag:sea').map((x) => x.name)), ['a.jpg', 'c.jpg']);
  assert.deepEqual(plain(M.counts(s.items)), { all: 3, unsorted: 1, liked: 1, disliked: 1, tags: [['sea', 2], ['sky', 1]] });
  assert.equal(M.csv(s.items), 'Photo,Folder,Decision,Tags\r\na.jpg,Trip,liked,sea\r\n"b, 2.jpg",,disliked,\r\nc.jpg,,,sea; sky\r\n');
});
