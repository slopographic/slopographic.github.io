// Covers: tools/whitelabel/media.mjs
// A build without media keeps no trace of this site's videos: no registry entry, no link, no id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mediaIds, stripText, stripMedia } from '../../tools/whitelabel/media.mjs';

const APPS = `const LIST = [\n  { id: 'pdf', name: 'PDF', video: { id: 'aB3_xY-9kLm', title: 'PDF tutorial', duration: 'PT1M' } },\n  { id: 'qr', name: 'QR' },\n];\n`;
const HOME = `<ul></ul>\n        <a class="hero-video" href="https://www.youtube.com/watch?v=Zz9yY8xX7wW" rel="noopener">\n          <img src="v.jpg" alt="">\n          <span>Watch</span>\n        </a>\n      </section>\n`;

test('the ids: the registry tutorials and the homepage links', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'media-'));
  mkdirSync(path.join(root, 'shared'));
  writeFileSync(path.join(root, 'shared/apps.js'), APPS);
  writeFileSync(path.join(root, 'index.html'), HOME);
  assert.deepEqual(mediaIds(root), ['Zz9yY8xX7wW', 'aB3_xY-9kLm']);
});

test('stripping: the registry entry and the link go, other mentions become a made-up id, other text stays', () => {
  const ids = ['Zz9yY8xX7wW', 'aB3_xY-9kLm'];
  const apps = stripText(APPS, ids);
  assert.doesNotMatch(apps, /video/);
  assert.match(apps, /\{ id: 'pdf', name: 'PDF' \}/);
  const home = stripText(HOME, ids);
  assert.doesNotMatch(home, /youtube|hero-video|Watch/);
  assert.match(home, /<\/section>/);
  assert.equal(stripText("const ID = 'aB3_xY-9kLm';", ids), "const ID = 'vid00000002';");
  assert.equal(stripText('nothing here', ids), 'nothing here');
});

test('a build is stripped in place, text files only', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'media-out-'));
  writeFileSync(path.join(out, 'a.js'), "x('Zz9yY8xX7wW')");
  writeFileSync(path.join(out, 'b.png'), 'Zz9yY8xX7wW');
  assert.equal(stripMedia(out, ['Zz9yY8xX7wW']), 1);
  assert.equal(readFileSync(path.join(out, 'a.js'), 'utf8'), "x('vid00000001')");
});
