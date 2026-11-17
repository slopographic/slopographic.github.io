// SlopSanitize (shared/sanitize/sanitize.js), the parts that need no DOM: link and image addresses (with the obfuscations
// browsers undo), CSS, keys that would reach Object.prototype, and XML entity bombs. The HTML and SVG sanitiser (DOMPurify)
// runs in the browser: tests/shared/sanitize.test.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const S = createRequire(import.meta.url)('../../shared/sanitize/sanitize.js');

test('links keep web, mail, phone, in-page and relative addresses, and lose every script or data address', () => {
  for (const ok of ['https://example.com/a?b=1#c', 'http://x.y', 'mailto:a@b.c', 'tel:+4612345', '#top', '/path', 'page.html', '../up', '//cdn.example/x'])
    assert.equal(S.url(ok, 'link'), ok, ok);
  const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', '\u0001javascript:alert(1)', '\u0000javascript:x',
    'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java\rscript:x', '\u000e javascript:x', 'jav\u0000ascript:x', 'vbscript:msgbox(1)',
    'VBScript:x', 'data:text/html,<script>alert(1)</script>', 'data:image/png;base64,AAAA', 'livescript:x', 'file:///etc/passwd',
    'blob:https://slopographic.com/x', 'javascript\u0009:alert(1)', 'ja\u000bvascript:x', '', null, undefined];
  for (const b of bad) assert.equal(S.url(b, 'link'), '', JSON.stringify(b));
  // entities stay text: the browser decodes an attribute once, so these are relative paths, not schemes
  assert.equal(S.url('javascript&#58;alert(1)', 'link'), 'javascript&#58;alert(1)');
  assert.equal(S.url('  https://x.y/  ', 'link'), 'https://x.y/');
});

test('images may also be data:image and blob:, and local images load nothing from the network', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(S.url(png, 'image'), png);
  assert.equal(S.url('data:image/svg+xml;utf8,<svg/>', 'image'), 'data:image/svg+xml;utf8,<svg/>');
  assert.equal(S.url('blob:https://slopographic.com/1', 'image'), 'blob:https://slopographic.com/1');
  assert.equal(S.url('https://x.y/p.png', 'image'), 'https://x.y/p.png');
  assert.equal(S.url('cid:logo@x', 'image'), 'cid:logo@x');
  for (const b of ['data:text/html,x', 'data:application/javascript,x', 'javascript:x', 'DATA:text/html,x']) assert.equal(S.url(b, 'image'), '', b);
  assert.equal(S.url(png, 'local'), png);
  assert.equal(S.url('#frag', 'local'), '#frag');
  for (const b of ['https://x.y/p.png', '//x.y/p.png', 'p.png', '/p.png', 'javascript:x']) assert.equal(S.url(b, 'local'), '', b);
});

test('CSS loses script (also spelled with escapes or comments) and, when local, everything that would load', () => {
  assert.doesNotMatch(S.css('width: expression(alert(1))'), /expression\s*\(/i);
  assert.doesNotMatch(S.css('width: \\65 xpression(alert(1))'), /expression\s*\(/i);
  assert.doesNotMatch(S.css('background: url(javascript:alert(1))'), /javascript:/i);
  assert.doesNotMatch(S.css('behavior: url(x.htc); -moz-binding: url(x.xml#y)'), /behavior\s*:|-moz-binding/i);
  assert.doesNotMatch(S.css('</style><script>alert(1)</script>'), /<\/style/i);
  const local = S.css('@import "https://evil/x.css"; a { background: url(https://evil/p.png) } b { background: u\\72l(https://evil/q.png) }' +
    ' c { background-image: image-set("https://evil/r.png" 1x) } d { background: url(data:image/png;base64,AAAA) }', 'local');
  assert.doesNotMatch(local, /evil|@import/);
  assert.match(local, /url\(data:image\/png;base64,AAAA\)/);
  assert.equal(S.css('p { color: #c00; content: "\\201C" }'), 'p { color: #c00; content: "\\201C" }');
  assert.equal(S.css('a{background:url(https://ok/x.png)}', 'web'), 'a{background:url(https://ok/x.png)}');
});

test('keys: __proto__, constructor and prototype are never taken from data', () => {
  for (const k of ['__proto__', 'constructor', 'prototype']) assert.equal(S.safeKey(k), false);
  assert.equal(S.safeKey('name'), true);
  const o = JSON.parse('{"a":1,"__proto__":{"polluted":1}}');
  assert.equal(S.own(o, 'a'), true);
  assert.equal(S.own(o, '__proto__'), false);
  assert.equal(S.own({}, 'toString'), false);
  const clean = S.parseJson('{"a":{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"b":[{"__proto__":{"x":1}}]}}');
  assert.deepEqual(Object.keys(clean.a), ['b']);
  assert.equal(Object.getPrototypeOf(clean.a), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(clean.a.b[0], '__proto__'), false);
  assert.equal({}.polluted, undefined);
  const merged = {};
  for (const [k, v] of Object.entries(JSON.parse('{"__proto__":{"polluted":3},"x":1}'))) if (S.safeKey(k)) merged[k] = v;
  assert.equal({}.polluted, undefined);
  assert.deepEqual(merged, { x: 1 });
});

test('XML: entity bombs, parameter and external entities are refused; plain files and a few flat entities pass', () => {
  const laughs = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">' +
    '<!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">]><lolz>&lol2;</lolz>';
  assert.throws(() => S.xmlText(laughs), /expand without limit/);
  assert.throws(() => S.xmlText('<!DOCTYPE x [<!ENTITY % p "x"> ]><x/>'), /expand without limit/);
  assert.throws(() => S.xmlText('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'), /expand without limit/);
  const many = '<!DOCTYPE x [' + Array.from({ length: 70 }, (_, i) => `<!ENTITY e${i} "v">`).join('') + ']><x/>';
  assert.throws(() => S.xmlText(many), /expand without limit/);
  const wide = '<!DOCTYPE x [<!ENTITY big "' + 'a'.repeat(10000) + '">]><x>' + '&big;'.repeat(500) + '</x>';
  assert.throws(() => S.xmlText(wide), /expand without limit/);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
  assert.equal(S.xmlText(svg), svg);
  const ai = '<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [' +
    '<!ENTITY ns_svg "http://www.w3.org/2000/svg"><!ENTITY ns_xlink "http://www.w3.org/1999/xlink">]><svg xmlns="&ns_svg;" xmlns:xlink="&ns_xlink;"/>';
  assert.equal(S.xmlText(ai), ai);
  assert.equal(S.xmlText('<!DOCTYPE html><p>x</p>'), '<!DOCTYPE html><p>x</p>');
});

test('without DOMPurify, html() refuses rather than passing markup through', () => {
  assert.throws(() => S.html('<img src=x onerror=alert(1)>'), /DOMPurify/);
});
