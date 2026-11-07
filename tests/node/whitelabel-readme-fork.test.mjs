// Covers: tools/whitelabel/fork.mjs, tools/whitelabel/emit.mjs, tools/whitelabel/profile.mjs
// "Fork me!" and the savings line, written once (tools/whitelabel/fork.mjs): this repository's README holds them for its
// own profile, a white-label build's generated README for the build's (its name, address and files), and the profile's
// "savings": false leaves out the line in the README and the homepage's line and list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { forkMe, savingsLine } from '../../tools/whitelabel/fork.mjs';
import { readme, notice, mit, markerValues, applyMarkers } from '../../tools/whitelabel/emit.mjs';
import { validate } from '../../tools/whitelabel/profile.mjs';
import { SHOWN } from '../../shared/savings/data.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const profile = (id) => JSON.parse(read(`brand/profiles/${id}.json`));

test("this repository's README has Fork me! and the savings line as fork.mjs writes them", () => {
  const p = profile('slopographic'), md = read('README.md');
  assert.ok(md.includes(forkMe(p, true)), 'README.md: the Fork me! section differs from tools/whitelabel/fork.mjs');
  assert.ok(md.includes(savingsLine(p)), 'README.md: the savings line differs from tools/whitelabel/fork.mjs');
  assert.ok(savingsLine(p).includes('$' + SHOWN.toLocaleString('en-US')));
  assert.ok(md.indexOf('## Fork me!') < md.indexOf('## The apps'), 'near the top');
  assert.ok(forkMe(p, true).includes('(brand/README.md)'));
});

test("a build's README carries them with the build's name, address and files", () => {
  const p = profile('sample'), md = readme(p, 'v2026.10.27');
  assert.ok(md.includes(forkMe(p, false)) && md.includes(savingsLine(p)));
  assert.ok(md.includes(`${p.origin}/#savings`));
  assert.ok(md.includes(`Every copy of ${p.name}`));
  assert.ok(!/brand\/README\.md|Slopographic/.test(md), 'no link to a file a build leaves out, no word of this brand');
  const off = readme(Object.assign({}, p, { savings: false }));
  assert.ok(!off.includes('#savings') && off.includes('## Fork me!'));
});

test('the profile switch: validated, and false empties the homepage blocks', () => {
  const p = profile('sample');
  assert.deepEqual(validate(Object.assign({}, p, { savings: false })), []);
  assert.ok(validate(Object.assign({}, p, { savings: 'no' })).some((e) => e.startsWith('savings:')));
  const html = read('index.html');
  const on = applyMarkers(html, markerValues(p)), off = applyMarkers(html, markerValues(Object.assign({}, p, { savings: false })));
  assert.ok(on.includes('class="hx-save"') && on.includes('<section id="savings"'));
  assert.ok(!off.includes('class="hx-save"') && !off.includes('<section id="savings"'));
  assert.equal(off.split('\n').length, html.split('\n').length, 'the line count stays');
  assert.match(applyMarkers(read('home/savings.js'), markerValues(Object.assign({}, p, { savings: false }))), /\/\*profile:savings\*\/false/);
});

test('Fork me! says what the MIT licence leaves out, pointing at the files that say so', () => {
  const src = forkMe(profile('slopographic'), true);
  assert.match(src, /The code is MIT, but the name Slopographic, its logo, the mascot art and the media \(screenshots, videos\)\nare not part/);
  for (const f of ['NOTICE.md', 'TRADEMARKS.md', 'LICENSE-ART']) assert.ok(src.includes(`(${f})`), f);
  const plain = forkMe(Object.assign({}, profile('sample'), { mascot: false, media: false }), false);
  assert.match(plain, /but the name Acme Tools and its logo\nare not part/);
  assert.ok(!plain.includes('LICENSE-ART'), 'no link to a file the build does not have');
});

test("a build's NOTICE.md names its media when it ships them; its LICENSE stays the plain MIT text", () => {
  const p = profile('sample');
  const withMedia = notice(Object.assign({}, p, { media: true }));
  assert.match(withMedia, /\n4\. Media\. Screenshots, video and images under `assets\/`, if any, are copyright 2026\n {3}Acme Example Ltd, all rights reserved\./);
  assert.ok(!/Media\./.test(notice(Object.assign({}, p, { media: false }))));
  assert.match(notice(Object.assign({}, p, { media: true, mascot: false })), /\n3\. Media\./);   // numbered after the items before it
  const lic = mit(p);
  assert.match(lic, /^MIT License\n/);
  assert.ok(!/Media|NOTICE/.test(lic), 'LICENSE is the MIT text only, so GitHub detects it');
});
