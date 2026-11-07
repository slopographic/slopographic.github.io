// Covers: tools/seo/head.mjs (LENIENT_BUILD), tools/whitelabel/transform.mjs (context: seoLenient)
// A renamed build's SEO copy is this site's with other words, so its description lengths move. Its SEO writer runs in
// places the build tool does not reach (the copy's own CI and deploy, the language pass), where SEO_LENIENT is not set;
// so the build writes lenience into the code itself (the seoLenient marker). This site and a plain copy of it stay strict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../brand-facts.mjs';
import { loadProfile, loadMap, profilesDir } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers } from '../../tools/whitelabel/emit.mjs';
import { context, forward } from '../../tools/whitelabel/transform.mjs';
import { LENIENT_BUILD, validateCopy } from '../../tools/seo/head.mjs';

const HEAD = readFileSync(path.join(ROOT, 'tools/seo/head.mjs'), 'utf8');
const lenientIn = (src) => /\/\*profile:seoLenient\*\/(true|false)/.exec(src)[1] === 'true';

test('this site is strict: a description out of range throws without SEO_LENIENT', () => {
  assert.equal(LENIENT_BUILD, false);
  const long = 'x'.repeat(170);
  const was = process.env.SEO_LENIENT;
  delete process.env.SEO_LENIENT;
  try { assert.throws(() => validateCopy([['a', { title: 'A', description: long }]], { code: 'sv' }), /description is 170/); } finally { if (was !== undefined) process.env.SEO_LENIENT = was; }
  assert.equal(lenientIn(applyMarkers(HEAD, markerValues(loadProfile(profilesDir(ROOT), 'slopographic')))), false, 'a plain copy of this site stays strict');
});

test('a renamed build is lenient in its code, so every run of its SEO writer only warns on lengths', () => {
  const dir = profilesDir(ROOT);
  for (const id of ['sample', 'sample-sv']) {
    const ctx = context(ROOT, loadProfile(dir, id), loadMap(dir, id));
    const built = forward(HEAD, ctx, 'tools/seo/head.mjs');
    assert.equal(lenientIn(built), true, id);
    assert.equal(built.split('\n').length, HEAD.split('\n').length, `${id}: the line count is kept`);
  }
});
