// Covers: shared/backup/index.js, shared/backup/core.js, shared/backup/central.js, shared/backup/ui.js, shared/backup/central-ui.js, drive/js/ui/dnd.js, drive/js/core/kinds.js, tools/whitelabel/emit.mjs, tools/whitelabel/profile.mjs
// The backup file's extension is a profile value: one pair of markers in shared/backup/index.js (SlopBackup.EXT and
// JSON_EXT) that every backup script reads, '.backup' for a plain-tone build unless the profile sets backupExt, this
// site's own '.slop' otherwise, and the text that names the extension (guides, the homepage) turned the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { validate, loadProfile, phrasePairs, profilesDir } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers } from '../../tools/whitelabel/emit.mjs';
import { phraseRules, phrases } from '../../tools/whitelabel/rename.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = profilesDir(ROOT);
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const sample = loadProfile(DIR, 'sample');

/** SlopBackup.EXT and JSON_EXT after the build's markers for a profile (index.js run in a bare window). */
function exts(p) {
  const win = { location: { href: 'https://x.example/' } };
  win.window = win;
  vm.runInNewContext(applyMarkers(read('shared/backup/index.js'), markerValues(p)), { window: win, document: { currentScript: null, createElement() {}, head: {} }, URL, location: win.location });
  return [win.SlopBackup.EXT, win.SlopBackup.JSON_EXT];
}

test('marker values: plain tone gets .backup, playful keeps the source, an explicit backupExt wins', () => {
  assert.deepEqual([markerValues(sample).backupExt, markerValues(sample).backupJson], ['.backup', '.backup.json']);
  const own = loadProfile(DIR, 'slopographic');
  assert.equal(markerValues(own).backupExt, undefined);
  assert.equal(markerValues(own).backupJson, undefined);
  const set = Object.assign({}, sample, { backupExt: '.acme' });
  assert.deepEqual([markerValues(set).backupExt, markerValues(set).backupJson], ['.acme', '.acme.json']);
});

test('the site keeps .slop; a plain build writes and reads its own extension', () => {
  assert.deepEqual(exts(loadProfile(DIR, 'slopographic')), ['.slop', '.slop-backup.json']);
  assert.deepEqual(exts(sample), ['.backup', '.backup.json']);
  assert.deepEqual(exts(Object.assign({}, sample, { backupExt: '.acme' })), ['.acme', '.acme.json']);
});

test('the backup scripts read the extension from SlopBackup, never a literal of their own', () => {
  for (const f of ['shared/backup/core.js', 'shared/backup/central.js', 'shared/backup/ui.js', 'shared/backup/central-ui.js', 'drive/js/ui/dnd.js', 'drive/js/core/kinds.js']) {
    const src = read(f).split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
    assert.doesNotMatch(src, /['"`][^'"`\n]*\.slop(?:-backup\.json)?\b(?![-.\w])/, f);
  }
  assert.match(read('shared/backup/core.js'), /window\.SlopBackup\.EXT/);
  assert.match(read('shared/backup/central.js'), /window\.SlopBackup\.JSON_EXT/);
  assert.match(read('drive/js/ui/dnd.js'), /SlopBackup\.EXT/);
});

test('validate refuses a bad backupExt', () => {
  assert.deepEqual(validate(Object.assign({}, sample, { backupExt: '.backup' })), []);
  for (const bad of ['backup', '.B', '.a', '.has space', '.way-too-long-for-a-file-ext']) {
    assert.match(validate(Object.assign({}, sample, { backupExt: bad })).join('\n'), /^backupExt:/m, bad);
  }
});

test('the text that names the extension says the profile value', () => {
  const rules = phraseRules(phrasePairs(ROOT, sample), sample.brandWord);
  assert.equal(phrases('everything as a single .slop file.', rules), 'everything as a single .backup file.');
  assert.equal(phrases('Restore a .slop backup here', rules), 'Restore a .backup file here');
  assert.equal(phrases('one .slop-backup.json file', rules), 'one .backup.json file');
  assert.equal(phrases('`x-backup-YYYY-MM-DD.slop` is a ZIP; `x-YYYY-MM-DD.slop-backup.json`', rules), '`x-backup-YYYY-MM-DD.backup` is a ZIP; `x-YYYY-MM-DD.backup.json`');
  const own = new Map(phrasePairs(ROOT, loadProfile(DIR, 'slopographic')));
  assert.equal(own.has('.slop file'), false);
});
