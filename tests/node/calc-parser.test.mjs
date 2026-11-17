// Slopculator parser and evaluator: precedence, percentages, roots, units, currency, dates and time arithmetic.
// Run with: node tests/run.mjs calc   (or: node --test tests/node/calc-parser.test.mjs)
// Covers: shared/calc/lexer.js, shared/calc/parser.js, shared/calc/evaluate.js, shared/calc/exact.js, shared/calc/units.js, shared/calc/format.js, shared/calc/calc.js, shared/i18n/ui/en/calc.js, shared/i18n/ui/sv/calc.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCalc } from './calc-env.mjs';

const C = await loadCalc();
const TODAY = '2026-10-11';
const RATES = { 'USD>EUR': 0.9, 'EUR>USD': 1.1 };
const rate = (from, to) => RATES[`${from}>${to}`];
const run = (src, extra = {}) => C.calc(src, { today: TODAY, rate, ...extra });
const ok = (src, extra) => { const r = run(src, extra); assert.equal(r.ok, true, `${src}: ${r.error && r.error.message}`); return r; };
const bad = (src, code, extra) => { const r = run(src, extra); assert.equal(r.ok, false, `${src} should fail, got ${r.text}`); assert.equal(r.error.code, code, `${src}: ${r.error.message}`); return r.error; };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

test('precedence and brackets', () => {
  assert.equal(ok('2 + 3 * 4').value.v, 14);
  assert.equal(ok('2 ^ 3 ^ 2').value.v, 512);
  assert.equal(ok('-2 ^ 2').value.v, -4);
  assert.equal(ok('(2 + 3) * 4').value.v, 20);
  assert.equal(ok('10 - 4 - 3').value.v, 3);
  assert.equal(ok('2 * 3 ^ 2').value.v, 18);
  assert.equal(ok('2 ^ -1').value.v, 0.5);
  assert.equal(ok('((1 + 1) * (2 + 2)) / 4').value.v, 2);
  assert.equal(ok('2 ** 3').value.v, 8);
  assert.equal(ok('6 × 7 ÷ 2 − 1').value.v, 20);
});

test('display rounds float noise and uses separators', () => {
  assert.equal(ok('0.1 + 0.2').text, '0.3');
  assert.equal(ok('1000 * 1.5').text, '1,500');
  assert.equal(ok('-0 * 5').text, '0');
});

test('percentages: plus, minus, of, and the tax, discount and markup helpers', () => {
  assert.equal(ok('200 + 20%').value.v, 240);
  assert.equal(ok('200 - 15%').value.v, 170);
  assert.equal(ok('100 + 25%').value.v, 125);
  assert.equal(ok('50%').text, '50%');
  assert.equal(ok('50%').value.v, 0.5);
  assert.equal(ok('20% of 150').value.v, 30);
  assert.equal(ok('8% of 1000 + 1').value.v, 81);
  assert.equal(ok('3 * 20%').text, '0.6');
  assert.equal(ok('tax(200, 8)').value.v, 216);
  assert.equal(ok('tax(200, 8%)').value.v, 216);
  assert.equal(ok('discount(200, 15)').value.v, 170);
  assert.equal(ok('markup(100, 25)').value.v, 125);
  bad('20% + of 5', 'syntax');
  bad('tax(200)', 'syntax');
});

test('roots, powers and named constants', () => {
  assert.equal(ok('sqrt(16)').value.v, 4);
  assert.equal(ok('√9 + 1').value.v, 4);
  assert.equal(ok('cbrt(27)').value.v, 3);
  assert.equal(ok('abs(-3)').value.v, 3);
  close(ok('pi').value.v, Math.PI, 1e-12);
  assert.equal(ok('ans * 2', { ans: { t: 'n', v: 5 } }).value.v, 10);
  bad('sqrt(-1)', 'math');
  bad('1 / 0', 'math');
  bad('ans', 'syntax');
});

test('unit conversion with in and to', () => {
  assert.equal(ok('5 km in m').text, '5,000 m');
  assert.equal(ok('5 km to m').text, '5,000 m');
  assert.equal(ok('1 mi in km').text, '1.609344 km');
  close(ok('2 lb in kg').value.v, 0.90718474, 1e-12);
  assert.equal(ok('12 inches in ft').text, '1 ft');
  assert.equal(ok('100 C in F').text, '212°F');
  assert.equal(ok('0 C in K').text, '273.15 K');
  assert.equal(ok('98.6 F in C').text, '37°C');
  assert.equal(ok('2 gal in L').text, '7.570823568 L');
  assert.equal(ok('5 m in ft').value.unit, 'ft');
  assert.equal(ok('2 km + 300 m').text, '2.3 km');
  close(ok('1 kg + 1 lb').value.v, 1.45359237, 1e-12);
  assert.equal(ok('3 * 4 kg').text, '12 kg');
  assert.equal(ok('5 km / 2 km').value.v, 2.5);
});

test('unit errors name the problem', () => {
  bad('5 km + 3', 'type');
  bad('5 km + 2 h', 'unit');
  bad('5 km * 2 km', 'type');
  bad('100 C + 5', 'type');
  bad('100 C * 2', 'type');
  bad('5 foo', 'unit');
  bad('5 in cm', 'unit');
  bad('5 km in h', 'unit');
});

test('currency uses the rate the caller supplies, and asks for a missing one', () => {
  assert.equal(ok('100 USD in EUR').text, '90.00 EUR');
  assert.equal(ok('100 USD + 50 EUR').text, '155.00 USD');
  const e = bad('100 USD in GBP', 'rate');
  assert.equal(e.from, 'USD');
  assert.equal(e.to, 'GBP');
  assert.equal(ok('5 m in ft').value.dim, 'length', 'm is metres, never a currency');
});

test('date arithmetic: add and subtract days, weeks, months and years', () => {
  assert.equal(ok('2026-01-31 + 1 month').value.iso, '2026-02-28');
  assert.equal(ok('2026-03-01 - 2 weeks').value.iso, '2026-02-15');
  assert.equal(ok('2026-10-11 + 90 days').value.iso, '2027-01-09');
  assert.equal(ok('2026-10-11 - 2 days').value.iso, '2026-10-09');
  assert.equal(ok('2024-02-29 + 1 year').value.iso, '2025-02-28');
  assert.equal(ok('today + 1 week').value.iso, '2026-10-18');
  assert.equal(ok('2026-01-15 + 3 months').value.iso, '2026-04-15');
  assert.equal(ok('2026-03-31 - 1 month').value.iso, '2026-02-28');
});

test('yyyymmdd without dashes is a date, and a bare number after a date is days', () => {
  assert.equal(ok('20261011 + 40').value.iso, '2026-11-20');
  assert.equal(ok('20261011 - 40').value.iso, '2026-09-01');
  assert.equal(ok('20261011 + 2 weeks').value.iso, '2026-10-25');
  assert.equal(ok('20261011 - 20260101').text, '283 days');
  assert.equal(ok('12345678 + 1').value.v, 12345679);
});

test('date differences in days, weeks and years', () => {
  assert.equal(ok('2026-12-25 - 2026-10-11').text, '75 days');
  assert.equal(ok('2026-10-11 - 2026-12-25').text, '-75 days');
  assert.equal(ok('2026-12-25 - 2026-10-11 in days').value.v, 75);
  close(ok('2026-12-25 - 2026-10-11 in weeks').value.v, 75 / 7, 1e-9);
  close(ok('2026-12-25 - 2026-10-11 in years').value.v, 75 / 365.2425, 1e-9);
  assert.equal(ok('2 weeks in days').text, '14 days');
  assert.equal(ok('1 day').text, '1 day');
});

test('date errors', () => {
  bad('2026-02-30', 'syntax');
  bad('2026-10-11 + 2h', 'type');
  assert.equal(ok('2026-10-11 + 3').value.iso, '2026-10-14');  // a bare number is days
  bad('2026-10-11 + 1.5 weeks', 'math');
  bad('2026-10-11 * 2', 'type');
});

test('time arithmetic: times of day, durations and time differences', () => {
  assert.equal(ok('09:30 + 2h 45m').text, '12:15');
  assert.equal(ok('09:30 + 90 min').text, '11:00');
  assert.equal(ok('23:30 + 1h').text, '00:30');
  assert.equal(ok('17:00 - 08:15').text, '8 h 45 min');
  assert.equal(ok('08:00 - 17:00').text, '-9 h');
  assert.equal(ok('2h 45m in min').value.v, 165);
  assert.equal(ok('2h 45m').value.v, 165);
  assert.equal(ok('90 min').text, '1 h 30 min');
  assert.equal(ok('1h 30min + 45 min').text, '2 h 15 min');
  assert.equal(ok('2h 45m + 1 h').text, '3 h 45 min');
});

test('time errors', () => {
  bad('25:00', 'syntax');
  bad('09:30 + 2', 'type');
  bad('09:30 + 2 weeks', 'type');
  bad('09:30 + 08:00', 'type');
  bad('2h 45m + 3 m', 'unit');
});

test('syntax errors point at the problem', () => {
  assert.equal(bad('2 +', 'syntax').message, 'The expression stops early');
  assert.match(bad('(2 + 3', 'syntax').message, /Expected \)/);
  assert.match(bad('2 3', 'syntax').message, /Unexpected/);
  assert.match(bad('', 'syntax').message, /Type an expression/);
  assert.match(bad('2 # 3', 'syntax').message, /Unexpected character/);
  assert.match(bad('foo', 'name').message, /Unknown name/); // a name the page does not hold: a variable, resolved when evaluated
  bad('max(1, 2)', 'syntax');
});

test('names that exist on Object.prototype are not units or functions', () => {
  bad('5 constructor', 'unit');
  bad('constructor(3)', 'syntax');
  bad('5 toString', 'unit');
});

test('an unexpected failure comes back as an error, never a thrown exception', () => {
  const boom = C.calc('100 USD in EUR', { today: TODAY, rate: () => { throw new Error('boom'); } });
  assert.equal(boom.ok, false);
  assert.match(boom.error.message, /boom/);
  assert.equal(C.calc('5 km / 0').error.code, 'math');
  assert.equal(C.calc('tax()').ok, false);
  assert.equal(C.calc('--3').text, '3');
  assert.equal(C.calc('100 USD + 8%', { rate }).text, '108.00 USD', 'a percentage of a currency needs no rate');
});

test('messages follow the language (shared/i18n/ui/<code>/calc.js); the codes stay as they are', async () => {
  const S = await loadCalc('sv');
  const sv = (src) => S.calc(src, { today: TODAY, rate }).error;
  assert.deepEqual([sv('5 / 0').code, sv('5 / 0').message], ['math', 'Division med noll']);
  assert.equal(sv('2 +').message, 'Uttrycket slutar för tidigt');
  assert.equal(sv('5 km + 2 kg').message, 'Kan inte addera massa och längd');
  assert.equal(sv('100 USD in SEK').code, 'rate');
  assert.equal(sv('sqrt(1, 2)').message, 'sqrt tar 1 argument');
  assert.equal(S.units.categories().find((c) => c.key === 'mass').label, 'Vikt');
  assert.equal(C.units.categories().find((c) => c.key === 'mass').label, 'Weight');
  assert.equal(run('sqrt(1, 2)').error.message, 'sqrt takes 1 argument');   // the #one form
});
