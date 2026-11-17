// Static upgrade rules for every IndexedDB open in the app code (see storage/HANDOFF.md):
//  - every indexedDB.open has an explicit version (a literal, or a constant set in the same file);
//  - every open has an onupgradeneeded;
//  - a file whose version is above 1 reads e.oldVersion (its upgrade is a migration, not just a create);
//  - SlopData has an upgrade step for every version up to DB_VERSION;
//  - nothing deletes an object store, and whole-database deletes happen only in the listed erase paths.
// Run: node tests/run.mjs storage
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './storage-env.mjs';

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'tests', '.git']);
const SKIP_TOP = new Set(['storage']); // the docs folder at the site root (not shared/storage, which is code)
// Generic openers: the version comes from the caller (backup restore), and they never create or migrate data.
// shared/cache/regen.js opens the caches with no version on purpose: it only empties stores that already exist, and a
// fixed version would fail with VersionError on a database the app has already upgraded (and clear nothing).
// shared/storage/storage.js lists the databases this site has and counts their records: it opens them with no version and
// aborts the open if one is missing, so it never creates or upgrades anything.
const GENERIC_OPEN = new Set(['shared/backup/core.js', 'shared/backup/central-idb.js', 'shared/cache/regen.js', 'shared/storage/storage.js', 'shared/db/db.js']);
// Whole-database deletes that are explicit user or test actions on a database the app owns.
const ERASE_OK = new Set(['shared/data/store.js', 'gallery/js/core/db.js', 'shared/backup/core.js']);

async function sources(dir = ROOT, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!e.name.startsWith('.') && !SKIP_DIRS.has(e.name) && !(dir === ROOT && SKIP_TOP.has(e.name))) await sources(path.join(dir, e.name), out); continue; }
    if (/\.(m?js|html)$/.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

/** The argument list of the call that starts at index `open` (just after "indexedDB.open("), split at top-level commas. */
function argsAt(text, open) {
  let depth = 0, cur = '', out = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') { if (depth === 0) { out.push(cur.trim()); return out.filter(Boolean); } depth--; }
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  return out;
}

/** The integer a name is set to in this file (const X = 2), or the literal itself. */
function versionOf(arg, text) {
  if (/^\d+$/.test(arg)) return Number(arg);
  const m = new RegExp(`\\b${arg}\\s*=\\s*(\\d+)\\b`).exec(text);
  return m ? Number(m[1]) : null;
}

test('every indexedDB.open names an explicit version and has an onupgradeneeded', async () => {
  const problems = [];
  let opens = 0;
  for (const f of await sources()) {
    const text = await readFile(f, 'utf8');
    const name = rel(f);
    if (GENERIC_OPEN.has(name)) continue;
    for (const m of text.matchAll(/indexedDB\.open\(/g)) {
      opens++;
      const args = argsAt(text, m.index + m[0].length);
      if (args.length < 2) { problems.push(`${name}: indexedDB.open without a version`); continue; }
      const v = versionOf(args[1], text);
      if (v === null) problems.push(`${name}: version "${args[1]}" is not a literal or a constant in this file`);
      if (v > 1 && !/oldVersion/.test(text)) {
        problems.push(`${name}: version ${v} needs a migration that reads oldVersion`);
      }
      if (!/onupgradeneeded/.test(text)) problems.push(`${name}: indexedDB.open without onupgradeneeded`);
    }
  }
  assert.ok(opens >= 15, `expected to find the app databases, found ${opens}`);
  assert.deepEqual(problems, []);
});

test('SlopData has an upgrade step for every version up to DB_VERSION', async () => {
  const text = await readFile(path.join(ROOT, 'shared/data/store.js'), 'utf8');
  const version = Number(/const DB_VERSION = (\d+);/.exec(text)[1]);
  const steps = /const UPGRADES = \{([^}]*)\}/.exec(text)[1].split(',').map((s) => Number(s.split(':')[0].trim()));
  for (let v = 1; v <= version; v++) assert.ok(steps.includes(v), `no upgrade step for SlopData version ${v}`);
});

test('no code deletes an object store; whole-database deletes only in the listed erase paths', async () => {
  const problems = [];
  for (const f of await sources()) {
    const text = await readFile(f, 'utf8');
    const name = rel(f);
    if (/deleteObjectStore\(/.test(text)) problems.push(`${name}: deletes an object store`);
    if (/deleteDatabase\(/.test(text) && !ERASE_OK.has(name)) problems.push(`${name}: deletes a database outside the erase paths`);
  }
  assert.deepEqual(problems, []);
});
