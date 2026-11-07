// The site frame of content pages (tools/seo/landing.mjs shell, siteTop, siteFoot; tools/seo/write.mjs siteChrome):
// generated pages and hand-made pages with markers get the same head tags, header and footer.
// Covers: tools/seo/landing.mjs, tools/seo/write.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = await import(pathToFileURL(path.join(ROOT, 'tools/seo/landing.mjs')).href);
const W = await import(pathToFileURL(path.join(ROOT, 'tools/seo/write.mjs')).href);

test('a generated page has the site stylesheet, the theme and consent scripts, the header, the footer and the shell', () => {
  const html = L.shell('<h1>Hi</h1>');
  for (const t of L.SITE_HEAD) assert.ok(html.includes(t), t);
  assert.ok(html.includes(L.siteTop()) && html.includes(L.siteFoot()));
  assert.match(html, /<main class="l-doc">\n<h1>Hi<\/h1>\n<\/main>/);
  assert.match(html, /<script src="\/shell\/shell\.js"><\/script>/);
  assert.doesNotMatch(html, /<style>/);
});

test('a hand-made page gets the same frame between its markers; a page without markers is unchanged', () => {
  const page = '<head><!-- site:head -->old<!-- /site:head --></head><body><!-- site:top --><!-- /site:top -->x<!-- site:foot -->y<!-- /site:foot --></body>';
  const out = W.siteChrome(page);
  assert.ok(out.includes(L.siteTop()) && out.includes(L.siteFoot()) && out.includes(L.SITE_HEAD[0]));
  assert.ok(!out.includes('old'));
  assert.equal(W.siteChrome(out), out);   // written again, it stays the same
  assert.equal(W.siteChrome('<p>plain</p>'), '<p>plain</p>');
});

test('the nav links the hub, all apps, the comparisons, How it works and Settings, and the footer links the public source', () => {
  assert.deepEqual([...L.siteTop().matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ['/', '/', '/all-tools/', '/compare/', '/best/', '/how-it-works/', '/settings/']);
  assert.match(L.siteFoot(), /https:\/\/github\.com\/slopographic\/apps/);
});
