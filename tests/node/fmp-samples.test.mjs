// Covers: shared/fmp/fmp.js
// Covers: shared/fmp/reader.js
// Covers: shared/fmp/sectors.js
// Covers: shared/fmp/values.js
// Real FileMaker files (the test data of the fmptools project: fp3, fp5, fp7 and fmp12 folders). They are not in this
// repository (their origin is unclear), so this test runs only when FMP_SAMPLES names the folder that holds them:
//   FMP_SAMPLES=/path/to/test/data node --test tests/node/fmp-samples.test.mjs
// It checks every file: detect, open, tables and columns, the pages of rows (width, no damage), the CSV and JSON, and that
// the shuffled and unshuffled copies of a file read alike. The numbers in EXPECTED are what this reader found (they are
// plausible: record counts of known tables); they guard against changes, they are not a second opinion.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadFmp, plain } from './fmp-fixture.mjs';

const DIR = process.env.FMP_SAMPLES;
if (!DIR || !existsSync(DIR)) {
  console.log('fmp-samples: skipped (set FMP_SAMPLES to the folder that holds the fp3, fp5, fp7 and fmp12 sample folders)');
  test('real FileMaker files', { skip: 'FMP_SAMPLES is not set' }, () => {});
} else {
  const F = loadFmp();
  const EXPECTED = {
    'fp3/000613-kth.fp3': [['000613-kth', 391, 41]], 'fp3/BD.fp3': [['BD', 56, 38]], 'fp3/CAKUNITS.FP3': [['CAKUNITS', 1351, 12]],
    'fp3/UM.fp3': [['UM', 4, 38]], 'fp3/VA.fp3': [['VA', 154, 38]], 'fp3/calendars.fp3': [['calendars', 116, 9]],
    'fp3/government.FP3': [['government', 2, 11]], 'fp3/governmenttypes.FP3': [['governmenttypes', 2, 3]],
    'fp5/CAKUNITS.FP5': [['CAKUNITS', 1351, 12]], 'fp5/Catalogue.fp5': [['Catalogue', 6586, 8]],
    'fp7/Dynamic_Fields.fp7': [['Field_Names', 10, 2], ['Cluster_Names', 3, 2], ['Field_Cluster_Join', 9, 4], ['Transactions', 1, 2], ['Field_Values', 1, 5]],
    'fp7/OpenWaiverDayForm.fp7': [['OpenWaiverDayForm', 0, 0]],
    'fp7/Standards.fp7': [['People', 0, 13], ['Events', 0, 3], ['Schedule', 0, 3], ['Startup', 0, 0]],
    'fp7/data.fp7': [['Orders', 4, 7], ['Products', 10, 8], ['Order_lines', 24, 7]], 'fp7/interface.fp7': [['Menu', 0, 5]],
    'fmp12/Charts.fmp12': [['Untitled', 1, 1], ['US Population', 22, 2], ['Demo', 1, 5], ['Congress', 540, 29], ['Grades', 67, 3], ['US Coasters', 250, 11], ['NW Customers', 89, 2], ['NW Line Items', 2156, 27], ['NW Salespeople', 9, 3], ['NW SalespersonCustomers', 464, 3]],
    'fmp12/FMburgh_2012_11_07_Database.fmp12': [['Basic', 0, 2], ['Comics_Normalized', 327, 6], ['Comics_Muddled', 326, 6], ['Orders_Schema', 17911, 9], ['Orders_Script', 189, 10], ['Comics_Entry', 3, 8]],
    'fmp12/PortableCode39-2.fmp12': [['Data', 1, 3]], 'fmp12/Standards.fmp12': [['Startup', 0, 0], ['Defaults', 0, 7]],
  };
  /** The "unshuffled" copies have their sectors in chain order but the old ids in their links (and, for two of them,
   *  sectors cut short or missing), so the links cannot be followed: they are read in file order. */
  const IDENTICAL_TWINS = ['fp3/000613-kth', 'fp3/BD', 'fp3/calendars', 'fp3/government', 'fp3/governmenttypes', 'fmp12/Standards'];
  const KINDS = ['fp3', 'fp5', 'fp7', 'fmp12'];
  const files = KINDS.flatMap((k) => readdirSync(path.join(DIR, k)).filter((f) => !/\.zip$/i.test(f)).sort().map((f) => k + '/' + f));
  const read = (rel) => new Uint8Array(readFileSync(path.join(DIR, rel)));
  const twinOf = (rel) => /-unshuffled/.test(rel);
  const openRel = (rel, bytes = read(rel)) => F.open(bytes, { name: path.basename(rel).replace('-unshuffled', ''), order: twinOf(rel) && !rel.startsWith('fmp12') ? 'file' : undefined });

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
  const dumpOf = async (db) => JSON.stringify(plain(await Promise.all(db.tables.map(async (t) => ({ t, rows: await db.rows(t.id, 0, t.rowCount) })))));

  describe('every sample file', () => {
    for (const rel of files) {
      test(rel, async () => {
        const bytes = read(rel);
        assert.equal((F.detect(bytes.subarray(0, 4096), path.basename(rel)) || {}).kind, rel.split('/')[0], 'detect');
        let db;
        try { db = await openRel(rel, bytes); } catch (e) { assert.equal(e.code, 'corrupt', rel + ' ' + e); return; } // a truncated "unshuffled" copy
        assert.ok(db.tables.length >= 1, 'tables');
        assert.equal(db.warnings, 0, 'sectors that could not be read');
        for (const t of db.tables) {
          assert.ok(t.name && typeof t.name === 'string', 'table name');
          assert.ok(Number.isInteger(t.rowCount) && t.rowCount >= 0);
          for (const c of t.columns) assert.ok(c.name && !/[\u0000-\u001F]/.test(c.name), 'column name ' + JSON.stringify(c.name));
          const all = plain(await db.rows(t.id, 0, t.rowCount + 5));
          assert.equal(all.length, t.rowCount);
          for (const r of all) {
            assert.equal(r.length, t.columns.length, 'width');
            for (const v of r) assert.ok(typeof v === 'string' && !/[�\u0000]/.test(v), 'value ' + JSON.stringify(v));
          }
          const got = [];
          for (let from = 0; from < t.rowCount; from += 41) got.push(...plain(await db.rows(t.id, from, 41)));
          assert.deepEqual(got, all, 'paging of ' + t.name);
          if (t.rowCount) {
            assert.deepEqual(plain(await db.rows(t.id, t.rowCount - 1, 3)), all.slice(-1), 'last row');
            assert.equal((await db.rows(t.id, 0, 1))[0].some((v) => v !== ''), true, 'first row has a value');
          }
          const csv = parseCsv(new TextDecoder().decode(await (await db.csv(t.id)).arrayBuffer()).slice(1));
          assert.equal(csv.length, t.rowCount + 1, 'csv rows of ' + t.name);
          assert.ok(csv.every((r) => r.length === Math.max(1, t.columns.length)), 'csv width'); // no columns: one empty cell per line
          if (t.columns.length) assert.deepEqual(csv.slice(1), all, 'csv equals rows');
          assert.equal(JSON.parse(await (await db.json(t.id)).text()).length, t.rowCount, 'json');
        }
        // a form with no fields, and a fragment (28 of 880 sectors) that has no column definitions, have no columns
        if (!['fp7/OpenWaiverDayForm.fp7', 'fp5/CAKUNITS-unshuffled.FP5'].includes(rel)) assert.ok(db.tables.some((t) => t.columns.length), 'some table has columns');
        if (!twinOf(rel)) assert.deepEqual(plain(db.tables.map((t) => [t.name, t.rowCount, t.columns.length])), EXPECTED[rel], 'tables');
        db.close();
      });
    }
  });

  describe('shuffled and unshuffled copies', () => {
    for (const rel of files.filter(twinOf)) {
      const base = rel.replace('-unshuffled', '');
      test(rel + ' against ' + path.basename(base), async () => {
        const a = await openRel(base);
        let b;
        try { b = await openRel(rel); } catch (e) { assert.equal(e.code, 'corrupt'); return; }
        const key = rel.replace(/-unshuffled.*$/, '');
        if (IDENTICAL_TWINS.includes(key)) assert.equal(await dumpOf(b), await dumpOf(a), 'identical tables, columns and rows');
        else assert.deepEqual(plain(b.tables.map((t) => t.name).filter((n) => a.tables.some((x) => x.name === n))), plain(b.tables.map((t) => t.name)), 'the same table names (the copy is cut short)');
      });
    }
  });

  describe('damaged copies of the samples', () => {
    test('truncated and byte-flipped copies never hang or throw: a database, or an error with a code', async () => {
      const codes = ['not-filemaker', 'encrypted', 'unsupported', 'corrupt', 'too-large'];
      let seed = 987654;
      const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF; return seed % n; };
      for (const rel of ['fp3/government.FP3', 'fp3/calendars.fp3', 'fp5/CAKUNITS.FP5', 'fp7/data.fp7', 'fmp12/PortableCode39-2.fmp12', 'fmp12/Standards.fmp12']) {
        const good = read(rel);
        for (let k = 0; k < 25; k++) {
          const bytes = Uint8Array.from(good);
          for (let j = 0; j < 1 + rnd(60); j++) bytes[rnd(bytes.length)] = rnd(256);
          try {
            const db = await F.open(k % 5 === 0 ? bytes.subarray(0, rnd(bytes.length)) : bytes, { name: rel });
            for (const t of db.tables) { await db.rows(t.id, 0, 20); await db.rows(t.id, Math.floor(t.rowCount / 2), 20); }
          } catch (e) { assert.ok(codes.includes(e.code), rel + ': ' + e + '\n' + e.stack); }
        }
      }
    });
    test('a zip of other files is not FileMaker', async () => {
      const zip = path.join(DIR, 'fp7', 'FP7 files.zip');
      if (existsSync(zip)) await assert.rejects(() => F.open(new Uint8Array(readFileSync(zip))), (e) => e.code === 'not-filemaker');
    });
  });
}
