// The pure side of Slop PDF find (pdf/js/find/search.js on the macro locator in pdf/js/macro/text.js): stepping
// through matches, the count label, the context text, and the match model (case, whole word, matches across items).
// Run with: node --test tests/node/pdf-find.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console, SP: {} };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['macro/text.js', 'find/search.js']) vm.runInContext(readFileSync(path.join(ROOT, 'pdf', 'js', f), 'utf8'), ctx, { filename: f });
const F = ctx.SlopPdfFind, T = ctx.SlopPdfMacro.text;
const plain = (v) => JSON.parse(JSON.stringify(v));

/** A pdf.js-shaped text content: items [{str, x, y, w, fs, eol}] on one font. */
function tc(items) {
  return {
    items: items.map((i) => ({ str: i.str, width: i.w, transform: [i.fs || 10, 0, 0, i.fs || 10, i.x || 0, i.y || 0], fontName: 'f1', hasEOL: !!i.eol })),
    styles: { f1: { fontFamily: 'Helvetica' } },
  };
}
const measure = (fam, str, fs) => str.length * fs * 0.5; // 0.5 em per character: exact for these fixtures

test('stepping wraps at both ends, and an empty result stays at -1', () => {
  assert.equal(F.step(0, 3, 1), 1);
  assert.equal(F.step(2, 3, 1), 0, 'Next wraps to the first');
  assert.equal(F.step(0, 3, -1), 2, 'Previous wraps to the last');
  assert.equal(F.step(-1, 3, 1), 0, 'the first Next from no match is the first');
  assert.equal(F.step(-1, 3, -1), 2, 'the first Previous from no match is the last');
  assert.equal(F.step(0, 0, 1), -1);
});

test('the count label reads "3 of 12", "No results" or "Searching…"', () => {
  assert.equal(F.label(2, 12, false), '3 of 12');
  assert.equal(F.label(0, 0, false), 'No results');
  assert.equal(F.label(0, 5, true), 'Searching…');
});

test('the context shows the match with text around it, and ellipses only where text is cut', () => {
  const text = 'The quick brown fox jumps over the lazy dog. The fox sleeps.';
  const start = text.indexOf('fox');
  const c = plain(F.context(text, start, start + 3));
  assert.equal(c.match, 'fox');
  assert.equal(c.before, (start > 30 ? '…' : '') + text.slice(Math.max(0, start - 30), start), 'thirty characters before, with an ellipsis where text is cut');
  assert.equal(c.after.endsWith('…'), true, 'more text follows: an ellipsis');
  const s3 = text.indexOf('sleeps');
  assert.equal(plain(F.context(text, s3, s3 + 6)).after, '.', 'the end of the text: no ellipsis');
  assert.equal(plain(F.context(text, 0, 3)).before, '', 'the start of the text: no ellipsis before');
});

test('case is ignored unless Match case is on', () => {
  const doc = tc([{ str: 'Apple pie, apple tart, APPLE', x: 0, y: 100, w: 150 }]);
  assert.equal(T.find(T.index(doc), 'apple', { caseSensitive: false }, measure).length, 3);
  assert.equal(T.find(T.index(doc), 'apple', { caseSensitive: true }, measure).length, 1);
});

test('Whole word needs no letter, digit or underscore beside the match, in any script', () => {
  const doc = tc([{ str: 'Apple pie applesauce apples APPLE', x: 0, y: 100, w: 200 }]);
  const substring = T.find(T.index(doc), 'apple', { caseSensitive: false }, measure);
  assert.equal(substring.length, 4);
  const whole = T.find(T.index(doc), 'apple', { caseSensitive: false, wholeWord: true }, measure);
  const big = 'Apple pie applesauce apples APPLE';
  assert.deepEqual(plain(whole.map((m) => m.index)), [0, big.indexOf('APPLE')]);
  const uni = tc([{ str: 'café caf cafés', x: 0, y: 100, w: 100 }]);
  assert.equal(T.find(T.index(uni), 'caf', { caseSensitive: false, wholeWord: true }, measure).length, 1, 'é is a letter, so "caf" inside "café" and "cafés" does not count');
  const under = tc([{ str: 'a_b ab', x: 0, y: 100, w: 40 }]);
  assert.equal(T.find(T.index(under), 'ab', { wholeWord: true }, measure).length, 1, 'an underscore is part of a word');
});

test('a match can run across text items and lines, with a space where the text breaks', () => {
  const doc = tc([{ str: 'Hel', x: 0, y: 100, w: 18 }, { str: 'lo', x: 18, y: 100, w: 12 }, { str: 'world', x: 0, y: 80, w: 30, eol: true }]);
  const ix = T.index(doc);
  assert.equal(ix.text, 'Hello world', 'the new line gives a space');
  const found = T.find(ix, 'hello world', { caseSensitive: false }, measure);
  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'Hello world');
  assert.equal(found[0].precise, true, 'every piece of it is located');
});

test('a match inside one item is precise only when the font metrics agree with its width', () => {
  const exact = tc([{ str: 'secret text', x: 0, y: 100, w: 55 }]);
  assert.equal(T.find(T.index(exact), 'text', {}, measure)[0].precise, true);
  const off = tc([{ str: 'secret text', x: 0, y: 100, w: 90 }]);
  assert.equal(T.find(T.index(off), 'text', {}, measure)[0].precise, false, 'an unknown width is not guessed');
});
