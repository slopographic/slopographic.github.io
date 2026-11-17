// Every app in the registry has 4 to 10 search keywords (shared/finder/app-search.js) and a long description in English
// and Swedish (shared/i18n/ui/en/shell2.js, shared/i18n/ui/sv/shell2.js), which SLOP_APP_SEARCH[id].desc reads in the
// chosen language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (file, name) => {
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { window: win });
  return win[name];
};
const apps = load('shared/apps.js', 'SLOP_ALL_APPS');   // every app, also one a brand profile hides
const search = load('shared/finder/app-search.js', 'SLOP_APP_SEARCH');
/** One language's ui part as a plain object (its SlopI18n.add call caught). */
const part = (code) => {
  const got = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, `shared/i18n/ui/${code}/shell2.js`), 'utf8'), { window: { SlopI18n: { add: (c, d) => Object.assign(got, d) } } });
  return got;
};
const descKey = (id) => 'ui.appdesc.' + id.replace(/-/g, '_');

test('every registry app has a search entry, and a description in English and Swedish', () => {
  const missing = Array.from(apps.filter((a) => !search[a.id]), (a) => a.id);
  assert.deepEqual(missing, [], 'add these ids to shared/finder/app-search.js');
  for (const code of ['en', 'sv']) {
    const tbl = part(code);
    const none = Array.from(apps, (a) => descKey(a.id)).filter((k) => !tbl[k] || !tbl[k].trim());
    assert.deepEqual(none, [], `add these keys to shared/i18n/ui/${code}/shell2.js`);
    const ids = new Set(apps.map((a) => descKey(a.id)));
    assert.deepEqual(Object.keys(tbl).filter((k) => k.startsWith('ui.appdesc.') && !ids.has(k)), [], `${code}: a description for an app the registry does not have`);
  }
});

test('desc reads the chosen language, and is empty without SlopI18n', () => {
  const tables = { en: part('en'), sv: part('sv') };
  let lang = 'sv';
  const I = { has: (k) => k in tables[lang], t: (k) => tables[lang][k] };
  const win = { SlopI18n: I };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/finder/app-search.js'), 'utf8'), { window: win });
  assert.equal(win.SLOP_APP_SEARCH.pdf.desc, tables.sv['ui.appdesc.pdf']);
  assert.equal(win.SLOP_APP_SEARCH['paint-classic'].desc, tables.sv['ui.appdesc.paint_classic']);
  lang = 'en';
  assert.equal(win.SLOP_APP_SEARCH.pdf.desc, tables.en['ui.appdesc.pdf']);
  assert.equal(win.slopAppDesc('3d'), tables.en['ui.appdesc.3d']);
  assert.equal(search.pdf.desc, '');
});

test('every entry has 4 to 10 keywords, none blank or repeated', () => {
  for (const a of apps) {
    const e = search[a.id];
    assert.ok(e.keywords.length >= 4 && e.keywords.length <= 10, `${a.id} has ${e.keywords.length} keywords`);
    assert.ok(e.keywords.every((k) => typeof k === 'string' && k.trim()), `${a.id} has a blank keyword`);
    assert.equal(new Set(e.keywords.map((k) => k.toLowerCase())).size, e.keywords.length, `${a.id} repeats a keyword`);
  }
});

test('no entry is left for an app the registry does not have', () => {
  const ids = new Set(apps.map((a) => a.id));
  assert.deepEqual(Object.keys(search).filter((k) => !ids.has(k)), []);
});
