// Node tests for the drop rules (shared/intake/rules.js, window.SlopIntake.rules and SlopDrop.rules): which dropped files an app takes, why it
// refuses the others, the toast words, and the accept attribute. Loaded in a vm context. Run with: node tests/run.mjs drop
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'shared', 'intake', 'rules.js'), 'utf8'), ctx, { filename: 'rules.js' });
const R = ctx.SlopDrop.rules;
// vm objects come from another realm, so compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

const PICS = { types: ['image/*', 'video/*'], exts: ['.heic'], noun: 'a picture or video' };
const PDF = { types: ['application/pdf'], exts: [], noun: 'a PDF', maxBytes: 1024 * 1024 };
const file = (name, type, size = 100) => ({ name, type, size });

test('accept: pictures and videos by MIME type', () => {
  assert.deepEqual(plain(R.check(file('a.png', 'image/png'), PICS)), { ok: true });
  assert.deepEqual(plain(R.check(file('b.mp4', 'video/mp4'), PICS)), { ok: true });
  assert.deepEqual(plain(R.check(file('c.webm', 'video/webm'), PICS)), { ok: true });
});

test('refuse: a file of another type says what it is not', () => {
  assert.deepEqual(plain(R.check(file('notes.txt', 'text/plain'), PICS)), { ok: false, reason: 'notes.txt is not a picture or video' });
  assert.deepEqual(plain(R.check(file('paper.pdf', 'application/pdf'), { types: ['image/*'], noun: 'a picture' })), { ok: false, reason: 'paper.pdf is not a picture' });
});

test('an unknown type is decided by the extension', () => {
  assert.equal(R.check(file('IMG_0001.HEIC', ''), PICS).ok, true);
  assert.equal(R.check(file('IMG_0001.heic', 'application/octet-stream'), PICS).ok, true);
  assert.deepEqual(plain(R.check(file('notes.txt', ''), PICS)), { ok: false, reason: 'notes.txt is not a picture or video' });
  // a known type wins over the extension: a .png that says text/plain is refused
  assert.equal(R.check(file('odd.png', 'text/plain'), PICS).ok, false);
});

test('refuse: an empty file, and a file over the size limit', () => {
  assert.deepEqual(plain(R.check(file('empty.png', 'image/png', 0), PICS)), { ok: false, reason: 'empty.png is empty' });
  assert.equal(R.check(file('ok.pdf', 'application/pdf', 1024 * 1024), PDF).ok, true);
  assert.deepEqual(plain(R.check(file('big.pdf', 'application/pdf', 1024 * 1024 + 1), PDF)), { ok: false, reason: 'big.pdf is larger than 1.0 MB' });
});

test('a missing noun still gives a reason', () => {
  assert.deepEqual(plain(R.check(file('x.bin', 'application/x-thing'), { types: ['image/*'] })), { ok: false, reason: 'x.bin is not a supported file' });
});

test('drag time: only a known type that is not taken is refused early', () => {
  assert.equal(R.maybeOk('', PICS), true);
  assert.equal(R.maybeOk('image/jpeg', PICS), true);
  assert.equal(R.maybeOk('text/plain', PICS), false);
  assert.equal(R.dragLabel(['image/png', 'image/jpeg'], PICS), 'Drop to add 2 files');
  assert.equal(R.dragLabel([''], PICS), 'Drop to add 1 file');
  assert.equal(R.dragLabel(['image/png', 'text/plain'], PICS), 'Drop to add 2 files (1 will be refused)');
});

test('the toast: added, skipped and nothing added', () => {
  assert.equal(R.describe({ added: [{}, {}, {}], skipped: [{ name: 'notes.txt', reason: 'notes.txt is not a picture' }] }),
    'Added 3 files, 1 skipped: notes.txt is not a picture');
  assert.equal(R.describe({ added: [{}], skipped: [] }), 'Added 1 file');
  assert.equal(R.describe({ added: [], skipped: [{ name: 'a.txt', reason: 'a.txt is not a picture' }] }), 'Nothing added: a.txt is not a picture');
  assert.equal(R.describe({ added: [{}], skipped: [{ reason: 'a is empty' }, { reason: 'b is empty' }, { reason: 'c is empty' }] }),
    'Added 1 file, 3 skipped: a is empty; b is empty and 1 more');
  assert.equal(R.describe({ added: [], skipped: [] }), 'No files to add');
});

test('the accept attribute lists the MIME patterns and the extensions', () => {
  assert.equal(R.acceptAttr(PICS), 'image/*,video/*,.heic');
  assert.equal(R.acceptAttr({ types: ['image/*'] }), 'image/*');
});

test('sizes read for people', () => {
  assert.equal(R.size(512), '512 B');
  assert.equal(R.size(3.4 * 1024), '3.4 KB');
  assert.equal(R.size(12 * 1024 * 1024), '12 MB');
  assert.equal(R.size(1.5 * 1024 * 1024 * 1024), '1.5 GB');
});

test('the extension of a name, lower case, with its dot', () => {
  assert.equal(R.ext('Holiday.JPG'), '.jpg');
  assert.equal(R.ext('archive.tar.gz'), '.gz');
  assert.equal(R.ext('noext'), '');
});
