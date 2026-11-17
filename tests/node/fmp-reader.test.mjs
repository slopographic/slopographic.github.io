// Covers: shared/fmp/values.js
// Covers: shared/fmp/reader.js
// Covers: shared/fmp/export.js
// Covers: shared/fmp/fmp.js
// Opens small FileMaker files built in the test (tests/node/fmp-fixture.mjs) through the public API: tables and columns,
// records, missing values, repeating fields, long values, leading spaces, sparse numbers, paging across many sectors (the
// checkpoints), CSV and JSON, and files with faults (no hang, no throw, a code from the list).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadFmp, plain, buildV7, buildV3, tableV7, tableV3, ascii } from './fmp-fixture.mjs';

const F = loadFmp();
const open = (bytes, opts) => F.open(bytes, opts || {});
const range = (n) => Array.from({ length: n }, (_, i) => i);
/** Reads a Blob as text, keeping a byte order mark (Blob.text() drops it). */
const text = async (blob) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer());
/** A small CSV parser (RFC 4180) for checking what csv() wrote. */
function parseCsv(s) {
  const rows = [[]];
  let cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { rows[rows.length - 1].push(cell); cell = ''; }
    else if (c === '\r' && s[i + 1] === '\n') { i++; rows[rows.length - 1].push(cell); cell = ''; rows.push([]); }
    else cell += c;
  }
  if (cell || rows[rows.length - 1].length) rows[rows.length - 1].push(cell); else rows.pop();
  return rows;
}

const PEOPLE = [['Alice', '30', 'Paris'], ['Bob', null, 'Rome'], ['Chloé  x', '41', null], [null, null, null], ['  lead', '', '   ']];
function people(over) { return buildV7(tableV7(1, 'People', ['Name', 'Age', 'City'], PEOPLE), over); }

describe('Pro 7+ files', () => {
  test('tables, columns and rows; a missing value is an empty string; leading spaces go', async () => {
    const db = await open(people());
    assert.equal(db.format, 'fmp12'); assert.equal(db.label, 'FileMaker Pro 12+ database'); assert.equal(db.version, 'Pro 12.0');
    assert.deepEqual(plain(db.tables), [{ id: '1', name: 'People', rowCount: 4, columns: [{ name: 'Name' }, { name: 'Age' }, { name: 'City' }] }]);
    assert.deepEqual(plain(await db.rows('1', 0, 10)), [['Alice', '30', 'Paris'], ['Bob', '', 'Rome'], ['Chloé  x', '41', ''], ['lead', '', '']]);
  });
  test('table and column numbers need not be compact; the tables come in number order', async () => {
    const t3 = tableV7(3, 'Third', ['a', 'b'], [['1', '2']]);
    const t1 = tableV7(1, 'First', ['x'], [['y']]);
    const db = await open(buildV7([...t3, ...t1]));
    assert.deepEqual(plain(db.tables).map((t) => [t.id, t.name, t.rowCount]), [['1', 'First', 1], ['3', 'Third', 1]]);
    assert.deepEqual(plain(await db.rows('3', 0, 5)), [['1', '2']]);
    assert.deepEqual(plain(await db.rows('9', 0, 5)), []); // no such table
  });
  test('a repeating field is joined with the group separator; a long value is put together from its segments', async () => {
    const db = await open(buildV7(tableV7(1, 'R', ['a', 'b', 'c'], [['x', { rep: ['one', 'two', 'three'] }, { long: 'A long text in segments' }], ['y', 'z', { long: 'abc' }]])));
    assert.deepEqual(plain(await db.rows('1', 0, 5)), [['x', 'one\x1Dtwo\x1Dthree', 'A long text in segments'], ['y', 'z', 'abc']]);
  });
  test('the sectors may be anywhere in the file, and an index sector may sit at id 2', async () => {
    const rows = range(40).map((i) => ['n' + i, String(i), 'c' + i]);
    const leaves = tableV7(1, 'T', ['Name', 'Age', 'City'], rows, { maxRows: 8 });
    const shuffled = await open(buildV7(leaves, { ids: [6, 3, 5, 2, 4] }));
    const indexed = await open(buildV7(leaves, { index: true }));
    assert.deepEqual(plain(await shuffled.rows('1', 0, 100)), rows);
    assert.deepEqual(plain(await indexed.rows('1', 0, 100)), rows);
    assert.ok(shuffled.warnings === 0);
  });
});

describe('paging', () => {
  const N = 400;
  const rows = range(N).map((i) => ['name ' + i, String(i * 7), i % 5 ? 'c' + i : null]);
  const expected = rows.map((r) => r.map((v) => v || ''));
  const bytes = buildV7(tableV7(1, 'Big', ['Name', 'N', 'C'], rows, { maxRows: 9 }));
  test('every page equals the same rows read in one go, from any start, at any size', async () => {
    const db = await open(bytes);
    assert.equal(db.tables[0].rowCount, N);
    assert.deepEqual(plain(await db.rows('1', 0, N)), expected);
    for (const [from, count] of [[0, 1], [1, 1], [63, 3], [64, 64], [65, 100], [199, 2], [N - 1, 5], [N - 3, 3], [250, 150]]) {
      assert.deepEqual(plain(await db.rows('1', from, count)), expected.slice(from, from + count), from + '+' + count);
    }
  });
  test('reading forward page after page gives the whole table', async () => {
    const db = await open(bytes);
    const got = [];
    for (let from = 0; from < N; from += 37) got.push(...await db.rows('1', from, 37));
    assert.deepEqual(plain(got), expected);
  });
  test('odd arguments give an empty or a clipped page, never an error', async () => {
    const db = await open(bytes);
    assert.deepEqual(plain(await db.rows('1', N, 10)), []);
    assert.deepEqual(plain(await db.rows('1', 5, 0)), []);
    assert.deepEqual(plain(await db.rows('1', -4, 2)), expected.slice(0, 2));
    assert.deepEqual(plain(await db.rows('1', 'x', 'y')), []);
    assert.equal((await db.rows('1', 390, 1e9)).length, 10);
  });
  test('after close() there is nothing to read', async () => {
    const db = await open(bytes);
    db.close();
    assert.deepEqual(plain(await db.rows('1', 0, 5)), []);
  });
});

describe('Pro 3 to 6 files', () => {
  test('one table named after the file, columns with types, records; text is MacRoman', async () => {
    const cols = [{ name: 'Name', type: 1 }, { name: 'Count', type: 2 }, { name: 'Born', type: 3 }];
    const bytes = buildV3([tableV3(cols, [['Fr\x9Ad\x8Eric', '3', null], ['Zo\x8E', '10', '1/2/1999']])]);
    const db = await open(bytes, { name: 'My Contacts.fp5' });
    assert.equal(db.format, 'fp5'); assert.equal(db.label, 'FileMaker Pro 5-6 database');
    assert.deepEqual(plain(db.tables), [{ id: '1', name: 'My Contacts', rowCount: 2, columns: [{ name: 'Name', type: 'text' }, { name: 'Count', type: 'number' }, { name: 'Born', type: 'date' }] }]);
    const rows = plain(await db.rows('1', 0, 5));
    assert.deepEqual(rows, [['Frödéric', '3', ''], ['Zoé', '10', '1/2/1999']]);
  });
  test('a Pro 3 file says so, and a file with no name still gets a table name', async () => {
    const db = await open(buildV3([tableV3([{ name: 'A' }], [['1']])], { version: 'Pro 3.0' }));
    assert.equal(db.format, 'fp3');
    assert.equal(db.tables[0].name, 'Table 1');
    assert.deepEqual(plain(await db.rows('1', 0, 5)), [['1']]);
  });
});

describe('CSV and JSON', () => {
  const tricky = [['a,b', 'say "hi"', 'two\nlines'], ['plain', '', '日\r\n本'], ['é', '日本', '']];
  const bytes = buildV7(tableV7(1, 'Quote', ['Name', 'Name', 'Other, 3'], tricky));
  test('CSV: BOM, CRLF, quoting by RFC 4180; it parses back to the rows', async () => {
    const db = await open(bytes);
    const blob = await db.csv('1');
    assert.match(blob.type, /^text\/csv/);
    const s = await text(blob);
    assert.ok(s.startsWith('﻿Name,Name,"Other, 3"\r\n'));
    assert.deepEqual(parseCsv(s.slice(1)), [['Name', 'Name', 'Other, 3'], ...tricky]);
  });
  test('JSON: an array of objects, repeated names get a number', async () => {
    const db = await open(bytes);
    const blob = await db.json('1');
    assert.equal(blob.type, 'application/json');
    const data = JSON.parse(await text(blob));
    assert.equal(data.length, 3);
    assert.deepEqual(Object.keys(data[0]), ['Name', 'Name (2)', 'Other, 3']);
    assert.equal(data[0]['Name (2)'], 'say "hi"');
    assert.equal(data[2]['Name (2)'], '日本');
  });
  test('more rows than one page (500), and a table that does not exist', async () => {
    const rows = range(1203).map((i) => ['r' + i, String(i), 'x']);
    const db = await open(buildV7(tableV7(1, 'Many', ['a', 'b', 'c'], rows, { maxRows: 100 })));
    const csv = parseCsv((await text(await db.csv('1'))).slice(1));
    assert.equal(csv.length, 1204);
    assert.deepEqual(csv[1203], ['r1202', '1202', 'x']);
    assert.equal(JSON.parse(await text(await db.json('1'))).length, 1203);
    await assert.rejects(() => db.csv('7'), (e) => e.name === 'RangeError');
  });
  test('an empty table gives the column names only, and "[]"', async () => {
    const db = await open(buildV7(tableV7(1, 'Empty', ['p', 'q'], [])));
    assert.equal(await text(await db.csv('1')), '﻿p,q\r\n');
    assert.deepEqual(JSON.parse(await text(await db.json('1'))), []);
  });
});

describe('faults', () => {
  test('a damaged sector is skipped and counted; the others are still read', async () => {
    const leaves = tableV7(1, 'T', ['a'], range(20).map((i) => ['v' + i]), { maxRows: 5 });
    leaves[2] = [...leaves[2], 0x41]; // an unknown code at the end of one sector
    const db = await open(buildV7(leaves));
    assert.equal(db.warnings, 1);
    assert.equal(db.tables[0].rowCount, 20);
  });
  test('bytes flipped at random never hang or throw: a Db or an error with a code', async () => {
    const good = buildV7(tableV7(1, 'T', ['a', 'b'], range(60).map((i) => ['v' + i, 'w' + i]), { maxRows: 7 }));
    const old = buildV3([tableV3([{ name: 'A' }, { name: 'B' }], range(60).map((i) => ['v' + i, 'w' + i]))]);
    let seed = 12345;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF; return seed % n; };
    const codes = ['not-filemaker', 'encrypted', 'unsupported', 'corrupt', 'too-large'];
    let opened = 0;
    for (let k = 0; k < 300; k++) {
      const bytes = Uint8Array.from(k % 2 ? good : old);
      for (let j = 0; j < 1 + rnd(40); j++) bytes[rnd(bytes.length)] = rnd(256);
      try {
        const db = await open(k % 7 === 0 ? bytes.subarray(0, rnd(bytes.length)) : bytes, { name: 'x.fmp12' });
        opened++;
        for (const t of db.tables) { await db.rows(t.id, 0, 50); await db.rows(t.id, 17, 3); }
      } catch (e) { assert.ok(codes.includes(e.code), 'unexpected: ' + e + ' ' + e.stack); }
    }
    assert.ok(opened > 20, 'some of the damaged files still open: ' + opened);
  });
  test('a file of any other kind is "not-filemaker", and empty or tiny input too', async () => {
    for (const input of [new Uint8Array(0), new Uint8Array(100), Uint8Array.from(ascii('hello world, this is text')), new Uint8Array(5000).fill(0x41)]) {
      await assert.rejects(() => open(input), (e) => e.code === 'not-filemaker');
    }
    await assert.rejects(() => open(null), (e) => e.code === 'not-filemaker');
    await assert.rejects(() => open('text'), (e) => e.code === 'not-filemaker');
  });
  test('truncated files are "corrupt"; HBAMe is "encrypted"; a newer tag is "unsupported"', async () => {
    const good = people();
    for (const cut of [600, 1500, 4096, 4096 + 100, good.length - 1]) await assert.rejects(() => open(good.subarray(0, cut)), (e) => e.code === 'corrupt', 'cut at ' + cut);
    await assert.rejects(() => open(people({ hbam: 'HBAMe' })), (e) => e.code === 'encrypted');
    await assert.rejects(() => open(people({ hbam: 'HBAM8' })), (e) => e.code === 'unsupported');
  });
  test('the input can be a Blob, an ArrayBuffer or a Uint8Array (a view into a bigger buffer too)', async () => {
    const good = people();
    for (const input of [new Blob([good]), good.buffer.slice(0), good]) assert.equal((await open(input)).tables[0].rowCount, 4);
    const big = new Uint8Array(good.length + 20); big.set(good, 10);
    assert.equal((await open(big.subarray(10, 10 + good.length))).tables[0].rowCount, 4);
  });
  test('a file over MAX_BYTES is "too-large" (a Blob is not even read); other big files stay "not-filemaker"', async () => {
    assert.equal(F.MAX_BYTES, 512 * 1024 * 1024);
    const fake = (head, size) => ({ size, slice: () => ({ arrayBuffer: async () => head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength) }), arrayBuffer: async () => { throw new Error('must not be read'); } });
    await assert.rejects(() => open(fake(people().subarray(0, 4096), F.MAX_BYTES + 1)), (e) => e.code === 'too-large');
    await assert.rejects(() => open(fake(new Uint8Array(4096), F.MAX_BYTES + 1)), (e) => e.code === 'not-filemaker');
  });
});
