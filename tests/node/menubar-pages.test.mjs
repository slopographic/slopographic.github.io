// The shared menu bar on the app pages: every id a menu or tool names is on the page, every view-mode route mounts on the
// bar, and no page still styles or looks up the header classes it used before the bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS } from '../../tools/seo/lang.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP = new Set(['.git', 'node_modules', 'tests', 'apps', 'vendor', 'downloads', 'docs']);
// The language folders at the root (/sv/...) hold copies of the app pages, made from these by tools/seo: the pages are checked once.
const LANG_DIRS = new Set(LANGS.map((l) => l.code.toLowerCase()));
const walk = (dir, ext, out = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.') || (dir === ROOT && LANG_DIRS.has(name))) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, ext, out);
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
};
const rel = (f) => path.relative(ROOT, f);
const barPages = walk(ROOT, '.html').filter((f) => /menubar\/menubar\.js/.test(readFileSync(f, 'utf8')));
// Header classes the bar replaced. A page or script that still uses one of these is looking for a header that is gone.
// Notes and Paste keep nt-top and pb-top as the row that holds their tabs and status; label keeps menubar as the bar's host.
const OLD = ['em-top', 'hx-top', 'sc-top', 'st-top', 'rp-top', 'ocr-top', 'sl-appbar', 'sn-top', 'topbar'];

test('every id the menu bar names is on its page', () => {
  const missing = [];
  for (const file of barPages) {
    const html = readFileSync(file, 'utf8');
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const mount = html.match(/SlopMenuBar\.mount\(([\s\S]*?)\);<\/script>/);
    if (!mount) continue;   // mounted from a script (Slopnodes), checked by its own page test
    for (const id of [...mount[1].matchAll(/'#([\w-]+)'|"#([\w-]+)"/g)].map((m) => m[1] || m[2])) {
      if (!ids.has(id)) missing.push(`${rel(file)} #${id}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every view-mode route mounts on the menu bar', () => {
  const bad = [];
  for (const file of walk(ROOT, '.js')) {
    const src = readFileSync(file, 'utf8');
    if (!/SlopViewMode\.register\('(eml|hex|calc|ocr)'/.test(src)) continue;
    if (!/mount: '\.smb-bar'|toolbar: (\[)?'\.smb-bar'/.test(src)) continue;
    if (/mount: '\.(em|hx|sc|ocr)-top'/.test(src)) bad.push(rel(file));
  }
  assert.deepEqual(bad, []);
});

test('the view-mode routes of the migrated apps name the bar, not a removed header', () => {
  const routes = {
    'eml/js/route.js': "mount: '.smb-bar'",
    'hex/js/route.js': "mount: '.smb-bar'",
    'calculator/js/route.js': "mount: '.smb-bar'",
    'ocr/js/route.js': "mount: '.smb-bar'",
  };
  for (const [file, text] of Object.entries(routes)) assert.ok(readFileSync(path.join(ROOT, file), 'utf8').includes(text), file);
});

test('no stylesheet, script or page in a migrated app still uses a header class the bar replaced', () => {
  const folders = new Set(barPages.map((p) => path.relative(ROOT, path.dirname(p)).split(path.sep)[0]));
  const hits = [];
  for (const folder of folders) {
    for (const file of [...walk(path.join(ROOT, folder), '.js'), ...walk(path.join(ROOT, folder), '.css'), ...walk(path.join(ROOT, folder), '.html')]) {
      const src = readFileSync(file, 'utf8');
      for (const cls of OLD) if (new RegExp(`\\.${cls}\\b`).test(src)) hits.push(`${rel(file)} .${cls}`);
    }
  }
  assert.deepEqual(hits, []);
});
