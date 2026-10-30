// Slop Signature: the random sample (signature/js/sample.js), the logo maker's drawing (signature/js/logo.js) and the copy for
// each mail program (signature/js/copy.js output). The same seed gives the same signature and the same logo; the Gmail copy
// leaves out a picture kept inside the signature, Outlook and Apple Mail keep it.
// Covers: signature/js/sample.js, signature/js/logo.js, signature/js/copy.js, signature/js/model.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PIN = "window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: null });";   // English in any build (a white-label build may choose another language first)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({});
ctx.window = ctx;   // the English string tables (signature/i18n/en), so the messages read as on the page
for (const f of ['shared/i18n/i18n.js', ...['app', 'copy', 'form'].map((p) => `signature/i18n/en/${p}.js`), 'shared/sample/rng.js', 'shared/sample/en.js', 'shared/sample/sv.js', 'shared/sample/people.js', 'signature/js/model.js',
  'signature/js/templates.js', 'signature/js/logo.js', 'signature/js/sample.js', 'signature/js/copy.js']) { vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); if (f === 'shared/i18n/i18n.js') vm.runInContext(PIN, ctx); }
const NS = ctx.SlopSignature, X = ctx.SlopSample;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('sample: the same seed gives the same signature; seeds differ; every sample is a valid signature', () => {
  assert.deepEqual(plain(NS.sample.make('4821')), plain(NS.sample.make('4821')));
  assert.notDeepEqual(plain(NS.sample.make('4821').state), plain(NS.sample.make('4822').state));
  const templates = new Set(), fonts = new Set();
  for (let i = 0; i < 80; i++) {
    const r = NS.sample.make(String(i), i % 2 ? 'sv' : 'en'), s = r.state;
    assert.deepEqual(plain(NS.model.problems(s)), [], `seed ${i}: ${JSON.stringify(NS.model.problems(s))}`);
    assert.ok(s.name && s.company && s.email && s.phone);
    assert.ok(X.contrast(s.accent, '#ffffff') >= 4.5, s.accent);
    assert.ok(NS.templates.html(NS.model.clean(s)).includes(s.name.split(' ')[0]));
    if (r.logo) assert.ok(r.logo.text.length >= 1 && r.logo.seed === String(i));
    templates.add(s.template); fonts.add(s.font);
  }
  assert.equal(templates.size, 4, 'every template comes up');
  assert.ok(fonts.size >= 4, 'fonts vary');
  assert.match(NS.sample.make('').seed, /^\d{4,5}$/, 'an empty seed is a new one');
});

test('logo: initials skip company forms; the SVG is the same for a seed and escapes the text', () => {
  assert.equal(NS.logo.initials('Harbour Studio Ltd'), 'HS');
  assert.equal(NS.logo.initials('Northwind'), 'N');
  assert.equal(NS.logo.initials('Björk Design AB'), 'BD');
  assert.equal(NS.logo.initials(''), '?');
  const o = { text: 'HS', kind: 'monogram', shape: 'circle', colour: '#1f6feb', seed: '7' };
  assert.equal(NS.logo.svg(o), NS.logo.svg(o));
  assert.match(NS.logo.svg(o), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="160" height="160"/);
  assert.match(NS.logo.svg(o), /<circle cx="80" cy="80"/);
  assert.match(NS.logo.svg(Object.assign({}, o, { shape: 'rounded' })), /<rect [^>]*rx="/);
  assert.doesNotMatch(NS.logo.svg(Object.assign({}, o, { shape: 'none' })), /<(rect|circle) [^>]*(width="160"|r="80")/);
  const looks = new Set(Array.from({ length: 30 }, (_, i) => NS.logo.svg(Object.assign({}, o, { seed: String(i) }))));
  assert.ok(looks.size > 5, 'seeds give other looks');
  const w = NS.logo.svg({ text: 'A <b>&', kind: 'wordmark', shape: 'none', colour: '#123456', seed: '1' });
  assert.ok(w.includes('A &lt;b&gt;&amp;') && !w.includes('<b>'));
  assert.match(w, /width="(\d+)" height="120"/);
  // white letters only on a colour dark enough for them; a pale colour gets dark letters
  const pale = NS.logo.svg({ text: 'P', shape: 'square', colour: '#f5f5a0', seed: '3', style: 'fill' });
  assert.match(pale, /fill="#111111"/);
});

test('copy: Gmail leaves out a picture kept inside; Outlook and Apple Mail keep it; HTML is the code', () => {
  const s = NS.model.clean(Object.assign(NS.model.sample(), { image: 'data:image/png;base64,AAAA', template: 'side' }));
  const gm = NS.copy.output('gmail', s), ol = NS.copy.output('outlook', s), ap = NS.copy.output('apple', s), code = NS.copy.output('html', s);
  assert.equal(gm.dropped, true);
  assert.ok(!gm.html.includes('data:image') && gm.html.includes('Alex Morgan'));
  assert.ok(ol.html.includes('data:image/png') && ap.html.includes('data:image/png'));
  assert.equal(ol.dropped, false);
  assert.match(ap.notes.join(' '), /Always match my default message font/);
  assert.ok(code.text.startsWith('<table') && code.text === code.html);
  assert.match(NS.copy.pictureNote(s), /Gmail does not show/);
  const web = NS.model.clean(Object.assign(NS.model.sample(), { image: 'https://northwind.example/logo.png' }));
  assert.equal(NS.copy.output('gmail', web).dropped, false);
  assert.ok(NS.copy.output('gmail', web).html.includes('https://northwind.example/logo.png'));
  assert.match(NS.copy.pictureNote(web), /northwind\.example/);
  assert.equal(NS.copy.pictureNote(NS.model.clean(NS.model.sample())), '');
});
