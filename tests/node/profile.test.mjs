// SlopProfile: get, set, reset and the default fallback, with overrides kept under 'slop-profile'.
// Run: node --test tests/node/profile.test.mjs (or node tests/run.mjs profile)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInto, plain } from './fx-env.mjs';

const OPTIONS = {
  tables: {
    decimals: { label: 'Decimal places', type: 'number', default: 2, min: 0, max: 6 },
    grid: { label: 'Grid', type: 'bool', default: true },
    theme: { label: 'Theme', type: 'enum', default: 'dark', values: ['dark', 'light'] },
    caption: { label: 'Caption', type: 'string', default: 'Untitled' },
  },
  notes: { size: { label: 'Size', type: 'number', default: 12 } },
};
const memStorage = (seed) => {
  const m = new Map(seed ? [['slop-profile', seed]] : []);
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
async function profile(storage = memStorage()) {
  const ctx = await loadInto(['profile/profile.js'], { localStorage: storage, SLOP_APP_OPTIONS: OPTIONS });
  return { P: ctx.SlopProfile, storage, ctx };
}
// The stored envelope is { v: 1, data: { <appId>: { ... } } }: the tests look at the data inside it.
const stored = (s) => JSON.parse(s.m.get('slop-profile') || 'null')?.data ?? null;

test('get gives the declared default when nothing is stored, or the app fallback when given', async () => {
  const { P } = await profile();
  assert.equal(P.get('tables', 'decimals'), 2);
  assert.equal(P.get('tables', 'grid'), true);
  assert.equal(P.get('tables', 'decimals', 4), 4);          // the app's own default wins over the declared one
  assert.equal(P.get('tables', 'nope'), undefined);
  assert.equal(P.get('unknown-app', 'decimals'), undefined);
});

test('set stores an override that get returns; only changed values are kept', async () => {
  const s = memStorage();
  const { P } = await profile(s);
  assert.equal(P.set('tables', 'decimals', 3).ok, true);
  assert.equal(P.get('tables', 'decimals'), 3);
  assert.deepEqual(stored(s), { tables: { decimals: 3 } });
  assert.equal(P.get('tables', 'decimals', 9), 3);          // a valid override beats the fallback
  P.set('tables', 'decimals', 2);                           // back to the default: the override goes
  assert.equal(stored(s).tables, undefined);
  assert.equal(P.get('tables', 'decimals'), 2);
});

test('invalid and undeclared values are refused and nothing changes', async () => {
  const s = memStorage();
  const { P } = await profile(s);
  assert.equal(P.set('tables', 'decimals', 9).ok, false);
  assert.equal(P.set('tables', 'decimals', '3').ok, false);
  assert.equal(P.set('tables', 'theme', 'blue').ok, false);
  assert.equal(P.set('tables', 'grid', 'yes').ok, false);
  assert.match(P.set('tables', 'missing', 1).error, /Unknown setting/);
  assert.equal(P.set('nobody', 'x', 1).ok, false);
  assert.equal(s.m.has('slop-profile'), false);
});

test('a stored value that is no longer valid is ignored and reads as the default', async () => {
  const { P } = await profile(memStorage(JSON.stringify({ tables: { decimals: 'abc', theme: 'light' } })));
  assert.equal(P.get('tables', 'decimals'), 2);
  assert.equal(P.get('tables', 'theme'), 'light');
  assert.deepEqual(plain(P.overrides('tables')), { theme: 'light' });
});

test('overrides and all: only what the person changed, and the effective values for an app', async () => {
  const { P } = await profile();
  P.set('tables', 'grid', false);
  P.set('tables', 'caption', 'Q3');
  assert.deepEqual(plain(P.overrides('tables')), { grid: false, caption: 'Q3' });
  assert.deepEqual(plain(P.all('tables')), { decimals: 2, grid: false, theme: 'dark', caption: 'Q3' });
});

test('reset clears one app back to its defaults and leaves the other apps alone', async () => {
  const { P } = await profile();
  P.set('tables', 'decimals', 4);
  P.set('notes', 'size', 16);
  assert.equal(P.reset('tables').ok, true);
  assert.equal(P.get('tables', 'decimals'), 2);
  assert.equal(P.get('notes', 'size'), 16);
  assert.deepEqual(plain(P.overrides('tables')), {});
});

test('corrupt storage reads as empty; a write replaces it', async () => {
  const s = memStorage('{not json');
  const { P } = await profile(s);
  assert.equal(P.get('tables', 'decimals'), 2);
  assert.equal(P.set('tables', 'decimals', 5).ok, true);
  assert.equal(P.get('tables', 'decimals'), 5);
});

test('blocked storage: every read gives the default and every write says so', async () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const { P } = await profile(blocked);
  assert.equal(P.get('tables', 'decimals'), 2);
  assert.equal(P.get('tables', 'decimals', 7), 7);
  const r = P.set('tables', 'decimals', 3);
  assert.equal(r.ok, false);
  assert.match(r.error, /browser storage is blocked/);
  assert.equal(P.reset('tables').ok, false);
});

test('no storage at all (null): reads default, writes refused', async () => {
  const P = (await loadInto(['profile/profile.js'], { localStorage: null, SLOP_APP_OPTIONS: OPTIONS })).SlopProfile;
  assert.equal(P.get('tables', 'grid'), true);
  assert.equal(P.set('tables', 'grid', false).ok, false);
});

test('the page-level instance is exported, and create() gives an independent profile', async () => {
  const { P, ctx } = await profile();
  assert.equal(typeof ctx.SlopProfile.create, 'function');
  const other = P.create({ storage: memStorage(), options: { x: { y: { type: 'bool', default: false } } } });
  assert.equal(other.get('x', 'y'), false);
  assert.equal(P.get('x', 'y'), undefined);
  assert.deepEqual(plain(P.appIds()), ['tables', 'notes']);
});
