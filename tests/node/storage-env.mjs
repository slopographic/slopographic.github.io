// Helpers for the storage upgrade tests: run real classic browser scripts in a vm context with a fake
// localStorage, and fake IndexedDB-free stand-ins for the globals a script touches at load time.
// Not a test file itself. Used by storage-*.test.mjs.
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A Storage-like object over a plain Map. Keeps the raw strings, so tests can check what was written. */
export function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    clear: () => m.clear(),
  };
}

/** Runs the given files (relative to the repo root) in one vm context. `globals` are copied onto window first. */
export async function loadClassic(files, globals = {}) {
  const ctx = { console, URL, JSON, Map, Set, Math, Date, Number, String, Array, Object, Promise, Symbol, Error, setTimeout, clearTimeout };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.document = { currentScript: null, getElementById: () => null };
  ctx.location = { href: 'https://slopographic.test/consent/index.html', search: '' };
  Object.assign(ctx, globals);
  vm.createContext(ctx);
  for (const f of files) {
    const src = await readFile(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx;
}
