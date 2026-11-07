// Slop Hex: the pure byte model (hex/js/bytes.js and hex/js/doc.js) run as the browser runs them, in one vm context.
// Covers parsing, magic-byte types, search across page and chunk boundaries, paged reads, edits with undo and redo,
// nibble coalescing, saving as a composed Blob, and SHA-256. Run: node tests/run.mjs hex
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HEX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'hex', 'js');
async function load() {
  const ctx = { Blob, TextEncoder, crypto: webcrypto, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['bytes.js', 'doc.js']) vm.runInContext(await readFile(path.join(HEX, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const B = await load();
const HB = B.HexBytes;
const u8 = (...a) => new Uint8Array(a);
const plain = (v) => JSON.parse(JSON.stringify(v));
const arr = (t) => Array.from(t);
/** Deterministic bytes: byte i is (i * 7 + i >> 8) & 255. */
const pattern = (n) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i * 7 + (i >> 8)) & 255; return a; };
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

test('offsets: decimal and 0x hex, inside the file only', () => {
  assert.deepEqual(plain(HB.parseOffset('1234', 5000)), { value: 1234 });
  assert.deepEqual(plain(HB.parseOffset(' 0x4D2 ', 5000)), { value: 1234 });
  assert.deepEqual(plain(HB.parseOffset('0XFF', 5000)), { value: 255 });
  assert.ok(HB.parseOffset('5000', 5000).error);
  assert.ok(HB.parseOffset('-1', 5000).error);
  assert.ok(HB.parseOffset('0xzz', 5000).error);
  assert.ok(HB.parseOffset('12abc', 5000).error);
  assert.ok(HB.parseOffset('0', 0).error);
});

test('hex input: spaces optional, whole bytes only', () => {
  assert.deepEqual(arr(HB.parseHex('4D 5A')), [0x4d, 0x5a]);
  assert.deepEqual(arr(HB.parseHex('4d5a\t90')), [0x4d, 0x5a, 0x90]);
  assert.deepEqual(arr(HB.parseHex('0x00FF')), [0, 0xff]);
  assert.equal(HB.parseHex('4D 5'), null);
  assert.equal(HB.parseHex('ZZ'), null);
  assert.equal(HB.parseHex('   '), null);
});

test('text search bytes are UTF-8', () => {
  assert.deepEqual(arr(HB.textBytes('é')), [0xc3, 0xa9]);
});

test('row formatting: hex pairs and printable ASCII only', () => {
  assert.equal(HB.hexOf(0x0a), '0A');
  assert.equal(HB.hexOf(0xff), 'FF');
  assert.equal(HB.asciiOf(0x41), 'A');
  assert.equal(HB.asciiOf(0x7f), '.');
  assert.equal(HB.asciiOf(0x00), '.');
  assert.equal(HB.formatOffset(0x1234, 100), '0x00001234');
  assert.equal(HB.formatOffset(0x10, 0x1ffffffff), '0x000000010');
});

test('file type from magic bytes and text detection', () => {
  assert.equal(HB.guessType(u8(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), 'PNG image');
  assert.equal(HB.guessType(u8(0xff, 0xd8, 0xff, 0xe0)), 'JPEG image');
  assert.equal(HB.guessType(new TextEncoder().encode('%PDF-1.7\n')), 'PDF document');
  assert.equal(HB.guessType(u8(0x50, 0x4b, 0x03, 0x04, 0)), 'ZIP archive (also Office and EPUB files)');
  assert.equal(HB.guessType(u8(0x7f, 0x45, 0x4c, 0x46, 2)), 'ELF executable');
  assert.equal(HB.guessType(u8(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), 'WebP image');
  assert.equal(HB.guessType(u8(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70)), 'MP4 or QuickTime media (ISO base media)');
  assert.equal(HB.guessType(new TextEncoder().encode('hello, world\n')), 'Text (probably UTF-8 or ASCII)');
  assert.equal(HB.guessType(u8(0x41, 0, 0x42)), 'Binary data');
  assert.equal(HB.guessType(new Uint8Array(0)), 'Empty file');
});

test('byte search inside a buffer, forwards and backwards', () => {
  const hay = u8(1, 2, 3, 1, 2, 3, 9);
  assert.equal(HB.indexOf(hay, u8(1, 2, 3), 0), 0);
  assert.equal(HB.indexOf(hay, u8(1, 2, 3), 1), 3);
  assert.equal(HB.indexOf(hay, u8(7), 0), -1);
  assert.equal(HB.lastIndexOf(hay, u8(1, 2, 3)), 3);
  assert.equal(HB.lastIndexOf(hay, u8(1, 2, 3), 2), 0);
  assert.equal(HB.indexOf(hay, u8(), 0), -1);
});

test('a loaded document reads through pages and shows the bytes', async () => {
  const data = pattern(300000);
  const d = B.HexDoc.create(new Blob([data]), { name: 'a.bin', crypto: webcrypto });
  assert.equal(d.size, 300000);
  assert.equal(d.byte(0), undefined, 'not loaded yet');
  assert.equal(d.has(0, 16), false);
  await d.load(0, 16);
  assert.equal(d.has(0, 16), true);
  assert.equal(d.byte(5), data[5]);
  await d.load(299990, 10);
  assert.equal(d.byte(299999), data[299999]);
  assert.equal(d.byte(300000), undefined);
});

test('the page cache is bounded: old pages drop out, and load brings them back', async () => {
  const n = 70 * B.HexDoc.PAGE + 100;
  const data = pattern(n);
  const d = B.HexDoc.create(new Blob([data]));
  for (let p = 0; p < 70; p++) await d.load(p * B.HexDoc.PAGE, 1);
  assert.equal(d.has(0, 1), false, 'the first page was dropped');
  assert.equal(d.has(69 * B.HexDoc.PAGE, 1), true);
  await d.load(0, 1);
  assert.equal(d.byte(0), data[0]);
});

test('writes, undo and redo, and a write to an unloaded byte is refused', async () => {
  const data = pattern(1000);
  const d = B.HexDoc.create(new Blob([data]));
  await d.load(0, 1000);
  assert.equal(d.write([{ at: 10, value: 0xab }]), true);
  assert.equal(d.byte(10), 0xab);
  assert.equal(d.write([{ at: 10, value: 0xab }]), false, 'same value is not an edit');
  assert.equal(d.dirty(), true);
  assert.equal(d.undo().at, 10);
  assert.equal(d.byte(10), data[10]);
  assert.equal(d.dirty(), false);
  assert.equal(d.canRedo(), true);
  d.redo();
  assert.equal(d.byte(10), 0xab);
  assert.equal(d.undo() !== null, true);
  assert.equal(d.undo(), null, 'nothing more to undo');
});

test('a write to a byte whose page is not loaded throws', async () => {
  const d = B.HexDoc.create(new Blob([pattern(200000)]));
  assert.throws(() => d.write([{ at: 150000, value: 1 }]), /not loaded/);
});

test('two typed digits coalesce into one undo group', async () => {
  const data = pattern(64);
  const d = B.HexDoc.create(new Blob([data]));
  await d.load(0, 64);
  d.write([{ at: 3, value: 0xa0 }], { coalesce: 'nib3' });
  d.write([{ at: 3, value: 0xab }], { coalesce: 'nib3' });
  assert.equal(d.byte(3), 0xab);
  assert.equal(d.undo().at, 3);
  assert.equal(d.byte(3), data[3], 'one undo restores the whole byte');
  assert.equal(d.canUndo(), false);
});

test('saving composes the original slices and the changed runs', async () => {
  const data = pattern(200000);
  const d = B.HexDoc.create(new Blob([data], { type: 'application/octet-stream' }));
  await d.load(0, 200000);
  d.write([{ at: 0, value: 0x11 }, { at: 1, value: 0x22 }, { at: 99999, value: 0x33 }, { at: 199999, value: 0x44 }]);
  const expect = Uint8Array.from(data);
  expect[0] = 0x11; expect[1] = 0x22; expect[99999] = 0x33; expect[199999] = 0x44;
  const out = await bytesOf(d.toBlob());
  assert.equal(out.length, 200000);
  assert.ok(out.every((b, i) => b === expect[i]), 'saved bytes match');
  assert.equal(d.toBlob().size, 200000);
});

test('markSaved clears dirty, and an edit after a save makes it dirty again', async () => {
  const d = B.HexDoc.create(new Blob([pattern(16)]));
  await d.load(0, 16);
  d.write([{ at: 0, value: 1 }]);
  d.markSaved();
  assert.equal(d.dirty(), false);
  d.write([{ at: 1, value: 2 }], { coalesce: 'x' });
  assert.equal(d.dirty(), true);
  d.undo();
  assert.equal(d.dirty(), false, 'undo back to the saved state is clean');
  d.undo();
  assert.equal(d.dirty(), true, 'past the saved state is dirty');
  d.redo();
  assert.equal(d.dirty(), false, 'redo back to the saved state is clean');
  d.redo();
  assert.equal(d.dirty(), true);
});

test('find: forward and backward, across chunk boundaries, with edits applied', async () => {
  const n = (1 << 20) * 2 + 500;
  const data = new Uint8Array(n);
  const pat = u8(0xde, 0xad, 0xbe, 0xef);
  data.set(pat, (1 << 20) - 2); // straddles the first chunk boundary
  data.set(pat, n - 40);
  const d = B.HexDoc.create(new Blob([data]));
  assert.equal(await d.find(pat, 0, 1), (1 << 20) - 2);
  assert.equal(await d.find(pat, (1 << 20) - 1, 1), n - 40);
  assert.equal(await d.find(pat, n - 41, 1), n - 40);
  assert.equal(await d.find(pat, n - 39, 1), -1);
  assert.equal(await d.find(pat, n - 40, -1), n - 40);
  assert.equal(await d.find(pat, n - 41, -1), (1 << 20) - 2);
  assert.equal(await d.find(pat, (1 << 20) - 3, -1), -1);
  await d.load((1 << 20) - 2, 1);
  d.write([{ at: (1 << 20) - 2, value: 0 }]);
  assert.equal(await d.find(pat, 0, 1), n - 40, 'the edited match is gone');
  assert.equal(await d.find(u8(0, 0xad), 0, 1), (1 << 20) - 2, 'a match made by an edit is found');
});

test('find: stop callback and no match', async () => {
  const d = B.HexDoc.create(new Blob([pattern(5000)]));
  assert.equal(await d.find(u8(0xff, 0xff, 0xff), 0, 1), -1);
  assert.equal(await d.find(u8(1), 0, 1, () => true), null);
  assert.equal(await d.find(new Uint8Array(0), 0, 1), -1);
});

test('readRange returns the current bytes of a range, edits included', async () => {
  const data = pattern(40);
  const d = B.HexDoc.create(new Blob([data]));
  await d.load(0, 40);
  d.write([{ at: 4, value: 0x99 }]);
  const r = await d.readRange(2, 5);
  assert.deepEqual(Array.from(r), [data[2], data[3], 0x99, data[5], data[6]]);
  assert.equal((await d.readRange(38, 10)).length, 2);
});

test('SHA-256 of the current content matches node crypto', async () => {
  const data = pattern(150000);
  const d = B.HexDoc.create(new Blob([data]), { crypto: webcrypto });
  await d.load(0, 150000);
  assert.equal(await d.sha256(), createHash('sha256').update(data).digest('hex'));
  d.write([{ at: 7, value: 0 }]);
  const edited = Uint8Array.from(data); edited[7] = 0;
  assert.equal(await d.sha256(), createHash('sha256').update(edited).digest('hex'));
});
