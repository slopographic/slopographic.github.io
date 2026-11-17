// Slop Contacts: the CSV parser (quotes, doubled quotes, line breaks in quotes, the delimiter), the column guess for the
// Google, Outlook and plain layouts, and the mapping of rows to contacts (several e-mail and phone columns, the address
// join, groups, notes), with a round trip through the plain export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContacts } from '../contacts/contacts.node-env.mjs';

const SC = loadContacts();
const mapped = (text, targets) => { const p = SC.csvMap.parse(text); return SC.csvMap.contactsFrom(p.rows, targets || SC.csvMap.guess(p.headers)); };

test('parser: quoted commas, doubled quotes and line breaks inside quotes; blank rows dropped', () => {
  const rows = SC.csv.parseCsv('a,b,c\r\n"x, y","say ""hi""","line 1\nline 2"\r\n\r\n,,\r\n', ',');
  assert.equal(rows.length, 2, 'the header and the quoted row; the blank and empty rows are dropped');
  assert.deepEqual(rows[1], ['x, y', 'say "hi"', 'line 1\nline 2']);
});

test('the delimiter is the one most common in the header: comma, semicolon or tab', () => {
  assert.equal(SC.csv.sniffDelim('Name;E-mail;Phone\r\nA;b;c'), ';');
  assert.equal(SC.csv.sniffDelim('Name\tE-mail\nA\tb'), '\t');
  assert.equal(SC.csv.sniffDelim('Name,E-mail\nA,b'), ',');
});

test('the column guess reads Google, Outlook and plain headers', () => {
  const g = (h) => SC.csvMap.guessOne(h);
  assert.deepEqual(['Given Name', 'Family Name', 'Name', 'Name Prefix'].map(g), ['given', 'family', 'name', 'ignore']);
  assert.deepEqual(['E-mail 1 - Value', 'E-mail 1 - Type', 'Phone 2 - Value', 'Phone 2 - Label'].map(g), ['email', 'ignore', 'phone', 'ignore']);
  assert.deepEqual(['Organization 1 - Name', 'Organization 1 - Title', 'Organization 1 - Department', 'Job Title', 'Title'].map(g),
    ['org', 'title', 'ignore', 'title', 'ignore']);
  assert.deepEqual(['Business Phone', 'Mobile Phone', 'E-mail Address', 'E-mail 2 Address', 'Business Street', 'Home City'].map(g),
    ['phone', 'phone', 'email', 'email', 'address', 'address']);
  assert.deepEqual(['Labels', 'Group Membership', 'Categories', 'Notes', 'Birthday', 'Website 1 - Value', 'Web Page', 'Pipeline'].map(g),
    ['groups', 'groups', 'groups', 'note', 'bday', 'url', 'url', 'ignore']);
});

test('Google rows: names, typed phones and e-mails, labels as groups without the system group, quoted commas', () => {
  const csv = 'Name,Given Name,Family Name,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value,Organization 1 - Name,Labels,Notes\r\n'
    + '"Lee, Ann",Ann,Lee,Home,ann@example.com,Mobile,"+44 7700 900123",Acme,"* myContacts ::: Friends",Hi\r\n';
  const [c] = mapped(csv);
  assert.equal(c.fn, 'Lee, Ann');
  assert.equal(c.name.given, 'Ann');
  assert.equal(c.name.family, 'Lee');
  assert.deepEqual(c.emails.map((e) => e.value), ['ann@example.com']);
  assert.deepEqual(c.phones.map((p) => p.value), ['+44 7700 900123']);
  assert.equal(c.org, 'Acme');
  assert.deepEqual(c.groups, ['Friends']);
  assert.equal(c.note, 'Hi');
});

test('several e-mail and phone columns each add a value; address columns join into one line; empty rows are dropped', () => {
  const csv = 'Full name,E-mail,E-mail 2,Phone,Phone 2,Street,City,Notes\r\n'
    + 'Bo Chen,bo@a.com,bo@b.com,555 0100,555 0200,1 Main St,Springfield,"line one\nline two"\r\n'
    + ',,,,,,,\r\n'
    + 'Only Notes,,,,,,,ignored text\r\n';
  const got = mapped(csv);
  assert.equal(got.length, 2);
  const [bo] = got;
  assert.equal(bo.fn, 'Bo Chen');
  assert.deepEqual(bo.emails.map((e) => e.value), ['bo@a.com', 'bo@b.com']);
  assert.deepEqual(bo.phones.map((p) => p.value), ['555 0100', '555 0200']);
  assert.equal(bo.adr[0].street, '1 Main St, Springfield');
  assert.equal(bo.note, 'line one\nline two');
});

test('a column can be set to ignore, and an e-mail typed in a mailto link is cleaned', () => {
  const csv = 'Name,E-mail,Secret\r\nCy,mailto:cy@example.com,hide me\r\n';
  const targets = ['name', 'email', 'ignore'];
  const [c] = mapped(csv, targets);
  assert.equal(c.emails[0].value, 'cy@example.com');
  assert.equal(JSON.stringify(c).includes('hide me'), false);
});

test('an Outlook birthday (M/D/YYYY) reads as ISO; ISO and --MM-DD are kept', () => {
  const [a] = mapped('Name,Birthday\r\nAnn,03/07/1985\r\n');
  assert.equal(a.bday, '1985-03-07');
  const [b] = mapped('Name,Birthday\r\nBo,--03-14\r\n');
  assert.equal(b.bday, '--03-14');
});

test('the plain export reads back through the column mapping with the same names, e-mails, phones and groups', () => {
  const src = [
    SC.model.normalise({ id: 'r-1', fn: 'Rt One', name: { given: 'Rt', family: 'One' }, org: 'Acme', title: 'CTO',
      emails: [{ value: 'one@example.com', types: [] }, { value: 'uno@example.es', types: [] }],
      phones: [{ value: '+44 20 7946 0000', types: [] }], groups: ['Friends', 'Work'], bday: '1980-01-02', note: 'Hi, there\nBye' }),
    SC.model.normalise({ id: 'r-2', fn: 'Rt Two', phones: [{ value: '+1 555 0100', types: [] }] }),
  ];
  const text = SC.csv.genericCsv(src);
  assert.equal(text.charCodeAt(0), 0xfeff, 'the file starts with a byte-order mark');
  const back = mapped(text);
  assert.equal(back.length, 2);
  assert.equal(back[0].fn, 'Rt One');
  assert.deepEqual(back[0].emails.map((e) => e.value), ['one@example.com', 'uno@example.es']);
  assert.deepEqual(back[0].phones.map((p) => p.value), ['+44 20 7946 0000']);
  assert.deepEqual(back[0].groups, ['Friends', 'Work']);
  assert.equal(back[0].bday, '1980-01-02');
  assert.equal(back[0].note, 'Hi, there\nBye');
  assert.equal(back[0].org, 'Acme');
  assert.equal(back[0].title, 'CTO');
});

test('the XLSX rows: a bold header, one row per contact, several values joined with semicolons', () => {
  const sheet = SC.csv.sheetOf([SC.model.normalise({ fn: 'Sh One', emails: [{ value: 'a@x.io', types: [] }, { value: 'b@x.io', types: [] }], stage: 'customer' })]);
  assert.equal(sheet.name, 'Contacts');
  assert.equal(sheet.rows[0][0], 'Name');
  assert.equal(sheet.rows[1][0], 'Sh One');
  assert.equal(sheet.rows[1][3], 'a@x.io; b@x.io');
  assert.equal(sheet.rows[1][9], 'Customer');
  assert.equal(sheet.rows[1][7], null);
  assert.equal([...sheet.bold].length, sheet.rows[0].length);
});
