// The string tables of the shared chrome, the shared components and every app (tools/i18n): the checker finds nothing
// (every key in every shipped language, the same {placeholders}, keys the code asks for exist), COVERAGE.md is up to
// date, no app loses translated coverage (the ratchet, tests/node/i18n-coverage.baseline.json), and every table file is
// named in tests/i18n/tables.covers.txt. Also the checker's own rules on small tables, and the extractor's heuristics.
// Covers: tools/i18n/i18n.mjs, tools/i18n/check.mjs, tools/i18n/coverage.mjs, tools/i18n/tables.mjs, tools/i18n/scan.mjs
// Run: node --test tests/node/i18n-tables.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { check, compare, placeholders, pluralForms, TRANSLIT, renameTargets } from '../../tools/i18n/check.mjs';
import { scan, render, levels, losses, raise, OUT, BASELINE } from '../../tools/i18n/coverage.mjs';
import { ROOT, COVERS, coversText, langs, apps, appTables, sharedAreas, sharedTables, pageAreas, tableFiles } from '../../tools/i18n/tables.mjs';
import { scanJs, scanHtml, wordy, fragment, staticText } from '../../tools/i18n/scan.mjs';

const rows = scan();
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

test('the tables are sound (node tools/i18n/i18n.mjs --check)', () => {
  assert.deepEqual(check(), []);
});

test('a plural family carries every form the language needs for counts; a million-only form is not asked for', () => {
  assert.deepEqual(pluralForms('ar').sort(), ['few', 'many', 'one', 'two', 'zero']);
  assert.deepEqual(pluralForms('ja'), []);
  assert.deepEqual(pluralForms('fr'), ['one']);           // fr 'many' is for 1 000 000 and up
  assert.deepEqual(pluralForms('pt-BR'), ['one']);
  const en = new Map([['a.files', '{n} files'], ['a.files#one', '{n} file'], ['a.name', 'Name']]);
  const ar = new Map([['a.files', '{n} ملفًا'], ['a.files#one', 'ملف واحد'], ['a.name', 'الاسم']]);
  assert.deepEqual(compare('x/ar', en, ar).filter((m) => m.includes('plural')).length, 4);
  assert.deepEqual(compare('x/ja', en, new Map([['a.files', '{n} 件'], ['a.name', '名前']])), []);
});

test('"slop" written in another script is refused, so a white-label rename still finds every product name', () => {
  for (const s of ['مرحبا من سلوبو', 'スロップ ブラシ', 'Слоппо', '斯洛普']) assert.ok(TRANSLIT.test(s), s);
  for (const s of ['Slop ブラシ', 'مرحبا من Sloppo', 'HTML 转 PDF', 'slope', 'بأسلوب واضح']) assert.ok(!TRANSLIT.test(s), s);
  const en = new Map([['a.hi', 'Hi from Sloppo']]);
  assert.equal(compare('x/ar', en, new Map([['a.hi', 'مرحبا من سلوبو']])).length, 1);
  assert.deepEqual(compare('x/ar', en, new Map([['a.hi', 'مرحبا من Sloppo']])), []);
});

test('a translation never holds a white-label rename target (its reverse would rewrite the word)', () => {
  const targets = renameTargets();
  if (!targets.length) return;   // a white-label build: no profiles shipped
  assert.ok(targets.length > 0, 'the targets come from brand/profiles/*.map.json');
  const t = targets[0];   // never written out here: the source must not hold a target
  const en = new Map([['a.blurb', 'A real editor']]);
  assert.equal(compare('x/nl', en, new Map([['a.blurb', `Een echte ${t}`]])).length, 1);
  assert.deepEqual(compare('x/nl', en, new Map([['a.blurb', 'Een echt tekenprogramma']])), []);
});

test('COVERAGE.md and tables.covers.txt are up to date (node tools/i18n/i18n.mjs coverage)', () => {
  assert.equal(read(OUT), render(rows));
  assert.equal(read(COVERS), coversText());
});

test('no app or shared table loses translated coverage in any language (the ratchet)', () => {
  const base = JSON.parse(read(BASELINE));
  const lost = rows.filter((r) => base[r.id]).map((r) => [r.id, losses(levels(r), base[r.id])]).filter(([, l]) => l.length);
  assert.deepEqual(lost, [], 'raise coverage, or put new text in the tables; node tools/i18n/i18n.mjs coverage --baseline records a gain');
});

test('the shared chrome and the shared components are complete in every language', () => {
  for (const id of ['chrome', 'ui']) {
    const r = rows.find((x) => x.id === id);
    for (const l of langs()) assert.equal(r.langs[l.code], r.keys, `${id} in ${l.code}`);
  }
});

test('the PDF editor ships English and Swedish tables, loaded from its page head', () => {
  const t = appTables(apps().find((a) => a.id === 'pdf'));
  assert.ok(t.langs.includes('en') && t.langs.includes('sv'), 'en and sv');
  assert.ok(t.tables.en.size > 300, 'the English tables hold the app');
  const head = read('pdf/index.html').split('</head>')[0];
  assert.match(head, /shared\/i18n\/i18n\.js[\s\S]*i18n\/index\.js/, 'i18n.js, then the index, in the head');
});

test('compare(): a missing key, a changed placeholder, an extra key and a bad plural form are problems', () => {
  const en = new Map([['a.x', 'Delete {n} pages'], ['a.y', 'Close'], ['a.x#one', 'Delete {n} page']]);
  assert.deepEqual(compare('t', en, new Map([['a.x', 'Ta bort {n} sidor'], ['a.y', 'Stäng'], ['a.x#one', 'Ta bort {n} sida'], ['a.x#few', 'x {n}']])), []);
  assert.deepEqual(compare('t', en, new Map([['a.x', 'Ta bort {n} sidor'], ['a.y', 'Stäng'], ['a.x#one', 'Ta bort sidan']])), [], 'a plural form may leave the count out');
  const bad = compare('t', en, new Map([['a.x', 'Ta bort {count} sidor'], ['a.z', 'z'], ['a.x#lots', 'x'], ['a.x#many', 'x {m}']]));
  assert.ok(bad.some((m) => /missing a\.y/.test(m)));
  assert.ok(bad.some((m) => /a\.x has \{count\}/.test(m)));
  assert.ok(bad.some((m) => /a\.z is not an English key/.test(m)));
  assert.ok(bad.some((m) => /a\.x#lots: not a plural category/.test(m)));
  assert.ok(bad.some((m) => /a\.x#many has \{m\}/.test(m)));
  assert.equal(placeholders('{b} and {a}'), 'a,b');
});

test('the ratchet keeps the best coverage and reports a loss', () => {
  const r = { id: 'x', keys: 10, hard: 10, langs: { en: 10, sv: 5 } };
  assert.deepEqual(levels(r), { en: 50, sv: 25 });
  assert.deepEqual(losses({ en: 50, sv: 20 }, { en: 50, sv: 25 }), ['sv: 20%, was 25%']);
  assert.deepEqual(raise([r], { x: { sv: 40 } }).x, { en: 50, sv: 40 }, 'never lowered');
});

test('the extractor finds UI text and skips ids, keys, selectors, paths and code', () => {
  const js = [
    "SlopUI.toast('Saved to Drive');",
    "var o = { label: 'Rotate right', id: 'rotate-right', cls: 'sui-btn sf-btn' };",
    "el.title = 'Zoom in';",
    "h('button', { class: 'x' }, 'Try a sample');",
    "console.warn('Something broke here');",
    "throw new Error('Bad input value');",
    "document.querySelector('.menu-b');",
    "var k = t('pdf.menu.open'); var f = 'shared/i18n/i18n.js';",
    "if (mode === 'Single page') go(); // i18n-ignore",
    'var re = /Not a string/g;',
  ].join('\n');
  const found = scanJs(js).map((s) => s.text);
  assert.deepEqual(found, ['Saved to Drive', 'Rotate right', 'Zoom in', 'Try a sample']);
  const html = '<head><title>Skip</title></head><body><h1>Drop PDFs here</h1><b data-i18n="x.y">Done</b><button aria-label="Close panel"><svg><text>no</text></svg></button><script>var x = "No";</script></body>';
  assert.deepEqual(scanHtml(html).map((s) => s.text), ['Close panel', 'Drop PDFs here']);
  for (const s of ['Rotate', 'Open PDFs or images…', 'to move']) assert.equal(wordy(s), true, s);
  for (const s of ['pdf.menu.open', 'rotate-right', 'camelCase', 'PDF', 'Ctrl+S', '../x/y.js', 'sui-btn sf-btn', 'use strict']) assert.equal(wordy(s), false, s);
});

test('the extractor reads template literals by their static text and finds lower-case fragments where only text goes', () => {
  const js = [
    'SlopUI.toast(`Saved ${n} files`);',
    'el.textContent = n + \' selected\';',
    "h('span', { class: 'b' }, 'more');",
    'label: `${n} of ${m}`,',
    'el.title = `${count} to move`;',
    // not text: classes, fonts, CSS, PDF and printer syntax, ids and enum values
    "el.className = 'btn sm';",
    'el.className = `btn small${on}`;',
    'ctx.font = `600 ${s}px system-ui, sans-serif`;',
    'el.style.transform = `translate(${x}px, ${y}px)`;',
    'var sz = `${w}px ${h}px`;',
    'ops.push(`q ${a} 0 0 ${b} cm Do Q`);',
    'cmd.push(`SIZE ${w} mm,${h} mm`);',
    "var st = { tip: 'round', blend: 'normal' };",
    "setStatus(id, 'open');",
    "var o = { label: 'log', text: 'text' };",
    'var p = `${base}/i18n/${code}.js`;',
  ].join('\n');
  assert.deepEqual(scanJs(js).map((s) => s.text), ['Saved {…} files', 'selected', 'more', '{…} of {…}', '{…} to move']);
  for (const s of ['selected', ' more', 'to move', '(untitled)', 'not shown on screen:']) assert.equal(fragment(s), true, s);
  for (const s of ['none', 'px', 'rotate-right', 'camelCase', 'Close', 'a1']) assert.equal(fragment(s), false, s);
  assert.equal(staticText('Saved {…} files'), 'Saved files');
  assert.equal(staticText('{…}px {…}px'), null);
  assert.equal(staticText('q {…} 0 0 {…} cm Do Q'), null);
});

test('the shared areas include shared/biz/i18n, so the checker and the coverage report read it', () => {
  const biz = sharedAreas().find((a) => a.id === 'biz');
  assert.ok(biz, 'sharedAreas() has biz');
  assert.equal(biz.base, 'shared/biz/i18n/');
  const t = appTables(biz);
  assert.ok(t.tables.en && t.tables.en.size > 0 && t.tables.sv, 'en and sv tables of biz');
  assert.ok([...t.tables.en.keys()].every((k) => k.startsWith('biz.')), 'biz keys');
  const row = rows.find((r) => r.id === 'biz');
  assert.ok(row && row.shared && row.keys === [...t.tables.en.keys()].filter((k) => !k.includes('#')).length, 'a coverage row for biz');
  assert.match(read(OUT), /Shared biz \(shared\/biz\/i18n\/\)/, 'COVERAGE.md lists it');
  assert.match(read('tools/i18n/check.mjs'), /\[\.\.\.apps\(\), \.\.\.pageAreas\(\), \.\.\.sharedAreas\(\)\]/, 'check() walks the pages and the shared areas');
});

test('Settings keeps its words like an app (settings/i18n, keys settings.*), read by the checker and the coverage report', () => {
  const page = pageAreas().find((a) => a.id === 'settings');
  assert.ok(page && page.dir === 'settings/' && page.files.includes('settings/index.html'), 'pageAreas() has settings');
  assert.ok(!apps().some((a) => a.id === 'settings'), 'not a registry app');
  const t = appTables(page);
  assert.ok(t.index && t.index.ns === 'settings' && t.tables.en && t.tables.sv, 'settings/i18n/index.js, en and sv');
  assert.ok([...t.tables.en.keys()].every((k) => /^settings\.[a-z_]+\.[a-z_]+(#one)?$/.test(k)), 'keys settings.<area>.<name>');
  const chrome = sharedTables('chrome').tables.en;
  assert.ok([...t.tables.en.keys()].every((k) => !chrome.has(k)), 'no key is also a chrome key (settings.appearance, ...)');
  assert.ok(rows.some((r) => r.id === 'settings' && r.keys === [...t.tables.en.keys()].filter((k) => !k.includes('#')).length), 'a coverage row');
  assert.ok(tableFiles().includes('settings/i18n/index.js') && tableFiles().includes('settings/i18n/sv/notes.js'), 'its table files are listed');
});

test('the home page describes the AI assistant, the file manager, the business apps and HTML to PDF in plain words, as sv and de do', () => {
  const chrome = sharedTables('chrome');
  for (const k of ['home.why_local_d', 'home.why_backup_d', 'home.sec_business_d', 'home.print_d']) {
    for (const l of langs()) {
      if (l.code === 'en') continue;
      const v = chrome.tables[l.code].get(k);
      assert.ok(!/Slop|\.slop\b/.test(v), `${l.code} ${k} names an app brand: ${v}`);
    }
  }
});
