// Every app page is painted only once it is built, with the browser's own render blocking and no loading screen: right
// after the theme script, <link rel="expect" href="#slop-built" blocking="render"> holds the first paint until the parser
// reaches <i id="slop-built" hidden>, the last thing in <body>, after every script. Browsers without rel=expect ignore it.
// Content pages (their HTML is complete as sent) do not need it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const THEME = /<script src="[^"]*shared\/theme\/theme\.js"[^>]*data-app="([^"]+)"[^>]*><\/script>\n?/;
const EXPECT = '<link rel="expect" href="#slop-built" blocking="render">';
const MARK = '<i id="slop-built" hidden></i>';
const CONTENT = new Set(['site', 'home', 'settings']);
const REDIRECTS = new Set(['cutout/index.html', 'slopedit/index.html']);   // old names that only send you on

async function pages() {
  const out = [];
  for (const d of await readdir(ROOT, { withFileTypes: true })) {
    if (!d.isDirectory() || /^(\.|node_modules|tests|vendor)/.test(d.name)) continue;
    const subs = (await readdir(path.join(ROOT, d.name), { withFileTypes: true })).filter((x) => x.isDirectory()).map((x) => `${d.name}/${x.name}/index.html`);
    for (const rel of [`${d.name}/index.html`, ...subs]) {
      const html = await readFile(path.join(ROOT, rel), 'utf8').catch(() => null);
      const m = html && html.match(THEME);
      if (m) out.push({ rel, html, m });
    }
  }
  return out;
}

test('every app page holds its first paint until it is built: the expect link after the theme script, the mark last in <body>', async () => {
  const apps = (await pages()).filter((p) => !CONTENT.has(p.m[1]) && !REDIRECTS.has(p.rel));
  assert.ok(apps.length > 50, 'the app pages are found: ' + apps.length);
  for (const { rel, html, m } of apps) {
    assert.ok(html.slice(m.index + m[0].length).trimStart().startsWith(EXPECT), rel + ': the expect link right after the theme script');
    assert.equal(html.split(EXPECT).length, 2, rel + ': one expect link');
    const end = html.lastIndexOf('</body>');
    assert.ok(html.slice(0, end).trimEnd().endsWith(MARK), rel + ': the mark is the last thing in <body>');
    assert.equal(html.split('id="slop-built"').length, 2, rel + ': one mark');
  }
});

test('content pages, the homepage and Settings do not block their paint', async () => {
  for (const { rel, html } of (await pages()).filter((p) => CONTENT.has(p.m[1]))) assert.ok(!html.includes('slop-built'), rel);
});
