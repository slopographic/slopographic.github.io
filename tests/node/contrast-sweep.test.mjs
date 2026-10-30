// The contrast sweep (tests/a11y/sweep-*.test.html) opens every app page of the registry (shared/apps.js) exactly once, so a
// new app is checked for readable text in every theme from its first commit. The homepage ('', not an app) is swept too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const registry = readFileSync(path.join(ROOT, 'shared/apps.js'), 'utf8');
const apps = [...registry.matchAll(/\bA\('[^']*', '[a-z]+', '[^']*', '([^']*)'/g)].map((m) => m[1]).filter((p) => !p.startsWith('#'));
const SITE_PAGES = [''];   // swept pages that are not apps: the homepage
const dir = path.join(ROOT, 'tests/a11y');
const pages = readdirSync(dir).filter((f) => /^sweep-\d+\.test\.html$/.test(f));
const swept = pages.flatMap((f) => {
  const m = /SlopSweep\.define\(\[([^\]]*)\]/.exec(readFileSync(path.join(dir, f), 'utf8'));
  return m ? [...m[1].matchAll(/'\.\.\/\.\.\/([^']*)'/g)].map((x) => x[1]) : [];
});

test('the registry lists the app pages', () => {
  assert.ok(apps.length > 40, `found ${apps.length}`);
});
test('every app page is in the contrast sweep once', () => {
  assert.deepEqual(apps.filter((a) => !swept.includes(a)), [], 'add the missing apps to a tests/a11y/sweep-*.test.html page');
  assert.deepEqual(swept.filter((a, i) => swept.indexOf(a) !== i), [], 'an app is swept twice');
  assert.deepEqual(swept.filter((a) => !apps.includes(a) && !SITE_PAGES.includes(a)), [], 'a swept page is not in shared/apps.js');
});
test('the homepage is in the contrast sweep', () => {
  for (const p of SITE_PAGES) assert.ok(swept.includes(p), `sweep ${p || 'the homepage'} on a tests/a11y/sweep-*.test.html page`);
});
