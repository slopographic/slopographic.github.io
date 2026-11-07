// Slop Signature, the model and the templates (signature/js/model.js, signature/js/templates.js): checks, safe links,
// and the HTML and plain-text signatures for each template.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({});
for (const f of ['signature/js/model.js', 'signature/js/templates.js']) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx);
const M = ctx.SlopSignature.model, T = ctx.SlopSignature.templates;

test('links: https added to a bare address, mailto and tel made, unsafe schemes refused', () => {
  assert.equal(M.href('url', 'northwind.example/call'), 'https://northwind.example/call');
  assert.equal(M.href('url', 'http://a.example'), 'http://a.example');
  assert.equal(M.href('url', 'javascript:alert(1)'), '');
  assert.equal(M.href('url', 'data:text/html,hi'), '');
  assert.equal(M.href('url', 'not a site'), '');
  assert.equal(M.href('email', 'alex@northwind.example'), 'mailto:alex@northwind.example');
  assert.equal(M.href('email', 'alex@'), '');
  assert.equal(M.href('tel', '+44 (117) 496-0000'), 'tel:+441174960000');
  assert.equal(M.href('tel', '12'), '');
});

test('clean trims, keeps a known template and colour, and lists only the filled socials', () => {
  const s = M.clean({ name: '  Alex ', template: 'nope', accent: 'red', linkedin: 'linkedin.com/in/alex', x: '', imageSize: 999 });
  assert.equal(s.name, 'Alex');
  assert.equal(s.template, 'classic');
  assert.equal(s.accent, M.STYLE.accent);
  assert.equal(s.imageSize, 160);
  assert.deepEqual(JSON.parse(JSON.stringify(s.socials)), [{ id: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/alex' }]);
  assert.equal(M.clean({ image: 'data:image/png;base64,AAAA' }).imageHref, 'data:image/png;base64,AAAA');
  assert.equal(M.clean({ image: 'data:image/svg+xml;base64,AAAA' }).imageHref, '');
});

test('problems name each field that will not work', () => {
  const p = M.problems({ email: 'alex', website: 'nope nope', phone: '1', ctaUrl: 'a.example' });
  assert.deepEqual(JSON.parse(JSON.stringify(p.map((x) => x.key))), ['website', 'phone', 'email', 'cta']);
  assert.deepEqual(JSON.parse(JSON.stringify(M.problems(M.sample()))), []);
});

test('every template escapes what was typed and links what it can', () => {
  const s = M.clean(Object.assign(M.sample(), { name: 'Alex <b>&</b> "Co"', image: 'northwind.example/logo.png' }));
  for (const [id] of T.LIST) {
    const h = T.html(Object.assign({}, s, { template: id }));
    assert.ok(h.startsWith('<table'), id);
    assert.ok(h.includes('Alex &lt;b&gt;&amp;&lt;/b&gt; &quot;Co&quot;'), id);
    assert.ok(!h.includes('<b>&</b>'), id);
    assert.ok(h.includes('href="mailto:alex@northwind.example"'), id);
    assert.ok(h.includes('href="tel:+441174960000"'), id);
    assert.ok(h.includes('href="https://northwind.example/call"'), id);
    assert.equal(h.includes('src="https://northwind.example/logo.png"'), id !== 'compact', id + ': the picture (compact has none)');
    assert.ok(!/<style|class=/.test(h), id + ': inline styles only');
  }
});

test('nothing to show gives no HTML; the plain text starts with the signature line', () => {
  assert.equal(T.html(M.clean({})), '');
  assert.equal(T.text(M.clean({})), '');
  const t = T.text(M.clean(M.sample()));
  assert.ok(t.startsWith('-- \nAlex Morgan\nSales manager\nNorthwind Ltd\nPhone +44 117 496 0000'));
  assert.ok(t.includes('Book a 15-minute call: https://northwind.example/call'));
});
