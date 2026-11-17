// The offline build lists (shared/offline/manifest.js): every listed file is on disk, and every script and stylesheet an
// app's page loads is listed, left out on purpose (drop) or marked data-offline="strip". A split that adds a script to a
// page without listing it fails here before the offline build does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APPS = createRequire(import.meta.url)(path.join(ROOT, 'shared/offline/manifest.js'));
const built = Object.values(APPS).filter((a) => a.offline !== false);

test('there are shared offline builds, each with an entry page and a file list', () => {
  assert.ok(built.length >= 2);
  for (const a of built) { assert.ok(existsSync(path.join(ROOT, a.entry)), a.entry); assert.ok(Array.isArray(a.files) && a.files.length, a.id); }
});

for (const a of built) {
  test(`${a.id}: every listed file is on disk`, () => {
    for (const f of [...a.files, ...(a.scripts || []), ...(a.binary || [])].filter((x) => typeof x === 'string')) assert.ok(existsSync(path.join(ROOT, f)), f);
  });
  test(`${a.id}: every local script and stylesheet of ${a.entry} is listed, dropped, or stripped`, () => {
    const html = readFileSync(path.join(ROOT, a.entry), 'utf8'), dir = path.posix.dirname(a.entry);
    const listed = new Set([...a.files, ...(a.scripts || [])].filter((x) => typeof x === 'string')), drop = new Set(a.drop || []);
    for (const m of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
      const tag = m[0], ref = (tag.match(/\b(?:src|href)="([^"#?]+)"/) || [])[1];
      if (!ref || /^(https?:|\/\/|data:)/.test(ref) || /data-offline="strip"/.test(tag)) continue;
      if (/^<link/i.test(tag) && !/rel="stylesheet"/.test(tag)) continue;
      const file = ref.startsWith('/') ? ref.slice(1) : path.posix.normalize(path.posix.join(dir, ref));
      assert.ok(listed.has(file) || drop.has(file), `${a.entry} loads ${file}, which the offline list lacks`);
    }
  });
}

// Safari cannot for-await over a stream, which pdf.js's getTextContent does: the offline Slop PDF runs the fill first.
// Covers: pdf/js/io/build.js, shared/compat/stream.js
test('pdf: the offline file carries shared/compat/stream.js and runs it before pdf.js', () => {
  const f = APPS.pdf.files, s = f.indexOf('shared/compat/stream.js');
  assert.ok(s > -1 && s < f.indexOf('vendor/pdfjs/pdf.min.js'));
  const boot = readFileSync(path.join(ROOT, 'pdf/js/io/build.js'), 'utf8');
  assert.ok(boot.indexOf("run(S['shared/compat/stream.js']") > -1 && boot.indexOf("run(S['shared/compat/stream.js']") < boot.indexOf("S['vendor/pdfjs/pdf.min.js']"));
});

// An offline copy fetches no tables (shared/i18n/i18n.js skips loading in a copy), so every English table the page
// asks for must be in the file: the chrome's (strings.js: menu.file, ...) and every ui part of UI_PARTS, not only
// ui/en.js. The PDF copy once showed menu.file and its kin as raw keys. UI_PARTS grows as parts are added.
test('every offline entry with the shared English tables carries strings.js and every ui part, after i18n.js', async () => {
  const { uiPartsIndex } = await import('../../tools/i18n/tables.mjs');
  const ui = uiPartsIndex();
  const parts = ui && ui.langs.includes('en') ? ui.parts.map((p) => `shared/i18n/ui/en/${p}.js`) : [];
  const withUi = built.filter((a) => a.files.includes('shared/i18n/ui/en.js'));
  assert.ok(withUi.some((a) => a.id === 'pdf'), 'the PDF copy carries the shared tables');
  for (const a of withUi) {
    for (const list of [a.files, a.scripts].filter(Boolean)) {
      for (const f of ['shared/i18n/strings.js', ...parts]) {
        assert.ok(list.includes(f), `${a.id} lacks ${f}`);
        assert.ok(list.indexOf(f) > list.indexOf('shared/i18n/i18n.js'), `${a.id}: ${f} runs before i18n.js`);
      }
    }
  }
});
