// This site's own SEO copy: every page's description is 120 to 160 characters (the homepage, each app page and about
// page, each landing page and hub). Repo-only (tests/repo-only.json): a white-label build renames the copy, so its
// lengths move, and its SEO writer only warns about them (SEO_LENIENT, tools/seo/write.mjs). That each description is
// there and unique is checked in every build: tests/seo/seo.test.mjs, tests/seo/seo.landing.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { loadRegistry, isPage, ROOT } from '../../tools/seo/site.mjs';

const DESC_MIN = 120, DESC_MAX = 160;
const apps = await loadRegistry(), pageApps = apps.filter(isPage);
const descOf = (h) => (h.match(/<meta\s+name="description"\s+content="([^"]*)"/) || [])[1];
const files = (list) => list.filter((f) => existsSync(path.join(ROOT, f)));
const check = (f, decode) => {
  const d = descOf(readFileSync(path.join(ROOT, f), 'utf8'));
  assert.ok(d, `${f}: no meta description`);
  const n = (decode ? d.replace(/&amp;/g, '&').replace(/&quot;/g, '"') : d).length;
  assert.ok(n >= DESC_MIN && n <= DESC_MAX, `${f}: description is ${n} characters`);
};

test('each page has a description of 120 to 160 characters: the homepage, the app pages, the about pages', () => {
  const list = ['index.html', ...pageApps.map((a) => `${a.path}index.html`)].concat(files(pageApps.map((a) => `${a.path}about/index.html`)));
  assert.ok(list.length > pageApps.length);
  for (const f of list) check(f, false);
});

test('each landing page and hub has a description of 120 to 160 characters', () => {
  const list = files([...pageApps.map((a) => `apps/${a.id}/index.html`), 'slop-365/index.html', 'creative-slop-pro/index.html', 'compare/index.html']);
  assert.ok(list.length >= pageApps.length);
  for (const f of list) check(f, true);
});
