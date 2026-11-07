// Covers: tests/brand-facts.mjs, tests/brand-facts.js
// The brand facts the tests read (tests/brand-facts.js) are the code's own profile markers: each one equals the marker of
// the same key in the code that acts on it, so a test that reads a fact checks the build it runs in, never a copy of this
// site's values. The registry helper gives the names a page shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { FACTS, BRAND, registry, appName, ROOT } from '../brand-facts.mjs';

const LIT = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|true|false|\[[^\]\n]*\]|\{[^\n]*\})`;
const marker = (file, key) => {
  const m = new RegExp(String.raw`/\*profile:${key}\*/` + LIT).exec(readFileSync(path.join(ROOT, file), 'utf8'));
  assert.ok(m, `${file}: no ${key} marker`);
  return JSON.parse(m[1][0] === "'" ? '"' + m[1].slice(1, -1) + '"' : m[1]);
};

test('every fact is the marker of the code that acts on it', () => {
  assert.equal(FACTS.naming, marker('shared/apps.js', 'naming'));
  assert.deepEqual([...FACTS.hideApps], marker('shared/apps.js', 'hideApps'));
  assert.equal(FACTS.media, marker('shared/apps.js', 'media'));
  assert.equal(marker('shared/drop/panel.js', 'media'), FACTS.media);
  assert.equal(FACTS.tone, marker('pdf/js/io/sample.js', 'tone'));
  assert.equal(FACTS.analytics, marker('shared/consent/config.js', 'analytics'));
  assert.equal(FACTS.defaultLang, marker('shared/i18n/i18n.js', 'defaultLang'));
  assert.equal(FACTS.seoIndex, marker('tools/seo/site.mjs', 'seoIndex'));
  assert.deepEqual({ ...FACTS.aiModels }, marker('shared/ai/makers.js', 'aiModels'));
  assert.equal(FACTS.savings, marker('home/savings.js', 'savings'));
  const themes = marker('shared/theme/theme.js', 'themes');
  const w = {};
  vm.runInNewContext(readFileSync(path.join(ROOT, 'shared/theme/theme.js'), 'utf8'), { window: w });
  assert.deepEqual([...FACTS.themes], [...w.SlopTheme.THEMES].map((t) => t.id), 'the themes the site offers, in its order');
  assert.equal(FACTS.themeBrand, themes.brand || '');
  assert.equal(FACTS.defaultTheme, marker('shared/theme/theme.js', 'defaultTheme'));
  const builtin = marker('shared/buddy/boot.js', 'mascot'), overlay = marker('shared/buddy/boot.js', 'mascotOverlay');
  assert.equal(FACTS.mascot, builtin ? 'builtin' : overlay ? 'overlay' : 'none');
  for (const f of ['drive/js/ui/empty.js', 'ai/js/ui/sloppo.js']) assert.equal(marker(f, 'mascot'), builtin, f);
  assert.ok(['brand', 'plain'].includes(FACTS.naming) && ['playful', 'plain'].includes(FACTS.tone));
  assert.ok(Object.isFrozen(FACTS));
});

test('the registry helper: the names a page shows, the hidden apps left out', () => {
  const r = registry();
  assert.ok(r.apps.length > 20 && r.all.length >= r.apps.length);
  for (const id of FACTS.hideApps) assert.ok(!r.apps.some((a) => a.id === id), id);
  const pdf = r.apps.find((a) => a.id === 'pdf');
  assert.equal(appName('pdf'), FACTS.naming === 'plain' ? pdf.plain : pdf.brandName);
  assert.equal(r.name(pdf), pdf.name);
  assert.equal(typeof BRAND.name, 'string');
  assert.ok(BRAND.name.length > 0);
});
