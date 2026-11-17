// Covers: shared/fmp/scsu.js
// Covers: shared/fmp/charset.js
// The text of a FileMaker file: SCSU (Pro 7+) with every byte XOR 0x5A, MacRoman (Pro 3 to 6), leading spaces removed.
// The vectors follow UTR #6 (the byte codes SQn, SCn, SDn, SDX, SQU, SCU and the Unicode-mode codes UCn, UDn, UDX, UQU).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadFmp, ascii } from './fmp-fixture.mjs';

const F = loadFmp(['scsu.js', 'charset.js']);
const dec = (bytes, mask = 0) => F.scsu.decode(Uint8Array.from(bytes), mask);
const hex = (s) => s.trim().split(/\s+/).map((h) => parseInt(h, 16));

describe('SCSU: single-byte mode', () => {
  test('ASCII and Latin-1 pass through (window 0 starts at U+0080)', () => {
    assert.equal(dec(ascii('Hello, world')), 'Hello, world');
    assert.equal(dec(hex('DC 6E 69 63 6F 64 65')), 'Ünicode');
  });
  test('SC2 selects the Cyrillic window: "Привет"', () => {
    assert.equal(dec(hex('12 9F C0 B8 B2 B5 C2')), 'Привет');
  });
  test('SDn redefines a window from the offset table (SD4 with 0x10 is U+0800), and SC returns to it', () => {
    assert.equal(dec(hex('1C 10 80 81')), 'ࠀࠁ');
    assert.equal(dec(hex('1C 10 80 10 81 14 81')), '\u0800\u0081\u0801'); // SC0 goes back to window 0, SC4 to the new one
  });
  test('an SD byte of 0x00 selects offset 0xAC00 (the C code has no case for it)', () => {
    assert.equal(dec(hex('18 00 80')), '가');
  });
  test('SDX defines a window beyond the BMP: window 1 at U+10000', () => {
    assert.equal(dec(hex('0B 20 00 80')), '\u{10000}');
  });
  test('SQn quotes one character: below 0x80 from the static window, above from the dynamic one', () => {
    assert.equal(dec(hex('02 41')), 'Á'); // static window 1 is U+0080
    assert.equal(dec(hex('02 C1 41')), 'āA'); // dynamic window 1 starts at U+00C0
    assert.equal(dec(hex('01 41')), 'A');
  });
  test('SQU quotes one UTF-16 unit', () => {
    assert.equal(dec(hex('0E 65 E5 41')), '日A');
  });
});

describe('SCSU: Unicode mode', () => {
  test('SCU switches to UTF-16BE and UC0 comes back: "日本語" and "日A"', () => {
    assert.equal(dec(hex('0F 65 E5 67 2C 8A 9E')), '日本語');
    assert.equal(dec(hex('0F 65 E5 E0 41')), '日A');
  });
  test('surrogate pairs and UQU reach past the BMP', () => {
    assert.equal(dec(hex('0F D8 00 DC 00')), '\u{10000}');
    assert.equal(dec(hex('0F D8 3D DE 00')), '\u{1F600}');
    assert.equal(dec(hex('0F F0 12 34')), 'ሴ');
  });
  test('UDn and UDX define a window and leave Unicode mode (UDX also selects it)', () => {
    assert.equal(dec(hex('0F E8 10 81')), 'ࠁ');
    assert.equal(dec(hex('0F F1 20 00 80')), '\u{10000}');
  });
});

describe('SCSU: control codes, spaces, the mask, short input', () => {
  test('tab is a space; CR and LF are line feeds (a CR LF pair gives two, as in the C code)', () => {
    assert.equal(dec(hex('41 09 42')), 'A B');
    assert.equal(dec(hex('41 0D 42')), 'A\nB');
    assert.equal(dec(hex('41 0A 42')), 'A\nB');
    assert.equal(dec(hex('41 0D 0A 42')), 'A\n\nB');
  });
  test('other control codes become U+FFFD; a NUL after a quote is dropped', () => {
    assert.equal(dec(hex('41 0C 42')), 'A�B');
    assert.equal(dec(hex('0E 00 00 41')), 'A');
  });
  test('leading spaces are removed, spaces inside stay', () => {
    assert.equal(dec(ascii('   a b ')), 'a b ');
    assert.equal(dec(ascii('   ')), '');
  });
  test('the mask is applied to every byte: FileMaker stores text XOR 0x5A', () => {
    assert.equal(dec(ascii('  Hi there').map((b) => b ^ 0x5A), 0x5A), 'Hi there');
    assert.equal(dec(hex('12 9F C0').map((b) => b ^ 0x5A), 0x5A), 'Пр');
  });
  test('a sequence cut short stops the text there and keeps what was read', () => {
    assert.equal(dec(hex('41 0F 65')), 'A');
    assert.equal(dec(hex('41 0E 65')), 'A');
    assert.equal(dec(hex('41 0B 20')), 'A');
    assert.equal(dec([]), '');
  });
  test('a start and an end pick part of a longer array', () => {
    assert.equal(F.scsu.decode(Uint8Array.from(ascii('xxHixx')), 0, 2, 4), 'Hi');
  });
});

describe('charset: MacRoman (Pro 3 to 6) and the text() entry', () => {
  const mac = (bytes) => F.charset.text(Uint8Array.from(bytes), 0, bytes.length, false);
  test('MacRoman letters, symbols and the euro sign', () => {
    assert.equal(mac([0x46, 0x9A, 0x72, 0x6E, 0x61, 0x6D, 0x6E]), 'Förnamn');
    assert.equal(mac([0xA5, 0xDB, 0xD2, 0xD3]), '•€“”');
  });
  test('the table is the one the browsers use ("macintosh")', () => {
    let td;
    try { td = new TextDecoder('macintosh'); } catch (e) { return; } // an ICU without it: nothing to compare with
    const all = Uint8Array.from({ length: 128 }, (_, i) => 128 + i);
    assert.equal(mac(Array.from(all)), td.decode(all));
  });
  test('leading spaces are dropped and a NUL ends the value (a C string)', () => {
    assert.equal(mac([0x20, 0x20, 0x41, 0x20, 0x42]), 'A B');
    assert.equal(mac([0x41, 0x00, 0x42]), 'A');
  });
  test('text() reads a range of a file and picks SCSU + XOR for Pro 7 and later', () => {
    const file = Uint8Array.from([9, 9, ...ascii('Hi').map((b) => b ^ 0x5A), 9]);
    assert.equal(F.charset.text(file, 2, 2, true), 'Hi');
    assert.equal(F.charset.text(Uint8Array.from([0x20, 0x48, 0x69]), 0, 3, false), 'Hi');
  });
});
