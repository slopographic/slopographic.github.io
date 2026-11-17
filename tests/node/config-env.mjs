// Helpers for the config tests (shared/config): the real scripts in one vm context, a template file, a stub apply and
// an in-memory stand-in for SlopData.store. Not a test file itself.
import { loadInto } from './fx-env.mjs';
import './ui-i18n-en.mjs';   // the config's words (shared/i18n/ui/<code>/config.js), handed to the vm as a page has them

export const CORE = ['config/schema.js', 'config/validate.js', 'config/template.js', 'config/io.js', 'config/prompt.js'];
export const APPS = [{ id: 'tables' }, { id: 'slides' }, { id: 'orders' }];

export async function config({ files = CORE, extra = {} } = {}) {
  const ctx = await loadInto(files, { SLOP_APPS: APPS, Blob, File, SlopI18n: globalThis.SlopI18n, ...extra });
  return ctx.SlopConfig;
}

/** A template file for the tables app, as an object. Override any envelope key with over. */
export const templateFile = (over = {}) => ({
  format: 'slop-config', version: 1, kind: 'template', app: 'tables', name: 'Budget',
  created: '2026-10-11T09:00:00Z',
  data: { pages: [{ name: 'Sheet 1', blocks: [{ type: 'table', rows: [['Item', 'Cost'], ['Rent', 900]] }] }] },
  ...over,
});

/** Registers the tables template kind with a stub apply that records its calls. */
export function stubTemplate(C, apply = () => {}) {
  const calls = [];
  C.registerKind('template', 'tables', C.templateSchema, (data, ctx) => { calls.push({ data, ctx }); return apply(data, ctx); });
  return calls;
}


/** A small in-memory stand-in for SlopData.store: transact() works on a copy and commits only when the body succeeds. */
export function fakeStore() {
  const rows = {
    settings: new Map([['main', { id: 'main', defaultCurrency: 'USD', locale: 'en-US', defaultTaxRate: 0, paymentTermsDays: 30 }]]),
    numbering: new Map([['invoice', { id: 'invoice', prefix: 'INV-', pad: 4, next: 7 }], ['order', { id: 'order', prefix: 'ORD-', pad: 4, next: 3 }]]),
  };
  const store = {
    rows,
    transactions: 0,
    async get(name, key) { return { ok: true, value: rows[name].get(key) ?? null }; },
    async list(name) { return { ok: true, value: [...rows[name].values()] }; },
    async transact(fn) {
      store.transactions++;
      const copy = { settings: new Map(rows.settings), numbering: new Map(rows.numbering) };
      const api = {
        get: async (n, k) => ({ ok: true, value: copy[n].get(k) ?? null }),
        put: async (n, rec) => { copy[n].set(rec.id, { ...rec }); return { ok: true, value: rec }; },
        fail: (r) => r,
      };
      const r = await fn(api);
      if (r && r.ok === false) return r;
      rows.settings = copy.settings;
      rows.numbering = copy.numbering;
      return { ok: true, value: r && r.value };
    },
  };
  return store;
}
