// Slop EML: HTML-to-text and word wrap (eml/js/text.js), the text the PDF is made from. Run: node tests/run.mjs eml-text
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EML = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'eml', 'js');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(await readFile(path.join(EML, 'text.js'), 'utf8'), ctx, { filename: 'text.js' });
const T = ctx.EmlText;

test('paragraphs and line breaks survive; source whitespace does not', () => {
  const out = T.htmlToText('<html><head><title>x</title><style>p{color:red}</style></head>\n<body>\n  <p>First   para\n  here.</p>\n  <p>Second<br>line</p>\n</body></html>');
  assert.equal(out, 'First para here.\n\nSecond\nline');
});

test('scripts, styles and comments are dropped', () => {
  const out = T.htmlToText('<!-- hidden --><script>alert(1)</script><p>visible</p><style>.a{}</style>');
  assert.equal(out, 'visible');
});

test('links keep their text and show the address once, as text', () => {
  assert.equal(T.htmlToText('<a href="https://example.com/x">Read the notes</a>'), 'Read the notes (https://example.com/x)');
  assert.equal(T.htmlToText('<a href="mailto:ann@example.com">ann@example.com</a>'), 'ann@example.com');
  assert.equal(T.htmlToText('<a href="https://example.com">https://example.com</a>'), 'https://example.com');
});

test('list items get bullets, table cells are separated, images show their alt text', () => {
  const out = T.htmlToText('<ul><li>one</li><li>two</li></ul><table><tr><td>a</td><td>b</td></tr></table><img src="cid:x" alt="Logo">');
  assert.equal(out, '• one\n• two\n\na b\n\n[Logo]');
});

test('entities decode, including numeric ones, and an unknown entity stays', () => {
  assert.equal(T.htmlToText('<p>Tom &amp; Jerry &lt;3 &#8364; &#x263A; &nbsp;&bogus;</p>'), 'Tom & Jerry <3 € ☺ &bogus;');
});

test('blank lines collapse to one', () => {
  assert.equal(T.htmlToText('<div>a</div><div></div><div></div><div></div><div>b</div>'), 'a\n\nb');
});

test('wrap breaks at spaces and splits a long word by character', () => {
  const measure = (s) => s.length;
  assert.equal(T.wrap('the quick brown fox', 10, measure).join('|'), 'the quick|brown fox');
  assert.equal(T.wrap('abcdefghij', 4, measure).join('|'), 'abcd|efgh|ij');
  assert.equal(T.wrap('', 10, measure).join('|'), '');
});
