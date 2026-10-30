// QR SLOP: the payload builders (qr/js/payload.js) run as the browser runs them, in one vm context.
// Covers Wi-Fi escaping and password rules, vCard, geo, calendar event, mailto, SMS, tel, URL and the byte limit.
// Run: node tests/run.mjs qr-payload
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'qr', 'js', 'payload.js'), 'utf8'), ctx, { filename: 'payload.js' });
const P = ctx.QRPayload;
const build = (type, v) => P.build(type, v);
const text = (type, v) => {
  const r = build(type, v);
  assert.ok(r.ok, `expected ok, got: ${r.error}`);
  return r.text;
};
const error = (type, v) => {
  const r = build(type, v);
  assert.equal(r.ok, false, `expected an error, got: ${r.text}`);
  return r.error;
};

test('lists every type with a label and a builder', () => {
  assert.deepEqual([...P.TYPES], ['text', 'url', 'email', 'phone', 'sms', 'wifi', 'vcard', 'geo', 'event']);
  for (const t of P.TYPES) assert.ok(P.LABELS[t], `${t} has a label`);
});

test('plain text is encoded exactly as typed, and empty text is refused', () => {
  assert.equal(text('text', { text: 'Hello, world' }), 'Hello, world');
  assert.equal(error('text', { text: '   ' }), 'Enter some text.');
});

test('a URL without a scheme gets https://, and a spaced one is refused', () => {
  assert.equal(text('url', { url: 'example.com/path' }), 'https://example.com/path');
  assert.equal(text('url', { url: 'http://example.com' }), 'http://example.com');
  assert.equal(error('url', { url: 'two words' }), 'A web address cannot contain spaces.');
  assert.equal(error('url', { url: '' }), 'Enter a web address.');
});

test('mailto carries the subject and body, percent-encoded, with CRLF line breaks', () => {
  assert.equal(text('email', { to: 'a@b.co' }), 'mailto:a@b.co');
  assert.equal(text('email', { to: 'a@b.co', subject: 'Hi & bye', body: 'Line 1\nLine 2' }),
    'mailto:a@b.co?subject=Hi%20%26%20bye&body=Line%201%0D%0ALine%202');
  assert.equal(error('email', { to: 'not-an-address' }), 'Enter an email address to send to.');
});

test('tel and sms keep a leading + and drop other punctuation', () => {
  assert.equal(text('phone', { number: '+1 (555) 010-0100' }), 'tel:+15550100100');
  assert.equal(text('sms', { number: '+44 20 7946 0000', message: 'On my way' }), 'sms:+442079460000?body=On%20my%20way');
  assert.equal(text('sms', { number: '555 0100' }), 'sms:5550100');
  assert.match(error('phone', { number: '+1 5+5' }), /optional leading \+/);
  assert.equal(error('phone', { number: '12' }), 'Enter a complete phone number.');
});

test('Wi-Fi: WPA, WEP and open networks, with the fields in order', () => {
  assert.equal(text('wifi', { ssid: 'Home', security: 'WPA', password: 'correct horse', hidden: false }),
    'WIFI:T:WPA;S:Home;P:correct horse;H:false;;');
  assert.equal(text('wifi', { ssid: 'Guest', security: 'nopass', hidden: true }), 'WIFI:T:nopass;S:Guest;H:true;;');
  assert.equal(text('wifi', { ssid: 'Old', security: 'WEP', password: 'abcde', hidden: false }), 'WIFI:T:WEP;S:Old;P:abcde;H:false;;');
});

test('Wi-Fi escapes backslash, semicolon, comma, colon and double quote in the name and the password', () => {
  assert.equal(P.wifiEsc('a\\b;c,d:e"f'), 'a\\\\b\\;c\\,d\\:e\\"f');
  assert.equal(text('wifi', { ssid: 'Cafe;1,2:"x"', security: 'WPA', password: 'pa\\ss;word,1:"' }),
    'WIFI:T:WPA;S:Cafe\\;1\\,2\\:\\"x\\";P:pa\\\\ss\\;word\\,1\\:\\";H:false;;');
});

test('Wi-Fi password rules: WPA 8 to 63, WEP 5 or 13 characters or 10 or 26 hex digits, required unless open', () => {
  assert.equal(error('wifi', { ssid: 'X', security: 'WPA', password: 'short' }), 'A WPA password is 8 to 63 characters.');
  assert.equal(error('wifi', { ssid: 'X', security: 'WPA', password: '' }), 'Enter the password, or choose no password.');
  assert.equal(error('wifi', { ssid: 'X', security: 'WEP', password: 'abcdef' }), 'A WEP key is 5 or 13 characters, or 10 or 26 hex digits.');
  assert.equal(text('wifi', { ssid: 'X', security: 'WEP', password: '0123456789' }), 'WIFI:T:WEP;S:X;P:0123456789;H:false;;');
  assert.equal(error('wifi', { ssid: '', security: 'nopass' }), 'Enter the network name.');
  assert.equal(error('wifi', { ssid: 'x'.repeat(33), security: 'nopass' }), 'A network name is at most 32 bytes.');
});

test('vCard 3.0: name, organisation, phone, email, URL and address, with escaped values', () => {
  const v = text('vcard', { first: 'Ada', last: 'Lovelace', org: 'Analytical; Engines', phone: '+44 20 0000 0000',
    email: 'ada@example.com', url: 'https://example.com/ada', street: '1 Main St, Flat 2', city: 'London', postal: 'N1', country: 'UK' });
  assert.equal(v, [
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Lovelace;Ada;;;', 'FN:Ada Lovelace', 'ORG:Analytical\\; Engines',
    'TEL;TYPE=CELL:+44 20 0000 0000', 'EMAIL;TYPE=INTERNET:ada@example.com', 'URL:https://example.com/ada',
    'ADR;TYPE=WORK:;;1 Main St\\, Flat 2;London;;N1;UK', 'END:VCARD',
  ].join('\n'));
});

test('vCard with only an organisation uses it as the formatted name, and needs a name or organisation', () => {
  const v = text('vcard', { org: 'Slopographic' });
  assert.match(v, /^BEGIN:VCARD\nVERSION:3\.0\nN:;;;;\nFN:Slopographic\nORG:Slopographic\nEND:VCARD$/);
  assert.equal(error('vcard', { phone: '+1 555' }), 'Enter a name or an organisation.');
  assert.equal(error('vcard', { first: 'A', email: 'nope' }), 'The contact email needs an @ and a domain.');
});

test('geo encodes latitude and longitude with at most six decimals, and checks the ranges', () => {
  assert.equal(text('geo', { lat: '48.858400123', lng: '2.2945' }), 'geo:48.8584,2.2945');
  assert.equal(text('geo', { lat: '-33.5', lng: '151.200000' }), 'geo:-33.5,151.2');
  assert.equal(text('geo', { lat: '0', lng: '0' }), 'geo:0,0');
  assert.equal(error('geo', { lat: '91', lng: '0' }), 'Latitude is between -90 and 90.');
  assert.equal(error('geo', { lat: '0', lng: '181' }), 'Longitude is between -180 and 180.');
  assert.equal(error('geo', { lat: '', lng: '1' }), 'Enter both latitude and longitude.');
});

test('calendar event: a VEVENT with start, end, title and location', () => {
  const v = text('event', { title: 'Team, sync', location: 'Room 4', start: '2026-03-14T09:30', end: '2026-03-14T10:15' });
  assert.equal(v, [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Slopographic//QR SLOP//EN', 'BEGIN:VEVENT',
    'SUMMARY:Team\\, sync', 'DTSTART:20260314T093000', 'DTEND:20260314T101500', 'LOCATION:Room 4', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\n'));
  assert.match(text('event', { title: 'Solo', start: '2026-01-02T00:00' }), /DTSTART:20260102T000000\nEND:VEVENT/);
});

test('calendar event: needs a title and a start, and refuses an end before the start', () => {
  assert.equal(error('event', { start: '2026-01-01T10:00' }), 'Enter a title.');
  assert.equal(error('event', { title: 'X' }), 'Enter the start date and time.');
  assert.equal(error('event', { title: 'X', start: '2026-01-01T10:00', end: '2026-01-01T09:00' }), 'The event ends before it starts.');
  assert.equal(error('event', { title: 'X', start: '2026-01-01T10:00', end: 'soon' }), 'The end date and time is not valid.');
});

test('the byte limit is checked with UTF-8 lengths, and an unknown type is refused', () => {
  assert.equal(P.byteLength('é'), 2);
  assert.equal(P.byteLength('€'), 3);
  assert.equal(P.byteLength('😀'), 4);
  assert.equal(error('text', { text: 'x'.repeat(P.MAX_BYTES + 1) }), 'That is too long for one QR code (2953 bytes at most).');
  assert.equal(text('text', { text: 'x'.repeat(P.MAX_BYTES) }).length, P.MAX_BYTES);
  assert.equal(error('crypto', {}), 'Choose a kind of code.');
});

test('vCard: a job title is written as TITLE after the organisation, and is escaped like the rest', () => {
  const v = text('vcard', { first: 'Ada', last: 'Lovelace', org: 'Analytical Engines', title: 'Countess; Analyst' });
  assert.ok(v.includes('\nORG:Analytical Engines\nTITLE:Countess\\; Analyst\n'), v);
  assert.equal(text('vcard', { first: 'Ada', org: 'X' }).includes('TITLE'), false, 'no title line when there is none');
});
