// File convert: spreadsheets to CSV and JSON, JSON to XLSX, ODS to XLSX (no browser). The runners are the catalog's own
// (convert/js/core/data-more.js) on the shared reader and writer; sheet-json.js is checked on its own too.
// Run: node --test tests/node/convert-sheets.test.mjs
// Covers: convert/js/core/sheet-json.js, convert/js/core/data-more.js
import './tables-dom-shim.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globalI18n } from './ui-i18n-env.mjs';
import { sheetRecords, tablesFromJson, workbookOf, headerNames } from '../../convert/js/core/sheet-json.js';
import { DATA_MORE } from '../../convert/js/core/data-more.js';
import { writeZip } from '../../shared/office/zip.js';
import { read } from '../../shared/sheets/read.js';

globalI18n('en');   // the reader's messages, as a page has them (shared/i18n/ui/en/sheets.js)

const conv = (id) => DATA_MORE.find((c) => c.id === id);
const item = (blob, name, kind) => ({ name, kind, file: Object.assign(blob, { name }) });
const run = (id, blob, name, kind, o = {}) => conv(id).run([item(blob, name, kind)], o);
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"';
const cell = (v) => (typeof v === 'number' ? `<table:table-cell office:value-type="float" office:value="${v}"><text:p>${v}</text:p></table:table-cell>` : `<table:table-cell office:value-type="string"><text:p>${v}</text:p></table:table-cell>`);
const ods = (sheets) => writeZip([{ path: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' }, { path: 'content.xml',
  data: `<office:document-content ${NS}><office:body><office:spreadsheet>${sheets.map(([name, rows]) => `<table:table table:name="${name}">${rows.map((r) => `<table:table-row>${r.map(cell).join('')}</table:table-row>`).join('')}</table:table>`).join('')}</office:spreadsheet></office:body></office:document-content>` }]);

test('sheet records: header keys, typed values, ISO dates, blanks null, trailing empty rows dropped, names made unique', () => {
  const sheet = { rows: [['Name', 'Price', null, 'Price'], ['Goo', 4, new Date(Date.UTC(2026, 9, 24)), true], [null, null, null, null]] };
  assert.deepEqual(sheetRecords(sheet), [{ Name: 'Goo', Price: 4, 'Column 3': '2026-10-24', 'Price 2': true }]);
  assert.deepEqual(sheetRecords(sheet, { header: false }), [['Name', 'Price', null, 'Price'], ['Goo', 4, '2026-10-24', true]]);
  assert.deepEqual(headerNames(['a', 'a', ''], 3), ['a', 'a 2', 'Column 3']);
  assert.equal(sheetRecords({ rows: [[new Date(Date.UTC(2026, 0, 2, 13, 5))]] }, { header: false })[0][0], '2026-01-02T13:05:00Z');
});

test('JSON as tables: records (union of keys), arrays, plain values, one object, an object of arrays', () => {
  assert.deepEqual(tablesFromJson([{ a: 1, b: { c: 2 } }, { a: 3, d: null }])[0].rows, [['a', 'b', 'd'], [1, '{"c":2}', null], [3, null, null]]);
  assert.deepEqual(tablesFromJson([[1, 2], [3]])[0], { name: 'Sheet1', rows: [[1, 2], [3]], header: false });
  assert.deepEqual(tablesFromJson(['x', 2])[0].rows, [['Value'], ['x'], [2]]);
  assert.deepEqual(tablesFromJson({ k: 'v', n: 1 })[0].rows, [['Key', 'Value'], ['k', 'v'], ['n', 1]]);
  assert.deepEqual(tablesFromJson({ People: [{ n: 'A' }], Places: [{ p: 'B' }] }).map((t) => t.name), ['People', 'Places']);
  assert.equal(workbookOf(tablesFromJson([{ a: 1 }]))[0].bold.size, 1);
});

test('JSON to XLSX and back to JSON and CSV, through the shared reader and writer', async () => {
  const json = new Blob([JSON.stringify([{ Name: 'Goo', Price: 4.5, Note: 'a, "b"' }, { Name: 'Åsa', Price: 7 }])]);
  const [x] = await run('json-to-xlsx', json, 'prices.json', 'json');
  assert.equal(x.name, 'prices.xlsx');
  const back = JSON.parse(await (await run('xlsx-to-json', x.blob, 'prices.xlsx', 'xlsx'))[0].blob.text());
  assert.deepEqual(back, [{ Name: 'Goo', Price: 4.5, Note: 'a, "b"' }, { Name: 'Åsa', Price: 7, Note: null }]);
  const [csv] = await run('xlsx-to-csv', x.blob, 'prices.xlsx', 'xlsx', { delimiter: ';', bom: false });
  assert.equal(await csv.blob.text(), 'Name;Price;Note\r\nGoo;4.5;"a, ""b"""\r\nÅsa;7;\r\n');
});

test('ODS: the first sheet or every sheet, to CSV (one file each) and JSON (a key per sheet), and ODS to XLSX', async () => {
  const book = await ods([['Budget', [['Item', 'Cost'], ['Rent', 900]]], ['Two', [['x'], [3]]]]);
  const first = await run('xlsx-to-csv', book, 'Budget.ods', 'ods');
  assert.equal(first.length, 1);
  assert.equal((await first[0].blob.text()).replace(/^﻿/, ''), 'Item,Cost\r\nRent,900\r\n');
  const all = await run('xlsx-to-csv', book, 'Budget.ods', 'ods', { sheet: 'all', delimiter: 'tab' });
  assert.deepEqual(all.map((o) => o.name), ['Budget - Budget.csv', 'Budget - Two.csv']);
  assert.equal(JSON.stringify(JSON.parse(await (await run('xlsx-to-json', book, 'Budget.ods', 'ods', { sheet: 'all' }))[0].blob.text())), '{"Budget":[{"Item":"Rent","Cost":900}],"Two":[{"x":3}]}');
  const [x] = await run('ods-to-xlsx', book, 'Budget.ods', 'ods');
  const doc = await read(Object.assign(x.blob, { name: 'Budget.xlsx' }));
  assert.deepEqual([doc.format, doc.sheets.map((s) => s.name), doc.sheets[0].rows[1]], ['xlsx', ['Budget', 'Two'], ['Rent', 900]]);
});

test('an old .xls file is refused with what to do', async () => {
  const ole = new Blob([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])]);
  await assert.rejects(run('xlsx-to-csv', ole, 'old.xls', 'xlsx'), /save it as \.xlsx/);
});
