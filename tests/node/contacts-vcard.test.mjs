// Slop Contacts: the vCard reader (2.1, 3.0, 4.0; folding, quoted-printable, UTF-8, photos skipped on import) and the
// writer (3.0 and 4.0, folded lines, escapes), with a round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContacts } from '../contacts/contacts.node-env.mjs';

const SC = loadContacts();
const one = (lines) => lines.join('\r\n') + '\r\n';
const card = (...lines) => one(['BEGIN:VCARD', ...lines, 'END:VCARD']);
const octets = (s) => new TextEncoder().encode(s).length;

test('one file holds several cards; a card with nothing in it is skipped', () => {
  const text = card('VERSION:3.0', 'FN:Ann Lee', 'EMAIL:ann@example.com') + card('VERSION:3.0', 'N:;;;;') + card('VERSION:3.0', 'FN:Bo Chen');
  const got = SC.vcard.read(text);
  assert.deepEqual(got.map((c) => c.fn), ['Ann Lee', 'Bo Chen']);
  assert.equal(got[0].emails[0].value, 'ann@example.com');
});

test('3.0: folded lines (a space or a tab continues), escaped commas, semicolons and newlines, ORG and CATEGORIES', () => {
  const text = card('VERSION:3.0', 'FN:Ann Lee', 'ORG:Acme\\; Ltd;Sales', 'NOTE:Line one\\nline two\\, with a comma',
    '  folded note part', '\tand a tab continuation', 'CATEGORIES:Friends,Work\\, Club', 'BDAY:19800229');
  const c = SC.vcard.read(text)[0];
  assert.equal(c.org, 'Acme; Ltd');
  assert.equal(c.dept, 'Sales');
  // Unfolding removes one leading white-space character: the space line keeps one space, the tab line none.
  assert.equal(c.note, 'Line one\nline two, with a comma folded note partand a tab continuation');
  assert.deepEqual(c.groups, ['Friends', 'Work, Club']);
  assert.equal(c.bday, '1980-02-29');
});

test('4.0: tel: and mailto: URIs are stripped, quoted TYPE lists are split, PREF is not a type', () => {
  const text = card('VERSION:4.0', 'FN:Cy Dane', 'N:Dane;Cy;;;', 'TEL;VALUE=uri;TYPE="work,voice";PREF=1:tel:+1-555-0100',
    'TEL;TYPE=cell:+1-555-0199', 'EMAIL;TYPE=home:mailto:cy@example.com', 'BDAY:--03-14', 'KIND:individual');
  const c = SC.vcard.read(text)[0];
  assert.deepEqual(c.phones, [{ value: '+1-555-0100', types: ['WORK'] }, { value: '+1-555-0199', types: ['CELL'] }]);
  assert.deepEqual(c.emails, [{ value: 'cy@example.com', types: ['HOME'] }]);
  assert.equal(c.bday, '--03-14');
  assert.equal(c.name.family, 'Dane');
});

test('2.1 quoted-printable UTF-8 names and a note with a soft line break decode to the characters', () => {
  const text = one(['BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;Jos=C3=A9;;;',
    'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 M=C3=BCller', 'NOTE;ENCODING=QUOTED-PRINTABLE:Line one=0D=0ALine two =3D soft=',
    'break', 'END:VCARD']);
  const c = SC.vcard.read(text)[0];
  assert.equal(c.fn, 'José Müller');
  assert.equal(c.note, 'Line one\nLine two = softbreak');
});

test('UTF-8 names pass through unchanged, with a byte-order mark and LF line ends too', () => {
  const text = '﻿' + ['BEGIN:VCARD', 'VERSION:3.0', 'FN:李 小龍', 'N:小龍;李;;;', 'EMAIL:li@example.cn', 'END:VCARD'].join('\n') + '\n';
  const c = SC.vcard.read(text)[0];
  assert.equal(c.fn, '李 小龍');
  assert.equal(c.name.given, '李');
});

test('Apple labels (itemN.X-ABLabel) become types; a custom label becomes its letters', () => {
  const text = card('VERSION:3.0', 'FN:Apple Person', 'item1.TEL:+1 555 0100', 'item1.X-ABLabel:_$!<Mobile>!$_',
    'item2.TEL:+1 555 0200', 'item2.X-ABLabel:Dad mobile');
  const c = SC.vcard.read(text)[0];
  assert.deepEqual(c.phones.map((p) => p.types), [['CELL'], ['DADMOBILE']]);
});

test('photos: kept by default, skipped when the import asks (photos: false); a link is kept as text', () => {
  const jpeg = '/9j/4AAQSkZJRgABAQ==';
  const text = card('VERSION:3.0', 'FN:Pic Person', `PHOTO;ENCODING=b;TYPE=JPEG:${jpeg}`) + card('VERSION:4.0', 'FN:Link Person', 'PHOTO;VALUE=uri:https://example.com/p.jpg');
  const kept = SC.vcard.read(text);
  assert.match(kept[0].photo, /^data:image\/jpeg;base64,/);
  assert.equal(kept[1].photo, 'https://example.com/p.jpg');
  const skipped = SC.vcard.read(text, { photos: false });
  assert.equal(skipped[0].photo, '');
  assert.equal(skipped[1].photo, '');
  assert.equal(skipped[0].fn, 'Pic Person');
});

test('3.0 writer: folded to 75 octets, escaped, and the reader gives the same contact back', () => {
  const src = SC.model.normalise({ id: 'w-1', name: { family: 'Ødegård', given: 'Ån, Ing; ' }, fn: 'Ån, Ing; Ødegård',
    org: 'Acme, Ltd', title: 'Head\\of', phones: [{ value: '+47 22 22 22 22', types: ['WORK', 'FAX'] }],
    emails: [{ value: 'an@example.no', types: ['WORK'] }], adr: [{ types: ['HOME'], street: 'Gate 1; Oslo', postal: '0150' }],
    bday: '1990-05-01', url: 'https://example.no/', note: 'A long note. '.repeat(20) + 'line\nbreak', groups: ['Team, A', 'Club'] });
  const text = SC.vcard.write([src], '3.0');
  for (const line of text.split('\r\n').filter(Boolean)) assert.ok(octets(line) <= 75, `line too long: ${line}`);
  assert.match(text, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  const back = SC.vcard.read(text)[0];
  assert.equal(back.fn, src.fn);
  assert.equal(back.org, 'Acme, Ltd');
  assert.equal(back.title, 'Head\\of');
  assert.deepEqual(back.phones, src.phones);
  assert.deepEqual(back.emails, src.emails);
  assert.equal(back.note, src.note);
  assert.deepEqual(back.groups, ['Team, A', 'Club']);
  assert.equal(back.bday, '1990-05-01');
});

test('4.0 writer: VERSION 4.0, a photo as a URI value, and the same data back', () => {
  const src = SC.model.normalise({ id: 'w-2', fn: 'Fo Four', name: { given: 'Fo', family: 'Four' },
    phones: [{ value: '+1 555 0100', types: ['CELL'] }], photo: 'https://example.com/fo.jpg' });
  const text = SC.vcard.write([src], '4.0');
  assert.match(text, /^BEGIN:VCARD\r\nVERSION:4\.0\r\n/);
  assert.match(text, /PHOTO;VALUE=uri:https:\/\/example\.com\/fo\.jpg\r\n/);
  assert.doesNotMatch(text, /ENCODING=b/);
  const back = SC.vcard.read(text)[0];
  assert.equal(back.fn, 'Fo Four');
  assert.deepEqual(back.phones, [{ value: '+1 555 0100', types: ['CELL'] }]);
  assert.equal(back.photo, 'https://example.com/fo.jpg');
});

test('the default writer is 3.0 and several contacts concatenate into one valid file', () => {
  const a = SC.model.normalise({ fn: 'One' }), b = SC.model.normalise({ fn: 'Two' });
  const text = SC.vcard.write([a, b]);
  assert.match(text, /VERSION:3\.0/);
  assert.equal(text.match(/BEGIN:VCARD/g).length, 2);
  assert.deepEqual(SC.vcard.read(text).map((c) => c.fn), ['One', 'Two']);
});
