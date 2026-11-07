// The shared config format (shared/config): validation, import and export, the built-in settings and numbering kinds,
// and the AI prompt and reply helpers. Runs the real scripts in one vm context, with a stub apply or a fake store.
// Run: node tests/run.mjs config   (or node --test tests/node/config.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadInto, plain } from './fx-env.mjs';
import { CORE, APPS, config, templateFile, stubTemplate, fakeStore } from './config-env.mjs';

const SHARED = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared');

test('buildPrompt names every field and allowed value, and its example is a valid file', async () => {
  const C = await config({ files: [...CORE, 'config/kinds.js'], extra: { SlopData: { store: fakeStore() } } });
  const text = C.buildPrompt('numbering', 'slop', 'Use INV-2026- for invoices');
  for (const word of ['sequences', 'id', 'prefix', 'pad', 'invoice', 'order', 'at most 12', 'Use INV-2026- for invoices']) {
    assert.ok(text.includes(word), `prompt should mention ${word}`);
  }
  assert.ok(text.includes('"invoice", "order"'), 'allowed values are listed');
  const example = text.slice(text.indexOf('An example of a valid file'), text.indexOf('What the person wants'));
  const r = C.parseAiReply(example, { app: 'slop' });
  assert.equal(r.ok, true, C.errorText(r.errors));

  const settings = C.buildPrompt('settings', 'slop', '');
  assert.ok(settings.includes('defaultCurrency') && settings.includes('defaultTaxRate') && settings.includes('locale'));

  assert.throws(() => C.buildPrompt('nope', 'slop', ''), /no kind/);
});

test('buildPrompt for a template lists block types and the page limit', async () => {
  const C = await config();
  stubTemplate(C);
  const text = C.buildPrompt('template', 'tables', '');
  assert.ok(text.includes('"heading", "text", "list", "table"'));
  assert.ok(text.includes('at most 200 items'));
  assert.ok(text.includes('pages'));
});

test('settings kind: the apply writes through the store in one transaction, and export reads it back', async () => {
  const store = fakeStore();
  const C = await config({ files: [...CORE, 'config/kinds.js'], extra: { SlopData: { store } } });
  const file = { format: 'slop-config', version: 1, kind: 'settings', app: 'slop', name: 'Company', created: '2026-10-11T09:00:00Z',
    data: { defaultCurrency: 'EUR', locale: 'de-DE', defaultTaxRate: 19.5 } };
  const res = await C.importText(JSON.stringify(file), { app: 'tables' });
  assert.equal(res.ok, true, C.errorText(res.errors));
  assert.equal(store.transactions, 1);
  assert.deepEqual(store.rows.settings.get('main'), { id: 'main', defaultCurrency: 'EUR', locale: 'de-DE', defaultTaxRate: 1950, paymentTermsDays: 30 });

  const exported = await C.exportKind('settings', 'tables', 'Company');
  const data = JSON.parse(await exported.text()).data;
  assert.deepEqual(data, { defaultCurrency: 'EUR', locale: 'de-DE', defaultTaxRate: 19.5 });
});

test('numbering kind: the format changes and the counter is kept', async () => {
  const store = fakeStore();
  const C = await config({ files: [...CORE, 'config/kinds.js'], extra: { SlopData: { store } } });
  const file = { format: 'slop-config', version: 1, kind: 'numbering', app: 'slop', name: 'Numbers', created: '2026-10-11T09:00:00Z',
    data: { sequences: [{ id: 'invoice', prefix: 'INV-2026-', pad: 6 }] } };
  const res = await C.importText(JSON.stringify(file), { app: 'tables' });
  assert.equal(res.ok, true, C.errorText(res.errors));
  assert.deepEqual(store.rows.numbering.get('invoice'), { id: 'invoice', prefix: 'INV-2026-', pad: 6, next: 7 });
  assert.deepEqual(store.rows.numbering.get('order'), { id: 'order', prefix: 'ORD-', pad: 4, next: 3 });
});

test('numbering kind: an unknown sequence is refused before the store is touched', async () => {
  const store = fakeStore();
  const C = await config({ files: [...CORE, 'config/kinds.js'], extra: { SlopData: { store } } });
  const file = { format: 'slop-config', version: 1, kind: 'numbering', app: 'slop', name: 'N', created: '2026-10-11T09:00:00Z',
    data: { sequences: [{ id: 'credit', prefix: 'CN-', pad: 4 }] } };
  const res = await C.importText(JSON.stringify(file));
  assert.equal(res.ok, false);
  assert.equal(store.transactions, 0);
});

test('a store failure in the middle of numbering rolls the whole apply back', async () => {
  const store = fakeStore();
  store.rows.numbering.delete('order'); // the second sequence is missing, so the store refuses
  const C = await config({ files: [...CORE, 'config/kinds.js'], extra: { SlopData: { store } } });
  const file = { format: 'slop-config', version: 1, kind: 'numbering', app: 'slop', name: 'N', created: '2026-10-11T09:00:00Z',
    data: { sequences: [{ id: 'invoice', prefix: 'NEW-', pad: 4 }, { id: 'order', prefix: 'ORD-', pad: 4 }] } };
  const res = await C.importText(JSON.stringify(file));
  assert.equal(res.ok, false);
  assert.equal(res.rolledBack, true);
  assert.match(res.errors[0].message, /no numbering sequence order/);
  assert.equal(store.rows.numbering.get('invoice').prefix, 'INV-');
});

test('settings apply without SlopData on the page says so, and applies nothing', async () => {
  const C = await config({ files: [...CORE, 'config/kinds.js'] });
  const file = { format: 'slop-config', version: 1, kind: 'settings', app: 'slop', name: 'S', created: '2026-10-11T09:00:00Z', data: { defaultCurrency: 'EUR' } };
  const res = await C.importText(JSON.stringify(file));
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /data store is not loaded/);
});


// The words come from shared/i18n/ui/<code>/widgets.js. SlopI18n with a stand-in profile (English first), so set('sv')
// works as on a page: the tables are already in, and 'slopi18n' fires on the window (an EventTarget here).
const PIN = "window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: { v: {}, get(a, k, d) { return this.v[k] || d; }, set(a, k, c) { this.v[k] = c; return { ok: true }; } } });";
async function withI18n(files, extra) {
  const et = new EventTarget();
  const ctx = await loadInto(['i18n/i18n.js'], { ...extra, CustomEvent, addEventListener: et.addEventListener.bind(et), removeEventListener: et.removeEventListener.bind(et), dispatchEvent: et.dispatchEvent.bind(et) });
  vm.runInContext(PIN, ctx);
  for (const f of ['i18n/ui/en/widgets.js', 'i18n/ui/sv/widgets.js', 'i18n/ui/en/config.js', 'i18n/ui/sv/config.js', ...files]) vm.runInContext(await readFile(path.join(SHARED, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const switched = (ctx, code) => new Promise((res) => { ctx.addEventListener('slopi18n', () => res(), { once: true }); ctx.SlopI18n.set(code); });

// Covers: shared/config/dialog-ai.js
test('the dialogs load without SlopUI on the page: menu items and the AI hook are wired', async () => {
  const ctx = await withI18n([...CORE, 'config/dialog.js', 'config/dialog-ai.js'], { SLOP_APPS: APPS, Blob, File });
  const D = ctx.SlopConfigDialog;
  assert.equal(typeof D.open, 'function');
  assert.deepEqual(plain(D.menuItems({ app: 'tables' }).map((i) => i.label)), ['Export current config…', 'Export plain template…', 'Import config…', 'Ask AI to write a config…']);
  assert.equal(typeof D.makeAi, 'function');
  assert.throws(() => D.open('nope'), /unknown dialog/);
});

// Covers: shared/config/schema.js, shared/config/kinds.js, shared/config/dialog.js, shared/i18n/ui/en/widgets.js, shared/i18n/ui/sv/widgets.js,
//   shared/config/validate.js, shared/config/prompt.js, shared/config/template.js, shared/config/io.js, shared/i18n/ui/en/config.js, shared/i18n/ui/sv/config.js
test('kind labels and the config items and commands follow a language change (keys, read when shown)', async () => {
  const ctx = await withI18n([...CORE, 'config/kinds.js', 'config/dialog.js'], { SLOP_APPS: APPS, Blob, File, SlopData: { store: fakeStore() } });
  const C = ctx.SlopConfig, D = ctx.SlopConfigDialog;
  const kind = C.getKind('settings', C.consts.SHARED);
  assert.equal(kind.label, 'Settings');
  assert.equal(kind.description, 'Default currency, locale and tax rate');
  const items = D.menuItems({ app: 'tables' });
  const registered = new Map();   // SlopCmd keeps a copy of each command; the dialog retitles that copy
  ctx.SlopCmd = { get: (id) => registered.get(id) || null };
  for (const c of D.commands({ app: 'tables' })) registered.set(c.id, Object.assign({}, c));
  assert.equal(registered.get('tables.config.import').title, 'Import config…');
  await switched(ctx, 'sv');
  assert.equal(kind.label, 'Inställningar');
  assert.equal(kind.description, 'Standardvaluta, språkformat och momssats');
  assert.equal(items[2].label, 'Importera konfiguration…');
  assert.equal(registered.get('tables.config.import').title, 'Importera konfiguration…');
  assert.equal(D.commands({ app: 'tables' })[0].title, 'Exportera aktuell konfiguration…');
  // the checks a file goes through and the AI reply's problems, in the new language (shared/i18n/ui/sv/config.js)
  assert.match(C.validate('{', {}).errors[0].message, /^inte giltig JSON: /);
  assert.equal(C.validate({ format: 'slop-config' }, {}).errors.find((e) => e.path === 'name').message, 'krävs: 1 till 120 tecken');
  assert.equal(C.parseAiReply('', {}).errors[0].message, 'svaret är tomt');
  await switched(ctx, 'en');
  assert.match(C.validate('{', {}).errors[0].message, /^not valid JSON: /);
});
