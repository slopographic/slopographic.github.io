// Slop AI's ready-made prompts (shared/ai/quick/): the engine (variables from the context, a choice's default, the value
// remembered, a missing value that blocks sending, `when`, the "/" filter, recent first) and every prompt list: each app
// with the AI panel has one (5–12 prompts), every key exists in English, every {variable} of a text is declared and every
// declared one is used, and the choices, hints and conditions have their words.
// Covers: shared/ai/quick/engine.js, shared/ai/quick/shared.js, shared/ai/i18n/index.js
// The lists (each run by the tests below):
// Covers: shared/ai/quick/apps/3d.js, shared/ai/quick/apps/admin.js, shared/ai/quick/apps/aitools.js
//    shared/ai/quick/apps/calculator.js, shared/ai/quick/apps/calendar.js, shared/ai/quick/apps/checksum.js
//    shared/ai/quick/apps/clean.js, shared/ai/quick/apps/code.js, shared/ai/quick/apps/colors.js
//    shared/ai/quick/apps/contacts.js, shared/ai/quick/apps/convert.js, shared/ai/quick/apps/crm.js
//    shared/ai/quick/apps/cutout.js, shared/ai/quick/apps/diff.js, shared/ai/quick/apps/docs.js
//    shared/ai/quick/apps/drive.js, shared/ai/quick/apps/effects.js, shared/ai/quick/apps/eml.js
//    shared/ai/quick/apps/expenses.js, shared/ai/quick/apps/fontcreator.js, shared/ai/quick/apps/gallery.js
//    shared/ai/quick/apps/hex.js, shared/ai/quick/apps/html2pdf.js, shared/ai/quick/apps/img3d.js
//    shared/ai/quick/apps/inventory.js, shared/ai/quick/apps/invoices.js, shared/ai/quick/apps/label.js
//    shared/ai/quick/apps/ledger.js, shared/ai/quick/apps/music.js, shared/ai/quick/apps/nodes.js
//    shared/ai/quick/apps/notes.js, shared/ai/quick/apps/ocr.js, shared/ai/quick/apps/orders.js
//    shared/ai/quick/apps/paint-classic.js, shared/ai/quick/apps/paste.js, shared/ai/quick/apps/pdf.js
//    shared/ai/quick/apps/photoslop.js, shared/ai/quick/apps/press.js, shared/ai/quick/apps/projects.js
//    shared/ai/quick/apps/purchases.js, shared/ai/quick/apps/qr.js, shared/ai/quick/apps/quotes.js
//    shared/ai/quick/apps/recorder.js, shared/ai/quick/apps/reminders.js, shared/ai/quick/apps/remix.js
//    shared/ai/quick/apps/reports.js, shared/ai/quick/apps/resize.js, shared/ai/quick/apps/scan.js, shared/ai/quick/apps/serials.js
//    shared/ai/quick/apps/sheetview.js, shared/ai/quick/apps/signature.js, shared/ai/quick/apps/slides.js
//    shared/ai/quick/apps/slopedit.js, shared/ai/quick/apps/sorter.js, shared/ai/quick/apps/tables.js
//    shared/ai/quick/apps/time.js, shared/ai/quick/apps/timesheets.js, shared/ai/quick/apps/todo.js
//    shared/ai/quick/apps/transcribe.js, shared/ai/quick/apps/upscale.js, shared/ai/quick/apps/vector.js
//    shared/ai/quick/apps/watermark.js, shared/ai/quick/apps/workflows.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { sharedAreas, appTables } from '../../tools/i18n/tables.mjs';

const require = createRequire(import.meta.url);
const Q = require('../../shared/ai/quick/engine.js');
const ROOT = new URL('../../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const tables = appTables(sharedAreas().find((a) => a.ns === 'prompts')).tables;
const EN = tables.en, SV = tables.sv;
const LANGS = [{ code: 'en', english: 'English' }, { code: 'es', english: 'Spanish' }, { code: 'de', english: 'German' }, { code: 'sv', english: 'Swedish' }];
const tr = (m) => (k, v) => { const s = m.has(k) ? m.get(k) : EN.has(k) ? EN.get(k) : k; return v ? s.replace(/\{(\w+)\}/g, (x, n) => (n in v ? v[n] : x)) : s; };
function storage() { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), d }; }
function engine(lang = 'en', st = storage()) {
  const m = lang === 'sv' ? SV : EN;
  return Q.create({ T: tr(m), has: (k) => m.has(k) || EN.has(k), lang, langs: LANGS, storage: st });
}
/** Every list, as a page has them: shared.js and each apps/<id>.js run in one window. */
function lists() {
  const w = { document: {} }; w.window = w;
  const ctx = vm.createContext(w);
  vm.runInContext(read('shared/ai/quick/shared.js'), ctx);
  const files = readdirSync(new URL('shared/ai/quick/apps/', ROOT)).filter((f) => f.endsWith('.js'));
  const own = {};
  for (const f of files) {
    const before = new Set(Object.keys(w.SlopAIKit.quickLists));
    vm.runInContext(read('shared/ai/quick/apps/' + f), ctx, { filename: f });
    own[f] = Object.keys(w.SlopAIKit.quickLists).filter((k) => !before.has(k));
  }
  return { L: w.SlopAIKit.quickLists, own, files };
}
function registry() { const w = {}; w.window = w; vm.runInContext(read('shared/apps.js'), vm.createContext(w)); return w.SLOP_APPS; }
const ctx0 = { app: 'Slop Tables', lang: 'English', selection: '' };

test('every app with the AI panel has its own list, in a file named after it, with 5 to 12 prompts', () => {
  const { L, own, files } = lists();
  // the shell's AI button: every page of the registry (shell.js detectCurrent: a path, not '#…'), Slop AI itself aside
  const apps = registry().filter((a) => a.path && !a.path.startsWith('#') && a.id !== 'ai').map((a) => a.id);
  for (const id of apps) assert.ok(files.includes(id + '.js'), `shared/ai/quick/apps/${id}.js is missing`);
  for (const f of files) assert.deepEqual(own[f], [f.slice(0, -3)], `${f} must set quickLists['${f.slice(0, -3)}'] and nothing else`);
  for (const id of apps) { const n = L[id].prompts.length; assert.ok(n >= 5 && n <= 12, `${id}: ${n} prompts`); }
  assert.ok(L.all.prompts.length >= 15, 'at least 15 shared prompts');
});

test('every prompt: its keys exist, its {variables} are declared and used, its choices, hints and conditions have words', () => {
  const { L } = lists(), E = engine(), sharedIds = new Set(L.all.prompts.map((p) => p.id));
  const used = new Set();
  for (const scope of Object.keys(L)) {
    const ids = new Set();
    for (const s of L[scope].skip || []) assert.ok(sharedIds.has(s) || Q.GROUPS.includes(s), `${scope}: skip "${s}" is no shared prompt or group`);
    for (const raw of L[scope].prompts) {
      const p = E.norm(raw, scope), where = `${scope}.${raw.id}`;
      assert.match(raw.id, /^[a-z][a-z0-9_]*$/, where);
      assert.ok(!ids.has(raw.id), `${where} twice`); ids.add(raw.id);
      if (scope === 'all') assert.ok(Q.GROUPS.includes(p.group), `${where}: group ${p.group}`);
      for (const k of [p.label, p.text]) { assert.ok(EN.has(k), `${where}: no English ${k}`); used.add(k); }
      assert.deepEqual(E.undeclared(p, EN.get(p.text)), [], `${where}: undeclared variables`);
      for (const v of p.vars) {
        assert.ok(['context', 'choice', 'text', 'number'].includes(v.kind), `${where}.${v.name}: kind ${v.kind}`);
        // a var called text would have its hint at prompts.<scope>.<id>.text, the prompt's own text key (found in watermark)
        assert.ok(!['text', 'label', 'var', 'opt'].includes(v.name), `${where}: a variable may not be called ${v.name}`);
        assert.ok(EN.get(p.text).includes(`{${v.name}}`), `${where}: {${v.name}} is declared but the text does not use it`);
        if (v.kind !== 'context') { const k = E.varLabel(v, p); assert.ok(EN.has(k), `${where}: no label ${k}`); used.add(k); }
        if (v.kind === 'choice') {
          if (typeof v.options === 'string') assert.ok(v.options === 'language' || Q.SETS[v.options], `${where}: no option set ${v.options}`);
          else for (const o of v.options) { const k = `${p.ns}.opt.${v.name}.${o}`; assert.ok(EN.has(k), `${where}: no ${k}`); used.add(k); }
        }
        if (v.hint) { const k = `${p.ns}.${raw.id}.${v.name}`; assert.ok(EN.has(k), `${where}: no hint ${k}`); used.add(k); }
      }
      for (const w of p.when) assert.ok(EN.has('prompts.when.' + w), `${where}: no reason prompts.when.${w}`);
    }
  }
  // no English key that no list asks for (a typo in a key or an id)
  const orphans = [...EN.keys()].filter((k) => /^prompts\.(?!ui\.|when\.|group\.|var\.|opt\.)/.test(k) && !used.has(k));
  assert.deepEqual(orphans, []);
});

test('context variables fill themselves; a long selection is cut; braces in it stay as they are', () => {
  const E = engine(), p = E.norm(lists().L.all.prompts.find((x) => x.id === 'proofread'), 'all');
  const r = E.fill(p, {}, Object.assign({}, ctx0, { selection: 'Teh cat {tone} sat.' }));
  assert.equal(r.text, 'Proofread this text: fix spelling, grammar and punctuation, and keep the meaning and the style. Give the corrected text, then list the changes briefly.\n\nTeh cat {tone} sat.');
  const long = E.fill(p, {}, Object.assign({}, ctx0, { selection: 'x'.repeat(9000) }));
  assert.ok(long.text.length < 6300 && long.text.endsWith('x …'));
  assert.deepEqual(E.fill(p, {}, ctx0).missing, ['selection'], 'no selection: nothing to send');
});

test('a choice starts on its default, the language on another than the page\'s, shown by name in the page\'s language', () => {
  const st = storage(), en = engine('en', st), { L } = lists();
  const tone = en.norm(L.all.prompts.find((x) => x.id === 'tone'), 'all'), tl = en.norm(L.all.prompts.find((x) => x.id === 'translate'), 'all');
  assert.deepEqual(en.initial(tone, ctx0), { tone: 'friendly' });
  assert.deepEqual(en.initial(tl, ctx0), { language: 'es' });
  assert.match(en.fill(tl, { language: 'de' }, Object.assign({}, ctx0, { selection: 'Hej' })).text, /^Translate this text into German\./);
  const sv = engine('sv', storage());
  assert.deepEqual(sv.initial(tl, ctx0), { language: 'en' });
  assert.match(sv.fill(tl, { language: 'de' }, Object.assign({}, ctx0, { selection: 'Hi' })).text, /^Översätt den här texten till tyska\./);
  assert.equal(sv.options(tone.vars[1], tone).find((o) => o.value === 'formal').label, 'Formell');
  assert.deepEqual(en.initial(tone, ctx0, {}), { tone: 'friendly' });
  assert.equal(en.initial(Object.assign({}, tone, { vars: [{ name: 'tone', kind: 'choice', options: 'tone', default: 'nope' }] }), ctx0).tone, 'friendly', 'an unknown default falls back to the first option');
});

test('the value used last comes back, per set across prompts; a value the app reports is not remembered over it', () => {
  const st = storage(), E = engine('en', st), { L } = lists();
  const tl = E.norm(L.all.prompts.find((x) => x.id === 'translate'), 'all');
  E.remember(tl, { language: 'de' });
  const other = E.norm({ id: 'x', vars: [{ name: 'language', kind: 'choice', options: 'language' }] }, 'pdf');
  assert.deepEqual(E.initial(other, ctx0), { language: 'de' }, 'the last language everywhere');
  const goal = E.norm({ id: 'g', vars: [{ name: 'goal', kind: 'text' }, { name: 'client', kind: 'text', from: 'client' }] }, 'invoices');
  E.remember(goal, { goal: 'remind them', client: 'Acme' });
  assert.deepEqual(E.initial(goal, { client: 'Beta AB' }), { goal: 'remind them', client: 'Beta AB' });
  assert.deepEqual(engine('en', st).recent(), ['invoices.g', 'all.translate']);
});

test('a required value that is missing blocks sending; an optional one does not; numbers stay in range', () => {
  const E = engine(), { L } = lists(), b = E.norm(L.all.prompts.find((x) => x.id === 'brainstorm'), 'all');
  assert.deepEqual(E.fill(b, { topic: '  ', n: 5 }, ctx0), { text: null, missing: ['topic'] });
  assert.equal(E.fill(b, { topic: 'cake names', n: 500 }, ctx0).text, 'Give me 30 ideas for: cake names. One line each.');
  const opt = E.norm({ id: 'o', vars: [{ name: 'details', kind: 'text', optional: true }] }, 'all');
  assert.deepEqual(E.fill(opt, { details: '' }, ctx0).missing, []);
});

test('when: no selection, Control off, a document the app says is not open: disabled with the reason; unknown counts as there', () => {
  const E = engine('sv'), { L } = lists();
  const pr = E.norm(L.all.prompts.find((x) => x.id === 'proofread'), 'all'), sum = E.norm(L.all.prompts.find((x) => x.id === 'summarize'), 'all');
  assert.deepEqual(E.check(pr, { selection: '  ' }), { ok: false, reason: 'prompts.when.selection', why: 'Markera lite text i appen först' });
  assert.equal(E.check(pr, { selection: 'hej' }).ok, true);
  assert.equal(E.check(sum, { app: 'Slop Tables' }, { tools: false }).why, 'Slå på ”Styr Slop Tables” först');
  assert.equal(E.check(sum, {}, { tools: true }).ok, true);
  const doc = E.norm({ id: 'd', when: ['document'] }, 'docs');
  assert.equal(E.check(doc, {}).ok, true, 'an app that reports nothing');
  assert.equal(E.check(doc, { document: null }).ok, false);
  assert.equal(E.check(doc, { document: 'Report.docx' }).ok, true);
});

test('the "/" filter: label first, then a word of it, then the group or the id; every word must match; recent first without a query', () => {
  const st = storage(), E = engine('en', st), { L } = lists(), all = E.all('tables', L);
  assert.equal(all[0].key, 'tables.formula', 'the app\'s own first');
  assert.ok(all.every((p) => !['expand', 'quiz', 'titles'].includes(p.id) || p.scope !== 'all'), 'skipped shared prompts are left out');
  assert.equal(E.filter(all, 'transl')[0].key, 'all.translate');
  assert.equal(E.filter(all, 'chart')[0].key, 'tables.chart');
  assert.deepEqual(E.filter(all, 'write formula').map((p) => p.key), ['tables.formula']);
  assert.ok(E.filter(all, 'understand').some((p) => p.key === 'all.explain'), 'by group');
  assert.deepEqual(E.filter(all, 'zzzz'), []);
  E.remember(all.find((p) => p.key === 'all.shorten'), {});
  assert.equal(E.filter(all, '')[0].key, 'all.shorten');
  const sv = engine('sv', storage()).all('tables', L);
  assert.equal(engine('sv', storage()).filter(sv, 'översätt')[0].key, 'all.translate', 'the label in the page\'s language');
});

test('storage that throws or is missing: the page still works, in memory', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  for (const st of [bad, null]) {
    const E = engine('en', st), p = E.norm({ id: 'a' }, 'all');
    E.remember(p, {});
    assert.ok(Array.isArray(E.recent()));
  }
});

test('the prompts tables ship every language with a folder, and each language of the site\'s other tables has one', () => {
  const langs = /langs: \[([^\]]*)\]/.exec(read('shared/ai/i18n/index.js'))[1].match(/[\w-]+/g);
  const dirs = readdirSync(new URL('shared/ai/i18n/', ROOT), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual([...langs].sort(), dirs);
  for (const c of ['en', 'sv', 'de', 'ja', 'ar', 'zh-CN']) assert.ok(langs.includes(c), c);
  assert.match(read('shared/ai/panel.js'), /'quick\/engine', 'quick\/context', 'quick\/shared', 'quick\/ui'/);
});
