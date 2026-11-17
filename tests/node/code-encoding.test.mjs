// Covers: code/js/encoding.js
// Covers: code/js/enc-tables.js
// Slop Code opens any text file: encoding detection, decoding, encoding, and line endings. Run with: node --test tests/node/code-encoding.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENCODINGS, EOLS, sniff, decode, encode, detectEol, applyEol, normalizeEol } from '../../code/js/encoding.js';

const hex = (s) => Uint8Array.from(Buffer.from(s.replace(/\s+/g, ''), 'hex'));
const bytesOf = (...parts) => Uint8Array.from(parts.flatMap((p) => Array.from(p)));
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const repeatTo = (unit, size) => Uint8Array.from({ length: Math.ceil(size / unit.length) * unit.length }, (_, i) => unit[i % unit.length]);
const hexOf = (bytes) => Buffer.from(bytes).toString('hex');
const SAMPLE = 64 * 1024;

// Short fixtures (hard-coded bytes): a word in each legacy encoding.
const WORDS = [
  ['windows-1252', 'café', '63 61 66 E9'], ['shift_jis', '日本語', '93 FA 96 7B 8C EA'], ['euc-jp', '日本語', 'C6 FC CB DC B8 EC'],
  ['gbk', '中文', 'D6 D0 CE C4'], ['big5', '中文', 'A4 A4 A4 E5'], ['euc-kr', '한국어', 'C7 D1 B1 B9 BE EE'],
  ['koi8-r', 'Привет', 'F0 D2 C9 D7 C5 D4'], ['windows-1251', 'Привет', 'CF F0 E8 E2 E5 F2'],
];
// Realistic sentences (hard-coded bytes), enough for the guess to go on. Written out in full the first time they appear.
const JA = '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。', RU = 'Привет, мир! Это тестовый текст на русском языке.';
const SENTENCES = [
  ['windows-1252', 'Le café est prêt, où êtes-vous ? Ça coûte 5 € – c\'est « très » cher.',
    '4c6520636166e920657374207072ea742c206ff920ea7465732d766f7573203f20c76120636ffb746520352080209620632765737420ab207472e87320bb20636865722e'],
  ['shift_jis', JA, '8ce1947982cd944c82c582a082e9814296bc914f82cd82dc82be96b382a2814282c782b182c590b682ea82bd82a982c682f182c68ca9939682aa82c282a982ca8142'],
  ['euc-jp', JA, 'b8e3c7daa4cfc7ada4c7a4a2a4eba1a3ccbec1b0a4cfa4dea4c0ccb5a4a4a1a3a4c9a4b3a4c7c0b8a4eca4bfa4aba4c8a4f3a4c8b8abc5f6a4aca4c4a4aba4cca1a3'],
  ['gbk', '你好，世界！今天天气很好，我们一起去公园玩吧。', 'c4e3bac3a3accac0bde7a3a1bdf1ccecccecc6f8badcbac3a3acced2c3c7d2bbc6f0c8a5b9abd4b0cde6b0c9a1a3'],
  ['big5', '你好，世界！今天天氣很好，我們一起去公園玩吧。', 'a741a66ea141a540acc9a149a4b5a4d1a4d1aef0abdca66ea141a7daadcca440b05fa568a4bdb6e9aab1a761a143'],
  ['euc-kr', '안녕하세요, 세계! 오늘은 날씨가 좋아서 우리는 함께 공원에 갔습니다.',
    'bec8b3e7c7cfbcbcbfe42c20bcbcb0e82120bfc0b4c3c0ba20b3afbebeb0a120c1c1bec6bcad20bfecb8aeb4c220c7d4b2b220b0f8bff8bfa120b0acbdc0b4cfb4d92e'],
  ['koi8-r', RU, 'f0d2c9d7c5d42c20cdc9d22120fcd4cf20d4c5d3d4cfd7d9ca20d4c5cbd3d420cec120d2d5d3d3cbcfcd20d1dad9cbc52e'],
  ['windows-1251', RU, 'cff0e8e2e5f22c20ece8f02120ddf2ee20f2e5f1f2eee2fbe920f2e5eaf1f220ede020f0f3f1f1eaeeec20ffe7fbeae52e'],
];

test('ENCODINGS and EOLS list what the contract names, with English labels', () => {
  assert.deepEqual(ENCODINGS.map((e) => e.id), ['utf-8', 'utf-16le', 'utf-16be', 'utf-32le', 'utf-32be', 'windows-1252', 'iso-8859-2', 'iso-8859-15',
    'windows-1250', 'windows-1251', 'koi8-r', 'ibm866', 'macintosh', 'shift_jis', 'euc-jp', 'iso-2022-jp', 'gbk', 'gb18030', 'big5', 'euc-kr']);
  for (const e of ENCODINGS) {
    assert.ok(e.label && typeof e.label === 'string', e.id);
    if (!e.id.startsWith('utf-32')) assert.equal(new TextDecoder(e.id).encoding, e.id); // a label TextDecoder knows by this very name
  }
  assert.equal(ENCODINGS[0].label, 'UTF-8');
  assert.equal(ENCODINGS.find((e) => e.id === 'windows-1252').label, 'Windows-1252 (Western)');
  assert.equal(ENCODINGS.find((e) => e.id === 'shift_jis').label, 'Shift_JIS (Japanese)');
  assert.deepEqual(EOLS, [{ id: 'lf', label: 'LF' }, { id: 'crlf', label: 'CRLF' }, { id: 'cr', label: 'CR' }]);
});

test('sniff: empty input is certain ASCII UTF-8', () => {
  assert.deepEqual(sniff(new Uint8Array(0)), { text: true, encoding: 'utf-8', bom: false, ascii: true, confidence: 'certain', reason: 'empty' });
});

test('sniff: every BOM is certain, and FF FE 00 00 is UTF-32', () => {
  const cases = [['EF BB BF 68 69', 'utf-8'], ['FF FE 68 00', 'utf-16le'], ['FE FF 00 68', 'utf-16be'], ['FF FE 00 00 68 00 00 00', 'utf-32le'],
    ['00 00 FE FF 00 00 00 68', 'utf-32be']];
  for (const [bytes, encoding] of cases) {
    const r = sniff(hex(bytes));
    assert.deepEqual([r.text, r.encoding, r.bom, r.confidence, r.reason], [true, encoding, true, 'certain', 'bom'], encoding);
  }
});

test('sniff: UTF-16 and UTF-32 without a BOM are found by where the NUL bytes sit', () => {
  const cases = [['utf-16le', '48006500 6c006c00 6f002000 7700 6f00 7200 6c00 6400 0a00'], ['utf-16be', '0048 0065 006c 006c 006f 0020 0077 006f 0072 006c 0064 000a'],
    ['utf-16le', '1f04 4004 3804 3204 3504 4204 2c00 2000 3c04 3804 4004'], // Cyrillic text: the NULs come only from the punctuation and spaces
    ['utf-32le', '48000000 65000000 6c000000 6c000000 6f000000 0a000000'], ['utf-32be', '00000048 00000065 0000006c 0000006c 0000006f 0000000a']];
  for (const [encoding, bytes] of cases) {
    const r = sniff(hex(bytes));
    assert.deepEqual([r.text, r.encoding, r.bom, r.confidence], [true, encoding, false, 'likely'], encoding + ' ' + bytes);
  }
  assert.equal(decode(hex(cases[2][1]), 'utf-16le'), 'Привет, мир');
});

test('sniff: binary data is not text', () => {
  const png = hex('89504E470D0A1A0A0000000D49484452000000100000001008060000001FF3FF61');
  assert.deepEqual([sniff(png).text, sniff(png).encoding, sniff(png).reason], [false, '', 'nul']);
  assert.equal(sniff(hex('7F454C46020101000000000000000000')).text, false); // ELF header
  const noisy = Uint8Array.from({ length: 200 }, (_, i) => (i % 10 === 0 ? 0x01 : 0x41)); // 10% control bytes, no NUL
  assert.deepEqual([sniff(noisy).text, sniff(noisy).reason], [false, 'control']);
  assert.equal(sniff(ascii('plain text with two bells \x07 and \x07 only, and a lot more text after them to stay below the limit')).text, true);
  assert.equal(sniff(ascii('tab\tcarriage\rform\fbackspace\bescape\x1b[0m and newline\n')).text, true);
});

test('sniff: ASCII and UTF-8', () => {
  const plain = sniff(ascii('let x = 1;\n'));
  assert.deepEqual([plain.text, plain.encoding, plain.ascii, plain.bom, plain.confidence, plain.reason], [true, 'utf-8', true, false, 'certain', 'ascii']);
  const utf8 = sniff(hex('4772c3bcc39f6520617573204dc3bc6e6368656e20e2809420e697a5e69cace8aa9e20e29c9320f09f9880'));
  assert.deepEqual([utf8.encoding, utf8.ascii, utf8.confidence, utf8.reason], ['utf-8', false, 'certain', 'utf-8']);
});

test('sniff: a word in each legacy encoding', () => {
  for (const [encoding, text, bytes] of WORDS) {
    const r = sniff(hex(bytes));
    assert.deepEqual([r.text, r.encoding, r.bom, r.ascii, r.confidence], [true, encoding, false, false, 'guess'], encoding);
    assert.equal(decode(hex(bytes), encoding), text, encoding);
  }
});

test('sniff: realistic sentences in each legacy encoding, and they decode to the right text', () => {
  for (const [encoding, text, bytes] of SENTENCES) {
    const r = sniff(hex(bytes));
    assert.equal(r.encoding, encoding, text);
    assert.equal(r.confidence, 'guess');
    assert.equal(decode(hex(bytes), r.encoding), text);
    assert.equal(sniff(bytesOf(ascii('// '), hex(bytes), ascii('\n'))).encoding, encoding, 'inside ASCII'); // plain ASCII around the text
  }
});

test('sniff: Western text with a few accents is not taken for Chinese, Japanese or Korean', () => {
  const words = ['C9 63 6F 6C 65', '4D FC 6C 6C 65 72', 'C4 72 67 65 72', '47 72 FC DF 65 20 61 75 73 20 4D FC 6E 63 68 65 6E', '6E 61 EF 76 65',
    '43 6F 70 79 72 69 67 68 74 20 A9 20 32 30 32 30'];
  for (const bytes of words) assert.equal(sniff(hex(bytes)).encoding, 'windows-1252', bytes);
});

test('sniff: ISO-2022-JP is recognised by its escape sequences, a terminal colour reset is not', () => {
  const jis = hex('1b244224332473244b2441244f21224024332621233a23467c244f45373524242c2424242424472439244d21231b2842');
  assert.deepEqual([sniff(jis).encoding, sniff(jis).confidence, sniff(jis).ascii], ['iso-2022-jp', 'likely', false]);
  assert.equal(decode(jis, 'iso-2022-jp'), 'こんにちは、世界。今日は天気がいいですね。');
  assert.equal(sniff(ascii('\x1b(B\x1b[m done\n')).encoding, 'utf-8');
});

test('sniff: a character split by the 64 KB cut does not spoil UTF-8', () => {
  for (const unit of [[0xC3, 0xA9], [0xE2, 0x82, 0xAC], [0xF0, 0x9F, 0x98, 0x80]]) {
    for (let inside = 1; inside < unit.length; inside++) {
      const file = bytesOf(new Uint8Array(SAMPLE - inside).fill(0x61), repeatTo(unit, 100 * 1024 - SAMPLE + inside));
      assert.equal(file.length > 100 * 1024 - 1, true);
      assert.deepEqual([sniff(file).encoding, sniff(file).confidence], ['utf-8', 'certain'], unit.length + '/' + inside);
    }
  }
  // the same file truncated for real (not by the sniff window) ends in half a character: not UTF-8
  assert.equal(sniff(bytesOf(ascii('caf'), hex('C3'))).encoding, 'windows-1252');
});

test('sniff: a legacy character split by the 64 KB cut does not spoil the guess', () => {
  for (const [encoding, , bytes] of SENTENCES.filter((s) => ['shift_jis', 'gbk', 'euc-kr'].includes(s[0]))) {
    let file;
    for (const pad of [0, 1]) { // choose the padding that puts the cut inside a two-byte character
      file = bytesOf(new Uint8Array(pad).fill(0x20), repeatTo(hex(bytes), 100 * 1024));
      let i = 0;
      while (i < SAMPLE - 1) i += file[i] >= 0x80 ? 2 : 1;
      if (i === SAMPLE - 1) break;
    }
    assert.ok(file[SAMPLE - 1] >= 0x80 && file[SAMPLE] >= 0x40, 'the cut splits a character');
    assert.equal(sniff(file).encoding, encoding);
  }
});

test('sniff: looks at no more than the first 64 KB, and never throws', () => {
  assert.equal(sniff(bytesOf(new Uint8Array(SAMPLE).fill(0x61), hex('00 00 00'))).text, true);
  assert.equal(sniff(bytesOf(new Uint8Array(SAMPLE - 1).fill(0x61), hex('00'))).text, false);
  for (const odd of [null, undefined, 5, 'text', {}, [104, 105], new ArrayBuffer(4), Buffer.from('hi')]) {
    const r = sniff(odd);
    assert.equal(typeof r, 'object');
    assert.equal(typeof r.text, 'boolean');
  }
  let seed = 12345; // random bytes: always an answer, and decode with it always gives a string
  for (let n = 0; n < 200; n++) {
    const noise = Uint8Array.from({ length: 1 + (n * 37) % 700 }, () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 255);
    const r = sniff(noise);
    assert.equal(typeof decode(noise, r.encoding || 'utf-8'), 'string');
  }
});

test('decode: drops a matching BOM, replaces bad sequences, never throws, unknown label is UTF-8', () => {
  assert.equal(decode(hex('EF BB BF 68 69'), 'utf-8'), 'hi');
  assert.equal(decode(hex('FF FE 68 00 69 00'), 'utf-16le'), 'hi');
  assert.equal(decode(hex('FE FF 00 68 00 69'), 'utf-16be'), 'hi');
  assert.equal(decode(hex('FF FE 00 00 68 00 00 00 69 00 00 00'), 'utf-32le'), 'hi');
  assert.equal(decode(hex('00 00 FE FF 00 00 00 68 00 00 00 69'), 'utf-32be'), 'hi');
  assert.equal(decode(hex('68 69 FF 6A'), 'utf-8'), 'hi\uFFFDj');
  assert.equal(decode(hex('68 00 69'), 'utf-16le'), 'h\uFFFD');
  assert.equal(decode(hex('68 00 00 00 00 00 11 00 3D D8 00 00 69'), 'utf-32le'), 'h\uFFFD\uFFFD\uFFFD'); // past U+10FFFF, a surrogate, a partial group
  assert.equal(decode(hex('C3 A9'), 'no-such-encoding'), 'é');
  assert.equal(decode(hex('C3 A9'), undefined), 'é');
  assert.equal(decode(hex('63 61 66 E9'), 'WINDOWS-1252'), 'café');
  assert.equal(decode(hex('EF BB BF 63 61 66 E9'), 'windows-1252'), 'ï»¿café'); // a UTF-8 BOM means nothing to Windows-1252
  assert.equal(decode(new Uint8Array(0), 'shift_jis'), '');
});

test('encode: UTF-8, UTF-16 and UTF-32 with and without a BOM', () => {
  const text = 'hé 日 😀';
  assert.equal(hexOf(encode(text, 'utf-8')), '68c3a920e697a520f09f9880');
  assert.equal(hexOf(encode('hi', 'utf-8', { bom: true })), 'efbbbf6869');
  assert.equal(hexOf(encode('hi', 'utf-16le')), '68006900');
  assert.equal(hexOf(encode('hi', 'utf-16le', { bom: true })), 'fffe68006900');
  assert.equal(hexOf(encode('hi', 'utf-16be', { bom: true })), 'feff00680069');
  assert.equal(hexOf(encode('😀', 'utf-16le')), '3dd800de');
  assert.equal(hexOf(encode('hi', 'utf-32le', { bom: true })), 'fffe000068000000' + '69000000');
  assert.equal(hexOf(encode('hi😀', 'utf-32be', { bom: true })), '0000feff' + '00000068' + '00000069' + '0001f600');
  for (const encoding of ['utf-8', 'utf-16le', 'utf-16be', 'utf-32le', 'utf-32be']) {
    for (const bom of [false, true]) {
      const bytes = encode(text, encoding, { bom });
      assert.equal(decode(bytes, encoding), text, encoding);
      if (bom) assert.deepEqual([sniff(bytes).encoding, sniff(bytes).bom], [encoding, true]);
    }
  }
  assert.equal(hexOf(encode('a\uD800b', 'utf-8')), '61efbfbd62'); // a lone surrogate becomes U+FFFD in every Unicode encoding
  assert.equal(hexOf(encode('a\uD800b', 'utf-16le')), '6100fdff6200');
  assert.equal(hexOf(encode('a\uDC00', 'utf-32be')), '00000061' + '0000fffd');
});

test('encode: single-byte code pages, with the 0x80-0x9F range right', () => {
  assert.equal(hexOf(encode('café', 'windows-1252')), '636166e9');
  assert.equal(hexOf(encode('€ ‚ „ … ‘ ’ “ ” • – — ™ Œ œ Ÿ', 'windows-1252')), '80 20 82 20 84 20 85 20 91 20 92 20 93 20 94 20 95 20 96 20 97 20 99 20 8c 20 9c 20 9f'.replace(/ /g, ''));
  assert.equal(hexOf(encode('Привет', 'koi8-r')), 'f0d2c9d7c5d4');
  assert.equal(hexOf(encode('Привет', 'windows-1251')), 'cff0e8e2e5f2');
  assert.equal(hexOf(encode('Zażółć', 'iso-8859-2')), '5a61bff3b3e6');
  assert.equal(hexOf(encode('Zażółć', 'windows-1250')), '5a61bff3b3e6');
  assert.equal(hexOf(encode('€ Œ Ž', 'iso-8859-15')), 'a420bc20b4');
  for (const id of ['windows-1252', 'iso-8859-2', 'iso-8859-15', 'windows-1250', 'windows-1251', 'koi8-r', 'ibm866', 'macintosh']) {
    const high = Uint8Array.from({ length: 128 }, (_, i) => 128 + i);
    assert.equal(hexOf(encode(decode(high, id), id)), hexOf(high), id); // every byte from 0x80 to 0xFF survives the round trip
  }
});

test('encode: what cannot be written is null, never a question mark', () => {
  assert.equal(encode('日本', 'windows-1252'), null);
  assert.equal(encode('€', 'iso-8859-2'), null);
  assert.equal(encode('😀', 'windows-1251'), null);
  assert.equal(encode('Привет', 'windows-1252'), null);
  assert.equal(encode('abc ā', 'windows-1252'), null);
  for (const id of ['shift_jis', 'euc-jp', 'iso-2022-jp', 'gbk', 'gb18030', 'big5', 'euc-kr', 'no-such-encoding', '', undefined]) assert.equal(encode('abc', id), null, String(id));
  for (const [encoding, text] of SENTENCES) {
    const bytes = encode(text, encoding);
    if (bytes !== null) assert.equal(decode(bytes, encoding), text, encoding);
  }
});

test('detectEol, applyEol and normalizeEol', () => {
  assert.deepEqual(detectEol(''), { eol: 'none', lf: 0, crlf: 0, cr: 0 });
  assert.deepEqual(detectEol('one line'), { eol: 'none', lf: 0, crlf: 0, cr: 0 });
  assert.deepEqual(detectEol('a\nb\nc\n'), { eol: 'lf', lf: 3, crlf: 0, cr: 0 });
  assert.deepEqual(detectEol('a\r\nb\r\nc'), { eol: 'crlf', lf: 0, crlf: 2, cr: 0 });
  assert.deepEqual(detectEol('a\rb\rc\r'), { eol: 'cr', lf: 0, crlf: 0, cr: 3 });
  assert.deepEqual(detectEol('a\r\nb\nc\rd'), { eol: 'mixed', lf: 1, crlf: 1, cr: 1 });
  assert.deepEqual(detectEol('a\r\n\r\nb'), { eol: 'crlf', lf: 0, crlf: 2, cr: 0 });
  assert.equal(detectEol('a\nb\r\nc\n').eol, 'mixed');
  assert.equal(normalizeEol('a\r\nb\rc\nd\r\n\r\ne'), 'a\nb\nc\nd\n\ne');
  assert.equal(normalizeEol('already\nfine'), 'already\nfine');
  assert.equal(applyEol('a\nb\n\nc', 'lf'), 'a\nb\n\nc');
  assert.equal(applyEol('a\nb\n\nc', 'crlf'), 'a\r\nb\r\n\r\nc');
  assert.equal(applyEol('a\nb\n\nc', 'cr'), 'a\rb\r\rc');
  for (const { id } of EOLS) assert.equal(normalizeEol(applyEol('x\ny\n', id)), 'x\ny\n', id);
  const crlfFile = decode(ascii('line one\r\nline two\r\n'), 'utf-8'); // a file read, edited as \n, and saved back the way it came
  assert.equal(detectEol(crlfFile).eol, 'crlf');
  assert.equal(applyEol(normalizeEol(crlfFile), detectEol(crlfFile).eol), crlfFile);
});
