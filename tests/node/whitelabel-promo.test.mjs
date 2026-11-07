// Covers: tools/whitelabel/profile.mjs, tools/whitelabel/emit.mjs, shared/promo/promo.js
// The brand profile's promo line (brand/README.md "A promo line"): the schema, the marker a build writes into
// shared/promo/promo.js, and the slots on the homepage and Settings (hidden, empty, filled only by the script).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, loadProfile, profilesDir, allProfiles, promoProblems } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers, promoMarker } from '../../tools/whitelabel/emit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = profilesDir(ROOT);
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const OK = { text: { en: 'Need parts? Compare prices at example.com', sv: 'Behöver du delar? Jämför på example.com' }, url: 'https://example.com' };

test('promo: optional; { text, url, where? } with a line or a line per language', () => {
  const s = loadProfile(DIR, 'sample');
  assert.deepEqual(promoProblems(undefined), []);
  for (const ok of [OK, { text: 'One line', url: 'https://example.com/a?b=1', where: ['home'] }, { ...OK, where: ['settings', 'home'] }]) {
    assert.deepEqual(validate({ ...s, promo: ok }), [], JSON.stringify(ok));
  }
  const bad = [null, 'x', [], { text: 'x' }, { text: 'x', url: 'http://example.com' }, { text: 'x', url: 'javascript:alert(1)' },
    { text: '', url: 'https://example.com' }, { text: {}, url: 'https://example.com' }, { text: { xx: 'y' }, url: 'https://example.com' },
    { text: 'x'.repeat(121), url: 'https://example.com' }, { ...OK, where: [] }, { ...OK, where: ['editor'] }, { ...OK, where: ['home', 'home'] }];
  for (const b of bad) assert.match(validate({ ...s, promo: b }).join('\n'), /^promo/m, JSON.stringify(b));
});

test('the marker: null without a promo (every profile here); a line per language and the places with one', () => {
  for (const p of allProfiles(DIR)) assert.equal(markerValues(p).promo, null, p.id);
  assert.deepEqual(promoMarker({ defaultLang: 'en', promo: OK }), { ...OK, where: ['home', 'settings'] });
  assert.deepEqual(promoMarker({ defaultLang: 'sv', promo: { text: 'Hej', url: 'https://example.com', where: ['home'] } }),
    { text: { sv: 'Hej' }, url: 'https://example.com', where: ['home'] });
  // the source keeps null; a build writes the profile's value into the same literal, and this site's build changes nothing
  const src = read('shared/promo/promo.js');
  assert.match(src, /const PROMO = \/\*profile:promo\*\/null;/);
  assert.equal(applyMarkers(src, markerValues(loadProfile(DIR, 'slopographic'))), src);
  const built = applyMarkers(src, markerValues({ ...loadProfile(DIR, 'sample'), promo: OK }));
  const lit = built.match(/const PROMO = \/\*profile:promo\*\/(.*);/)[1];
  assert.deepEqual(JSON.parse(lit), { ...OK, where: ['home', 'settings'] });
});

test('the homepage and Settings have a hidden, empty slot and load the script; no editor has one', () => {
  for (const [file, place, src] of [['index.html', 'home', 'shared/promo/promo.js'], ['settings/index.html', 'settings', '../shared/promo/promo.js']]) {
    const html = read(file);
    assert.match(html, new RegExp(`<div class="promo-slot" data-promo-slot="${place}" hidden></div>`), file);
    assert.ok(html.includes(`<script src="${src}"></script>`), file);
  }
  for (const app of ['pdf/index.html', 'docs/index.html', 'tables/index.html']) assert.ok(!read(app).includes('data-promo-slot'), app);
});
