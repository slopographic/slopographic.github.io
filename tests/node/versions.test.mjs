// Node tests for shared/versions/versions.js: numbered versions, the 20-version limit, restore and removal. Run: node --test tests/node/versions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const V = createRequire(import.meta.url)('../../shared/versions/versions.js');

/** An in-memory stand-in for SlopHub: put, get, update and remove, with the same shapes. */
function fakeHub() {
  const m = new Map();
  let next = 1;
  return {
    m,
    async put(blob, o) { const id = 'r' + next++; m.set(id, { id, blob, name: o.name, folderId: o.folderId || null, meta: o.meta || {} }); return id; },
    async get(id) { return m.has(id) ? structuredClone({ ...m.get(id), blob: m.get(id).blob }) : null; },
    async update(id, patch) { const r = m.get(id); if (!r) return null; if (patch.meta) r.meta = patch.meta; return r; },
    async remove(id) { m.delete(id); },
  };
}
const blob = (t) => ({ text: t, size: t.length, type: 'application/pdf' });

test('each add is numbered from 1, and the original points at the newest version', async () => {
  const hub = fakeHub();
  const id = await hub.put(blob('original'), { name: 'a.pdf', from: 'pdf', meta: { pdf: { role: 'original' } } });
  let orig = await hub.get(id);
  const v1 = await V.add(hub, orig, { blob: blob('edit one'), name: 'a.pdf', changesBlob: blob('[]'), changesName: 'a.changes.json' });
  orig = await hub.get(id);
  const v2 = await V.add(hub, orig, { blob: blob('edit two'), name: 'a.pdf' });
  orig = await hub.get(id);
  assert.equal(v1.version, 1);
  assert.equal(v2.version, 2);
  assert.equal(orig.meta.pdf.versions.length, 2);
  assert.equal(orig.meta.pdf.edited, v2.editedId);
  assert.equal(orig.meta.pdf.changes, null, 'the newest version has no change list here');
});

test('records come back newest first, with their change lists', async () => {
  const hub = fakeHub();
  const id = await hub.put(blob('original'), { name: 'b.pdf', from: 'pdf', meta: { pdf: { role: 'original' } } });
  await V.add(hub, await hub.get(id), { blob: blob('one'), name: 'b.pdf', changesBlob: blob('[1]') });
  await V.add(hub, await hub.get(id), { blob: blob('two'), name: 'b.pdf', changesBlob: blob('[2]') });
  const list = await V.records(hub, await hub.get(id));
  assert.deepEqual(list.map((v) => v.n), [2, 1]);
  assert.equal(list[0].edited.blob.text, 'two');
  assert.equal(list[1].changes.blob.text, '[1]');
});

test('only the newest 20 are kept: older versions are removed from the hub', async () => {
  const hub = fakeHub();
  const id = await hub.put(blob('original'), { name: 'c.pdf', from: 'pdf', meta: { pdf: { role: 'original' } } });
  let first = null;
  for (let i = 1; i <= 22; i++) {
    const r = await V.add(hub, await hub.get(id), { blob: blob('v' + i), name: 'c.pdf', changesBlob: blob('c' + i) });
    if (i === 1) first = r;
  }
  const orig = await hub.get(id);
  assert.equal(orig.meta.pdf.versions.length, V.MAX);
  assert.equal(orig.meta.pdf.versions[0].n, 3, 'versions 1 and 2 were dropped');
  assert.equal(hub.m.has(first.editedId), false, 'version 1 file is gone from the hub');
  assert.equal(hub.m.has(first.changesId), false, 'version 1 change list is gone from the hub');
});

test('restore copies an old version into a new newest version, and keeps the history', async () => {
  const hub = fakeHub();
  const id = await hub.put(blob('original'), { name: 'd.pdf', from: 'pdf', meta: { pdf: { role: 'original' } } });
  const one = await V.add(hub, await hub.get(id), { blob: blob('first'), name: 'd.pdf', changesBlob: blob('[first]') });
  await V.add(hub, await hub.get(id), { blob: blob('second'), name: 'd.pdf' });
  const back = await V.restore(hub, await hub.get(id), one.editedId);
  const orig = await hub.get(id);
  assert.equal(back.version, 3);
  assert.equal(orig.meta.pdf.versions.length, 3);
  assert.equal((await hub.get(orig.meta.pdf.edited)).blob.text, 'first');
  assert.equal((await hub.get(orig.meta.pdf.changes)).blob.text, '[first]');
});

test('restore refuses a version that is not part of the document', async () => {
  const hub = fakeHub();
  const id = await hub.put(blob('original'), { name: 'e.pdf', from: 'pdf', meta: { pdf: { role: 'original' } } });
  await V.add(hub, await hub.get(id), { blob: blob('x'), name: 'e.pdf' });
  await assert.rejects(V.restore(hub, await hub.get(id), 'nope'), /not part of this document/);
});

test('removeAll removes every version record of a document', async () => {
  const hub = fakeHub();
  const id = await hub.put(blob('original'), { name: 'f.pdf', from: 'pdf', meta: { pdf: { role: 'original' } } });
  await V.add(hub, await hub.get(id), { blob: blob('a'), name: 'f.pdf', changesBlob: blob('[a]') });
  await V.add(hub, await hub.get(id), { blob: blob('b'), name: 'f.pdf', changesBlob: blob('[b]') });
  await V.removeAll(hub, await hub.get(id));
  assert.deepEqual([...hub.m.keys()], [id], 'only the original is left');
});

test('a document saved before versions existed counts its one edited copy as version 1', async () => {
  const hub = fakeHub();
  const edited = await hub.put(blob('old edit'), { name: 'g.pdf', from: 'pdf', meta: { pdf: { role: 'edited' } } });
  const id = await hub.put(blob('original'), { name: 'g.pdf', from: 'pdf', meta: { pdf: { role: 'original', edited } } });
  const list = await V.records(hub, await hub.get(id));
  assert.equal(list.length, 1);
  assert.equal(list[0].n, 1);
  await V.add(hub, await hub.get(id), { blob: blob('new edit'), name: 'g.pdf' });
  const after = await V.records(hub, await hub.get(id));
  assert.deepEqual(after.map((v) => v.n), [2, 1]);
});
