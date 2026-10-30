// The shared PDF security handler (shared/pdf-crypto/): the spec's algorithms against known answers, decryption of files
// another program (qpdf 12.2.0) encrypted, and AES-256 encryption round trips with the real pdf-lib from vendor/.
// Known answers: MD5 (RFC 1321), RC4 (the usual "Key"/"Plaintext" vector), and for the PDF algorithms the file keys qpdf
// itself reports (`qpdf --show-encryption-key`) for the fixtures in tests/pdf-crypto/fixtures/ (see the README there).
// When qpdf is on PATH (or QPDF names it), the files this module writes are also checked with `qpdf --check`.
// Run with: node --test tests/node/pdf-crypto.test.mjs
// Covers: shared/pdf-crypto/legacy.js shared/pdf-crypto/aes256.js shared/pdf-crypto/security.js shared/pdf-crypto/decrypt.js shared/pdf-crypto/encrypt.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const L = require('../../vendor/pdf-lib/pdf-lib.min.js');
const C = Object.assign({}, ...['legacy', 'aes256', 'security', 'decrypt', 'encrypt'].map((m) => require(`../../shared/pdf-crypto/${m}.js`)));
const fx = (n) => new Uint8Array(readFileSync(new URL(`../pdf-crypto/fixtures/${n}`, import.meta.url)));
const hex = C.toHex, utf8 = (s) => new TextEncoder().encode(s);
const opts = { PDFLib: L };
/** A fixed bytes source, so a run is repeatable. */
const fixedRandom = () => { let n = 0; return (k) => Uint8Array.from({ length: k }, () => (n++ * 37 + 11) & 255); };
async function encOf(bytes) { return C.readEncrypt(L, (await C.parseRaw(L, bytes)).ctx); }
const contentText = async (bytes, pw) => {
  const doc = await L.PDFDocument.load(pw === undefined ? bytes : await C.decryptPdf(bytes, pw, opts));
  const s = doc.getPages()[0].node.Contents();
  const streams = s instanceof L.PDFArray ? s.asArray().map((r) => doc.context.lookup(r)) : [s];
  const ops = streams.map((st) => new TextDecoder('latin1').decode(L.decodePDFRawStream(st).decode())).join('\n');
  return { doc, text: ops.replace(/<([0-9A-Fa-f]*)>/g, (m, h) => new TextDecoder('latin1').decode(C.fromHex(h))) };   // pdf-lib writes text as hex
};

test('MD5 and RC4 give the published answers', () => {
  assert.equal(hex(C.md5(utf8(''))), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(hex(C.md5(utf8('abc'))), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(hex(C.md5(utf8('12345678901234567890123456789012345678901234567890123456789012345678901234567890'))), '57edf4a22be3c955ac49da2e2107b67a');
  assert.equal(hex(C.rc4(utf8('Key'), utf8('Plaintext'))), 'bbf316e8d940af0ad3');
});

test('permission flags: /P values match what qpdf writes, and read back', () => {
  assert.equal(C.toP({}), -4);                                   // everything allowed (qpdf: P = -4)
  assert.equal(C.toP({ print: false, copy: false }), -2072);       // qpdf --print=none --extract=n
  const p = C.fromP(C.toP({ print: false, modify: false, fillForms: false }));
  assert.deepEqual(p, { print: false, modify: false, copy: true, annotate: true, fillForms: false, accessibility: true, assemble: false, printHigh: false });
  assert.equal(C.toP({ print: false }) & 0b11, 0);                 // bits 1 and 2 are always 0
  assert.equal((C.toP({ print: false, copy: false, modify: false, annotate: false, fillForms: false, accessibility: false }) >>> 0).toString(16), 'fffff0c0');
});

test('AES-256 R6 (qpdf): Algorithm 2.B, 2.A for the user and owner passwords, and /Perms (Algorithm 13)', async () => {
  const enc = await encOf(fx('qpdf-aes256.pdf'));
  assert.equal(enc.R, 6); assert.equal(enc.V, 5); assert.equal(enc.stm, 'AESV3'); assert.equal(enc.P, -2072);
  const h = await C.hashR6(C.pwBytes('sesame'), enc.U.subarray(32, 40), new Uint8Array(0), 6);
  assert.equal(hex(h), hex(enc.U.subarray(0, 32)));                // the user validation hash
  const KEY = '01a92594dbd6c6a64d489ea258c56fd4a6769fcc4fa0e94fb5f3009aa4add109';   // qpdf --show-encryption-key
  const user = await C.keyR6('sesame', enc);
  assert.equal(hex(user.key), KEY); assert.equal(user.owner, false);
  const owner = await C.keyR6('Ëigner', enc);                      // non-ASCII: UTF-8 after NFKC
  assert.equal(hex(owner.key), KEY); assert.equal(owner.owner, true);
  assert.equal(await C.keyR6('Ëigner'.normalize('NFD'), enc).then((r) => r && r.owner), true);   // the same password typed decomposed
  assert.equal(await C.keyR6('sesame!', enc), null);
  assert.deepEqual(await C.readPerms(user.key, enc.Perms), { P: -2072, encryptMetadata: true });
});

test('AES-128 R4 and RC4 40-bit R2 (qpdf): Algorithm 2, and the owner password through Algorithm 7', async () => {
  const a = await encOf(fx('qpdf-aes128.pdf'));
  assert.equal(a.R, 4); assert.equal(a.stm, 'AESV2');
  assert.equal(hex((await C.fileKey(a, 'sesame')).key), 'f3fa7bc2ff20a80ad535d38d1291d9f5');
  const owner = await C.fileKey(a, 'owner128');
  assert.equal(hex(owner.key), 'f3fa7bc2ff20a80ad535d38d1291d9f5'); assert.equal(owner.owner, true);
  assert.equal(await C.fileKey(a, ''), null);
  const r = await encOf(fx('qpdf-rc4-40.pdf'));
  assert.equal(r.R, 2);
  assert.equal(hex((await C.fileKey(r, '')).key), 'd5b5e57442');
  assert.equal((await C.fileKey(r, 'owner40')).owner, true);
});

test('decryptPdf opens the qpdf files (object streams too) and inspect describes them', async () => {
  for (const [name, pw] of [['qpdf-aes256.pdf', 'sesame'], ['qpdf-aes256.pdf', 'Ëigner'], ['qpdf-aes128.pdf', 'owner128'], ['qpdf-rc4-40.pdf', '']]) {
    const { doc, text } = await contentText(fx(name), pw);
    assert.equal(doc.getTitle(), 'Fixture', name);
    assert.match(text, /Known answer page/, name);
    assert.equal(doc.context.trailerInfo.Encrypt, undefined);
  }
  await assert.rejects(C.decryptPdf(fx('qpdf-aes256.pdf'), 'wrong', opts), (e) => e.code === 'password');
  assert.deepEqual(await C.inspect(fx('qpdf-aes256.pdf'), opts).then((i) => [i.encrypted, i.bits, i.method, i.needsPassword, i.permissions.print, i.permissions.copy]), [true, 256, 'AESV3', true, false, false]);
  assert.deepEqual(await C.inspect(fx('qpdf-rc4-40.pdf'), opts).then((i) => [i.bits, i.method, i.needsPassword]), [40, 'RC4', false]);
  const plain = await (await L.PDFDocument.create()).save();
  assert.equal(await C.decryptPdf(plain, '', opts), null);
  assert.deepEqual(await C.inspect(plain, opts), { encrypted: false });
});

test('makeR6 (Algorithms 8 to 10): both passwords give the file key back, /Perms holds P, and a fixed bytes source repeats', async () => {
  const fileKey = Uint8Array.from({ length: 32 }, (_, i) => i);
  const make = () => C.makeR6({ userPassword: 'pässword', ownerPassword: 'boss', P: -2072, random: fixedRandom(), fileKey });
  const s = await make();
  assert.equal(s.U.length, 48); assert.equal(s.O.length, 48); assert.equal(s.UE.length, 32); assert.equal(s.OE.length, 32); assert.equal(s.Perms.length, 16);
  const enc = { R: 6, U: s.U, O: s.O, UE: s.UE, OE: s.OE };
  assert.deepEqual([hex((await C.keyR6('pässword', enc)).key), (await C.keyR6('pässword', enc)).owner], [hex(fileKey), false]);
  assert.deepEqual([hex((await C.keyR6('boss', enc)).key), (await C.keyR6('boss', enc)).owner], [hex(fileKey), true]);
  assert.deepEqual(await C.readPerms(fileKey, s.Perms), { P: -2072, encryptMetadata: true });
  assert.equal(hex((await make()).U), hex(s.U));
});

/** A solid red 4 x 4 PNG (RGB), made here so the test needs no picture file. */
function redPng() {
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.from([0, 0, 0, 4, 0, 0, 0, 4, 8, 2, 0, 0, 0]);
  const rows = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

async function sample() {
  const d = await L.PDFDocument.create();
  const f = await d.embedFont(L.StandardFonts.Helvetica);
  const page = d.addPage([400, 300]);
  page.drawText('Secret text (with brackets) and \\ slash', { x: 20, y: 250, font: f, size: 12 });
  const png = await d.embedPng(redPng());
  page.drawImage(png, { x: 20, y: 20, width: 100, height: 100 });
  d.setTitle('Plan (draft) é'); d.setSubject('Literal \\(escaped\\) string');
  return { bytes: await d.save({ useObjectStreams: true }), png };
}

test('encryptPdf: nothing readable in the file, both passwords open it, strings, text and pictures come back intact', async () => {
  const { bytes } = await sample();
  const out = await C.encryptPdf(bytes, { ...opts, userPassword: 'open me', ownerPassword: 'owner', permissions: { print: false, copy: false, modify: false } });
  const raw = new TextDecoder('latin1').decode(out);
  assert.match(raw, /^%PDF-1\.7/);
  assert.match(raw, /\/Filter \/Standard/); assert.match(raw, /\/CFM \/AESV3/); assert.match(raw, /\/ExtensionLevel 8/); assert.match(raw, /\/ID \[/);
  assert.doesNotMatch(raw, /Plan|Secret|ObjStm|\/XRef/);
  const info = await C.inspect(out, opts);
  assert.deepEqual([info.bits, info.needsPassword, info.permissions.print, info.permissions.copy, info.permissions.modify, info.permissions.fillForms], [256, true, false, false, false, true]);
  for (const pw of ['open me', 'owner']) {
    const { doc, text } = await contentText(out, pw);
    assert.equal(doc.getTitle(), 'Plan (draft) é'); assert.equal(doc.getSubject(), 'Literal \\(escaped\\) string');
    assert.match(text, /Secret text/); assert.match(text, /Do/);
  }
  const plain = await L.PDFDocument.load(await C.decryptPdf(out, 'open me', opts)), orig = await L.PDFDocument.load(bytes);
  const pics = (doc) => doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof L.PDFRawStream && String(o.dict.get(L.PDFName.of('Subtype'))) === '/Image').map(([, o]) => hex(o.contents));
  assert.deepEqual(pics(plain), pics(orig));
  await assert.rejects(C.decryptPdf(out, 'Open me', opts), (e) => e.code === 'password');
});

test('encryptPdf: no user password (permissions only), a protected input with its password, and a wrong current password', async () => {
  const { bytes } = await sample();
  const open = await C.encryptPdf(bytes, { ...opts, permissions: { print: false } });
  const i = await C.inspect(open, opts);
  assert.equal(i.needsPassword, false); assert.equal(i.permissions.print, false);
  assert.match((await contentText(open, '')).text, /Secret text/);
  const again = await C.encryptPdf(fx('qpdf-aes128.pdf'), { ...opts, currentPassword: 'sesame', userPassword: 'new' });
  assert.match((await contentText(again, 'new')).text, /Known answer page/);
  await assert.rejects(C.decryptPdf(again, 'sesame', opts), (e) => e.code === 'password');
  await assert.rejects(C.encryptPdf(fx('qpdf-aes128.pdf'), { ...opts, currentPassword: 'nope', userPassword: 'x' }), (e) => e.code === 'password');
});

const qpdf = process.env.QPDF || (spawnSync('sh', ['-c', 'command -v qpdf'], { encoding: 'utf8' }).stdout || '').trim();
test('qpdf --check accepts the encrypted files (skipped when qpdf is not installed)', { skip: !qpdf && 'qpdf not installed' }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdf-crypto-'));
  const file = path.join(dir, 'enc.pdf');
  writeFileSync(file, await C.encryptPdf((await sample()).bytes, { ...opts, userPassword: 'open me', ownerPassword: 'owner', permissions: { copy: false } }));
  for (const pw of ['open me', 'owner']) {
    const r = spawnSync(qpdf, ['--check', `--password=${pw}`, file], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /No syntax or stream encoding errors found/);
  }
  assert.notEqual(spawnSync(qpdf, ['--check', '--password=bad', file]).status, 0);
});
