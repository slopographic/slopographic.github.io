// brand.json "support" flags: defaults on, an explicit false hides that part, nothing else changes. Loads the real
// brand/brand.js in a vm with stub browser globals and a fetch that returns the given JSON.
// Run: node tests/run.mjs support
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(path.join(ROOT, 'brand', 'brand.js'), 'utf8');

/** Runs brand.js with the given brand.json (or a failed fetch when json is undefined). Resolves with SlopBrand. */
async function brandWith(json) {
  const el = { style: { setProperty() {} }, hasAttribute: () => false, setAttribute() {} };
  const doc = {
    title: 'Slopographic', currentScript: null, readyState: 'complete', documentElement: el,
    querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true, addEventListener() {}
  };
  const fetchStub = async () => {
    if (json === undefined) throw new Error('offline');
    return { ok: true, json: async () => json };
  };
  const ctx = { document: doc, location: { href: 'https://slopographic.com/photoslop/' }, URL, fetch: fetchStub, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'brand/brand.js' });
  return ctx.SlopBrand.ready.then(() => ctx.SlopBrand);
}

test('brand.js exposes support flags, all on by default', async () => {
  const b = await brandWith({});
  assert.deepEqual({ ...b.config.support }, { exportCard: true, donate: true, ads: true });
});

test('a brand.json with no support block keeps every part on', async () => {
  const b = await brandWith({ name: 'Fork' });
  assert.deepEqual({ ...b.config.support }, { exportCard: true, donate: true, ads: true });
});

test('the origin mark stays the same whatever brand.json says', async () => {
  const a = await brandWith(undefined), b = await brandWith({ name: 'Fork', support: { ads: false } });
  assert.equal(a.origin, b.origin);
  assert.deepEqual([...a.origin].map((c) => c.charCodeAt(0)), [75, 101, 118, 105, 110]);
});

test('a failed brand.json fetch falls back to the defaults', async () => {
  const b = await brandWith(undefined);
  assert.deepEqual({ ...b.config.support }, { exportCard: true, donate: true, ads: true });
});

test('setting any flag to false hides that part and only that part', async () => {
  const b = await brandWith({ support: { exportCard: false, donate: true, ads: true } });
  assert.deepEqual({ ...b.config.support }, { exportCard: false, donate: true, ads: true });
  const d = await brandWith({ support: { donate: false } });
  assert.deepEqual({ ...d.config.support }, { exportCard: true, donate: false, ads: true });
  const a = await brandWith({ support: { ads: false } });
  assert.deepEqual({ ...a.config.support }, { exportCard: true, donate: true, ads: false });
});

test('all three false, from a fork', async () => {
  const b = await brandWith({ support: { exportCard: false, donate: false, ads: false } });
  assert.deepEqual({ ...b.config.support }, { exportCard: false, donate: false, ads: false });
});

test('only a real false hides a part: strings and other values keep it on', async () => {
  const b = await brandWith({ support: { exportCard: 'false', donate: 0, ads: null } });
  assert.deepEqual({ ...b.config.support }, { exportCard: true, donate: true, ads: true });
});

test('the shipped brand/brand.json has the support block, a true or false for each part', () => {
  const j = JSON.parse(readFileSync(path.join(ROOT, 'brand', 'brand.json'), 'utf8'));
  assert.deepEqual(Object.keys(j.support).sort(), ['ads', 'donate', 'exportCard']);
  for (const [k, v] of Object.entries(j.support)) assert.equal(typeof v, 'boolean', k);
  // its values are the profile's: all on for this site (tests/node/whitelabel-facts.test.mjs checks them against it)
});
