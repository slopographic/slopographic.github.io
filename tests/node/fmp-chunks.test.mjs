// Covers: shared/fmp/chunks.js
// Covers: shared/fmp/chunks7.js
// Covers: shared/fmp/sectors.js
// The byte codes of a sector's payload (hand-built arrays for each code of Pro 7+ and Pro 3 to 6, the pop that follows a
// code with its top bits set, the no-ops, the faults), the path numbers, the file header, the sector table and the chain
// of leaf sectors (shuffled ids, an index sector at id 2, a loop).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadFmp, plain, buildV7, buildV3, ascii } from './fmp-fixture.mjs';

const F = loadFmp(['scsu.js', 'charset.js', 'sectors.js', 'chunks.js', 'chunks7.js']);
const C = F.chunks;
const T = { PUSH: C.PUSH, POP: C.POP, DATA: C.DATA, REF: C.REF, LREF: C.LREF, SEG: C.SEG };
const d7 = (bytes) => { const b = Uint8Array.from(bytes); const r = C.decode(b, 0, b.length, true); return { error: r.error, chunks: plain(r.chunks) }; };
const d3 = (bytes) => { const b = Uint8Array.from(bytes); const r = C.decode(b, 0, b.length, false); return { error: r.error, chunks: plain(r.chunks) }; };
/** [kind, key, offset, length] of each chunk. */
const brief = (r) => r.chunks.map((c) => [c.t, c.t === T.SEG ? c.seg : c.ref, c.o, c.n]);

describe('Pro 7+ codes', () => {
  test('key and value: 0x01-0x05 take 1, 2, 4, 6, 8 bytes; 0x06 a length; 0x09-0x0E have a two-byte key', () => {
    assert.deepEqual(brief(d7([0x01, 5, 9])), [[T.REF, 5, 2, 1]]);
    assert.deepEqual(brief(d7([0x02, 5, 9, 9])), [[T.REF, 5, 2, 2]]);
    assert.deepEqual(brief(d7([0x05, 5, 1, 2, 3, 4, 5, 6, 7, 8])), [[T.REF, 5, 2, 8]]);
    assert.deepEqual(brief(d7([0x06, 7, 3, 1, 2, 3])), [[T.REF, 7, 3, 3]]);
    assert.deepEqual(brief(d7([0x09, 0x01, 0x05, 9])), [[T.REF, 0x80 + 0x105, 3, 1]]); // 0x80 + (1 << 8) + 5
    assert.deepEqual(brief(d7([0x0A, 0x80, 0x03, 9, 9])), [[T.REF, 0x83, 3, 2]]); // the top bit of the first byte is ignored
    assert.deepEqual(brief(d7([0x0E, 0x00, 0x04, 2, 8, 8])), [[T.REF, 0x84, 4, 2]]);
  });
  test('segments: 0x07 (one-byte index, two-byte length) and 0x0F (a path integer index)', () => {
    assert.deepEqual(brief(d7([0x07, 3, 0x00, 0x02, 8, 9])), [[T.SEG, 3, 4, 2]]);
    assert.deepEqual(brief(d7([0x0F, 0x00, 0x02, 0x00, 0x01, 8])), [[T.SEG, 0x82, 5, 1]]);
  });
  test('plain data: 0x00 (1 byte), 0x08 (2), 0x0E 0xFF (6), 0x10-0x15 (3, 4, 5, 7, 9, 11), 0x18 and 0x23 (a length)', () => {
    assert.deepEqual(brief(d7([0x00, 7])), [[T.DATA, 0, 1, 1]]);
    assert.deepEqual(brief(d7([0x08, 1, 2])), [[T.DATA, 0, 1, 2]]);
    assert.deepEqual(brief(d7([0x0E, 0xFF, 1, 2, 3, 4, 5])), [[T.DATA, 0, 1, 6]]);
    for (const [code, n] of [[0x10, 3], [0x11, 4], [0x12, 5], [0x13, 7], [0x14, 9], [0x15, 11]]) {
      assert.deepEqual(brief(d7([code, ...new Array(n).fill(1)])), [[T.DATA, 0, 1, n]], 'code ' + code.toString(16));
    }
    assert.deepEqual(brief(d7([0x18, 2, 8, 9])), [[T.DATA, 0, 2, 2]]);
    assert.deepEqual(brief(d7([0x23, 1, 8])), [[T.DATA, 0, 2, 1]]);
  });
  test('0x19-0x1D: the value, then a trailing part that is skipped; 0x1B 0x00 is a key and four bytes', () => {
    const r = d7([0x19, 2, 8, 9, 7, 0x06, 1, 1, 5]);
    assert.deepEqual(brief(r), [[T.DATA, 0, 2, 2], [T.REF, 1, 8, 1]]);
    assert.deepEqual(brief(d7([0x1A, 1, 8, 7, 7, 0x00, 4])), [[T.DATA, 0, 2, 1], [T.DATA, 0, 6, 1]]);
    assert.deepEqual(brief(d7([0x1B, 0x00, 6, 1, 2, 3, 4])), [[T.REF, 6, 3, 4]]);
  });
  test('keys of bytes: 0x16 (three-byte key, one-byte length), 0x17 (two-byte length), 0x1E and 0x1F (a length-prefixed key)', () => {
    const k = (r) => r.chunks.map((c) => [c.t, c.ko, c.kn, c.o, c.n]);
    assert.deepEqual(k(d7([0x16, 1, 2, 3, 2, 8, 9])), [[T.LREF, 1, 3, 5, 2]]);
    assert.deepEqual(k(d7([0x17, 1, 2, 3, 0, 1, 8])), [[T.LREF, 1, 3, 6, 1]]);
    assert.deepEqual(k(d7([0x1E, 2, 7, 7, 1, 9])), [[T.LREF, 2, 2, 5, 1]]);
    assert.deepEqual(k(d7([0x1F, 1, 7, 0, 2, 8, 9])), [[T.LREF, 2, 1, 5, 2]]);
  });
  test('the path: push of 1, 2, 3 bytes (0x20, 0x28, 0x30), of 8 (0x20 0xFE) and of n (0x38); pop 0x3D and 0x40', () => {
    const r = d7([0x20, 5, 0x28, 0x00, 0x01, 0x30, 0, 0, 7, 0x38, 2, 9, 9, 0x20, 0xFE, 1, 2, 3, 4, 5, 6, 7, 8, 0x3D, 0x40]);
    assert.deepEqual(r.chunks.map((c) => [c.t, c.n]), [[T.PUSH, 1], [T.PUSH, 2], [T.PUSH, 3], [T.PUSH, 2], [T.PUSH, 8], [T.POP, 0], [T.POP, 0]]);
    assert.equal(r.error, 0);
  });
  test('a code with its top two bits set is the same chunk followed by a pop', () => {
    assert.deepEqual(d7([0xE0, 7]).chunks.map((c) => c.t), [T.PUSH, T.POP]); // 0xE0 = 0xC0 | 0x20
    assert.deepEqual(d7([0xC6, 3, 1, 9, 0x06, 4, 1, 8]).chunks.map((c) => c.t), [T.REF, T.POP, T.REF]);
    assert.deepEqual(d7([0xFD]).chunks.map((c) => c.t), [T.POP, T.POP]); // 0xFD = 0xC0 | 0x3D
  });
  test('0x80 and 0x88 read as nothing; zero padding ends the sector without a fault', () => {
    const r = d7([0x80, 0x06, 1, 1, 9, 0x88, 0x06, 2, 1, 8, 0x00, 0x00, 0x00]);
    assert.deepEqual(r.chunks.map((c) => c.ref), [1, 2]);
    assert.equal(r.error, 0);
    assert.deepEqual(d7([0x00, 0x00]).chunks, []);
  });
  test('an unknown code (error 2) and data that runs past the sector (error 1) keep the chunks read before', () => {
    const bad = d7([0x06, 1, 1, 9, 0x41, 0x06, 2, 1, 8]);
    assert.equal(bad.error, 2);
    assert.deepEqual(bad.chunks.map((c) => c.ref), [1]);
    const cut = d7([0x06, 1, 1, 9, 0x06, 2, 5, 8]);
    assert.equal(cut.error, 1);
    assert.deepEqual(cut.chunks.map((c) => c.ref), [1]);
    for (const code of [0x01, 0x06, 0x07, 0x09, 0x0E, 0x0F, 0x16, 0x17, 0x18, 0x1E, 0x1F, 0x20, 0x28, 0x30, 0x38]) {
      assert.equal(d7([code]).error, 1, 'a lone ' + code.toString(16));
    }
  });
});

describe('Pro 3 to 6 codes', () => {
  test('0x00 and 0x40-0x7F: a key (0 or code - 0x40) and a one-byte length; 0x80-0xBF data of code - 0x80', () => {
    assert.deepEqual(brief(d3([0x00, 2, 8, 9])), [[T.REF, 0, 2, 2]]);
    assert.deepEqual(brief(d3([0x43, 1, 8])), [[T.REF, 3, 2, 1]]);
    assert.deepEqual(brief(d3([0x80 + 3, 1, 2, 3])), [[T.DATA, 0, 1, 3]]);
  });
  test('0x01-0x3F: a key of bytes, then a value; a key of one byte is the same as a number', () => {
    const r = d3([0x02, 7, 8, 3, 1, 2, 3]);
    assert.deepEqual(r.chunks.map((c) => [c.t, c.ko, c.kn, c.o, c.n]), [[T.LREF, 1, 2, 4, 3]]);
    const one = d3([0x01, 9, 2, 5, 5]);
    assert.deepEqual(one.chunks.map((c) => [c.t, c.ref, c.o, c.n]), [[T.REF, 9, 3, 2]]);
  });
  test('0xC0 pops, 0xC1-0xFE push that many bytes', () => {
    assert.deepEqual(d3([0xC2, 5, 6, 0xC0, 0xC1, 3]).chunks.map((c) => [c.t, c.n]), [[T.PUSH, 2], [T.POP, 0], [T.PUSH, 1]]);
  });
  test('0xFF: a long key (1-4 bytes) or a key 0x40-0x80 with a two-byte length; the 01 FF 05 marker is skipped', () => {
    const r = d3([0xFF, 0x02, 7, 8, 0x00, 0x03, 1, 2, 3]);
    assert.deepEqual(r.chunks.map((c) => [c.t, c.kn, c.o, c.n]), [[T.LREF, 2, 6, 3]]);
    const s = d3([0xFF, 0x45, 0x00, 0x02, 8, 9]);
    assert.deepEqual(s.chunks.map((c) => [c.t, c.ref, c.o, c.n]), [[T.REF, 5, 4, 2]]);
    const marker = d3([0x01, 0xFF, 0x05, 0, 0, 0, 0, 0, 0x43, 1, 8]);
    assert.deepEqual(marker.chunks.map((c) => c.ref), [3]);
  });
  test('faults: a zero or unknown second byte after 0xFF, and data past the end', () => {
    assert.equal(d3([0xFF, 0x00, 1, 2]).error, 1);
    assert.equal(d3([0xFF, 0x20, 1, 2]).error, 1);
    const cut = d3([0x41, 1, 8, 0x42, 9, 1]);
    assert.equal(cut.error, 1);
    assert.deepEqual(cut.chunks.map((c) => c.ref), [1]);
  });
});

describe('path numbers', () => {
  const pv = (bytes, v7) => { const b = Uint8Array.from(bytes); return C.pathValue(b, { o: 0, n: b.length }, v7); };
  test('1 byte is itself, 2 bytes are 0x80 + 15 bits, 3 bytes depend on the version, more is 0', () => {
    assert.equal(pv([5], true), 5);
    assert.equal(pv([0x81, 0x02], false), 0x80 + 0x102);
    assert.equal(pv([0x00, 0x01, 0x02], true), 0x80 + 0x102); // Pro 7+: the first byte is ignored
    assert.equal(pv([0x01, 0x00, 0x02], false), 0xC000 + 0x10002); // Pro 3 to 6: 22 bits
    assert.equal(pv([1, 2, 3, 4], true), 0);
  });
});

describe('header', () => {
  test('Pro 7+, Pro 12, Pro 3 to 6, and what is not a file of ours', () => {
    const h12 = F.sectors.header(buildV7([[]]));
    assert.equal(h12.v7, true); assert.equal(h12.version, 12); assert.equal(h12.sectorSize, 4096); assert.equal(h12.versionString, 'Pro 12.0');
    const h7 = buildV7([[]], { version: 'Pro 7.0' }); h7[521] = 0x1D;
    assert.equal(F.sectors.header(h7).version, 7);
    const h5 = F.sectors.header(buildV3([[]]));
    assert.equal(h5.v7, false); assert.equal(h5.sectorSize, 1024); assert.equal(h5.first, 2048); assert.equal(h5.versionString, 'Pro 5.0');
    assert.equal(F.sectors.header(new Uint8Array(2000)).error, 'not-filemaker');
    assert.equal(F.sectors.header(Uint8Array.from(ascii('<?xml version="1.0"?>'))).error, 'not-filemaker');
    assert.equal(F.sectors.header(new Uint8Array(4)).error, 'not-filemaker');
    assert.equal(F.sectors.header(buildV7([[]]).subarray(0, 600)).error, 'corrupt'); // the magic number, then cut short
  });
  test('HBAMe is encrypted, any other HBAM tag is a newer format', () => {
    assert.equal(F.sectors.header(buildV7([[]], { hbam: 'HBAMe' })).error, 'encrypted');
    assert.equal(F.sectors.header(buildV7([[]], { hbam: 'HBAM8' })).error, 'unsupported');
  });
});

describe('sector table and the chain of leaves', () => {
  const chainOf = (bytes) => { const i = F.sectors.header(bytes); return plain(F.sectors.leafChain(F.sectors.table(bytes, i), i)); };
  test('leaves are read in link order, whatever their order in the file (shuffled ids)', () => {
    const bytes = buildV7([[0x00, 1], [0x00, 2], [0x00, 3], [0x00, 4]], { ids: [4, 2, 5, 3] });
    assert.deepEqual(chainOf(bytes).map((i) => i + 1), [4, 2, 5, 3]);
    assert.deepEqual(chainOf(buildV3([[0x80], [0x80], [0x80]], { ids: [2, 4, 3] })).map((i) => i + 1), [2, 4, 3]); // Pro 3 to 6 starts at id 2
  });
  test('Pro 7+: an index sector at id 2 is skipped, the chain starts at the leaf with no predecessor', () => {
    assert.deepEqual(chainOf(buildV7([[0x00, 1], [0x00, 2]], { index: true })).map((i) => i + 1), [3, 4]);
  });
  test('the count in the first sector must fit the size of the file', () => {
    const bytes = buildV7([[0x00, 1]]);
    const i = F.sectors.header(bytes);
    assert.equal(F.sectors.table(bytes.subarray(0, bytes.length - 4096), i).error, 'corrupt');
    assert.equal(F.sectors.table(new Uint8Array(bytes.length + 10).fill(0).map((_, k) => bytes[k] || 0), i).error, 'corrupt');
    assert.equal(F.sectors.table(bytes, i).count, 2);
    assert.equal(F.sectors.table(bytes.subarray(0, 4096), i).error, 'corrupt');
  });
  test('a loop in the links, a link past the end and a damaged sector do not hang or throw', () => {
    const bytes = buildV7([[0x00, 1], [0x00, 2], [0x00, 3]]);
    const view = new DataView(bytes.buffer);
    view.setUint32(4 * 4096 + 8, 2); // the last leaf links back to the first
    assert.deepEqual(chainOf(bytes).map((i) => i + 1), [2, 3, 4]);
    view.setUint32(4 * 4096 + 8, 999); // or to a sector that is not there
    assert.deepEqual(chainOf(bytes).map((i) => i + 1), [2, 3, 4]);
    const old = buildV3([[0x80], [0x80]]);
    new DataView(old.buffer).setUint16(1024 + 3 * 1024 + 12, 5000); // a payload longer than its sector
    const info = F.sectors.header(old), t = F.sectors.table(old, info);
    assert.deepEqual(plain(F.sectors.leafChain(t, info)).map((i) => i + 1), [2]);
  });
  test('the sector order of the file can be used instead of the links (files whose links are stale)', () => {
    const bytes = buildV3([[0x80], [0x80]], { ids: [3, 2] });
    const info = F.sectors.header(bytes);
    assert.equal(F.sectors.table(bytes, info, true).count, 3);
  });
});
