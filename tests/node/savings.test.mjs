// Covers: shared/savings/data.mjs, home/savings.js, shared/savings/i18n/index.js, index.html
// The yearly savings (shared/savings/data.mjs): the total is the sum of the plans, each plan counted once; every price
// has a pricing page and a checked date; every app it names is in the registry and in one plan only; the homepage's line
// shows the rounded-down total (or, with the profile's "savings": false, neither the line nor the list is there).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { PLANS, CURRENCY, yearly, TOTAL, SHOWN, CHECKED } from '../../shared/savings/data.mjs';
import { FACTS, registry, ROOT } from '../brand-facts.mjs';

const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const table = (code) => { const out = {}; vm.runInNewContext(read(`shared/savings/i18n/${code}/home.js`), { window: { SlopI18n: { add: (c, d) => Object.assign(out, d) } } }); return out; };

test('the total is the sum of the plans, each plan once; the shown figure rounds it down to the hundred', () => {
  const cents = PLANS.reduce((s, p) => s + Math.round(yearly(p) * 100), 0);
  assert.equal(Math.round(TOTAL * 100), cents);
  assert.equal(SHOWN, Math.floor(cents / 10000) * 100);
  assert.ok(SHOWN <= TOTAL && TOTAL - SHOWN < 100);
  assert.equal(CURRENCY, 'USD');
  for (const p of PLANS) {
    assert.ok((p.month === undefined) !== (p.year === undefined), `${p.id}: a monthly or a yearly price, not both`);
    assert.ok(yearly(p) > 0 && yearly(p) < 2000, `${p.id}: ${yearly(p)}`);
    if (p.month !== undefined) assert.equal(yearly(p), Math.round(p.month * 1200) / 100);
  }
  assert.equal(new Set(PLANS.map((p) => p.id)).size, PLANS.length, 'plan ids are unique');
  assert.equal(new Set(PLANS.map((p) => p.name)).size, PLANS.length, 'no plan twice under another id');
});

test('every price has its pricing page, the date it was checked and its terms in words', () => {
  const en = table('en'), today = new Date().toISOString().slice(0, 10);
  for (const p of PLANS) {
    assert.match(p.source, /^https:\/\/[^\s]+$/, p.id);
    assert.match(p.checked, /^20\d\d-[01]\d-[0-3]\d$/, p.id);
    assert.ok(!Number.isNaN(Date.parse(p.checked)) && p.checked <= today, `${p.id}: checked ${p.checked}`);
    assert.ok(typeof p.name === 'string' && p.name.length > 2, p.id);
    assert.ok(en['savings.terms.' + p.terms], `${p.id}: no words for terms ${p.terms}`);
  }
  assert.equal(CHECKED, PLANS.map((p) => p.checked).sort().pop());
});

test('every app is in the registry and in one plan only (a bundle covers its apps once)', () => {
  const ids = new Set(registry().all.map((a) => a.id)), seen = new Map();
  for (const p of PLANS) {
    assert.ok(p.apps.length > 0, p.id);
    for (const id of p.apps) {
      assert.ok(ids.has(id), `${p.id}: ${id} is not in shared/apps.js`);
      assert.ok(!seen.has(id), `${id} is in ${seen.get(id)} and ${p.id}`);
      seen.set(id, p.id);
    }
  }
});

test('the homepage line shows the rounded total, with the list it links to; or neither when the profile hides them', () => {
  const html = read('index.html'), js = read('home/savings.js');
  assert.match(js, /from '\.\.\/shared\/savings\/data\.mjs'/);
  const line = /<p class="hx-save"><span data-i18n="savings\.hero\.line" data-i18n-vars='\{"total":(\d+)\}'>([^<]*)<\/span><a class="hx-save-star" href="#savings"/.exec(html);
  if (!FACTS.savings) {
    assert.equal(line, null);
    assert.ok(!html.includes('id="savings"'));
    return;
  }
  assert.ok(line, 'the hero line');
  assert.equal(Number(line[1]), SHOWN);
  // the HTML's own text is the English line as the page fills it (no change, so nothing moves at load)
  assert.equal(line[2], table('en')['savings.hero.line'].replace('{total}', SHOWN.toLocaleString('en')));
  assert.ok(html.includes('<section id="savings"') && html.includes('id="savings-how"') && html.includes('id="savings-list"'));
  assert.ok(html.includes('<script src="shared/savings/i18n/index.js"'), 'the tables load in the head');
  const sv = table('sv');
  for (const k of Object.keys(table('en'))) assert.ok(sv[k], `sv: ${k}`);
});
