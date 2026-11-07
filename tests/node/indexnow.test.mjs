// IndexNow (tools/seo/indexnow.mjs, .github/workflows/indexnow.yml): which URLs a push sends, the key file, and that only
// production pushes ping.
// Covers: tools/seo/indexnow.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const N = await import(pathToFileURL(path.join(ROOT, 'tools/seo/indexnow.mjs')).href);
const MAP = ['https://slopographic.com/', 'https://slopographic.com/pdf/', 'https://slopographic.com/slopisolate/white-background/'];

test('a changed page is sent as its URL; scripts, styles and pages not in the sitemap are not', () => {
  assert.equal(N.urlOf('index.html'), 'https://slopographic.com/');
  assert.equal(N.urlOf('slopisolate/white-background/index.html'), 'https://slopographic.com/slopisolate/white-background/');
  assert.equal(N.urlOf('pdf/js/ui/drop.js'), null);
  assert.deepEqual(N.urlsFor(['pdf/index.html', 'pdf/js/a.js', 'tests/x/index.html', 'pdf/index.html'], MAP), ['https://slopographic.com/pdf/']);
});
test('a change to the tool, the workflow or the key sends every URL in the sitemap', () => {
  for (const f of ['tools/seo/indexnow.mjs', '.github/workflows/indexnow.yml', `${N.KEY}.txt`]) assert.deepEqual(N.urlsFor([f], MAP), MAP);
});
test('the key file at the site root holds the key; the workflow runs on main only, after Pages publishes', () => {
  assert.match(N.KEY, /^[0-9a-f]{32}$/);
  assert.ok(existsSync(path.join(ROOT, `${N.KEY}.txt`)));
  assert.equal(readFileSync(path.join(ROOT, `${N.KEY}.txt`), 'utf8'), N.KEY);
  const wf = readFileSync(path.join(ROOT, '.github/workflows/indexnow.yml'), 'utf8');
  assert.match(wf, /branches: \[main\]/);
  assert.doesNotMatch(wf, /branches:[^\n]*testing/);
  assert.match(wf, /node tools\/seo\/indexnow\.mjs/);
});
