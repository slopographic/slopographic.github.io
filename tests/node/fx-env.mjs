// Helpers for the currency and rate tests: an in-memory transaction over the real schema (no IndexedDB), a CSV
// fixture in the shape of the ECB data API, and a loader that runs the consent scripts and the data scripts in one
// vm context. Not a test file itself.
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared');
const DATA = path.join(ROOT, 'data');
export const DATA_FILES = ['money.js', 'barcode.js', 'schema-checks.js', 'schema-defs.js', 'schema.js', 'currency.js', 'store.js', 'numbering.js', 'fx.js', 'ledger.js', 'billing.js', 'bundle-check.js', 'rates-ecb.js'];

/** Runs the given files (relative to shared/) in one context. `extra` is copied onto the window first. */
export async function loadInto(files, extra = {}) {
  const ctx = { ...extra };
  ctx.window = ctx;
  vm.createContext(ctx);
  // The records' messages need their English words (shared/i18n/ui/en/data.js, data2.js) first, unless the caller loads i18n itself.
  const words = files.some((f) => f.startsWith('data/')) && !files.includes('i18n/i18n.js') ? ['i18n/i18n.js', 'i18n/ui/en.js', 'i18n/ui/en/data.js', 'i18n/ui/en/data2.js'] : [];
  for (const f of [...words, ...files]) {
    const src = await readFile(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
    if (words.length && f === 'i18n/i18n.js') vm.runInContext("window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: null });", ctx);   // English in any build
  }
  return ctx;
}

/** Plain copy of a value, so objects made inside the vm context compare equal to host objects. */
export const plain = (v) => JSON.parse(JSON.stringify(v));

/** An in-memory stand-in for a store transaction: list/get/put with the real schema rules, no immutability or numbering. */
export function fakeTx(D, seed = {}) {
  const tables = { accounts: D.schema.DEFAULT_CHART.map((a) => ({ ...a, createdAt: 1, updatedAt: 1, version: 1 })), settings: [{ id: 'main', ...D.schema.DEFAULT_SETTINGS, createdAt: 1, updatedAt: 1, version: 1 }], ...seed };
  let seq = 0;
  const ok = (value) => ({ ok: true, value });
  const fail = (code, message) => ({ ok: false, code, message });
  const tx = {
    tables,
    fail: (r) => r,
    async get(name, key) {
      const k = D.schema.def(name).key;
      return ok((tables[name] || []).find((r) => r[k] === key) || null);
    },
    async list(name, o = {}) {
      let rows = tables[name] || [];
      if (o.index) rows = rows.filter((r) => r[o.index] === o.value);
      if (o.filter) rows = rows.filter(o.filter);
      if (o.limit) rows = rows.slice(0, o.limit);
      return ok(rows.slice());
    },
    async put(name, rec) {
      const d = D.schema.def(name);
      const key = rec[d.key] !== undefined ? rec[d.key] : `${name}-${++seq}`;
      const p = D.schema.prepare(name, { ...rec, [d.key]: key });
      if (!p.ok) return fail('invalid', D.schema.errorText(p.errors));
      const row = { ...p.value, [d.key]: key, createdAt: ++seq, updatedAt: seq, version: 1 };
      tables[name] = (tables[name] || []).filter((r) => r[d.key] !== key).concat([row]);
      return ok(row);
    },
  };
  return tx;
}

/** A small fixture in the shape of the ECB data API (SDMX CSV, lastNObservations=1). Same rates as the old XML
 *  fixture (USD 1.1600, JPY 180.25, GBP 0.8712 on 2026-10-09). The last two rows are a discontinued series with an
 *  old date and a row with an empty OBS_VALUE: the parser must skip both. */
export const ECB_FIXTURE = `KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS,TITLE
EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-09,1.1600,A,US dollar/Euro ECB reference exchange rate
EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,A,2026-10-09,180.25,A,"Japanese yen/Euro, ECB reference"
EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-10-09,0.8712,A,Pound sterling/Euro ECB reference exchange rate
EXR.D.ARS.EUR.SP00.A,D,ARS,EUR,SP00,A,2020-10-30,91.5953,A,Argentine peso/Euro
EXR.D.BGN.EUR.SP00.A,D,BGN,EUR,SP00,A,2025-12-31,,A,Euro/Bulgarian lev
`;
