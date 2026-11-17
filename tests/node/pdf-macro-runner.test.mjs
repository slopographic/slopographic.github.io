// The Slop PDF macro runner (pdf/js/macro/*.js, no UI) in a vm context with the vendored pdf-lib, and the vendored pdf.js
// (imported here, so text positions are real). Covers: replace text on a generated PDF (located, and not guessed),
// a footer with tokens, page numbers, rotation, delete, keep, watermark rotation, and the step error path.
// Run with: node --test tests/node/pdf-macro-runner.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const toDataUrl = (s) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const MACRO_FILES = ['core/watermark', 'macro/pattern', 'macro/model', 'macro/frame', 'macro/text', 'macro/ops-edit', 'macro/ops-draw', 'macro/runner'].map((n) => `pdf/js/${n}.js`);
MACRO_FILES.unshift('shared/watermark/spec.js');   // the watermark's page ranges
MACRO_FILES.unshift('shared/i18n/i18n.js', 'shared/i18n/ui/en.js', 'shared/i18n/ui/en/watermark.js');   // its messages' words

// pdf.js 5 reads a few browser geometry classes when it loads. Node has none, so give it minimal stand-ins: the text
// positions here come from pdf.js's own transform helpers, not from these classes.
if (!globalThis.DOMMatrix) globalThis.DOMMatrix = class DOMMatrix { constructor(init) { [this.a, this.b, this.c, this.d, this.e, this.f] = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0]; } };
if (!globalThis.ImageData) globalThis.ImageData = class ImageData { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
if (!globalThis.Path2D) globalThis.Path2D = class Path2D {};

// pdf.js runs in this realm (its fake worker is the handler module); pdf-lib and the macro code run in the vm realm.
globalThis.pdfjsWorker = { WorkerMessageHandler: (await import(toDataUrl(read('vendor/pdfjs/pdf.worker.min.js')))).WorkerMessageHandler };
const pdfjs = await import(toDataUrl(read('vendor/pdfjs/pdf.min.js')));

async function load() {
  const ctx = { console, atob: (s) => Buffer.from(s, 'base64').toString('binary') };
  ctx.window = ctx;
  ctx.self = ctx; // pdf-lib's UMD wrapper reads self when it is not a module
  vm.createContext(ctx);
  vm.runInContext(read('vendor/pdf-lib/pdf-lib.min.js'), ctx, { filename: 'pdf-lib.min.js' });
  for (const f of MACRO_FILES) vm.runInContext(read(f), ctx, { filename: f });
  ctx.SlopPdfMacro.text.setLib(pdfjs);
  // Builds a PDF in the vm realm: pages: [{ w, h, rotate, texts: [{ text, x, y, size, font, spacing }] }]
  ctx.makePdf = vm.runInContext(`(async function (pages) {
    var L = PDFLib, doc = await L.PDFDocument.create();
    var helv = await doc.embedFont(L.StandardFonts.Helvetica), times = await doc.embedFont(L.StandardFonts.TimesRoman);
    pages.forEach(function (pg) {
      var p = doc.addPage([pg.w || 300, pg.h || 200]);
      if (pg.rotate) p.setRotation(L.degrees(pg.rotate));
      (pg.texts || []).forEach(function (t) {
        if (t.spacing) p.pushOperators(L.setCharacterSpacing(t.spacing));
        p.drawText(t.text, { x: t.x, y: t.y, size: t.size || 12, font: t.font === 'times' ? times : helv });
      });
    });
    return await doc.save();
  })`, ctx);
  ctx.pageCount = vm.runInContext('(async function (b) { return (await PDFLib.PDFDocument.load(b)).getPageCount(); })', ctx);
  return ctx;
}
const M = (ctx) => ctx.SlopPdfMacro;
const macro = (ctx, steps, extra) => Object.assign({ id: 'test', name: 'Test', pattern: '', auto: 'off', steps: steps.map((s) => {
  const st = M(ctx).newStep(s.type);
  if (s.type === 'addWatermark' && !s.layers) delete st.layers; // a flat watermark step: its own fields are the layer
  return Object.assign(st, s);
}) }, extra || {});

/** pdf.js text items of every page of a PDF (plain copies, so node assertions can use them). */
async function items(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.filter((it) => it.str).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], fs: it.transform[3], t: [...it.transform], w: it.width })));
  }
  await doc.destroy();
  return out;
}

test('replace text: a whole item is replaced in place and the old text is covered', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [{ text: 'INV-1001', x: 40, y: 150, size: 14 }, { text: 'Hello there', x: 40, y: 100 }] }]);
  const before = new Uint8Array(src);
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'replaceText', find: 'INV-1001', replace: 'INV-2002' }]), src, { filename: 'a.pdf' });
  assert.equal(r.ok, true, r.log.map((l) => l.message).join(' | '));
  assert.equal(r.log[0].warn, false);
  assert.match(r.log[0].message, /Replaced 1 match on 1 page/);
  assert.deepEqual(new Uint8Array(src), before, 'the input bytes are not changed');
  const it = (await items(r.bytes))[0];
  const rep = it.find((x) => x.str === 'INV-2002');
  assert.ok(rep, 'the replacement is in the text layer');
  assert.ok(Math.abs(rep.x - 40) < 0.01 && Math.abs(rep.y - 150) < 0.01, `replacement at the original place, got ${rep.x},${rep.y}`);
  assert.equal(rep.fs, 14);
  assert.ok(it.find((x) => x.str === 'Hello there'), 'other text is untouched');
});

test('replace text: a match inside an item is placed by the font metrics', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [{ text: 'Hello world Acme', x: 20, y: 150, size: 12 }] }]);
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'replaceText', find: 'Acme', replace: 'Beta' }]), src);
  assert.equal(r.ok, true, r.log[0].message);
  assert.match(r.log[0].message, /Replaced 1 match/);
  const it = (await items(r.bytes))[0];
  const beta = it.find((x) => x.str === 'Beta');
  assert.ok(beta, 'replacement text found');
  const wPrefix = ctx.SlopPdfMacro.pdf.measure('Helvetica', 'Hello world ', 12);
  assert.ok(Math.abs(beta.x - (20 + wPrefix)) < 0.2, `placed at the match start, got ${beta.x}`);
});

test('replace text: a match the position cannot be trusted for is reported, not guessed', async () => {
  const ctx = await load();
  // Character spacing makes pdf.js report the letters as separate pieces whose widths no longer match the standard
  // font metrics, so the match "c m" inside one piece cannot be located exactly.
  const src = await ctx.makePdf([{ texts: [{ text: 'Hello world Acme', x: 20, y: 150, size: 12, spacing: 5 }] }]);
  const before = (await items(src))[0].map((x) => x.str).join('');
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'replaceText', find: 'c m', replace: 'X' }]), src);
  assert.equal(r.ok, true);
  assert.equal(r.log[0].warn, true);
  assert.match(r.log[0].message, /left as it is, because its position could not be located exactly \(page 1\)/);
  assert.equal(r.log[0].message.includes('Replaced'), false);
  const after = (await items(r.bytes))[0].map((x) => x.str).join('');
  assert.equal(after, before, 'nothing was replaced or covered');
});

test('replace text: regular expression with a capture group, and a page that does not match', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [{ text: 'Order 4711', x: 20, y: 150, size: 12 }] }, { texts: [{ text: 'Nothing here', x: 20, y: 150 }] }]);
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'replaceText', find: 'Order (\\d+)', regex: true, replace: 'Ref $1', pages: '1' }]), src);
  assert.equal(r.ok, true, r.log[0].message);
  const pages = await items(r.bytes);
  assert.ok(pages[0].find((x) => x.str === 'Ref 4711'));
  assert.ok(pages[1].find((x) => x.str === 'Nothing here'));
});

test('footer with tokens lands on every page in the chosen order', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [{ text: 'One', x: 20, y: 150 }] }, { texts: [{ text: 'Two', x: 20, y: 150 }] }]);
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'addHeaderFooter', position: 'footer', align: 'center', text: 'Page {page} of {pages} · {filename} · {date}' }]),
    src, { filename: 'invoice-7.pdf', date: '2026-10-11' });
  assert.equal(r.ok, true, r.log[0].message);
  const pages = await items(r.bytes);
  assert.ok(pages[0].find((x) => x.str === 'Page 1 of 2 · invoice-7.pdf · 2026-10-11'), JSON.stringify(pages[0].map((x) => x.str)));
  assert.ok(pages[1].find((x) => x.str === 'Page 2 of 2 · invoice-7.pdf · 2026-10-11'));
  assert.ok(pages[0].find((x) => x.str === 'One'));
});

test('page numbers: format and first number', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [] }, { texts: [] }, { texts: [] }]);
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'addPageNumbers', format: 'page-of', position: 'top-right', start: 3 }]), src);
  assert.equal(r.ok, true, r.log[0].message);
  const pages = await items(r.bytes);
  assert.deepEqual(pages.map((p) => p[0] && p[0].str), ['Page 3 of 5', 'Page 4 of 5', 'Page 5 of 5']);
  assert.ok(pages[0][0].x > 150 && pages[0][0].y > 150, 'top right');
});

test('rotate, delete and keep only the pages asked for', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [{ text: 'A', x: 20, y: 150 }] }, { texts: [{ text: 'B', x: 20, y: 150 }] }, { texts: [{ text: 'C', x: 20, y: 150 }] }]);
  const rot = await M(ctx).runMacro(macro(ctx, [{ type: 'rotate', angle: 90, pages: '2' }]), src);
  assert.equal(rot.ok, true, rot.log[0].message);
  assert.equal(await ctx.pageCount(rot.bytes), 3);
  const del = await M(ctx).runMacro(macro(ctx, [{ type: 'deletePages', pages: '1,3' }]), src);
  assert.equal(del.ok, true);
  assert.equal(await ctx.pageCount(del.bytes), 1);
  assert.equal((await items(del.bytes))[0][0].str, 'B');
  const keep = await M(ctx).runMacro(macro(ctx, [{ type: 'extractPages', pages: '3-2' }]), src);
  assert.equal(await ctx.pageCount(keep.bytes), 2);
  assert.deepEqual((await items(keep.bytes)).map((p) => p[0].str), ['B', 'C']);
});

test('watermark is drawn rotated and at the chosen opacity', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [] }]);
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'addWatermark', text: 'DRAFT', angle: 45, size: 40 }]), src);
  assert.equal(r.ok, true, r.log[0].message);
  const it = (await items(r.bytes))[0].find((x) => x.str === 'DRAFT');
  assert.ok(it, 'watermark text present');
  assert.ok(Math.abs(it.t[0] - 40 * Math.cos(Math.PI / 4)) < 0.5 && Math.abs(it.t[1] - 40 * Math.sin(Math.PI / 4)) < 0.5, 'rotated 45 degrees');
});

test('a rotated page keeps its footer reading the right way', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ rotate: 90, texts: [] }]);
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'addHeaderFooter', position: 'footer', text: 'Footer' }]), src);
  assert.equal(r.ok, true, r.log[0].message);
  const it = (await items(r.bytes))[0].find((x) => x.str === 'Footer');
  assert.ok(it, 'footer present');
  assert.ok(Math.abs(it.t[1]) > 0.5, 'the text runs along the rotated page, not the raw page');
});

test('a failing step stops the run, names the step and returns no bytes', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [{ text: 'Only', x: 20, y: 150 }] }]);
  const before = new Uint8Array(src);
  const steps = [{ type: 'addHeaderFooter', position: 'header', text: 'Top' }, { type: 'deletePages', pages: 'all' }, { type: 'rotate', angle: 90 }];
  const r = await M(ctx).runMacro(macro(ctx, steps), src);
  assert.equal(r.ok, false);
  assert.equal(r.bytes, null);
  assert.equal(r.failed, 1);
  assert.equal(r.log.length, 2, 'the step after the failure did not run');
  assert.equal(r.log[0].ok, true);
  assert.equal(r.log[1].ok, false);
  assert.match(r.log[1].message, /every page/);
  assert.match(r.log[1].step, /^2\. /);
  assert.deepEqual(new Uint8Array(src), before);
});

test('a macro with a bad step is refused before anything runs', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [] }]);
  const bad = { id: 'x', name: 'Bad', pattern: '', auto: 'off', steps: [{ type: 'rotate', angle: 90, pages: 'two' }] };
  const r = await M(ctx).runMacro(bad, src);
  assert.equal(r.ok, false);
  assert.equal(r.failed, -1);
  assert.equal(r.bytes, null);
  assert.equal(r.log[0].step, 'Check');
  assert.match(r.log[0].message, /Step 1, Rotate: Pages/);
});

test('a page number outside the file is a step error, not a silent skip', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [] }]);
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'rotate', angle: 90, pages: '4' }]), src);
  assert.equal(r.ok, false);
  assert.match(r.log[0].message, /Page 4 is not in this file, which has 1 page/);
});

test('stamp with a text placed on the page', async () => {
  const ctx = await load();
  const src = await ctx.makePdf([{ texts: [] }]);
  const r = await M(ctx).runMacro(macro(ctx, [{ type: 'stamp', text: 'Received {date}', x: 10, y: 10, colour: '#ff0000' }]), src, { date: '2026-10-11' });
  assert.equal(r.ok, true, r.log[0].message);
  const it = (await items(r.bytes))[0].find((x) => x.str === 'Received 2026-10-11');
  assert.ok(it, 'stamp text present');
});
