// Covers: shared/fmp/fmp.js
// SlopFmp.detect: which kind of FileMaker file the first bytes are (from the header, with the name as a hint only), and
// that it never throws. Headers are built as shared/fmp/HANDOFF.md describes them (the 15-byte magic number, "HBAM7" or
// "HBAMe" at byte 15, the Pascal string "Pro N.0" at byte 541).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFmp, plain, buildV7, buildV3, ascii } from './fmp-fixture.mjs';

const F = loadFmp();
const head = (bytes) => bytes.subarray(0, 4096);
const kind = (bytes, name = '') => (F.detect(bytes, name) || {}).kind;

test('Pro 12 and later is fmp12, Pro 7 to 11 is fp7, Pro 3 and 4 are fp3, Pro 5 and 6 are fp5, by the version in the header', () => {
  assert.deepEqual(plain(F.detect(head(buildV7([[]])), 'a.fmp12')), { kind: 'fmp12', label: 'FileMaker Pro 12+ database' });
  const seven = buildV7([[]], { version: 'Pro 7.0' }); seven[521] = 0x1D;
  assert.deepEqual(plain(F.detect(head(seven), 'a.fp7')), { kind: 'fp7', label: 'FileMaker Pro 7-11 database' });
  assert.equal(kind(head(buildV7([[]], { version: 'Pro 14.0' }))), 'fmp12');
  assert.equal(kind(head(buildV7([[]], { version: 'Pro 19.0' }))), 'fmp12');
  assert.deepEqual(plain(F.detect(head(buildV3([[]], { version: 'Pro 3.0' })), 'a.fp3')), { kind: 'fp3', label: 'FileMaker Pro 3-4 database' });
  assert.equal(kind(head(buildV3([[]], { version: 'Pro 4.0' }))), 'fp3');
  assert.deepEqual(plain(F.detect(head(buildV3([[]], { version: 'Pro 5.0' })), 'a.fp5')), { kind: 'fp5', label: 'FileMaker Pro 5-6 database' });
  assert.equal(kind(head(buildV3([[]], { version: 'Pro 6.0' }))), 'fp5');
});

test('the header wins over the file name; the name decides only when the header does not say', () => {
  assert.equal(kind(head(buildV7([[]])), 'wrong.fp5'), 'fmp12');
  const noVersion = buildV7([[]], { version: '' }); noVersion[521] = 0x1D;
  assert.equal(kind(head(noVersion), 'x.FMP12'), 'fmp12');
  assert.equal(kind(head(noVersion), 'x.fp7'), 'fp7');
  assert.equal(kind(head(buildV3([[]], { version: '' })), 'x.fp3'), 'fp3');
  assert.equal(kind(head(buildV3([[]], { version: '' })), ''), 'fp5');
});

test('encrypted and newer files are still FileMaker files (open() says why it cannot read them)', () => {
  assert.equal(kind(head(buildV7([[]], { hbam: 'HBAMe' }))), 'fmp12');
  assert.equal(kind(head(buildV7([[]], { hbam: 'HBAM8' }))), 'fmp12');
});

test('only the first bytes are needed: the 15-byte magic number is enough to say it is one of ours', () => {
  const magic = buildV3([[]]).subarray(0, 15);
  assert.equal(kind(magic), 'fp5');
  assert.equal(F.detect(magic.subarray(0, 14), ''), null);
});

test('other files are null: text, pictures, zeros, empty input, almost-the-magic', () => {
  for (const bytes of [new Uint8Array(0), new Uint8Array(3), new Uint8Array(5000), Uint8Array.from(ascii('Name,Age\nAnn,3\n')), Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0xD]), Uint8Array.from([0, 1, 0, 0, 0, 2, 0, 1, 0, 5, 0, 2, 0, 2, 0xC1, 0, 0])]) {
    assert.equal(F.detect(bytes, 'file.fmp12'), null);
  }
});

test('detect never throws, whatever it is given; an ArrayBuffer is accepted too', () => {
  for (const v of [undefined, null, 5, 'text', {}, [], { length: 9 }, Symbol.iterator.toString()]) assert.doesNotThrow(() => F.detect(v, v));
  assert.equal(F.detect(undefined, ''), null);
  const b = head(buildV7([[]]));
  assert.equal(kind(b.buffer.slice(b.byteOffset, b.byteOffset + 4096)), 'fmp12');
});

test('XML exports are found by their first element, in a file of any size', () => {
  const xml = (s) => Uint8Array.from(ascii(s));
  assert.equal(kind(xml('<?xml version="1.0"?><FMPXMLRESULT><ROW/></FMPXMLRESULT>')), 'fmpxmlresult');
  assert.equal(kind(xml('<fmxmlsnippet type="FMObjectList"/>')), 'fmxmlsnippet');
  assert.equal(kind(xml('<?xml version="1.0"?><FMPReport/>')), 'ddr');
  assert.equal(kind(xml('<?xml version="1.0"?><plist/>')), undefined);
  assert.deepEqual(plain(F.detect(xml('<FMPXMLRESULT/>'), 'x.xml')), { kind: 'fmpxmlresult', label: 'FileMaker XML export' });
});
