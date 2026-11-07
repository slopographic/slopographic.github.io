// Camera RAW detection, preview extraction and camera settings, on small hand-built TIFF, DNG, CR2, ORF, RW2, RAF and CR3
// structures (tests/raw/build.js), plus one real DNG: tests/raw/fixtures/canon-5d3-crop.dng, "Canon - EOS 5D Mark III - 14bit
// 14bit (2.3471882640587).dng" from raw.pixls.us (CC0 1.0, public domain dedication), 1.5 MB, a cropped DNG with no preview.
// Covers: shared/raw/tiff.js, shared/raw/detect.js, shared/raw/preview.js, tests/raw/build.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const T = require(path.join(ROOT, 'shared/raw/tiff.js'));
const D = require(path.join(ROOT, 'shared/raw/detect.js'));
const P = require(path.join(ROOT, 'shared/raw/preview.js'));
const B = require(path.join(ROOT, 'tests/raw/build.js'));

const small = B.jpeg(160, 120), big = B.jpeg(1620, 1080), full = B.jpeg(6000, 4000), lossless = B.jpeg(6000, 4000, { sof: 0xc3 });
const camera = [[0x10f, 2, 'NIKON CORPORATION'], [0x110, 2, 'NIKON Z 6'], [0x112, 3, 6], [0x132, 2, '2024:05:06 07:08:09']];

test('a DNG is found by its DNGVersion tag, whatever its name', () => {
  const dng = B.tiff({ ifd0: [[0xc612, 1, [1, 4, 0, 0]], [0x10f, 2, 'Canon'], [0x106, 3, 32803]] });
  assert.equal(D.sniff(dng, 'photo.dng').ext, 'dng');
  assert.equal(D.sniff(dng, 'photo.tif').ext, 'dng');
  assert.equal(D.sniff(dng, '').maker, 'Canon');
});

test('a plain TIFF is not RAW; a camera maker\'s TIFF with a CFA image or SubIFDs is', () => {
  const plain = B.tiff({ ifd0: [[0x100, 3, 10], [0x101, 3, 10], [0x106, 3, 2], [0x10f, 2, 'Epson Scanner']] });
  assert.equal(D.sniff(plain, 'scan.tif'), null);
  assert.equal(D.sniff(plain, 'scan'), null);
  const nef = B.tiff({ ifd0: [...camera, [0x14a, 4, [{ ifd: 1 }]]], subs: [[[0x106, 3, 32803]]] });
  assert.equal(D.sniff(nef, 'DSC_0001').ext, 'nef');
  assert.equal(D.sniff(nef, 'DSC_0001.NEF').label, 'Nikon NEF');
  assert.equal(D.sniff(nef, 'x.tif'), null, 'a .tif name keeps a non-DNG TIFF out');
  const arw = B.tiff({ ifd0: [[0x10f, 2, 'SONY']] });
  assert.equal(D.sniff(arw, 'a.arw').ext, 'arw', 'a RAW extension on a TIFF is enough');
});

test('the RAW magics: CR2, ORF, RW2, RAF, CR3, CRW and MRW', () => {
  assert.equal(D.sniff(B.tiff({ kind: 'cr2', ifd0: [[0x10f, 2, 'Canon']] }), 'x').ext, 'cr2');
  assert.equal(D.sniff(B.tiff({ kind: 'orf' }), 'x').ext, 'orf');
  assert.equal(D.sniff(B.tiff({ kind: 'rw2' }), 'x').ext, 'rw2');
  assert.equal(D.sniff(B.tiff({ kind: 'rw2' }), 'x.RWL').ext, 'rwl');
  assert.equal(D.sniff(B.raf(small), 'x').ext, 'raf');
  assert.equal(D.sniff(B.cr3([small]), 'x').ext, 'cr3');
  const crw = new Uint8Array(32); crw.set([0x49, 0x49, 0x1a, 0, 0, 0, ...'HEAPCCDR'].map((c) => (typeof c === 'string' ? c.charCodeAt(0) : c)));
  assert.equal(D.sniff(crw, 'x').ext, 'crw');
  const mrw = new Uint8Array(32); mrw.set([0, 0x4d, 0x52, 0x4d]);
  assert.equal(D.sniff(mrw, 'x').ext, 'mrw');
  assert.equal(D.sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'x.jpg'), null);
  assert.equal(D.sniff(new Uint8Array(4), 'x.cr2'), null, 'too short to judge');
});

test('extensions and the accept list', () => {
  for (const n of ['a.CR2', 'b.cr3', 'c.nef', 'd.ARW', 'e.dng', 'f.raf', 'g.orf', 'h.rw2', 'i.pef', 'j.srw', 'k.rwl', 'l.3fr', 'm.nrw', 'n.sr2', 'o.crw']) assert.ok(D.isRawName(n), n);
  for (const n of ['a.jpg', 'b.tif', 'c', 'd.raw.txt']) assert.ok(!D.isRawName(n), n);
  assert.match(D.ACCEPT, /\.cr2,.*\.nef/);
  assert.ok(D.EXTS.length >= 20);
});

test('the TIFF reader follows SubIFDs and EXIF, and survives a loop and a cut file', () => {
  const t = B.tiff({ ifd0: [...camera, [0x14a, 4, [{ ifd: 1 }, { ifd: 2 }]], [0x8769, 4, { ifd: 3 }]], subs: [[[0x100, 3, 1]], [[0x100, 3, 2]]],
    exif: [[0x8827, 3, 400], [0x829a, 5, 0.004], [0x829d, 5, 2.8], [0x920a, 5, 50], [0x9003, 2, '2023:01:02 03:04:05']] });
  const list = T.ifds(t);
  assert.deepEqual(list.map((d) => d.kind), ['ifd0', 'sub', 'sub', 'exif']);
  const m = T.meta(t);
  assert.equal(m.make, 'NIKON CORPORATION');
  assert.equal(m.iso, 400);
  assert.equal(m.aperture, 2.8);
  assert.equal(m.focal, 50);
  assert.equal(m.shutter, 0.004);
  assert.equal(m.date, '2023-01-02T03:04:05', 'DateTimeOriginal wins over DateTime');
  assert.equal(m.orientation, 6);
  const loop = B.tiff({ ifd0: [[0x14a, 4, [{ ifd: 0 }]]] });
  assert.equal(T.ifds(loop).length, 1);
  assert.doesNotThrow(() => T.ifds(t.subarray(0, 30)));
  assert.equal(T.header(new Uint8Array([0x49, 0x49, 0x2b, 0, 8, 0, 0, 0])), null);
});

test('preview: the JPEGInterchangeFormat in a SubIFD, the largest one, with the camera orientation', () => {
  const nef = B.tiff({ ifd0: [...camera, [0x201, 4, { blob: 't' }], [0x202, 4, { len: 't' }], [0x14a, 4, [{ ifd: 1 }, { ifd: 2 }]]],
    subs: [[[0x201, 4, { blob: 'big' }], [0x202, 4, { len: 'big' }]], [[0x103, 3, 7], [0x106, 3, 32803], [0x111, 4, { blob: 'raw' }], [0x117, 4, { len: 'raw' }]]],
    blobs: { t: small, big: full, raw: lossless } });
  const p = P.extract(nef);
  assert.equal(p.width, 6000);
  assert.equal(p.height, 4000);
  assert.equal(p.orientation, 6);
  assert.deepEqual([...p.jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.equal(p.jpeg.length, full.length);
  const c = P.candidates(nef);
  assert.equal(c.length, 2, 'the lossless sensor data (SOF3) is not a preview');
});

test('preview: DNG and CR2 JPEG strips, RW2 JpgFromRaw', () => {
  const dng = B.tiff({ ifd0: [[0xc612, 1, [1, 4, 0, 0]], [0x103, 3, 7], [0x106, 3, 6], [0x111, 4, { blob: 'p' }], [0x117, 4, { len: 'p' }]], blobs: { p: big } });
  assert.equal(P.extract(dng).width, 1620);
  assert.equal(P.candidates(dng)[0].from, 'strip');
  const cr2 = B.tiff({ kind: 'cr2', ifd0: [[0x103, 3, 6], [0x111, 4, { blob: 'p' }], [0x117, 4, { len: 'p' }], [0x112, 3, 8]], blobs: { p: full } });
  assert.equal(P.extract(cr2).width, 6000);
  assert.equal(P.extract(cr2).orientation, 8);
  const rw2 = B.tiff({ kind: 'rw2', ifd0: [[0x2e, 7, { bytes: big }]] });
  assert.equal(P.extract(rw2).height, 1080);
});

test('preview: RAF header, CR3 boxes (largest of PRVW and the full JPEG) and a scan when the structure says nothing', () => {
  const raf = B.raf(B.jpeg(1920, 1280, { exif: B.tiff({ le: false, ifd0: [[0x10f, 2, 'FUJIFILM'], [0x112, 3, 3]] }) }));
  const p = P.extract(raf);
  assert.equal(p.width, 1920);
  assert.equal(P.candidates(raf)[0].from, 'RAF header');
  assert.equal(p.orientation, 3, 'the JPEG\'s own EXIF gives the orientation');
  assert.equal(P.meta(raf).make, 'FUJIFILM');
  const cr3 = B.cr3([small, big, full], B.tiff({ ifd0: [[0x10f, 2, 'Canon'], [0x110, 2, 'Canon EOS R5'], [0x112, 3, 6]] }));
  assert.equal(P.extract(cr3).width, 6000);
  assert.equal(P.meta(cr3).model, 'Canon EOS R5');
  assert.equal(P.meta(cr3).orientation, 6);
  const orf = B.tiff({ kind: 'orf', ifd0: [[0x10f, 2, 'OLYMPUS']], blobs: { maker: big } });
  assert.equal(P.extract(orf).width, 1620, 'an ORF preview kept in maker data is found by the scan');
});

test('preview: none in a file with only sensor data; broken JPEGs are skipped', () => {
  const t = B.tiff({ ifd0: [[0xc612, 1, [1, 4, 0, 0]], [0x103, 3, 7], [0x111, 4, { blob: 'raw' }], [0x117, 4, { len: 'raw' }]], blobs: { raw: lossless } });
  assert.equal(P.extract(t), null);
  const cut = big.subarray(0, big.length - 6);
  assert.equal(P.jpegAt(cut, 0), null, 'a JPEG with no end is not counted');
  assert.equal(P.extract(new Uint8Array(100)), null);
  const progressive = B.jpeg(800, 600, { sof: 0xc2 });
  assert.equal(P.jpegAt(progressive, 0).sof, 0xc2);
});

test('a real CC0 DNG from raw.pixls.us: detected, read, no preview', () => {
  const b = new Uint8Array(readFileSync(path.join(ROOT, 'tests/raw/fixtures/canon-5d3-crop.dng')));
  assert.deepEqual(D.sniff(b.subarray(0, 65536), 'IMG.dng'), { ext: 'dng', label: 'Adobe DNG', maker: 'Canon' });
  assert.equal(D.sniff(b, 'noname').ext, 'dng');
  const m = P.meta(b);
  assert.equal(m.model, 'Canon EOS 5D Mark III');
  assert.equal(m.iso, 200);
  assert.equal(m.focal, 50);
  assert.equal(P.extract(b), null);
});
