// Covers: tools/whitelabel/repeats.mjs, tools/whitelabel/build.mjs, tools/whitelabel/export.mjs
// Mapping artefacts: the build reports a word the rename doubled ("A code editor for your Slop Drive files." with the
// plain name Slop Drive -> Files reads "your Files files"), in any case and language, and only when the source did not
// already repeat it; export.mjs fails on one like on a leftover name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repeatCounts, newRepeats, repeatReport } from '../../tools/whitelabel/repeats.mjs';
import { phraseRules, phrases } from '../../tools/whitelabel/rename.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('counts a word that directly follows itself, in any case, across one line break', () => {
  const c = repeatCounts('Your Files files. Spara i Filer filer\nfiles\n  files, the the end; and-and no; files-files no');
  assert.equal(c.get('files files'), 2);
  assert.equal(c.get('filer filer'), 1);
  assert.equal(c.get('the the'), 1);
  assert.equal(c.has('and and'), false);
  assert.equal(repeatCounts('Ärende ärende och Ö ö').get('ärende ärende'), 1);   // letters of any language; one letter is no word
  assert.equal(repeatCounts('Ö ö').size, 0);
  assert.equal(repeatCounts('that that one had had').size, 0);                  // grammar that repeats on purpose
});

test('reports only the pairs the rename made, with the line', () => {
  const r = phraseRules([['Slop Drive', 'Files']], 'Acme');
  const src = "tagline: 'A code editor for your Slop Drive files. Nothing uploaded.',\nok: 'the the source had this'";
  const out = phrases(src, r);
  const found = newRepeats(src, out, 'shared/apps.js');
  assert.equal(found.length, 1);
  assert.equal(found[0].pair, 'files files');
  assert.equal(found[0].file, 'shared/apps.js');
  assert.match(found[0].line, /your Files files\. Nothing/);
  assert.deepEqual(newRepeats('the the', 'the the'), []);
  assert.deepEqual(newRepeats('Drive files', 'Drive files'), []);
  // a profile's own copy words it again: nothing left
  const fixed = phrases(src, phraseRules([['Slop Drive', 'Files'], ['your Slop Drive files', 'your files in Files']], 'Acme'));
  assert.deepEqual(newRepeats(src, fixed, 'shared/apps.js'), []);
  assert.match(fixed, /A code editor for your files in Files\./);
});

test('the report and the build wiring', () => {
  assert.match(repeatReport([]), /none/);
  const many = Array.from({ length: 3 }, (_, i) => ({ file: `f${i}.js`, pair: 'files files', line: 'x' }));
  const rep = repeatReport(many, 2);
  assert.match(rep, /3 made by the rename/);
  assert.match(rep, /… and 1 more/);
  const build = readFileSync(path.join(ROOT, 'tools/whitelabel/build.mjs'), 'utf8');
  assert.match(build, /newRepeats\(src, text, dest\)/);
  assert.match(build, /p\.repeatAllow/);
  const exp = readFileSync(path.join(ROOT, 'tools/whitelabel/export.mjs'), 'utf8');
  assert.match(exp, /ok: r\.found\.length === 0 && reps\.length === 0/);
});
