// Covers: tests/needs.mjs, tests/run.mjs, tests/english.js, tests/harness.js
// The page tags that keep a feature's tests to the builds that ship the feature (tests/needs.mjs), and the pages that
// carry them: the buddy engine's pages need the built-in mascot, and a page checks the other side of each switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { needsOf, unmet, loadFacts, englishFirst } from '../needs.mjs';
import { FACTS, BRAND, ROOT } from '../brand-facts.mjs';

const F = { mascot: 'overlay', media: false, defaultLang: 'sv' };

test('a page with no tag runs everywhere; a tag runs a page only where every condition holds', () => {
  assert.deepEqual(needsOf('<title>x</title>'), []);
  const n = needsOf('<meta name="slop-test-needs" content="mascot=builtin|overlay; media=false">');
  assert.deepEqual(n, [{ key: 'mascot', values: ['builtin', 'overlay'] }, { key: 'media', values: ['false'] }]);
  assert.deepEqual(unmet(n, F), []);
  assert.deepEqual(unmet(n, { ...F, mascot: 'none' }).map((c) => c.key), ['mascot']);
  assert.deepEqual(unmet(needsOf('<meta name="slop-test-needs" content="media=true">'), F).map((c) => c.key), ['media']);
  assert.throws(() => unmet(needsOf('<meta name="slop-test-needs" content="mascott=builtin">'), F), /no brand fact "mascott"/);
  assert.throws(() => needsOf('<meta name="slop-test-needs" content="mascot">'), /key=value/);
  const all = loadFacts();
  for (const k of Object.keys(FACTS)) assert.equal(JSON.stringify(all[k]), JSON.stringify(FACTS[k]), k);
  for (const k of ['exportCard', 'donate', 'ads']) assert.equal(all[`support.${k}`], BRAND.support[k], k);
  assert.deepEqual(unmet(needsOf('<meta name="slop-test-needs" content="support.exportCard=true">'), { 'support.exportCard': false }).map((c) => c.key), ['support.exportCard']);
});

test('the pages of the buddy engine need it, the slot needs a mascot, and the off page needs none', () => {
  const needs = (f) => needsOf(readFileSync(path.join(ROOT, f), 'utf8'));
  for (const f of ['tests/buddy/app.test.html', 'tests/buddy/care.test.html', 'tests/buddy/mood.test.html', 'tests/buddy/tips.test.html']) {
    assert.deepEqual(needs(f), [{ key: 'mascot', values: ['builtin'] }], f);
  }
  assert.deepEqual(needs('tests/buddy/off.test.html'), [{ key: 'mascot', values: ['none'] }]);
  const run = readFileSync(path.join(ROOT, 'tests/run.mjs'), 'utf8');
  assert.match(run, /unmet\(needsOf\(/);
});

test('in a build that starts in another language the runner stores English before the page loads, in the top page only', () => {
  const page = '<title>x</title>', aboutStart = '<meta name="slop-test-lang" content="default">';
  assert.equal(englishFirst(page, { defaultLang: 'sv' }), true);
  assert.equal(englishFirst(aboutStart, { defaultLang: 'sv' }), false);
  assert.equal(englishFirst(page, { defaultLang: 'en' }), false);
  const src = readFileSync(path.join(ROOT, 'tests/english.js'), 'utf8');
  /** tests/english.js in a window over a storage; returns what it stored (null: nothing) and the window. */
  const run = (stored, { init = true, top = true } = {}) => {
    const box = { v: stored, sets: 0 }, w = { localStorage: { getItem: () => box.v, setItem: (k, v) => { box.sets++; box.k = k; box.v = v; } } };
    w.top = top ? w : {}; w.__SLOPTEST_ENGLISH__ = init;
    vm.runInNewContext(src, { window: w });
    return { box, w };
  };
  const { box } = run(null);
  assert.equal(box.k, 'slop-profile');
  assert.deepEqual(JSON.parse(box.v), { v: 1, data: { lang: { mode: 'en' } } });
  // the app's frame (an init script runs in every frame) stores nothing: the choice is the test page's
  assert.equal(run(null, { top: false }).box.sets, 0);
  // the harness (no init flag) stores it when asked, keeping the rest of the profile; already English: no write, no storage event
  const kept = run(JSON.stringify({ v: 1, data: { tables: { grid: true } } }), { init: false });
  assert.equal(kept.box.sets, 0);
  kept.w.SlopTestEnglish();
  assert.deepEqual(JSON.parse(kept.box.v).data, { tables: { grid: true }, lang: { mode: 'en' } });
  kept.w.SlopTestEnglish();
  assert.equal(kept.box.sets, 1);
});
