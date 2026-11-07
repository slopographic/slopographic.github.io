// File convert: CSV to Markdown and HTML tables, the CSV separator, JSON Lines, text encodings, ASS and SBV subtitles,
// JSON to CSV flattened, EPUB link paths, and the routes the new conversions make (no browser).
// Run: node --test tests/node/convert-text-more.test.mjs
// Covers: convert/js/core/table-out.js, convert/js/core/jsonl.js, convert/js/core/encoding.js, convert/js/core/subs-more.js
// Covers: convert/js/core/csv.js, convert/js/core/epub.js, convert/js/core/text-more.js, convert/js/core/chain-flags.js, convert/js/core/detect.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsToMarkdown, rowsToHtml, isNumberCell } from '../../convert/js/core/table-out.js';
import { parseCsv, jsonToCsv, flattenRecord } from '../../convert/js/core/csv.js';
import { jsonlToJson, jsonToJsonl } from '../../convert/js/core/jsonl.js';
import { toUtf8, sniffEncoding } from '../../convert/js/core/encoding.js';
import { parseAss, parseSbv, subsTo, assText } from '../../convert/js/core/subs-more.js';
import { resolveHref } from '../../convert/js/core/epub.js';
import { CONVERSIONS } from '../../convert/js/core/catalog.js';
import { routeTo } from '../../convert/js/core/chain.js';
import { detectKind } from '../../convert/js/core/detect.js';

const conv = (id) => CONVERSIONS.find((c) => c.id === id);
const file = (name, body) => ({ name, kind: detectKind(name, '', null), file: new Blob([body]) });

test('CSV to a Markdown table: header, escaped pipes, line breaks, numbers right-aligned', () => {
  const rows = parseCsv('Name,Price,Note\n"Tea, green",4.50,"a|b"\nCoffee,"1,200","two\nlines"\n');
  assert.equal(rowsToMarkdown(rows), '| Name | Price | Note |\n| --- | ---: | --- |\n| Tea, green | 4.50 | a\\|b |\n| Coffee | 1,200 | two<br>lines |\n');
  assert.equal(rowsToMarkdown([['1', '2'], ['3']], { header: false, align: 'none' }), '| Column 1 | Column 2 |\n| --- | --- |\n| 1 | 2 |\n| 3 |  |\n');
  assert.ok(isNumberCell('-1 234,5') && isNumberCell('12%') && !isNumberCell('12 apples'));
  assert.throws(() => rowsToMarkdown([['', '']]), /empty/);
});

test('CSV to an HTML table: escaped cells, a thead, a page or only the table', () => {
  const html = rowsToHtml([['A', 'B'], ['<b>x</b>', 'Å & ö']], { title: 'Prices' });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>Prices<\/title>/);
  assert.match(html, /<thead>\n {4}<tr><th>A<\/th><th>B<\/th><\/tr>/);
  assert.match(html, /<td>&lt;b&gt;x&lt;\/b&gt;<\/td><td>Å &amp; ö<\/td>/);
  assert.equal(rowsToHtml([['1']], { header: false, standalone: false }), '<table>\n  <tbody>\n    <tr><td>1</td></tr>\n  </tbody>\n</table>\n');
});

test('the CSV separator: semicolons in, tabs out as .tsv; quoting kept where needed', async () => {
  const [o] = await conv('csv-separator').run([file('prices.csv', 'a;b\n"x;y";2\n')], { delimiter: 'auto', to: '\t' });
  assert.equal(o.name, 'prices.tsv');
  assert.equal(await o.blob.text(), 'a\tb\nx;y\t2\n');
  const [c] = await conv('csv-separator').run([file('t.csv', 'a\tb\n1,5\t2\n')], { to: ';', eol: 'crlf' });
  assert.deepEqual([c.name, await c.blob.text()], ['t-semicolon.csv', 'a;b\r\n1,5;2\r\n']);
  assert.equal(detectKind('data.tsv', '', null), 'csv');
});

test('JSON Lines both ways; a bad line is named', () => {
  assert.equal(jsonlToJson('{"a":1}\n\n{"a":2,"b":[1]}\r\n'), '[\n  {\n    "a": 1\n  },\n  {\n    "a": 2,\n    "b": [\n      1\n    ]\n  }\n]\n');
  assert.equal(jsonlToJson('1\n"two"', { indent: '0' }), '[1,"two"]');
  assert.throws(() => jsonlToJson('{"a":1}\n{"a":}\n'), /Line 2 is not valid JSON: the mistake is at column 6/);
  assert.throws(() => jsonlToJson('\n \n'), /empty/);
  assert.deepEqual(jsonToJsonl('[{"a": 1}, [2, 3], "x"]'), { text: '{"a":1}\n[2,3]\n"x"\n', count: 3 });
  assert.deepEqual(jsonToJsonl('{"k": {"n": null}}'), { text: '{"k":{"n":null}}\n', count: 1 });
});

test('text encodings: Windows-1252, UTF-16 with and without a mark, Shift_JIS, a UTF-8 mark on request', () => {
  const cp1252 = Uint8Array.from([0x53, 0xe5, 0x20, 0x80, 0x35, 0x20, 0x93, 0x68, 0x69, 0x94]);   // Så €5 “hi”
  assert.equal(sniffEncoding(cp1252), 'windows-1252');
  assert.deepEqual(toUtf8(cp1252), { text: 'Så €5 “hi”', from: 'windows-1252' });
  const le = Uint8Array.from([0xff, 0xfe, 0x48, 0, 0xe9, 0]);
  assert.deepEqual(toUtf8(le), { text: 'Hé', from: 'utf-16le' });
  assert.equal(sniffEncoding(Uint8Array.from([0, 0x41, 0, 0x42, 0, 0x43, 0, 0x44])), 'utf-16be');
  assert.equal(toUtf8(Uint8Array.from([0x82, 0xa0]), { from: 'shift_jis' }).text, 'あ');
  assert.equal(toUtf8(new TextEncoder().encode('ok'), { bom: true }).text, '\uFEFFok');
  assert.equal(sniffEncoding(new TextEncoder().encode('Ünïcödé')), 'utf-8');
});

const ASS = `[Script Info]
Title: test

[V4+ Styles]
Format: Name, Fontname
Style: Default,Arial

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.00,0:00:06.50,Default,,0,0,0,,Second, with a comma
Comment: 0,0:00:00.00,0:00:09.00,Default,,0,0,0,,not shown
Dialogue: 0,0:00:01.25,0:00:03.00,Default,,0,0,0,,{\\an8\\pos(10,20)}Hello {\\i1}there{\\i0}\\Nnew line
Dialogue: 0,0:01:02.03,0:01:04.00,Default,,0,0,0,,{\\b1}Bold never closed
`;
test('ASS and SSA: Dialogue lines in time order, italics and bold kept, positions and comments dropped', () => {
  const cues = parseAss(ASS);
  assert.deepEqual(cues.map((c) => [c.start, c.end, c.text]), [[1250, 3000, 'Hello <i>there</i>\nnew line'], [5000, 6500, 'Second, with a comma'], [62030, 64000, '<b>Bold never closed</b>']]);
  assert.equal(subsTo(cues, 'srt').split('\n').slice(0, 4).join('\n'), '1\n00:00:01,250 --> 00:00:03,000\nHello <i>there</i>\nnew line');
  assert.match(subsTo(cues, 'vtt', { shift: 1 }), /^WEBVTT\n\n00:00:02\.250 --> 00:00:04\.000\n/);
  assert.equal(assText('a\\hb{\\u1}c'), 'a b<u>c</u>');
  assert.throws(() => parseAss('[Events]\nFormat: Start, End, Text\n'), /No subtitles found/);
});

test('SBV (YouTube) to SRT', () => {
  const cues = parseSbv('0:00:00.599,0:00:04.160\n>> Hello\nworld\n\n0:01:02.5,0:01:03.000\nTwo\n');
  assert.deepEqual(cues.map((c) => [c.start, c.end, c.text]), [[599, 4160, '>> Hello\nworld'], [62500, 63000, 'Two']]);
  assert.equal(subsTo(cues, 'srt'), '1\n00:00:00,599 --> 00:00:04,160\n>> Hello\nworld\n\n2\n00:01:02,500 --> 00:01:03,000\nTwo\n');
  assert.throws(() => parseSbv('nothing'), /SBV/);
});

test('JSON to CSV, flattened: nested keys become columns', () => {
  assert.deepEqual(flattenRecord({ a: { b: 1, c: { d: true } }, tags: ['x', 'y'], e: {}, n: null }), { 'a.b': 1, 'a.c.d': true, 'tags.0': 'x', 'tags.1': 'y', e: '{}', n: null });
  const json = '[{"id":1,"who":{"name":"Ann","city":"Oslo"}},{"id":2,"who":{"name":"Bo"},"tags":["a"]}]';
  assert.equal(jsonToCsv(json, { flatten: true }), 'id,who.name,who.city,tags.0\n1,Ann,Oslo,\n2,Bo,,a\n');
  assert.equal(jsonToCsv(json).split('\n')[1], '1,"{""name"":""Ann"",""city"":""Oslo""}",');
});

test('EPUB link paths are resolved from the file that links them', () => {
  assert.equal(resolveHref('OEBPS/content.opf', 'Text/ch%201.xhtml#p3'), 'OEBPS/Text/ch 1.xhtml');
  assert.equal(resolveHref('OEBPS/Text/ch1.xhtml', '../Images/a.png'), 'OEBPS/Images/a.png');
  assert.equal(resolveHref('content.opf', './ch.html'), 'ch.html');
  assert.equal(resolveHref('OEBPS/a.xhtml', '/root.png'), 'root.png');
  assert.equal(resolveHref('OEBPS/a.xhtml', 'https://example.com/x.png'), '');
});

test('the new kinds and routes: EPUB to PDF through Markdown, KML to GPX, GPX to CSV', () => {
  assert.deepEqual(['a.jsonl', 'a.ndjson', 'a.ass', 'a.ssa', 'a.sbv', 'a.gpx', 'a.kml', 'a.geojson', 'a.epub'].map((n) => detectKind(n, '', null)),
    ['jsonl', 'jsonl', 'ass', 'ass', 'sbv', 'gpx', 'kml', 'geojson', 'epub']);
  assert.equal(routeTo('epub', 'pdf'), 'epub-to-md>md-to-pdf');
  assert.equal(routeTo('kml', 'gpx'), 'kml-to-geojson>geojson-to-gpx');
  assert.equal(routeTo('gpx', 'csv'), 'gpx-to-geojson>geojson-to-csv');
  assert.equal(routeTo('html', 'docx'), 'html-to-md>md-to-docx');
  for (const id of ['csv-separator', 'text-to-utf8', 'audio-trim', 'video-trim', 'favicon-pack']) assert.equal(conv(id).chain, false, id);
  assert.equal(routeTo('mp3', 'wav'), 'to-wav');   // a cut is never a step of a found route
});
