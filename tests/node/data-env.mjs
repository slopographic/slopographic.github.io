// Loads the classic browser scripts of shared/data into a vm context (no DOM, no IndexedDB).
// Helper for data.test.mjs and data-ledger.test.mjs. Not a test file itself.
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'data');
// The English words of the records' messages (shared/i18n/ui/en/data.js, data2.js), loaded first as a page has them.
export const PIN = "window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: null });";   // English in any build
export const WORDS = ['i18n.js', 'ui/en.js', 'ui/en/data.js', 'ui/en/data2.js', 'ui/en/calendar.js'].map((f) => path.join(DATA, '..', 'i18n', f));
export const PURE = ['money.js', 'barcode.js', 'schema-checks.js', 'schema-defs.js', 'schema.js', 'currency.js', 'store.js', 'numbering.js', 'fx.js', 'ledger.js', 'stock.js', 'billing.js', 'bundle-check.js', 'rates-ecb.js'];

/** Returns window.SlopData from a fresh context with the given files loaded in order. */
export async function load(files = PURE) {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of WORDS) { vm.runInContext(await readFile(f, 'utf8'), ctx, { filename: f }); if (f === WORDS[0]) vm.runInContext(PIN, ctx); }
  for (const f of files) vm.runInContext(await readFile(path.join(DATA, f), 'utf8'), ctx, { filename: f });
  return ctx.SlopData;
}

/** Plain copy of a value, so objects made inside the vm context compare equal to host objects. */
export const plain = (v) => JSON.parse(JSON.stringify(v));
