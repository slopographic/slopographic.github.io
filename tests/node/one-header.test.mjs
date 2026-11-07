// One header per app: a page that loads the shared menu bar (shared/menubar) has no other header with content in it.
// A page may keep an empty <header> that the bar fills (the host option), as SlopLabel does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP = new Set(['.git', 'node_modules', 'tests', 'apps', 'vendor', 'downloads', 'docs']);

function pages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (name === 'index.html') out.push(full);
  }
  return out;
}

test('a page with the shared menu bar has no second header with content', () => {
  const bad = [];
  let checked = 0;
  for (const file of pages(ROOT)) {
    const html = readFileSync(file, 'utf8');
    if (!/menubar\/menubar\.js/.test(html)) continue;
    checked++;
    for (const m of html.matchAll(/<header\b[^>]*>([\s\S]*?)<\/header>/g)) {
      if (m[1].trim() !== '') bad.push(path.relative(ROOT, file));
    }
  }
  assert.ok(checked > 10, `expected the mini apps to use the menu bar, found ${checked}`);
  assert.deepEqual([...new Set(bad)], []);
});
