// A service-worker update must never clear IndexedDB or localStorage. Runs the real service-worker.js in a vm with
// a fake Cache API, fires its activate event, and checks that only old slopographic-* caches are deleted.
// Run: node tests/run.mjs storage
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ROOT } from './storage-env.mjs';
import path from 'node:path';

async function swWith(cacheNames) {
  const deleted = [];
  const listeners = {};
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    location: { origin: 'https://slopographic.test' },
    registration: { scope: 'https://slopographic.test/' },
  };
  const caches = {
    keys: async () => [...cacheNames],
    delete: async (n) => { deleted.push(n); return true; },
    open: async () => ({ addAll: async () => {}, put: async () => {}, match: async () => undefined }),
    match: async () => undefined,
  };
  // importScripts runs each precache part (sw-precache*.js) in the same context, as a browser does.
  const importScripts = (...urls) => { for (const u of urls) vm.runInContext(readFileSync(path.join(ROOT, u), 'utf8'), ctx, { filename: u }); };
  const ctx = { self, caches, console, URL, Promise, Set, Map, Object, Array, JSON, Math, Date, Response: class {}, Request: class {}, Headers: class {}, fetch: async () => { throw new Error('no network'); }, importScripts };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = await readFile(path.join(ROOT, 'service-worker.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'service-worker.js' });
  let pending = null;
  listeners.activate({ waitUntil: (p) => { pending = p; } });
  await pending;
  return { deleted, src };
}

test('activate deletes only old slopographic-* caches, never the current one or other names', async () => {
  const { deleted, src } = await swWith(['slopographic-v4', 'slopographic-v5', 'slopographic-v6', 'slop-user-cache', 'some-other-app']);
  const current = 'slopographic-' + /const VERSION = '([^']+)'/.exec(src)[1];
  assert.deepEqual(deleted.sort(), ['slopographic-v4', 'slopographic-v5', 'slopographic-v6'].filter((n) => n !== current));
  assert.equal(deleted.includes('slopographic-' + current), false, 'the current cache is kept');
  for (const n of deleted) assert.match(n, /^slopographic-/);
});

test('the service worker source never touches IndexedDB, localStorage or sessionStorage', async () => {
  const src = await readFile(path.join(ROOT, 'service-worker.js'), 'utf8');
  for (const word of ['indexedDB', 'localStorage', 'sessionStorage', 'deleteDatabase']) {
    assert.equal(src.includes(word), false, `service-worker.js must not use ${word}`);
  }
});
