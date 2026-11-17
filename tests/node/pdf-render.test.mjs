// The shared PDF export (shared/docs/pdf-render.js) with the template set (pdf-layouts.js) and the view (doc-view.js), run in
// a vm context with the vendored pdf-lib and the real money and schema code. The bytes start with %PDF and contain the
// totals text; the same document gives the same bytes; a long table runs onto more pages; the seed picks the template; the
// printed words, money and dates follow the document's language (SlopBiz.docLang.words), whatever the page's language.
// Covers: shared/biz/i18n/en/print.js, shared/biz/i18n/sv/print.js, shared/biz/biz.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = ['shared/i18n/i18n.js', 'shared/biz/biz.js', 'shared/biz/i18n/en/biz.js', 'shared/biz/i18n/en/print.js', 'shared/biz/i18n/sv/biz.js', 'shared/biz/i18n/sv/print.js',
  'shared/data/money.js', 'shared/data/barcode.js', 'shared/data/schema-checks.js', 'shared/data/schema-defs.js', 'shared/data/schema.js',
  'shared/docs/model.js', 'shared/docs/pdf-layouts.js', 'shared/docs/doc-view.js', 'shared/docs/pdf-render.js'];

// the page in English in any build (a white-label build may start in another language)
const PIN = "window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: null });";

async function load() {
  const ctx = {};
  ctx.window = ctx;
  ctx.self = ctx;   // pdf-lib's UMD wrapper reads self when it is not a module
  vm.createContext(ctx);
  // pdf-lib runs in the same context as the code that calls it (arrays must share a realm for its instanceof checks)
  const lib = 'vendor/pdf-lib/pdf-lib.min.js';
  vm.runInContext(await readFile(path.join(ROOT, lib), 'utf8'), ctx, { filename: lib });
  for (const f of FILES) {
    vm.runInContext(await readFile(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
    if (f === 'shared/i18n/i18n.js') vm.runInContext(PIN, ctx);
  }
  return ctx;
}

const plain = (x) => JSON.parse(JSON.stringify(x));   // values from the vm's realm, for deepEqual

const LINES = [
  { description: 'Widget', qty: 2, unitPrice: 1000, taxRate: 2000 },   // net 2000, tax 400
  { description: 'Service', qty: 1, unitPrice: 500, taxRate: 0 },      // net 500, tax 0
];

/** A document as the apps build its view: ctx carries money, totals, the company and the customer. */
function docOf(ctx, extra = {}) {
  const S = ctx.SlopData;
  const lines = extra.lines || LINES;
  return {
    kind: 'invoice', id: 'inv-test', number: 'INV-0001', status: 'issued', words: ctx.SlopBiz.docLang.words('en', 'en-US'),
    date: '2026-10-11', dueDate: '2026-11-10', notes: 'Thank you.\nPay by bank transfer within 30 days.',
    currency: 'USD', locale: 'en-US', lines, totals: ctx.SlopDocs.model.totals(lines),
    customer: { name: 'Acme Ltd', email: 'ap@acme.test', address: '2 High St\nLondon' },
    company: { name: 'Slop Works Ltd', address: '1 Main St\nSpringfield', taxNumber: 'GB123456' },
    paid: 0, balance: 2900, money: (m) => S.money.formatMinor(m, 'USD', 'en-US'), ...extra,
  };
}
/** The PDF's text: the file as latin1 plus every flate stream inflated (pdf-lib compresses the page content). */
function pdfText(u8) {
  const buf = Buffer.from(u8);
  const parts = [buf.toString('latin1')];
  let i = 0;
  for (;;) {
    const s = buf.indexOf('stream', i, 'latin1');
    if (s < 0) break;
    if (s >= 3 && buf.toString('latin1', s - 3, s) === 'end') { i = s + 6; continue; }
    let start = s + 6;
    if (buf[start] === 0x0d) start += 1;
    if (buf[start] === 0x0a) start += 1;
    const e = buf.indexOf('endstream', start, 'latin1');
    if (e < 0) break;
    try { parts.push(inflateSync(buf.subarray(start, e)).toString('latin1')); } catch (err) { /* not a flate stream */ }
    i = e + 9;
  }
  // standard fonts are written as hex strings (<...> Tj): decode them so the text can be searched
  return parts.join('\n').replace(/<([0-9A-Fa-f]*)>\s*Tj/g, (m, hex) => `(${Buffer.from(hex, 'hex').toString('latin1')}) Tj`);
}

test('every template renders a PDF whose bytes start with %PDF and contain the totals', async () => {
  const ctx = await load();
  const L = ctx.SlopDocs.layouts;
  for (const id of L.IDS) {
    const view = ctx.SlopDocs.view.build(docOf(ctx, { pdfLayout: id }));
    const r = await ctx.SlopDocs.pdf.renderPdf(view);
    assert.equal(r.ok, true, id);
    assert.equal(Buffer.from(r.value.slice(0, 5)).toString('latin1'), '%PDF-', id);
    const text = pdfText(r.value);
    assert.ok(text.includes('$29.00'), `${id}: the total 29.00 is in the bytes`);
    assert.ok(text.includes('$4.00'), `${id}: the tax 4.00 is in the bytes`);
    assert.ok(text.includes('$25.00'), `${id}: the subtotal 25.00 is in the bytes`);
    assert.ok(text.includes('INV-0001'), `${id}: the number is in the bytes`);
    assert.ok(text.includes('Acme Ltd'), `${id}: the customer is in the bytes`);
  }
});

test('the same document gives the same bytes, and a seed picks the same template every time', async () => {
  const ctx = await load();
  const d = docOf(ctx, { id: 'same', pdfSeed: 424242 });
  const a = await ctx.SlopDocs.pdf.renderPdf(ctx.SlopDocs.view.build(d));
  const b = await ctx.SlopDocs.pdf.renderPdf(ctx.SlopDocs.view.build({ ...d }));
  assert.deepEqual(Buffer.from(a.value), Buffer.from(b.value));
  assert.equal(ctx.SlopDocs.layouts.resolve(d).id, ctx.SlopDocs.layouts.resolve({ ...d }).id);
});

test('a long table runs onto more pages and the document still loads with every page', async () => {
  const ctx = await load();
  const many = Array.from({ length: 60 }, (_, i) => ({ description: `Line ${i + 1} with a longer description that may wrap onto a second line`, qty: 1, unitPrice: 100, taxRate: 0 }));
  const view = ctx.SlopDocs.view.build(docOf(ctx, { lines: many, balance: null, pdfLayout: 'classic' }));
  const r = await ctx.SlopDocs.pdf.renderPdf(view);
  assert.equal(r.ok, true);
  const pdf = await ctx.PDFLib.PDFDocument.load(r.value);
  assert.ok(pdf.getPageCount() >= 3, `expected several pages, got ${pdf.getPageCount()}`);
  assert.ok(pdfText(r.value).includes('Page 1 of '), 'the footer numbers the pages');
});

test('a Swedish document prints Swedish words, money and dates while the page stays English; stored text stays as written', async () => {
  const ctx = await load();
  assert.equal(ctx.SlopI18n.get(), 'en');
  const w = ctx.SlopBiz.docLang.words('sv', 'en-US');   // a company locale of another language: the document's own (sv)
  assert.equal(w.locale, 'sv');
  const S = ctx.SlopData;
  const view = ctx.SlopDocs.view.build(docOf(ctx, { words: w, currency: 'SEK', money: (m) => S.money.formatMinor(m, 'SEK', w.locale), pdfLayout: 'modern' }));
  assert.equal(view.title, 'Faktura');
  assert.equal(view.statusText, 'Utfärdad');
  assert.deepEqual(plain(view.meta.map((m) => [m.label, m.value])), [['Datum', '2026-10-11'], ['Förfallodatum', '2026-11-10'], ['Betalningsvillkor', '30 dagar netto']]);
  assert.deepEqual(plain(view.totals.map((x) => x.label.replace(/\s/g, ' '))), ['Summa exkl. moms', 'Moms 0 % på 5,00 kr', 'Moms 20 % på 20,00 kr', 'Totalt', 'Att betala']);
  assert.equal(view.words.number, 'Fakturanummer');
  assert.equal(view.rows[0].description, 'Widget', 'line text is stored data, not translated');
  const text = pdfText((await ctx.SlopDocs.pdf.renderPdf(view)).value);
  for (const s of ['FAKTURA', 'Att betala', 'F\u00f6rfallodatum', 'Moms 20 % p\u00e5', '29,00 kr', 'Sida 1 av 1', 'Momsreg.nr GB123456', 'BESKRIVNING', 'Acme Ltd', 'Thank you.']) {
    assert.ok(text.includes(s), `the Swedish PDF has ${s}`);
  }
  assert.ok(!text.includes('Balance due') && !text.includes('Page 1 of'), 'no English words');
  const en = ctx.SlopDocs.view.build(docOf(ctx));
  assert.equal(en.title, 'Invoice');
  assert.deepEqual(plain(en.meta.map((m) => m.value)), ['10/11/2026', '11/10/2026', '30 days net']);
  assert.equal(en.meta[0].raw, '2026-10-11', 'the raw date is what the page edits');
});

test('the layout set has the five templates, and the schema accepts exactly their ids', async () => {
  const ctx = await load();
  const L = ctx.SlopDocs.layouts;
  assert.deepEqual([...L.IDS].sort(), ['bold', 'classic', 'minimal', 'modern', 'sidebar']);
  assert.deepEqual([...ctx.SlopData.schemaDefs.ENUM.pdfLayout].sort(), [...L.IDS].sort());
  assert.equal(L.ACCENTS.length, 4);
});

test('a seed picks a template, the document may pick its own, and all five come up across seeds', async () => {
  const ctx = await load();
  const L = ctx.SlopDocs.layouts;
  const seen = new Set();
  for (let s = 0; s < 300; s += 1) seen.add(L.resolve({ id: 'x', pdfSeed: s }).id);
  assert.deepEqual([...seen].sort(), [...L.IDS].sort());
  assert.equal(L.resolve({ id: 'x', pdfSeed: 7, pdfLayout: 'bold' }).id, 'bold');
  assert.equal(L.resolve({ id: 'x', pdfSeed: 7, pdfLayout: 'nope' }).id, L.resolve({ id: 'x', pdfSeed: 7 }).id);
  // a record saved before seeds keeps a stable style from its id
  assert.equal(L.seedOf({ id: 'abc' }), L.seedOf({ id: 'abc' }));
  const n = L.newSeed();
  assert.ok(Number.isInteger(n) && n >= 0 && n <= 2147483647);
});

test('text wraps by words and cuts a word wider than the column', async () => {
  const ctx = await load();
  const font = { widthOfTextAtSize: (t, size) => t.length * size * 0.5 };   // 0.5 em per character
  const out = ctx.SlopDocs.pdf.wrap(font, 'one two three four five six', 10, 60);   // 12 characters per line
  assert.deepEqual([...out], ['one two', 'three four', 'five six']);
  assert.deepEqual([...ctx.SlopDocs.pdf.wrap(font, 'abcdefghijklmnop', 10, 60)], ['abcdefghijkl', 'mnop']);
  assert.deepEqual([...ctx.SlopDocs.pdf.wrap(font, 'a\n\nb', 10, 60)], ['a', '', 'b']);
});
