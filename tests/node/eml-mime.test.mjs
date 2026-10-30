// Slop EML: the pure MIME layer (shared/mail/codec.js and shared/mail/mime.js) run as the browser runs them, in one vm context.
// Covers unfolded headers, RFC 2047 encoded words, base64 and quoted-printable, nested multiparts, cid images, charsets,
// RFC 2231 file names and malformed parts. Run: node tests/run.mjs eml-mime
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EML = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'mail');
const ctx = { TextDecoder, btoa, atob, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['codec.js', 'mime.js']) vm.runInContext(await readFile(path.join(EML, f), 'utf8'), ctx, { filename: f });
const M = ctx.EmlMime, K = ctx.EmlCodec;

/** Bytes of a bin string (each character is one byte). */
const bin = (s) => new Uint8Array(Buffer.from(s, 'latin1'));
const text = (u8) => Buffer.from(u8).toString('utf8');
const msg = (...lines) => bin(lines.join('\r\n'));

test('unfolded headers keep their order and their decoded values', () => {
  const m = M.parse(msg('From: Ann <ann@example.com>', 'Subject: a long', '  subject line', 'To: b@example.com', '', 'Hi'));
  assert.equal(m.headers.map((h) => h.name).join('|'), 'From|Subject|To');
  assert.equal(M.header(m.headers, 'subject'), 'a long subject line');
  assert.equal(M.summary(m).from, 'Ann <ann@example.com>');
  assert.equal(m.text, 'Hi');
});

test('a header line with no name is skipped and reported, the rest still reads', () => {
  const m = M.parse(msg('From: a@example.com', 'this line has no colon', 'Subject: ok', '', 'body'));
  assert.equal(M.header(m.headers, 'Subject'), 'ok');
  assert.equal(m.text, 'body');
  assert.ok(m.warnings.some((w) => /no name/.test(w)));
});

test('RFC 2047 encoded words: B and Q, UTF-8 and ISO-8859-1, adjacent words joined', () => {
  assert.equal(K.decodeWords('=?UTF-8?B?4oKsIGV1cm8=?='), '€ euro');
  assert.equal(K.decodeWords('=?UTF-8?Q?Caf=C3=A9_au_lait?='), 'Café au lait');
  assert.equal(K.decodeWords('=?ISO-8859-1?Q?Jos=E9?='), 'José');
  assert.equal(K.decodeWords('=?UTF-8?Q?Hel?= =?UTF-8?Q?lo?= world'), 'Hello world');
  assert.equal(K.decodeWords('plain  text'), 'plain  text');
  assert.equal(K.decodeWords('=?UTF-8?Q?a?= (b)'), 'a (b)');
});

test('an encoded Subject and From read as text', () => {
  const m = M.parse(msg('Subject: =?UTF-8?B?UHLDvGZ1bmc=?=', 'From: =?UTF-8?Q?Ren=C3=A9?= <r@example.com>', '', 'x'));
  assert.equal(M.summary(m).subject, 'Prüfung');
  assert.equal(M.summary(m).from, 'René <r@example.com>');
});

test('base64 and quoted-printable transfer encodings decode', () => {
  const b64 = M.parse(msg('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', 'SGVsbG8s', 'IHdvcmxkIOKCrA=='));
  assert.equal(b64.text, 'Hello, world €');
  const qp = M.parse(msg('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '', 'Caf=C3=A9 soft=', 'break and =E2=82=AC  ', 'end'));
  assert.equal(qp.text, 'Café softbreak and €\nend');
});

test('a bad =XX in quoted-printable stays as written', () => {
  const b = K.qpToBytes('a=ZZb=4');
  assert.equal(Buffer.from(b).toString('latin1'), 'a=ZZb=4');
});

test('multipart/alternative picks the plain and the HTML body', () => {
  const m = M.parse(msg(
    'Subject: alt', 'Content-Type: multipart/alternative; boundary="b1"', '',
    '--b1', 'Content-Type: text/plain; charset=utf-8', '', 'plain body',
    '--b1', 'Content-Type: text/html; charset=utf-8', '', '<p>html <b>body</b></p>',
    '--b1--', ''));
  assert.equal(m.text, 'plain body');
  assert.equal(m.html, '<p>html <b>body</b></p>');
  assert.equal(m.attachments.length, 0);
});

test('nested multipart: mixed holds alternative, and the file is an attachment with its name', () => {
  const m = M.parse(msg(
    'Content-Type: multipart/mixed; boundary=outer', '',
    '--outer', 'Content-Type: multipart/alternative; boundary=inner', '',
    '--inner', 'Content-Type: text/plain', '', 'hello nested',
    '--inner', 'Content-Type: text/html', '', '<i>hello nested</i>',
    '--inner--',
    '--outer', 'Content-Type: application/pdf; name="report.pdf"', 'Content-Disposition: attachment; filename="report.pdf"', 'Content-Transfer-Encoding: base64', '', 'JVBERi0=',
    '--outer--', ''));
  assert.equal(m.text, 'hello nested');
  assert.equal(m.html, '<i>hello nested</i>');
  assert.equal(m.attachments.length, 1);
  assert.equal(m.attachments[0].name, 'report.pdf');
  assert.equal(m.attachments[0].type, 'application/pdf');
  assert.equal(Buffer.from(m.attachments[0].bytes).toString('latin1'), '%PDF-');
});

test('multipart/related: cid images are found and embedded as data URIs', () => {
  const m = M.parse(msg(
    'Content-Type: multipart/related; boundary="r"', '',
    '--r', 'Content-Type: text/html; charset=utf-8', '', '<img src="cid:logo@x"><img src=cid:logo%40x><img src="https://tracker.example/p.gif">',
    '--r', 'Content-Type: image/png', 'Content-ID: <logo@x>', 'Content-Transfer-Encoding: base64', '', 'iVBORw0K',
    '--r--', ''));
  assert.ok(m.cids.has('logo@x'));
  assert.equal(m.attachments[0].inline, true);
  assert.equal(M.remoteRefs(m.html), 1);
  assert.equal(M.cidRefs(m.html), 2);
  const e = M.embedCids(m.html, m.cids);
  assert.equal(e.replaced, 2);
  assert.ok(e.html.includes('src="data:image/png;base64,iVBORw0K"'));
  assert.ok(e.html.includes('src=data:image/png;base64,iVBORw0K'));
  assert.ok(e.html.includes('https://tracker.example/p.gif'), 'remote image is left as it is');
});

test('charsets: ISO-8859-1, windows-1252 and UTF-8 bodies decode to the right characters', () => {
  const latin = M.parse(msg('Content-Type: text/plain; charset=ISO-8859-1', 'Content-Transfer-Encoding: 8bit', '', 'caf\xe9'));
  assert.equal(latin.text, 'café');
  const cp1252 = M.parse(msg('Content-Type: text/plain; charset="windows-1252"', '', 'Price: \x80 5'));
  assert.equal(cp1252.text, 'Price: € 5');
  const u8 = M.parse(new Uint8Array(Buffer.concat([bin('Content-Type: text/plain; charset=utf-8\r\n\r\n'), Buffer.from('naïve ✓', 'utf8')])));
  assert.equal(u8.text, 'naïve ✓');
  const unknown = M.parse(msg('Content-Type: text/plain; charset=x-made-up', '', 'still readable'));
  assert.equal(unknown.text, 'still readable');
});

test('RFC 2231 file names: encoded value with a charset, and continuations', () => {
  const p = K.parseParams("attachment; filename*=UTF-8''%E2%82%AC%20rates.txt");
  assert.equal(p.params.filename, '€ rates.txt');
  const c = K.parseParams("attachment; filename*0*=UTF-8''long%20; filename*1=name.txt");
  assert.equal(c.params.filename, 'long name.txt');
  const plain = K.parseParams('attachment; filename="a \\"quoted\\" name.doc"');
  assert.equal(plain.params.filename, 'a "quoted" name.doc');
  const m = M.parse(msg('Content-Type: multipart/mixed; boundary=z', '', '--z', 'Content-Type: text/plain', '', 'x',
    "--z", "Content-Type: application/octet-stream", "Content-Disposition: attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.bin", 'Content-Transfer-Encoding: base64', '', 'AAEC', '--z--', ''));
  assert.equal(m.attachments[0].name, 'résumé.bin');
});

test('a part with no file name gets a numbered name from its type', () => {
  const m = M.parse(msg('Content-Type: multipart/mixed; boundary=q', '', '--q', 'Content-Type: image/jpeg', 'Content-Transfer-Encoding: base64', '', 'AAEC', '--q--', ''));
  assert.equal(m.attachments[0].name, 'attachment 1.jpg');
  assert.equal(m.attachments[0].size, 3);
});

test('a broken Content-Type makes the part an attachment that can still be saved', () => {
  const m = M.parse(msg('Content-Type: multipart/mixed; boundary=k', '', '--k', 'Content-Type: $$$ garbage', '', 'raw bytes here', '--k', 'Content-Type: text/plain', '', 'good text', '--k--', ''));
  assert.equal(m.text, 'good text');
  assert.equal(m.attachments.length, 1);
  assert.equal(m.attachments[0].malformed, true);
  assert.equal(m.attachments[0].type, 'application/octet-stream');
  assert.equal(text(m.attachments[0].bytes).includes('raw bytes here'), true);
  assert.ok(m.warnings.length > 0);
});

test('a multipart with no boundary is read as text, not dropped', () => {
  const m = M.parse(msg('Content-Type: multipart/mixed', '', 'Just the words, boundary missing.'));
  assert.equal(m.text, 'Just the words, boundary missing.');
  assert.ok(m.warnings.some((w) => /boundary/.test(w)));
});

test('a multipart missing its closing boundary keeps the parts it has', () => {
  const m = M.parse(msg('Content-Type: multipart/alternative; boundary=x', '', '--x', 'Content-Type: text/plain', '', 'kept text'));
  assert.equal(m.text, 'kept text');
  assert.ok(m.warnings.some((w) => /closing boundary/.test(w)));
});

test('a file with no headers at all still opens, with a warning', () => {
  const m = M.parse(msg('just a line of text'));
  assert.equal(m.headers.length, 0);
  assert.ok(m.warnings.some((w) => /no headers/.test(w)));
});

test('a message attached as message/rfc822 stays as its own bytes', () => {
  const inner = 'Subject: inner\r\n\r\ninside';
  const m = M.parse(msg('Content-Type: multipart/mixed; boundary=m', '', '--m', 'Content-Type: message/rfc822', 'Content-Disposition: attachment', '', inner, '--m--', ''));
  assert.equal(m.attachments.length, 1);
  assert.equal(m.attachments[0].name, 'attachment 1.eml');
  assert.equal(text(m.attachments[0].bytes), inner);
});

test('the parser never throws on junk input', () => {
  for (const junk of [new Uint8Array(0), bin('\x00\xff\r\n\r\n--'), bin('Content-Type: multipart/x; boundary=\r\n\r\n--\r\n')]) {
    assert.doesNotThrow(() => M.parse(junk));
  }
});
