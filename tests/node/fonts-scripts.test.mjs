// Writing systems and bidirectional layout (shared/fonts/scripts.js, shared/fonts/bidi.js): the script and pack of a
// character, the packs a text needs, and the visual order of mixed right-to-left and left-to-right lines.
// Covers: shared/fonts/scripts.js, shared/fonts/bidi.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../../shared/fonts/scripts.js'), B = require('../../shared/fonts/bidi.js');
const cp = (c) => c.codePointAt(0);
const plain = (v) => JSON.parse(JSON.stringify(v));

test('the script and the pack of a character', () => {
  const cases = [['A', 'latin', 'noto-sans'], ['ł', 'latin', 'noto-sans'], ['Ж', 'cyrillic', 'noto-sans'], ['λ', 'greek', 'noto-sans'],
    ['م', 'arabic', 'noto-arabic'], ['٣', 'arabic-digit', 'noto-arabic'], ['ש', 'hebrew', 'noto-hebrew'], ['न', 'devanagari', 'noto-devanagari'],
    ['ก', 'thai', 'noto-thai'], ['ក', 'khmer', 'noto-khmer'], ['あ', 'kana', 'noto-jp'], ['한', 'hangul', 'noto-kr'], ['中', 'han', 'noto-sc'],
    ['𠀀', 'han', 'noto-sc'], ['ሀ', 'ethiopic', 'noto-ethiopic'], [' ', 'common', null], ['7', 'common', null], ['€', 'common', null]];
  for (const [c, script, pack] of cases) assert.deepEqual([c, S.scriptOf(cp(c)), S.packOf(cp(c))], [c, script, pack]);
  assert.equal(S.packOf(cp('中'), { han: 'tc' }), 'noto-tc');
});

test('Chinese characters follow the text and the language: kana means Japanese, hangul Korean', () => {
  assert.equal(S.hanFor('東京に行く'), 'jp');
  assert.equal(S.hanFor('한국어 漢字'), 'kr');
  assert.equal(S.hanFor('發票', 'zh-TW'), 'tc');
  assert.equal(S.hanFor('发票', 'ja'), 'jp');
  assert.equal(S.hanFor('发票', 'en-US'), 'sc');
});

test('packsFor lists only what the current font cannot set, once each, in order', () => {
  const ascii = (c) => c < 0x80;
  assert.deepEqual(S.packsFor('Invoice 发票 فاتورة 发', ascii), ['noto-sc', 'noto-arabic']);
  assert.deepEqual(S.packsFor('Hello, world 123', ascii), []);
  assert.deepEqual(S.packsFor('Привет', () => false), ['noto-sans']);
});

const fontOf = (c) => { const p = S.packOf(c); return p || null; };
const seg = (t, base) => plain(B.segments(t, { fontOf, base })).map((s) => [s.text, s.rtl]);

test('Arabic with digits: the number keeps its order, on the left of the words', () => {
  assert.deepEqual(seg('مرحبا 123'), [['123', false], ['مرحبا ', true]]);
  assert.deepEqual(seg('المبلغ ٤٥ ريال'), [[' ريال', true], ['٤٥', false], ['المبلغ ', true]]);
});

test('Latin with an Arabic or Hebrew phrase: the phrase reads right to left inside the line', () => {
  // digits after an Arabic word belong to it (UAX #9 W2), as browsers show: "Invoice 45 فاتورة"
  assert.deepEqual(seg('Invoice فاتورة 45'), [['Invoice ', false], ['45', false], ['فاتورة ', true]]);
  assert.deepEqual(seg('Shalom שלום עולם!'), [['Shalom ', false], ['שלום עולם', true], ['!', false]]);
});

test('a right-to-left line with an English word: the last word is on the left, the English reads left to right', () => {
  assert.deepEqual(seg('שלום Bob שלום'), [['שלום', true], [' ', true], ['Bob', false], ['שלום ', true]]);
});

test('fonts split a line where the script changes; spaces and digits stay with the run before them', () => {
  assert.deepEqual(plain(B.segments('Total 合計 1200', { fontOf })).map((x) => [x.text, x.font]), [['Total ', 'noto-sans'], ['合計 1200', 'noto-sc']]);
});

test('base direction: the first strong character, unless given', () => {
  assert.equal(B.baseOf('123 שלום abc'), 'rtl');
  assert.equal(B.baseOf('abc שלום'), 'ltr');
  assert.equal(B.baseOf('123 !'), 'ltr');
  assert.deepEqual(seg('abc', 'rtl').map((x) => x[0]), ['abc']);
  assert.deepEqual(B.segments('', {}), []);
});

test('N0: a bracket pair takes the direction of the strong text inside it', () => {
  const lv = (text, base) => { const cps = [...text].map(cp); const l = B.levels(cps, base); return (ch) => l[[...text].indexOf(ch)]; };
  // right-to-left words in brackets inside English: both brackets join the Arabic run
  let at = lv('English العربية (عربي) end', 0);
  assert.deepEqual([at('('), at(')')], [1, 1]);
  assert.deepEqual(seg('English العربية (عربي) end').filter((x) => x[1]).map((x) => x[0]), ['العربية (عربي)']);
  // English in brackets: stays left to right
  at = lv('say (hello) now', 0);
  assert.deepEqual([at('('), at(')')], [0, 0]);
  // Hebrew in brackets after English, in an English paragraph: the text before is left to right, so the brackets are too
  at = lv('see (שלום) here', 0);
  assert.deepEqual([at('('), at(')')], [0, 0]);
  // English in brackets inside a right-to-left paragraph, after Hebrew: the brackets follow the paragraph
  at = lv('שלום (abc) עולם', 1);
  assert.deepEqual([at('('), at(')')], [1, 1]);
  // unmatched brackets are left alone; nested pairs are each resolved
  assert.equal(lv('a ( b', 0)('('), 0);
  at = lv('x [מ (y) נ] z', 0);
  assert.deepEqual([at('['), at(']')], [0, 0]);
});

test('reorder (L2) puts items at higher levels in reverse, highest first', () => {
  assert.deepEqual(B.reorder([{ level: 0, t: 'a' }, { level: 1, t: 'b' }, { level: 1, t: 'c' }, { level: 0, t: 'd' }]).map((x) => x.t), ['a', 'c', 'b', 'd']);
  assert.deepEqual(B.reorder([{ level: 1, t: 'a' }, { level: 2, t: 'b' }, { level: 1, t: 'c' }]).map((x) => x.t), ['c', 'b', 'a']);
});
