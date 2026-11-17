// Slop Code's file recognition: the bytes at the start of a file (and its name, where the bytes cannot say) name its format.
// Every case is a hand-built byte array. Run with: node --test tests/node/code-magic.test.mjs
// Covers: code/js/magic.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { identify, formats, signatureCount } from '../../code/js/magic.js';

/** Bytes from a spec: hex bytes, "text", and @offset to jump (the rest is zero). At least 64 bytes long. */
function bytes(spec, min = 64) {
  const parts = [];
  let at = 0, end = 0;
  for (const m of spec.matchAll(/@(0x[0-9a-f]+|\d+)|"([^"]*)"|([0-9a-f]{2})/gi)) {
    if (m[1]) at = Number(m[1]);
    else { const data = m[2] != null ? [...m[2]].map((c) => c.charCodeAt(0)) : [parseInt(m[3], 16)]; parts.push([at, data]); at += data.length; }
    end = Math.max(end, at);
  }
  const out = new Uint8Array(Math.max(min, end));
  for (const [o, d] of parts) out.set(d, o);
  return out;
}
/** Text exactly as a small file holds it (no zero padding, which bytes() adds). */
const text = (s) => new TextEncoder().encode(s);
const hexLen = (s) => s.length.toString(16).padStart(2, '0');
/** A ZIP's first local header: the name at byte 30, then tail (the entry's data, other names). */
const ZIP = (name, tail = '') => `"PK" 03 04 14 00 @26 ${hexLen(name)} 00 00 00 @30 "${name}" ${tail}`;
const PE = (flags) => `"MZ" 90 00 @0x3c 80 00 00 00 @0x80 "PE" 00 00 @0x96 ${flags}`;
const FTYP = (brand, ...compat) => `@4 "ftyp" "${brand}" 00 00 00 00 ${compat.map((c) => `"${c}"`).join(' ')}`;
const OGG = (packet) => `"OggS" 00 02 @26 01 1e ${packet}`;
const MIME = (s) => ZIP('mimetype', `"application/${s}"`);
const ASF = '30 26 b2 75 8e 66 cf 11 a6 d9 00 aa 00 62 ce 6c';
const OLE = 'd0 cf 11 e0 a1 b1 1a e1';
const PK = '"PK" 03 04 14 00';

// [id, category, ...variants]: a variant is a spec, a [spec, file name] or a Uint8Array; each must be recognised as id.
const CASES = [
  ['png', 'image', ['89 "PNG" 0d 0a 1a 0a 00 00 00 0d "IHDR"', 'a.png']], ['jpeg', 'image', 'ff d8 ff e0 00 10 "JFIF"'],
  ['gif', 'image', '"GIF89a" 01 00 01 00', '"GIF87a" 01 00 01 00'], ['webp', 'image', '"RIFF" 24 00 00 00 "WEBP" "VP8 "'],
  ['bmp', 'image', '"BM" 36 00 00 00 00 00 00 00 36 00 00 00 28 00 00 00'], ['ico', 'image', '00 00 01 00 01 00 10 10 00 00 01 00 20 00'],
  ['cur', 'image', '00 00 02 00 01 00 10 10 00 00 01 00 20 00'], ['tiff', 'image', '49 49 2a 00 08 00 00 00', '4d 4d 00 2a 00 00 00 08'],
  ['heic', 'image', FTYP('heic', 'mif1', 'heic'), FTYP('mif1', 'mif1', 'heic')], ['heif', 'image', FTYP('mif1', 'mif1')],
  ['avif', 'image', FTYP('avif', 'mif1', 'avif'), [FTYP('mif1', 'mif1', 'miaf'), 'photo.avif']], ['cr3', 'image', FTYP('crx ', 'crx ')],
  ['psd', 'image', '"8BPS" 00 01 00 00 00 00 00 00'], ['jp2', 'image', '00 00 00 0c 6a 50 20 20 0d 0a 87 0a 00 00 00 14', 'ff 4f ff 51 00 2f'],
  ['jxl', 'image', '00 00 00 0c "JXL " 0d 0a 87 0a'], ['exr', 'image', '76 2f 31 01 02 00 00 00'],
  ['hdr', 'image', '"#?RADIANCE" 0a "FORMAT=32-bit_rle_rgbe"'], ['dds', 'image', '"DDS " 7c 00 00 00 07 10 08 00'],
  ['ktx', 'image', 'ab "KTX 11" bb 0d 0a 1a 0a 01 02', 'ab "KTX 20" bb 0d 0a 1a 0a 01 02'],
  ['mp3', 'audio', '"ID3" 03 00 00 00 00 0f 76', ['ff fb 90 00 00 00 00 00', 'x.bin'], 'ff e3 18 c4 00 00 00 00'], ['aac', 'audio', 'ff f1 50 80 02 1f fc'],
  ['flac', 'audio', '"fLaC" 00 00 00 22'], ['ogg', 'audio', OGG('"junk"')], ['vorbis', 'audio', OGG('01 "vorbis" 00')],
  ['opus', 'audio', OGG('"OpusHead" 01 02')], ['wav', 'audio', '"RIFF" 24 00 00 00 "WAVE" "fmt " 10 00 00 00', ['"RIFF" 00 00 00 00 "ABCD"', 'x.wav']],
  ['riff', 'other', '"RIFF" 00 00 00 00 "ABCD"'], ['aiff', 'audio', '"FORM" 00 00 00 20 "AIFF" "COMM"', '"FORM" 00 00 00 20 "AIFC" "FVER"'],
  ['midi', 'audio', '"MThd" 00 00 00 06 00 01 00 02'], ['m4a', 'audio', FTYP('M4A ', 'M4A ', 'mp42'), [FTYP('isom', 'isom', 'mp42'), 'song.m4a']],
  ['amr', 'audio', '"#!AMR" 0a 3c', '"#!AMR-WB" 0a 3c'], ['au', 'audio', '".snd" 00 00 00 18 00 00 00 00'], ['ape', 'audio', '"MAC " 96 0f 00 00 2c 00 00 00'],
  ['mp4', 'video', FTYP('isom', 'isom', 'iso2', 'mp41'), [FTYP('mp42', 'mp42', 'isom'), 'clip.mp4']],
  ['mov', 'video', FTYP('qt  ', 'qt  '), [FTYP('isom', 'isom'), 'a.mov'], '00 00 00 08 "wide" 00 00 10 00 "mdat"'],
  ['m4v', 'video', FTYP('M4V ', 'M4V ', 'mp42')], ['3gp', 'video', FTYP('3gp5', '3gp5', 'isom')], ['3g2', 'video', FTYP('3g2a', '3g2a')],
  ['mkv', 'video', '1a 45 df a3 93 42 82 88 "matroska"'], ['webm', 'video', '1a 45 df a3 93 42 82 84 "webm"', ['1a 45 df a3 93 42 82 88 "matroska"', 'a.webm']],
  ['mka', 'audio', ['1a 45 df a3 93 42 82 88 "matroska"', 'a.mka']], ['ogv', 'video', OGG('80 "theora" 03'), [OGG('"junk"'), 'a.ogv']],
  ['avi', 'video', '"RIFF" 00 00 00 00 "AVI " "LIST"'], ['flv', 'video', '"FLV" 01 05 00 00 00 09'],
  ['mpg', 'video', '00 00 01 ba 44 00 04 00', '00 00 01 b3 16 00 f0 c4'],
  ['ts', 'video', '47 40 00 10 @188 47 40 11 10 @376 47 40 00 11', '@4 47 40 00 10 @196 47 40 11 10 @388 47'],
  ['asf', 'video', ASF], ['wmv', 'video', [ASF, 'a.wmv']], ['wma', 'audio', [ASF, 'a.wma']],
  ['swf', 'video', '"CWS" 0a 10 00 00 00', '"FWS" 09 10 00 00 00', '"ZWS" 0d 10 00 00 00'],
  ['zip', 'archive', `${PK} 00 00 08 00`, '"PK" 05 06 00 00 00 00', '"PK" 07 08 00 00 00 00'], ['gz', 'archive', '1f 8b 08 00 00 00 00 00'],
  ['bz2', 'archive', '"BZh" 39 31 41 59 26 53 59'], ['xz', 'archive', 'fd 37 7a 58 5a 00 00 04'], ['zst', 'archive', '28 b5 2f fd 04 58'],
  ['7z', 'archive', '37 7a bc af 27 1c 00 04'], ['rar', 'archive', '"Rar!" 1a 07 00 cf 90 73', '"Rar!" 1a 07 01 00 33 92'],
  ['tar', 'archive', '@257 "ustar" 00 "00"', ['@257 "ustar  " 00', 'a.tar']], ['cab', 'archive', '"MSCF" 00 00 00 00 5c 01'],
  ['arj', 'archive', '60 ea 2a 00 1e 0b'], ['lz4', 'archive', '04 22 4d 18 64 40 a7'], ['lz', 'archive', '"LZIP" 01 0c 00'],
  ['z', 'archive', '1f 9d 90 00'], ['cpio', 'archive', '"070707" "000000"', '"070701" "00000001"'], ['ar', 'archive', '"!<arch>" 0a "foo.o/"'],
  ['deb', 'archive', '"!<arch>" 0a "debian-binary   " "2.0"'], ['rpm', 'archive', 'ed ab ee db 03 00 00 00'],
  ['iso', 'archive', '@0x8001 "CD001" 01', ['41 42 43 44', 'x.iso']], ['dmg', 'archive', ['41 42 43 44', 'x.dmg']],
  ['sqfs', 'archive', '"hsqs" 02 00 00 00'], ['zlib', 'archive', '78 9c 4b 4c 4a 06 00'],
  ['pdf', 'document', '"%PDF-1.7" 0a "%" e2 e3'], ['ps', 'document', '"%!PS-Adobe-3.0" 0a'],
  ['eps', 'document', '"%!PS-Adobe-3.0 EPSF-3.0" 0a', 'c5 d0 d3 c6 1e 00 00 00'], ['rtf', 'document', '"{\\rtf1\\ansi\\deff0"'],
  ['djvu', 'document', '"AT&TFORM" 00 00 00 10 "DJVU" "INFO"'], ['ole', 'document', OLE], ['doc', 'document', [OLE, 'a.doc']],
  ['xls', 'document', [OLE, 'a.xls']], ['ppt', 'document', [OLE, 'A.PPT']], ['msg', 'document', [OLE, 'a.msg']], ['msi', 'executable', [OLE, 'setup.msi']],
  ['docx', 'document', [PK, 'report.docx'], ZIP('[Content_Types].xml', '@80 "word/document.xml"')],
  ['xlsx', 'document', [PK, 'book.xlsx'], ZIP('[Content_Types].xml', '@80 "xl/workbook.xml"')],
  ['pptx', 'document', [PK, 'deck.pptx'], ZIP('[Content_Types].xml', '@80 "ppt/slides/slide1.xml"')],
  ['odt', 'document', [PK, 'a.odt'], MIME('vnd.oasis.opendocument.text')], ['ods', 'document', [PK, 'a.ods'], MIME('vnd.oasis.opendocument.spreadsheet')],
  ['odp', 'document', [PK, 'a.odp'], MIME('vnd.oasis.opendocument.presentation')], ['epub', 'document', [PK, 'a.epub'], MIME('epub+zip')],
  ['jar', 'executable', [PK, 'lib.jar'], ZIP('META-INF/MANIFEST.MF')], ['apk', 'executable', [PK, 'app.apk'], ZIP('AndroidManifest.xml')],
  ['ipa', 'executable', [PK, 'app.ipa']], ['3mf', '3d', [PK, 'model.3mf']], ['usdz', '3d', [PK, 'scene.usdz']],
  ['elf', 'executable', '7f "ELF" 02 01 01 00'], ['appimage', 'executable', '7f "ELF" 02 01 01 00 "AI" 02'],
  ['macho', 'executable', 'fe ed fa ce 00 00 00 07', 'fe ed fa cf 01 00 00 0c', 'ce fa ed fe 07 00 00 00', 'cf fa ed fe 07 00 00 01'],
  ['macho-fat', 'executable', 'ca fe ba be 00 00 00 02 01 00 00 07'], ['class', 'executable', 'ca fe ba be 00 00 00 34 00 10', 'ca fe ba be 00 00 00 41 00 10'],
  ['pe', 'executable', PE('22 01')], ['dll', 'executable', PE('02 21')], ['dos', 'executable', '"MZ" 90 00 03 00 @0x3c 00 00 00 00'],
  ['wasm', 'executable', '00 "asm" 01 00 00 00 01 07'], ['dex', 'executable', '"dex" 0a "035" 00'], ['lua', 'executable', '1b "Lua" 54 00 19 93'],
  ['pyc', 'executable', 'a7 0d 0d 0a 00 00 00 00 12 34 56 78', ['03 f3 0d 0a 12 34 56 78', 'old.pyc']],
  ['shell', 'executable', '"#!/bin/sh" 0a "echo hi"', '"#!/usr/bin/env bash" 0a'], ['script', 'executable', '"#!/usr/bin/env python3" 0a'],
  ['lnk', 'other', '4c 00 00 00 01 14 02 00 00 00 00 00 c0 00 00 00 00 00 00 46 81'],
  ['sqlite', 'database', '"SQLite format 3" 00 10 00'], ['parquet', 'database', '"PAR1" 15 04'], ['hdf5', 'database', '89 "HDF" 0d 0a 1a 0a 00'],
  ['npy', 'data', '93 "NUMPY" 01 00 76 00'], ['pickle', 'data', '80 04 95 11 00 00 00 00', '80 02 7d 71 00 28'],
  ['gitpack', 'database', '"PACK" 00 00 00 02 00 00 00 05'], ['pcap', 'data', 'd4 c3 b2 a1 02 00 04 00', 'a1 b2 c3 d4 00 02 00 04', '4d 3c b2 a1 02 00', 'a1 b2 3c 4d 00 02'],
  ['pcapng', 'data', '0a 0d 0d 0a 1c 00 00 00'], ['arrow', 'database', '"ARROW1" 00 00'], ['avro', 'database', '"Obj" 01 04 14'],
  ['mdb', 'database', '00 01 00 00 "Standard Jet DB" 00'], ['accdb', 'database', '00 01 00 00 "Standard ACE DB" 00'],
  ['pgp', 'data', '"-----BEGIN PGP MESSAGE-----" 0a', ['99 01 a2 04 5a', 'key.gpg']],
  ['torrent', 'data', '"d8:announce" "35:udp://tracker.example:6969" "4:info"'],
  ['ttf', 'font', '00 01 00 00 00 0e 00 80 00 03 00 60'], ['otf', 'font', '"OTTO" 00 0a 00 80 00 03'], ['woff', 'font', '"wOFF" 00 01 00 00'],
  ['woff2', 'font', '"wOF2" 00 01 00 00'], ['ttc', 'font', '"ttcf" 00 01 00 00 00 00 00 02'],
  ['glb', '3d', '"glTF" 02 00 00 00 10 00'], ['fbx', '3d', '"Kaydara FBX Binary  " 00 1a 00 e8 1c 00 00'], ['blend', '3d', '"BLENDER-v300" 00'],
  ['stl', '3d', '"solid cube" 0a "  facet normal 0 0 1"', '"solid" 0a "endsolid"', ['00 00 00 00 00 10 20 30 40 @90 01', 'binary.stl']],
  ['ply', '3d', '"ply" 0a "format ascii 1.0" 0a'], ['usdc', '3d', '"PXR-USDC" 00 08'], ['dae', '3d', text('<?xml version="1.0"?><COLLADA xmlns="x">')],
  ['obj', '3d', [text('# a cube\nv 0 0 0\nf 1 2 3\n'), 'cube.obj']], ['3ds', '3d', ['4d 4d 10 00 00 00 02 00', 'old.3ds']],
  ['gltf', '3d', [text('{\n"asset": {"version": "2.0"}}'), 'scene.gltf']],
  ['xml', 'text', text('<?xml version="1.0"?>\n<root/>')],
  ['svg', 'text', text('<?xml version="1.0"?>\n<svg xmlns="x"/>'), text('<svg xmlns="x" viewBox="0 0 1 1"/>'), text('\n  <SVG xmlns="x"/>'), [text('<?xml version="1.0"?><root/>'), 'logo.svg']],
  ['html', 'text', text('<!DOCTYPE html>\n<title>x</title>'), text('\r\n   <html lang="en">')], ['pem', 'text', '"-----BEGIN CERTIFICATE-----" 0a'],
  ['json', 'text', [text('{"a": [1, 2]}'), 'data.json'], [text(' [1, 2, 3]'), 'list.json']],
  ['vcf', 'text', '"BEGIN:VCARD" 0a "VERSION:3.0"'], ['ics', 'text', '"BEGIN:VCALENDAR" 0a "VERSION:2.0"'],
];
const variants = ([id, , ...vs]) => vs.map((v) => (Array.isArray(v) ? v : [v, '']).map((x, i) => (i === 0 && typeof x === 'string' ? bytes(x) : x)));
const say = (spec, name) => `${typeof spec === 'string' ? spec : '(bytes)'} ${name}`;
const is = (spec, name, id) => assert.equal((identify(typeof spec === 'string' ? bytes(spec) : spec, name) || {}).id, id, say(spec, name));
const none = (spec, name = '') => assert.equal(identify(typeof spec === 'string' ? bytes(spec) : spec, name), null, say(spec, name));

test('the table holds at least 80 signatures, each format with a label, a mime type and a known category', () => {
  assert.ok(signatureCount() >= 80, `only ${signatureCount()} signatures`);
  const cats = ['image', 'audio', 'video', 'archive', 'document', 'executable', 'database', 'font', '3d', 'data', 'text', 'other'];
  for (const f of formats()) assert.ok(f.label && /^[\w.+-]+\/[\w.+-]+$/.test(f.mime) && cats.includes(f.category), JSON.stringify(f));
  const src = readFileSync(new URL('../../code/js/magic.js', import.meta.url), 'utf8');
  const ids = [...src.matchAll(/^ {2}\['([\w-]+)', ['"]/gm)].map((m) => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'an id is written twice');
  assert.deepEqual(ids.sort(), formats().map((f) => f.id).sort());
});

test('the result has exactly id, label, mime and category, and is a copy', () => {
  assert.deepEqual(identify(bytes('89 "PNG" 0d 0a 1a 0a'), 'x.png'), { id: 'png', label: 'PNG image', mime: 'image/png', category: 'image' });
  assert.deepEqual(identify(bytes('"SQLite format 3" 00'), ''), { id: 'sqlite', label: 'SQLite 3 database', mime: 'application/vnd.sqlite3', category: 'database' });
  assert.equal(identify(bytes('7f "ELF" 02 01'), '').label, 'ELF executable');
  identify(bytes('89 "PNG" 0d 0a 1a 0a'), '').label = 'changed';
  assert.equal(identify(bytes('89 "PNG" 0d 0a 1a 0a'), '').label, 'PNG image');
});

test('every case is recognised with its id and category, and every format has a case', () => {
  for (const c of CASES) for (const [b, name] of variants(c)) {
    const r = identify(b, name);
    assert.ok(r, `${c[0]} (${name}) was not recognised`);
    assert.deepEqual([r.id, r.category], [c[0], c[1]], `${c[0]} ${name}`);
  }
  assert.deepEqual(formats().map((f) => f.id).filter((id) => !CASES.some((c) => c[0] === id)), []);
});

test('a cut-off buffer never throws (every prefix of every case), and an ArrayBuffer is read like its bytes', () => {
  for (const c of CASES) for (const [b, name] of variants(c)) {
    for (let n = 0; n <= Math.min(b.length, 300); n++) identify(b.subarray(0, n), name);
    identify(b, name);
  }
  for (const empty of [new Uint8Array(0), null, undefined]) none(empty, 'a.png');
  none(Uint8Array.of(0x89));
  is(bytes('"%PDF-1.4"').buffer, '', 'pdf');
});

test('the name only decides between formats the bytes cannot tell apart', () => {
  is('"PK" 03 04', 'x.docx', 'docx'); is('"PK" 03 04', 'x.zip', 'zip'); is('"PK" 03 04', 'x.unknown', 'zip'); is('"PK" 03 04', 'x', 'zip');
  is(MIME('epub+zip'), 'x.zip', 'zip');      // a .zip name is taken at its word
  is(MIME('epub+zip'), 'x.bin', 'epub');     // a name that says nothing leaves it to the bytes
  is('89 "PNG" 0d 0a 1a 0a', 'x.zip', 'png');   // the bytes beat the name
  is('"RIFF" 00 00 00 00 "ABCD"', 'x.wav', 'wav'); is('"RIFF" 00 00 00 00 "ABCD"', 'x.dat', 'riff'); is('"RIFF" 00 00 00 00 "WEBP"', 'x.wav', 'webp');
  is(OGG('"junk"'), 'a.ogg', 'ogg'); is(OGG('"OpusHead"'), 'a.ogv', 'opus');
});

test('Java classes and fat Mach-O files share four bytes: the next four tell them apart', () => {
  is('ca fe ba be 00 00 00 02', '', 'macho-fat'); is('ca fe ba be 00 00 00 2d', '', 'class');
  is('ca fe ba be 00 03 00 34', '', 'class'); is('ca fe ba bf 00 00 00 01', '', 'macho-fat');
});

test('ftyp brands: a distinctive brand wins, a generic one yields to the name, then to the compatible list', () => {
  is(FTYP('heic', 'mif1'), 'x.mp4', 'heic'); is(FTYP('isom', 'isom'), 'x.mp4', 'mp4'); is(FTYP('isom', 'isom'), 'x.m4v', 'm4v');
  is(FTYP('isom', 'isom'), '', 'mp4'); is(FTYP('mif1', 'mif1', 'avif'), '', 'avif'); is(FTYP('xxxx', 'yyyy'), '', 'mp4');
});

test('Windows executables: PE, DLL and plain DOS', () => {
  is(PE('22 01'), 'x.dll', 'pe');   // the flags decide, not the name
  is('"MZ" @0x3c 00 10 00 00', '', 'pe');   // the PE header lies past the bytes we have
  is('"MZ" @0x3c 80 00 00 00 @0x80 "XX" 00 00 @0x96 22 01', '', 'dos');
});

test('text with a byte order mark is left to the caller', () => {
  none('ef bb bf "<?xml version=1.0?>"', 'a.xml'); none('ef bb bf "{}"', 'a.json'); none('ff fe 3c 00 3f 00', 'a.xml'); none('fe ff 00 3c 00 3f', 'a.xml');
});

test('nothing matches: null', () => {
  none(text('hello world, this is plain text'), 'notes.txt'); none(''); none(text('hello'), 'photo.png'); none(text('hello'), 'data.json');
  none(text('plain words'), 'a.obj'); none('"FWSomething"'); none('ff 00 00'); none('"BM" 00 00 00 00'); none('"ab" 0d 0a "text"');
  none('"ID3 tags are fun"'); none('00 01 00 00 00 00 00 00'); none('"x^2 + y^2"'); none('"hello"', 'a.iso.txt');
});

test('JSON is told by its first byte, and only when the name ends in .json', () => {
  for (const s of ['{}', '[1]', '"s"', '-1', '12', 'true', 'false', 'null', '  \n {"a":1}']) is(text(s), 'a.json', 'json');
  none(text('{}'), 'a.txt'); none(text('{}'));
});

test('scripts: a shell, or another interpreter', () => {
  is('"#!/bin/zsh" 0a', '', 'shell'); is('"#! /usr/bin/env -S node" 0a', '', 'script'); is('"#!/usr/bin/perl" 0a', '', 'script');
});

test('ISO 9660 is seen at byte 32769, or by name when fewer bytes are given', () => {
  is(bytes('@0x8001 "CD001"', 36864), '', 'iso'); none(bytes('@4 "abc"', 4096)); is(bytes('@4 "abc"', 4096), 'disc.iso', 'iso');
});
