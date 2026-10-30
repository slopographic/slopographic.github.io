// Slop Timesheets, typed durations in every shipped language (timesheets/js/core/time.js: parseDuration and its UNITS
// table), and every example the translated hints give ('timesheets.ed.bad_time', 'timesheets.page.duration_ph') parses.
// Covers: timesheets/js/core/time.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const T = require('../../timesheets/js/core/time.js');
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'timesheets', 'i18n');

test('unit words of the shipped languages, any case, with or without spaces, with an abbreviation dot', () => {
  const cases = {
    '90м': 90, '90 мин': 90, '90 МИН.': 90, '2 ч 15 мин': 135, '1,5 ч': 90,   // ru
    '90 хв': 90, '2 год 30 хв': 150,   // uk
    '90 min': 90, '1,5 godz.': 90, '2 godziny': 120, '45 minut': 45,   // pl
    '2 Std. 15 Min.': 135, '3 Stunden': 180, '90 Minuten': 90,   // de
    '2 heures': 120, '90 mn': 90, '1 h 30': 90,   // fr
    '2 horas': 120, '90 minutos': 90, '2 ore': 120, '90 minuti': 90,   // es, pt, it
    '1,5 tim': 90, '2 timmar': 120, '2t 15m': 135, '90 minuter': 90,   // sv
    '1u30': 90, '2 uur': 120, '90 minuten': 90,   // nl, af
    '2 saat': 120, '90 dk': 90, '2 jam': 120, '90 menit': 90, '1 giờ 30 phút': 90, '90 phút': 90,   // tr, id, vi
    '1時間30分': 90, '２時間': 120, '90分': 90, '90分钟': 90, '1小时30分钟': 90, '2小時': 120, '90 분': 90, '2시간': 120,   // ja, zh, ko
    '١٫٥ ساعة': 90, '٩٠ دقيقة': 90, '2 ساعات': 120, '90 דקות': 90, '2 שעות': 120, '90 मिनट': 90, '2 घंटे': 120,   // ar, he, hi
    '2 saa': 120, '90 dakika': 90, '90 ደቂቃ': 90, '2 ሰዓት': 120, '90 ìṣẹ́jú': 90, '1 wákàtí': 60, '90 imizuzu': 90, '2 amahora': 120,
  };
  for (const [t, m] of Object.entries(cases)) assert.equal(T.parseDuration(t), m, t);
  // a unit alone, seconds, or a minute word where hours go first is still refused
  for (const t of ['мин', '90s', '2s', '90 сек', '30 мин 2 ч', '25 ч', '1500 мин']) assert.equal(T.parseDuration(t), null, t);
});

test('no word is an hour in one language and a minute in another', () => {
  const words = (s) => new Set(T.fold(s).split(' '));
  const h = words(T.UNITS.h), m = words(T.UNITS.m);
  assert.deepEqual([...h].filter((w) => m.has(w)), []);
});

/** The examples a hint gives: a number, and the letters right after it when they are a unit ("90m", "90 min", "1,5"). */
function examples(text) {
  const out = [];
  for (const x of text.matchAll(/(\d+(?:[:.,]\d+)?)( ?)(\p{L}*)/gu)) {
    const [, num, space, word] = x;
    // the longest start of the following word that parses with the number (stops before "まで", "o", "lub", ")"...)
    let best = null;
    for (let i = word.length; i > 0 && best === null; i--) if (T.parseDuration(num + space + word.slice(0, i)) !== null) best = num + space + word.slice(0, i);
    // letters glued to the number are a unit ("90м"): they must parse; a word after a space may be "or" ("1,5 o 90m")
    if (best === null) best = space || !word ? num : num + word;
    out.push(best);
  }
  return out;
}

test('every example in every language\'s duration hint parses', async () => {
  const keys = /'timesheets\.(?:ed\.bad_time|page\.duration_ph)':\s*(['"])(.*?)\1,/g;
  let seen = 0;
  for (const lang of await readdir(DIR)) {
    if (lang.endsWith('.js')) continue;
    for (const f of await readdir(path.join(DIR, lang))) {
      const src = await readFile(path.join(DIR, lang, f), 'utf8');
      for (const [, , hint] of src.matchAll(keys)) {
        const ex = examples(hint);
        assert.ok(ex.length >= 3, `${lang}: ${hint}`);
        for (const e of ex) assert.notEqual(T.parseDuration(e), null, `${lang}/${f}: "${e}" in "${hint}"`);
        seen++;
      }
    }
  }
  assert.ok(seen >= 18, `hints read: ${seen}`);   // en, sv, de, fr, es, pt-BR, zh-CN, ja, ar: two each
});

test('the hint reader keeps glued units and stops at words that are not units', () => {
  assert.deepEqual(examples('1:30, 1,5 o 90m (hasta 24 horas).'), ['1:30', '1,5', '90m', '24 horas']);
  assert.deepEqual(examples('Wpisz czas, na przykład 1:30, 1,5 lub 90м'), ['1:30', '1,5', '90м']);
  assert.deepEqual(examples('1:30、1.5、または 90m'), ['1:30', '1.5', '90m']);
  assert.deepEqual(examples('（例：90分。24 時間まで）'), ['90分', '24 時間']);
  assert.equal(T.parseDuration(examples('90xyz')[0]), null);   // an unknown glued unit is caught
});
