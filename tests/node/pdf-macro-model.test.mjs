// The pure side of Slop PDF macros (pdf/js/macro/pattern.js and model.js): filename patterns and automatic rules,
// page lists, filename tokens, step checks, and the saved list with its versioned envelope (blocked storage included).
// Loaded in a vm context. Run with: node --test tests/node/pdf-macro-model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'shared', 'watermark', 'spec.js'), 'utf8'), ctx, { filename: 'spec.js' });   // the page ranges
vm.runInContext(readFileSync(path.join(ROOT, 'pdf', 'js', 'core', 'watermark.js'), 'utf8'), ctx, { filename: 'watermark.js' });
for (const f of ['pattern', 'model']) vm.runInContext(readFileSync(path.join(ROOT, 'pdf', 'js', 'macro', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const M = ctx.SlopPdfMacro;
// vm objects come from another realm, so compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

test('glob patterns match the whole file name, case-insensitively', () => {
  assert.equal(M.matchName('invoice-*.pdf', 'Invoice-2026-07.PDF'), true);
  assert.equal(M.matchName('invoice-*.pdf', 'receipt-invoice-1.pdf'), false, 'anchored at both ends');
  assert.equal(M.matchName('scan?.pdf', 'scan7.pdf'), true);
  assert.equal(M.matchName('scan?.pdf', 'scan77.pdf'), false);
  assert.equal(M.matchName('report (v2).pdf', 'report (v2).pdf'), true, 'brackets and parentheses are literal');
  assert.equal(M.matchName('a.b.pdf', 'aXb.pdf'), false, 'dots are literal');
  assert.equal(M.matchName('', 'anything.pdf'), false, 'an empty pattern matches nothing');
});

test('regular expression patterns are written between slashes', () => {
  assert.equal(M.matchName('/^inv-\\d{4}\\.pdf$/', 'INV-2026.pdf'), true, 'case-insensitive by default');
  assert.equal(M.matchName('/^inv-\\d{4}\\.pdf$/', 'inv-26.pdf'), false);
  assert.equal(M.matchName('/a\\.pdf/s', 'A.PDF'), true, 'flags other than g and y are kept, and i is added');
  assert.equal(M.matchName('/[/', 'x.pdf'), false, 'an invalid expression matches nothing');
  assert.throws(() => M.compilePattern('/[/'), /Invalid regular expression|Unterminated/);
});

test('the first automatic rule that matches wins, and a manual macro never runs on its own', () => {
  const macros = [
    { id: 'a', name: 'Manual', pattern: 'invoice-*.pdf', auto: 'off' },
    { id: 'b', name: 'Ask', pattern: 'invoice-*.pdf', auto: 'ask' },
    { id: 'c', name: 'Silent', pattern: '*.pdf', auto: 'silent' }
  ];
  assert.equal(M.findRule(macros, 'invoice-1.pdf').id, 'b');
  assert.equal(M.findRule(macros, 'notes.pdf').id, 'c');
  assert.deepEqual(plain(M.findRules(macros, 'invoice-1.pdf').map((m) => m.id)), ['b', 'c']);
  assert.equal(M.findRule([macros[0]], 'invoice-1.pdf'), null);
  assert.equal(M.findRule(null, 'x.pdf'), null);
});

test('page lists: ranges, keywords, order and the bounds', () => {
  assert.deepEqual(plain(M.parsePages('', 3)), [0, 1, 2]);
  assert.deepEqual(plain(M.parsePages('all', 3)), [0, 1, 2]);
  assert.deepEqual(plain(M.parsePages('3, 1-2, 2', 4)), [0, 1, 2]);
  assert.deepEqual(plain(M.parsePages('3-1', 4)), [0, 1, 2], 'a reversed range is read in order');
  assert.deepEqual(plain(M.parsePages('odd', 5)), [0, 2, 4]);
  assert.deepEqual(plain(M.parsePages('even', 5)), [1, 3]);
  assert.deepEqual(plain(M.parsePages('last', 5)), [4]);
  assert.throws(() => M.parsePages('two', 5), /“two” is not a page number/);
  assert.throws(() => M.parsePages('4', 3), /Page 4 is not in this file, which has 3 pages\./);
  assert.throws(() => M.parsePages('2', 1), /Page 2 is not in this file, which has 1 page\./);
  assert.deepEqual(plain(M.parsePages('2-4', Infinity)), [1, 2, 3], 'syntax-only checks skip the range');
});

test('tokens are filled in and unknown ones are left alone', () => {
  const info = { page: 2, pages: 5, date: '2026-10-11', filename: 'invoice-7.pdf' };
  assert.equal(M.expandTokens('Page {page} of {pages}, {date}, {filename}', info), 'Page 2 of 5, 2026-10-11, invoice-7.pdf');
  assert.equal(M.expandTokens('{unknown} {page}', info), '{unknown} 2');
  assert.equal(M.expandTokens(null, info), '');
});

test('the date is a local calendar date', () => {
  assert.equal(M.isoDate(new Date(2026, 0, 5, 12)), '2026-01-05');
  assert.equal(M.isoDate(new Date(2026, 10, 30, 23, 59)), '2026-11-30');
});

test('steps are normalised and checked with readable messages', () => {
  const ok = M.normalizeStep({ type: 'addPageNumbers', start: '4', colour: '#ABCDEF' });
  assert.deepEqual(plain(ok.errors), []);
  assert.equal(ok.step.start, 4);
  assert.equal(ok.step.colour, '#abcdef');
  assert.equal(ok.step.position, 'bottom-center');

  assert.match(M.normalizeStep({ type: 'replaceText', find: '' }).errors[0], /Replace text: Find is required/);
  assert.match(M.normalizeStep({ type: 'addWatermark', text: 'x', opacity: 2 }).errors[0], /Opacity \(0 to 1\) must be at most 1/);
  assert.match(M.normalizeStep({ type: 'addHeaderFooter', text: 'x', colour: 'red' }).errors[0], /Colour must be a colour such as #ff0000/);
  assert.match(M.normalizeStep({ type: 'rotate', angle: 45 }).errors[0], /Angle has a choice that is not offered/);
  assert.match(M.normalizeStep({ type: 'replaceText', find: '(', regex: true }).errors[0], /not a valid regular expression/);
  assert.match(M.normalizeStep({ type: 'stamp' }).errors[0], /A stamp needs an image or some text/);
  assert.match(M.normalizeStep({ type: 'stamp', imageDataUrl: 'data:image/gif;base64,AAAA' }).errors[0], /PNG or JPEG/);
  assert.equal(M.normalizeStep({ type: 'nope' }).step, null);
});

test('a macro is ready only with steps, a valid pattern and a pattern for automatic runs', () => {
  const m = M.newMacro('Invoices');
  assert.match(M.validateMacro(m)[0], /no steps/);
  m.steps.push(M.newStep('addPageNumbers'));
  assert.deepEqual(plain(M.validateMacro(m)), []);
  m.auto = 'ask';
  assert.match(M.validateMacro(m)[0], /Set a file name pattern/);
  m.pattern = 'invoice-*.pdf';
  assert.deepEqual(plain(M.validateMacro(m)), []);
  m.pattern = '/(/';
  assert.match(M.validateMacro(m).join(' '), /not a valid regular expression/);
});

test('saving writes the versioned envelope and loading reads it back', () => {
  const mem = new Map();
  M.setStorage({ getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) });
  const m = M.newMacro('Footer');
  m.steps.push(M.newStep('addHeaderFooter'));
  assert.equal(M.save([m]), true);
  const env = JSON.parse(mem.get('slop.pdf.macros.v1'));
  assert.equal(env.v, 1);
  assert.equal(env.data[0].name, 'Footer');
  assert.equal(env.data[0].steps[0].type, 'addHeaderFooter');
  const back = plain(M.load());
  assert.equal(back.length, 1);
  assert.equal(back[0].steps[0].text, 'Page {page} of {pages}');
});

test('damaged or foreign saved data is ignored, not thrown', () => {
  const mem = new Map();
  M.setStorage({ getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) });
  mem.set('slop.pdf.macros.v1', '{not json');
  assert.deepEqual(plain(M.load()), []);
  mem.set('slop.pdf.macros.v1', JSON.stringify({ v: 2, data: [] }));
  assert.deepEqual(plain(M.load()), []);
  mem.set('slop.pdf.macros.v1', JSON.stringify({ v: 1, data: [null, { id: 'x' }, { id: 'y', name: 'Ok', steps: [] }] }));
  assert.deepEqual(plain(M.load()).map((x) => x.id), ['y']);
});

test('blocked storage: reads fall back to memory and a failed write is reported', () => {
  M.setStorage({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } });
  assert.deepEqual(plain(M.load()), []);
  const m = M.newMacro('Kept');
  assert.equal(M.save([m]), false, 'the caller is told the browser did not keep it');
  assert.deepEqual(plain(M.load()).map((x) => x.name), ['Kept'], 'the memory copy still holds it for this page');
  M.setStorage(null);
  assert.equal(M.save([m]), false);
  M.setStorage(undefined);
});
