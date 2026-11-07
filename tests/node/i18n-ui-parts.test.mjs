// The shared components' tables beyond ui/<code>.js: shared/i18n/ui/<code>/<part>.js, listed in UI_PARTS of
// shared/i18n/i18n.js. i18n.js loads them for English and for a language that has them (another reads English), the
// tools read them as an app's tables (tools/i18n/tables.mjs sharedAreas(), with shared/<area>/i18n such as shared/biz).
// Covers: shared/i18n/i18n.js, tools/i18n/tables.mjs, tools/i18n/check.mjs, tools/i18n/coverage.mjs, tools/i18n/i18n.mjs
// Run: node --test tests/node/i18n-ui-parts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, sharedAreas, appTables, uiPartsIndex, UI_PARTS_RE } from '../../tools/i18n/tables.mjs';
import { usedKeys } from '../../tools/i18n/check.mjs';
import { scan } from '../../tools/i18n/coverage.mjs';

// the default-language literal a white-label build rewrites (built from pieces so the build leaves this file alone)
const DEFAULT_RE = new RegExp('(/\\*profile:' + 'defaultLang\\*/)([\'"])[^\'"]*[\'"]');   // 'en', or "sv" as a build writes it
const SRC = readFileSync(path.join(ROOT, 'shared/i18n/i18n.js'), 'utf8');

/** Runs i18n.js in a fake page whose language is `code`, with UI_PARTS replaced; returns the script URLs it asks for. */
function load(code, parts) {
  const urls = [];
  const el = () => ({ setAttribute() {}, hasAttribute: () => false, appendChild() {} });
  const doc = {
    readyState: 'complete', currentScript: { src: 'https://x.test/shared/i18n/i18n.js', hasAttribute: () => false },
    documentElement: el(), head: { appendChild: (s) => { urls.push(s.src); if (s.onload) s.onload(); } },
    createElement: () => ({}), querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  };
  const ctx = { document: doc };   // no SlopProfile: the language is the default choice, set here as a white-label build does
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = SRC.replace(UI_PARTS_RE, '/*ui-parts*/' + JSON.stringify(parts) + ';').replace(DEFAULT_RE, (m, mark) => `${mark}'${code}'`);
  vm.runInContext(src, ctx);
  return { urls, api: Object.values(ctx).find((v) => v && v.LANGS && v.t) };   // by shape: a build may rename the global
}

test('UI_PARTS is one line that i18n.js and the tools both read', () => {
  assert.match(SRC, UI_PARTS_RE);
  const idx = uiPartsIndex();
  assert.ok(Array.isArray(idx.parts) && Array.isArray(idx.langs));
  const dir = path.join(ROOT, 'shared/i18n/ui');
  const folders = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual([...idx.langs].sort(), folders, 'UI_PARTS.langs are the folders (node tools/i18n/i18n.mjs index ui)');
});

test('English and a language with parts load them; a language without reads English', async () => {
  const parts = { parts: ['alpha', 'beta'], langs: ['en', 'sv'] };
  const sv = load('sv', parts);
  assert.equal(sv.api.get(), 'sv');
  for (const u of ['ui/en.js', 'ui/en/alpha.js', 'ui/en/beta.js', 'ui/sv.js', 'ui/sv/alpha.js', 'ui/sv/beta.js']) {
    assert.ok(sv.urls.some((x) => x.endsWith('/shared/i18n/' + u)), u + ' for sv');
  }
  const de = load('de', parts);
  assert.ok(de.urls.some((x) => x.endsWith('/shared/i18n/ui/de.js')), 'de base table');
  assert.ok(!de.urls.some((x) => /\/ui\/de\//.test(x)), 'no de parts: German reads English');
  assert.ok(de.urls.some((x) => x.endsWith('/shared/i18n/ui/en/alpha.js')), 'the English parts');
  de.api.add('en', { 'ui.alpha.x': 'Hello' });
  assert.equal(de.api.t('ui.alpha.x'), 'Hello', 'the fallback is English');
});

test('the tools read the ui parts and shared/biz as tables of their own', () => {
  const ids = sharedAreas().map((a) => a.id);
  assert.ok(ids.includes('ui-parts') && ids.includes('biz'), ids.join());
  const biz = appTables(sharedAreas().find((a) => a.id === 'biz'));
  assert.ok(biz.tables.en && biz.tables.en.size > 50 && biz.tables.sv, 'shared/biz/i18n en and sv');
  const rows = scan();
  assert.ok(rows.some((r) => r.id === 'biz' && r.shared) && rows.some((r) => r.id === 'ui-parts' && r.shared), 'coverage rows');
});

test('a key prefix built in code is not taken for a key the code asks for', () => {
  const f = 'tests/node/i18n-ui-parts.test.mjs';
  const keys = [...usedKeys([f], 'zz').keys()];
  assert.ok(keys.includes('zz.real.key') && !keys.some((k) => k.endsWith('_')), keys.join());
  // samples read by the test above: t('zz.real.key'); t('zz.prefix_' + kind)
});
