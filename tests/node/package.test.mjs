// Node tests for the package generator (package/js/package.js). Run: node --test tests/node/package.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackage, toCsv, seedFromHash, SEED_PATTERN, newPackageSeed } from '../../package/js/package.js';

test('the same seed gives the same document, table and outline', () => {
  const a = buildPackage('harbour-42-alpha'), b = buildPackage('harbour-42-alpha');
  assert.deepEqual(a.doc, b.doc);
  assert.equal(a.table, b.table);
  assert.equal(a.outline, b.outline);
});

test('different seeds give different packages (20 seeds, all distinct)', () => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const p = buildPackage('seed-number-' + i);
    seen.add(JSON.stringify([p.doc, p.table, p.outline]));
  }
  assert.equal(seen.size, 20);
});

test('the table totals match the figures in the outline', () => {
  const p = buildPackage('totals-check-07');
  const rows = p.table.trim().split('\r\n').slice(1).map((l) => l.split(','));
  const sum = rows.reduce((t, r) => t + Number(r[3]), 0);
  assert.equal(rows.every((r) => Number(r[1]) * Number(r[2]) === Number(r[3])), true);
  assert.match(p.outline, new RegExp(`Total: £${sum}`));
});

test('the outline carries the same client, company and title as the document', () => {
  const p = buildPackage('names-match-11');
  const n = p.names;
  assert.ok(n.client && n.company && n.title, 'names are drawn');
  assert.ok(p.outline.includes(`# ${n.title}`));
  assert.ok(p.outline.includes(`${n.company} for ${n.client}`));
  assert.ok(p.outline.includes(`Confirm with ${n.recipient}`));
  assert.ok(JSON.stringify(p.doc).includes(n.client), 'the document names the same client');
});

test('CSV quotes commas, quotes and line breaks', () => {
  assert.equal(toCsv([['a,b', 'say "hi"', 'x\ny']]), '"a,b","say ""hi""","x\ny"\r\n');
  assert.equal(toCsv([['plain', 3]]), 'plain,3\r\n');
});

test('the seed in the link is read back, and bad seeds are refused', () => {
  assert.equal(seedFromHash('#seed=harbour-42-alpha'), 'harbour-42-alpha');
  assert.equal(seedFromHash('#seed=harbour%2D42%2Dalpha'), 'harbour-42-alpha');
  assert.equal(seedFromHash(''), null);
  assert.equal(seedFromHash('#seed=short'), null);
  assert.equal(seedFromHash('#seed=has spaces here'), null);
  assert.equal(SEED_PATTERN.test('x'.repeat(65)), false);
});

test('a new seed is 24 characters from the allowed set and is usable', () => {
  const bytes = Uint8Array.from({ length: 24 }, (_, i) => i * 7);
  const s = newPackageSeed(bytes);
  assert.equal(s.length, 24);
  assert.equal(SEED_PATTERN.test(s), true);
  assert.equal(buildPackage(s).seed, s);
});
