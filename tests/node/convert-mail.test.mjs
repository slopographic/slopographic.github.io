// Convert: the mail, calendar and archive conversions (convert/js/core/mail.js) and the file detection that picks them
// (convert/js/core/detect.js). The shared readers (EmlMime, SlopIcs) run as the browser runs them, in one vm context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = async (files) => {
  // The web APIs the browser gives these scripts, which a vm context does not have.
  const ctx = { TextEncoder, TextDecoder, atob, btoa, Blob, URL };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(await readFile(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
};
// The readers mail.js looks for on the global object; the page would have them loaded already.
const ctx = await load(['shared/mail/codec.js', 'shared/mail/mime.js']);
globalThis.EmlMime = ctx.EmlMime;
const cal = await load(['shared/calendar/tz.js', 'shared/calendar/rrule.js', 'shared/calendar/ics.js']);
globalThis.SlopIcs = cal.SlopIcs;

const M = await import('../../convert/js/core/mail.js');
const D = await import('../../convert/js/core/detect.js');
const { readZip } = await import('../../shared/office/zip.js');
const enc = new TextEncoder();
const bytesOf = (s) => enc.encode(s);
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

const PLAIN = [
  'From: Ada <ada@example.com>', 'To: Grace <grace@example.com>', 'Subject: Lunch on Friday', 'Date: Mon, 6 Oct 2025 09:00:00 +0000',
  'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', 'Are we still on for Friday?', '',
].join('\r\n');

const WITH_ATTACHMENT = [
  'From: Ada <ada@example.com>', 'To: Grace <grace@example.com>', 'Subject: Report', 'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="XYZ"', '',
  '--XYZ', 'Content-Type: text/plain; charset=utf-8', '', 'See the attached notes.', '',
  '--XYZ', 'Content-Type: text/plain; name="notes.txt"', 'Content-Disposition: attachment; filename="notes.txt"',
  'Content-Transfer-Encoding: base64', '', b64('first notes'), '',
  '--XYZ', 'Content-Type: text/plain; name="notes.txt"', 'Content-Disposition: attachment; filename="notes.txt"',
  'Content-Transfer-Encoding: base64', '', b64('second notes'), '',
  '--XYZ--', '',
].join('\r\n');

test('an email to plain text: the address and date lines, a blank line, then the text body', async () => {
  const out = await M.emlToText(bytesOf(PLAIN));
  assert.match(out, /^From: Ada <ada@example\.com>\nTo: Grace <grace@example\.com>\n/);
  assert.match(out, /Subject: Lunch on Friday\n/);
  assert.match(out, /\n\nAre we still on for Friday\?\n$/);
});

// An HTML body is sanitised with DOMPurify, which needs a DOM: tests/convert/mail.test.html checks it in the browser.

test('a plain-text email goes into HTML inside a preformatted block, escaped', async () => {
  const html = await M.emlToHtml(bytesOf(PLAIN.replace('Are we still', '<Are> we still')));
  assert.match(html, /<pre>&lt;Are&gt; we still on for Friday\?/);
});

test('the attachments of a message come out as one ZIP, with duplicate names numbered', async () => {
  const blob = await M.emlAttachmentsZip(bytesOf(WITH_ATTACHMENT));
  const files = await readZip(blob);
  assert.deepEqual([...files.keys()].sort(), ['notes (2).txt', 'notes.txt']);
  assert.equal(Buffer.from(files.get('notes.txt')).toString('utf8'), 'first notes');
  assert.equal(Buffer.from(files.get('notes (2).txt')).toString('utf8'), 'second notes');
});

test('a message with no attachments says so, rather than making an empty ZIP', async () => {
  await assert.rejects(() => M.emlAttachmentsZip(bytesOf(PLAIN)), /no attachments/);
});

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:a1', 'SUMMARY:Planning, round 2', 'LOCATION:Room 4',
  'DTSTART:20251010T090000Z', 'DTEND:20251010T100000Z', 'DESCRIPTION:Bring the\\, budget', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a2', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20251225', 'DTEND;VALUE=DATE:20251226', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

test('a calendar file to CSV: one row per event, with timed and all-day events told apart', async () => {
  const csv = await M.icsToCsv(ICS);
  const rows = csv.trim().split('\n');
  assert.equal(rows[0], 'Title,Start,End,All day,Location,Notes');
  assert.equal(rows[1], '"Planning, round 2",2025-10-10T09:00:00Z,2025-10-10T10:00:00Z,no,Room 4,"Bring the, budget"');
  assert.equal(rows[2], 'Holiday,2025-12-25,2025-12-25,yes,,');
});

test('a calendar file to JSON: the events, with their times, and the warnings', async () => {
  const data = JSON.parse(await M.icsToJson(ICS));
  assert.equal(data.events.length, 2);
  assert.equal(data.events[0].title, 'Planning, round 2');
  assert.equal(data.events[0].start, Date.UTC(2025, 9, 10, 9));
  assert.equal(data.events[1].allDay, true);
  assert.equal(data.events[1].startDay, '2025-12-25');
  assert.ok(Array.isArray(data.warnings));
});

test('a file that cannot be read as a calendar gives no events, not a crash', async () => {
  const data = JSON.parse(await M.icsToJson('BEGIN:VCALENDAR\nEND:VCALENDAR\n'));
  assert.deepEqual(data.events, []);
});

test('a ZIP is unpacked into its files, and files are zipped with their names', async () => {
  const zip = await M.zipFiles([
    { name: 'a.txt', file: new Blob(['alpha']) },
    { name: 'a.txt', file: new Blob(['beta']) },
  ]);
  const entries = await M.unzipEntries(zip);
  assert.deepEqual(entries.map((e) => e.name), ['a.txt', 'a (2).txt']);
  assert.equal(await entries[1].blob.text(), 'beta');
});

test('the readers load on first use when the page has not loaded them', async () => {
  const saved = globalThis.EmlMime;
  delete globalThis.EmlMime;
  await assert.rejects(() => M.emlToText(bytesOf(PLAIN)), /document/);   // no document to load scripts into, in node
  globalThis.EmlMime = saved;
});

// Detection: the kind a file is given decides which conversions it is offered.
const head = (s) => bytesOf(s).slice(0, 512);
test('an email is detected by its name, its type, or what its header block says', () => {
  assert.equal(D.detectKind('mail.eml', '', head(PLAIN)), 'eml');
  assert.equal(D.detectKind('mail.bin', 'message/rfc822', head(PLAIN)), 'eml');
  assert.equal(D.detectKind('notes.txt', 'text/plain', head(PLAIN)), 'eml');
  assert.equal(D.detectKind('', '', head(PLAIN)), 'eml');
});

test('a calendar file, an XML file and a plain text file are each told apart', () => {
  assert.equal(D.detectKind('cal.ics', '', head(ICS)), 'ics');
  assert.equal(D.detectKind('cal.txt', '', head(ICS)), 'ics');
  assert.equal(D.detectKind('data.xml', '', head('<a/>')), 'xml');
  assert.equal(D.detectKind('data.txt', '', head('<?xml version="1.0"?><a/>')), 'xml');
  assert.equal(D.detectKind('list.csv', '', head('From,To\n1,2\n')), 'csv');
  assert.equal(D.detectKind('todo.txt', '', head('buy milk: two\n')), 'txt');
});

test('the binary kinds are told apart by their first bytes, and Office files by their extension', () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  assert.equal(D.detectKind('archive.zip', '', zip), 'zip');
  assert.equal(D.detectKind('report.docx', '', zip), 'docx');
  assert.equal(D.detectKind('deck.pptx', 'application/zip', zip), 'pptx');
  assert.equal(D.detectKind('book.epub', '', zip), 'epub');
  assert.equal(D.detectKind('favicon.ico', '', new Uint8Array([0, 0, 1, 0, 1, 0])), 'ico');
  assert.equal(D.detectKind('scan.tif', '', new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0])), 'tif');
  const avif = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0]);
  assert.equal(D.detectKind('photo.avif', '', avif), 'avif');
  const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0]);
  assert.equal(D.detectKind('clip.mp4', '', mp4), 'mp4');
});

test('every kind the detector can return has a label, so the tool can name it', () => {
  for (const k of ['eml', 'ics', 'xml', 'yaml', 'ico', 'tif', 'avif', 'heic', 'zip', 'docx', 'pptx', 'odt', 'ods', 'odp', 'epub']) {
    assert.ok(D.KIND_LABEL[k], k);
  }
});
