// The vCard converters' header rule (convert/js/core/vcf-map.js): a CSV with mixed-case and synonym headers maps to the
// right vCard fields, and the cards it makes read back through the Contacts vCard code.
// Run: node --test tests/node/vcf-map.test.mjs    (or: node tests/run.mjs vcf-map)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapHeaders, contactsFromTable, contactsToTable } from '../../convert/js/core/vcf-map.js';
import { parseCsv } from '../../convert/js/core/csv.js';
import { loadContacts } from '../contacts/contacts.node-env.mjs';

const CSV = [
  'FIRST NAME,last name,E-mail,Mobile,Company,Job Title,Street Address,web site,Notes,Department',
  'Ada,Lovelace,ADA@example.com,+44 20 7946 0000,Analytical Engines,Engineer,"12 St James\'s Sq, London",https://example.com,Met at the lab,Maths',
  'Bo,Chen,bo@example.com;bo2@example.com,,,,,,,',
  ',,,,,,,,,',
].join('\n');

test('headers are matched case-insensitively and by synonym; unknown headers are listed, not used', () => {
  const { recognised, unrecognised } = mapHeaders(parseCsv(CSV)[0]);
  const field = Object.fromEntries(recognised.map((r) => [r.header, r.field]));
  assert.deepEqual(field, {
    'FIRST NAME': 'given', 'last name': 'family', 'E-mail': 'email', Mobile: 'phone', Company: 'org', 'Job Title': 'title',
    'Street Address': 'address', 'web site': 'url', Notes: 'note',
  });
  assert.deepEqual(unrecognised, ['Department']);
});

test('separators in header names do not matter: E-mail, e_mail and E MAIL are one field', () => {
  for (const h of ['E-mail', 'e_mail', 'E MAIL', 'email']) assert.equal(mapHeaders([h]).recognised[0].field, 'email', h);
});

test('a type word in the header sets the vCard TYPE; a plain phone header has none', () => {
  const [mobile, work, plain] = mapHeaders(['Mobile', 'Work Phone', 'Phone']).columns;
  assert.deepEqual(mobile.types, ['CELL']);
  assert.deepEqual(work.types, ['WORK']);
  assert.deepEqual(plain.types, []);
});

test('the first non-empty column wins for a single-value field; blank rows are skipped', () => {
  const table = [['Name', 'Full name', 'Company'], ['Ann Lee', 'Someone else', ''], ['', '', ''], ['', 'Bo Chen', 'Acme']];
  const { contacts } = contactsFromTable(table);
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].fn, 'Ann Lee');
  assert.equal(contacts[1].fn, 'Bo Chen');
  assert.equal(contacts[1].org, 'Acme');
});

test('CSV rows become contacts with the right fields', () => {
  const { contacts } = contactsFromTable(parseCsv(CSV));
  assert.equal(contacts.length, 2);
  const ada = contacts[0];
  assert.deepEqual(ada.name, { given: 'Ada', family: 'Lovelace' });
  assert.deepEqual(ada.emails, [{ value: 'ADA@example.com', types: [] }]);
  assert.deepEqual(ada.phones, [{ value: '+44 20 7946 0000', types: ['CELL'] }]);
  assert.equal(ada.org, 'Analytical Engines');
  assert.equal(ada.title, 'Engineer');
  assert.equal(ada.adr[0].street, "12 St James's Sq, London");
  assert.equal(ada.url, 'https://example.com');
  assert.equal(ada.note, 'Met at the lab');
  assert.deepEqual(contacts[1].emails.map((e) => e.value), ['bo@example.com', 'bo2@example.com']);
});

test('a CSV made into vCard 3.0 by the Contacts writer reads back with the same name, e-mail and phone', () => {
  const SC = loadContacts();
  const { contacts } = contactsFromTable(parseCsv(CSV));
  const vcf = SC.vcard.write(contacts, '3.0');
  assert.equal(vcf.split('BEGIN:VCARD').length - 1, 2);
  const back = SC.vcard.read(vcf);
  assert.equal(back.length, 2);
  assert.equal(back[0].fn, 'Ada Lovelace');
  assert.equal(back[0].emails[0].value, 'ADA@example.com');
  assert.equal(back[0].phones[0].value, '+44 20 7946 0000');
  assert.deepEqual(back[0].phones[0].types, ['CELL']);
});

test('a read vCard exports to a table whose headers the import recognises again', () => {
  const SC = loadContacts();
  const contacts = SC.vcard.read('BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lovelace;Ada;;;\r\nFN:Ada Lovelace\r\nORG:Analytical Engines\r\nEMAIL;TYPE=WORK:ada@example.com\r\nTEL;TYPE=CELL:+44 1\r\nEND:VCARD\r\n');
  const { headers, rows } = contactsToTable(contacts);
  assert.deepEqual(rows[0].slice(0, 7), ['Ada Lovelace', 'Ada', 'Lovelace', 'Analytical Engines', '', 'ada@example.com', '+44 1']);
  const { mapping } = contactsFromTable([headers, ...rows]);
  assert.equal(mapping.unrecognised.length, 0);
  assert.equal(contactsFromTable([headers, ...rows]).contacts[0].emails[0].value, 'ada@example.com');
});
