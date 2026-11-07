// QR SLOP: the model (qr/js/parse.js, templates.js, state.js) run as the browser runs them, in one vm context.
// Covers the raw-text round trip, the gallery's templates, the settings record and the logo's error correction.
// Run: node tests/run.mjs qr-model
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = ['qr/js/payload.js', 'qr/js/parse.js', 'qr/js/templates.js', 'qr/js/matrix.js', 'qr/js/render.js', 'qr/js/state.js'];
const ctx = { console, atob: globalThis.atob, btoa: globalThis.btoa, TextEncoder: globalThis.TextEncoder };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'vendor', 'bwip-js', 'bwip-js-min.js'), 'utf8'), ctx, { filename: 'bwip-js-min.js' });
for (const f of FILES) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { QRPayload: P, QRParse: Pa, QRTemplates: T, QRState: St } = ctx;
const plain = (o) => JSON.parse(JSON.stringify(o));

const SAMPLES = {
  'plain text': ['text', 'Hello, QR'],
  'URL': ['url', 'https://example.com/path?x=1'],
  'mailto with subject and CRLF body': ['email', 'mailto:a@b.co?subject=Hi%20%26%20bye&body=Line%201%0D%0ALine%202'],
  'tel': ['phone', 'tel:+15550100100'],
  'sms with a message': ['sms', 'sms:+442079460000?body=On%20my%20way'],
  'Wi-Fi with escapes': ['wifi', 'WIFI:T:WPA;S:Cafe\\;1;P:pass\\,word\\:1;H:false;;'],
  'open Wi-Fi': ['wifi', 'WIFI:T:nopass;S:Guest;H:false;;'],
  'geo': ['geo', 'geo:48.8584,2.2945'],
};

test('a raw text round-trips: parse, then build from the form, gives the same text back', () => {
  for (const [name, [type, text]] of Object.entries(SAMPLES)) {
    const p = Pa.parse(text);
    assert.equal(p.type, type, `${name}: kind`);
    const r = P.build(p.type, p.values);
    assert.ok(r.ok, `${name}: ${r.error}`);
    assert.equal(r.text, text, `${name}: text`);
  }
});

test('a vCard and a calendar event built by the app parse back and build to the same text', () => {
  const card = P.build('vcard', { first: 'Ada', last: 'Lovelace', org: 'Analytical; Engines', title: 'Countess', phone: '+44 20 7946 0000', email: 'ada@example.com', url: 'https://example.com', street: '1 Main St, Flat 2', city: 'London', postal: 'N1', country: 'UK' }).text;
  const v = Pa.parse(card);
  assert.equal(v.type, 'vcard');
  assert.equal(v.values.org, 'Analytical; Engines');
  assert.equal(v.values.street, '1 Main St, Flat 2');
  assert.equal(v.values.title, 'Countess');
  assert.equal(P.build('vcard', v.values).text, card);

  const ev = P.build('event', { title: 'Launch, part 1', location: 'Hall', start: '2026-03-14T09:30', end: '2026-03-14T10:30' }).text;
  const e = Pa.parse(ev);
  assert.equal(e.type, 'event');
  assert.deepEqual(plain({ title: e.values.title, start: e.values.start, end: e.values.end }), { title: 'Launch, part 1', start: '2026-03-14T09:30', end: '2026-03-14T10:30' });
  assert.equal(P.build('event', e.values).text, ev);
});

test('text that matches no kind is a plain text form, and a URL with a space is text too', () => {
  assert.deepEqual(plain(Pa.parse('just words')), { type: 'text', values: { text: 'just words' } });
  assert.equal(Pa.parse('https://a.example c').type, 'text');
  assert.equal(Pa.fromIcs('20260314T093000'), '2026-03-14T09:30');
  assert.equal(Pa.fromIcs('nope'), '');
});

test('editing the raw text fills the form, keeps the text as typed, and a form edit takes over again', () => {
  St.reset();
  St.setRaw('WIFI:T:WPA;S:Lab;P:secretpass;H:false;;');
  assert.equal(St.S.kind, 'wifi');
  assert.equal(St.vals().ssid, 'Lab');
  assert.equal(St.encodedText().text, 'WIFI:T:WPA;S:Lab;P:secretpass;H:false;;');
  St.setValue('ssid', 'Other');
  assert.equal(St.S.raw, null);
  assert.equal(St.encodedText().text, 'WIFI:T:WPA;S:Other;P:secretpass;H:false;;');
});

test('an empty raw text is refused, and changing the kind drops the raw override', () => {
  St.reset();
  St.setRaw('');
  assert.equal(St.encodedText().ok, false);
  St.setRaw('https://example.com');
  St.setKind('text');
  assert.equal(St.S.raw, null);
  assert.equal(St.S.kind, 'text');
});

test('every template builds as it is, has a name and a description, and the gallery has the forms asked for', () => {
  const list = T.list();
  const ids = list.map((t) => t.id);
  for (const want of ['wifi-card', 'contact-card', 'email-signature', 'link-in-bio', 'instagram', 'x-profile', 'telegram', 'whatsapp', 'restaurant-menu', 'event', 'review-link']) {
    assert.ok(ids.includes(want), `missing template ${want}`);
  }
  assert.equal(new Set(ids).size, ids.length, 'template ids are unique');
  for (const t of list) {
    assert.ok(t.name && t.desc, `${t.id} has a name and a description`);
    const c = T.copy(t.id);
    const r = P.build(c.type, c.values);
    assert.ok(r.ok, `${t.id}: ${r.error}`);
    if (c.type === 'url') assert.match(r.text, /^https:\/\//, `${t.id} uses a public https link`);
  }
});

test('a template fills the kind and its values, and the gallery copy is independent of the form', () => {
  assert.equal(St.applyTemplate('whatsapp'), true);
  assert.equal(St.S.kind, 'url');
  assert.ok(St.encodedText().text.startsWith('https://wa.me/15550100100?text=Hi'));
  St.vals().url = 'https://example.org/changed';
  assert.equal(T.copy('whatsapp').values.url.startsWith('https://wa.me/'), true);
  assert.equal(St.applyTemplate('nope'), false);
});

test('the settings record round-trips through JSON, and a bad record keeps the defaults', () => {
  St.reset();
  St.applyTemplate('contact-card');
  Object.assign(St.S.style, { fg: '#112233', fg2: '#445566', gradient: true, shape: 'round', transparent: true, quiet: 2, size: 900, ec: 'Q' });
  St.S.logo.href = 'data:image/png;base64,iVBORw0KGgo=';
  St.S.logo.name = 'mark.png';
  St.S.logo.frac = 0.5;
  St.setLabel('Desk card');
  const snap = St.snapshot();
  assert.equal(snap.logo.frac, 0.5, 'the snapshot keeps the value the person set');
  const saved = JSON.parse(JSON.stringify(snap));
  St.reset();
  assert.equal(St.S.kind, 'text');
  assert.equal(St.restore(saved), true);
  assert.deepEqual(plain(St.snapshot()), { ...saved, logo: { ...saved.logo, frac: 0.22 } }, 'the restored record has the logo width capped at 22%');
  assert.equal(St.S.label, 'Desk card');
  assert.equal(St.S.style.shape, 'round');

  assert.equal(St.restore({ app: 'other' }), false);
  assert.equal(St.restore(null), false);
  St.restore({ app: 'qr', kind: 'nope', style: { fg: 'red', shape: 'weird', ec: 'Z', size: 'x' }, logo: { href: 'javascript:alert(1)', frac: 9 }, values: 'bad', raw: 42 });
  assert.equal(St.S.kind, 'text');
  assert.equal(St.S.style.fg, '#000000');
  assert.equal(St.S.style.shape, 'square');
  assert.equal(St.S.style.ec, 'M');
  assert.equal(St.S.style.size, 512);
  assert.equal(St.S.logo.href, null);
  assert.equal(St.S.logo.frac, 0.22);
  assert.equal(St.S.raw, null);
});

test('a logo forces error correction H, and without one the chosen level is used', () => {
  St.reset();
  St.setValue('text', 'Logo check');
  St.S.style.ec = 'L';
  assert.equal(St.renderOpts().ec, 'L');
  St.S.logo.href = 'data:image/png;base64,iVBORw0KGgo=';
  St.S.logo.frac = 0.2;
  const ro = St.renderOpts();
  assert.equal(ro.ec, 'H');
  assert.equal(ro.logo.href, St.S.logo.href);
  assert.equal(ro.logo.frac, 0.2);
  assert.equal(St.S.style.ec, 'L', 'the chosen level is kept for when the logo goes');
});
