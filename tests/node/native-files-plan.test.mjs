// Slop Drive in the iPhone/iPad app's folder: the sync's plan (which Drive file lives at which path, and what one sync
// does when either side changed). The browser side, with a stand-in for the app's plugin: tests/native/files.test.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const P = createRequire(import.meta.url)('../../shared/native/files-plan.js');
const ops = (steps) => steps.filter((s) => s.op !== 'dirs');
const folder = (id, name, parentId = null, extra = {}) => Object.assign({ id, name, parentId }, extra);
const file = (id, name, folderId, extra = {}) => Object.assign({ id, name, folderId, size: 3, modified: 10, time: 1 }, extra);

test('names the Files app takes', () => {
  assert.equal(P.safeName('a/b:c.pdf'), 'a-b-c.pdf');
  assert.equal(P.safeName('.hidden'), '_hidden');
  assert.equal(P.safeName('  '), 'Untitled');
  assert.equal(P.freeName(new Set(['a.pdf', 'a (2).pdf']), 'a.pdf'), 'a (3).pdf');
  assert.equal(P.freeName(new Set(['notes']), 'Notes'), 'Notes (2)');
});

test('the layout: Drive folders as paths, nothing from the Trash, a clash gets a free name', () => {
  const folders = [folder('f', 'PDF'), folder('g', 'Old', null, { trashedAt: 5 }), folder('h', 'Sub', 'f')];
  const files = [file('a', 'x.pdf', 'f'), file('b', 'x.pdf', 'f', { time: 2 }), file('c', 'y.pdf', 'g'), file('d', 'z.pdf', 'h'), file('e', 't.pdf', null, { trashedAt: 9 })];
  const L = P.layout(files, folders);
  assert.deepEqual(Object.fromEntries(L.files), { a: 'PDF/x.pdf', b: 'PDF/x (2).pdf', d: 'PDF/Sub/z.pdf' });
  assert.deepEqual([...L.folders], [['f', 'PDF'], ['h', 'PDF/Sub']]);
  // a file keeps the path a clash gave it, so removing the first never moves the second
  assert.deepEqual([...P.layout([files[1]], folders, new Map([['b', 'PDF/x (2).pdf']])).files], [['b', 'PDF/x (2).pdf']]);
});

test('the first sync writes every Drive file and makes the folders; strangers come in', () => {
  const steps = P.plan({ files: [file('a', 'x.pdf', 'f')], folders: [folder('f', 'PDF'), folder('e', 'Empty')], tree: [{ path: 'Mine', dir: true }, { path: 'Mine/n.txt', size: 1, mtime: 5 }], state: null });
  assert.deepEqual(ops(steps), [
    { op: 'mkdir', id: 'f', path: 'PDF' }, { op: 'mkdir', id: 'e', path: 'Empty' }, { op: 'newFolder', path: 'Mine' },
    { op: 'write', id: 'a', path: 'PDF/x.pdf' }, { op: 'import', path: 'Mine/n.txt' },
  ]);
  assert.deepEqual(steps[steps.length - 1], { op: 'dirs', map: { f: 'PDF', e: 'Empty' } });
});

test('a stranger at a Drive file\'s path is not written over: both are kept', () => {
  const steps = ops(P.plan({ files: [file('a', 'x.pdf', null, { size: 9 })], folders: [], tree: [{ path: 'x.pdf', size: 4, mtime: 5 }], state: null }));
  assert.deepEqual(steps, [{ op: 'write', id: 'a', path: 'x (2).pdf' }, { op: 'import', path: 'x.pdf' }]);
});

test('the same file already there (same size) is taken as it is; an iCloud file on its way waits', () => {
  assert.deepEqual(ops(P.plan({ files: [file('a', 'x.pdf', null)], folders: [], tree: [{ path: 'x.pdf', size: 3, mtime: 5 }], state: null })), [{ op: 'adopt', id: 'a', path: 'x.pdf' }]);
  assert.deepEqual(ops(P.plan({ files: [file('a', 'x.pdf', null)], folders: [], tree: [{ path: 'x.pdf', placeholder: true, size: 0, mtime: 0 }], state: null })), []);
});

test('changes on either side, both sides, and deletes', () => {
  const state = { files: { a: { p: 'x.pdf', m: 5, s: 3, d: 10 } }, dirs: {} };
  const same = [{ path: 'x.pdf', size: 3, mtime: 5 }], moved = [{ path: 'x.pdf', size: 4, mtime: 9 }];
  const plan = (files, tree) => ops(P.plan({ files, folders: [], tree, state }));
  assert.deepEqual(plan([file('a', 'x.pdf', null)], same), []);
  assert.deepEqual(plan([file('a', 'x.pdf', null)], moved), [{ op: 'update', id: 'a', path: 'x.pdf' }]);
  assert.deepEqual(plan([file('a', 'x.pdf', null, { modified: 11 })], same), [{ op: 'write', id: 'a', path: 'x.pdf', old: null }]);
  assert.deepEqual(plan([file('a', 'x.pdf', null, { modified: 11 })], moved), [{ op: 'conflict', id: 'a', path: 'x.pdf' }, { op: 'write', id: 'a', path: 'x.pdf', old: null }]);
  assert.deepEqual(plan([file('a', 'y.pdf', null)], same), [{ op: 'move', id: 'a', from: 'x.pdf', to: 'y.pdf' }]);
  assert.deepEqual(plan([file('a', 'y.pdf', null, { modified: 11 })], same), [{ op: 'write', id: 'a', path: 'y.pdf', old: 'x.pdf' }]);
  assert.deepEqual(plan([file('a', 'x.pdf', null)], []), [{ op: 'trash', id: 'a' }], 'deleted in Files: to the Trash');
  assert.deepEqual(plan([file('a', 'x.pdf', null, { modified: 11 })], []), [{ op: 'write', id: 'a', path: 'x.pdf' }], 'deleted there but changed here: written again');
  assert.deepEqual(plan([file('a', 'x.pdf', null, { trashedAt: 3 })], same), [{ op: 'remove', id: 'a', path: 'x.pdf' }]);
  assert.deepEqual(plan([], moved), [{ op: 'forget', id: 'a' }, { op: 'import', path: 'x.pdf' }], 'gone from Drive but changed in Files: it comes back');
});

test('two files that swap names: no old copy is removed under the other', () => {
  const state = { files: { a: { p: 'x.pdf', m: 5, s: 3, d: 10 }, b: { p: 'y.pdf', m: 6, s: 3, d: 10 } }, dirs: {} };
  const tree = [{ path: 'x.pdf', size: 3, mtime: 5 }, { path: 'y.pdf', size: 3, mtime: 6 }];
  const steps = ops(P.plan({ files: [file('a', 'y.pdf', null, { modified: 11 }), file('b', 'x.pdf', null, { modified: 11 })], folders: [], tree, state }));
  assert.deepEqual(steps, [{ op: 'write', id: 'a', path: 'y.pdf', old: null }, { op: 'write', id: 'b', path: 'x.pdf', old: null }]);
});

test('a folder deleted in Files takes its Drive folder to the Trash; a changed file inside keeps it', () => {
  const folders = [folder('f', 'Trips')], state = { files: { a: { p: 'Trips/p.md', m: 5, s: 3, d: 10 } }, dirs: { f: 'Trips' } };
  assert.deepEqual(ops(P.plan({ files: [file('a', 'p.md', 'f')], folders, tree: [], state })), [{ op: 'trashFolder', id: 'f' }, { op: 'forget', id: 'a' }]);
  assert.deepEqual(ops(P.plan({ files: [file('a', 'p.md', 'f', { modified: 12 })], folders, tree: [], state })), [{ op: 'mkdir', id: 'f', path: 'Trips' }, { op: 'write', id: 'a', path: 'Trips/p.md' }]);
});
