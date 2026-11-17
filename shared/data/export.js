// Full export to one JSON file, and import from one file. Import is all-or-nothing: the whole file is
// validated before the first write, then every collection is replaced inside one transaction.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail } = ns.result;

  /** Every record of every collection, deleted ones included, as one plain object. */
  async function exportBundle() {
    const r = await ns.store.readAll(async (tx) => {
      const out = {};
      for (const n of ns.schema.COLLECTIONS) {
        const l = await tx.list(n, { includeDeleted: true });
        if (!l.ok) return l;
        out[n] = l.value;
      }
      return ok(out);
    });
    if (!r.ok) return r;
    return ok({ format: ns.bundleCheck.FORMAT, version: ns.bundleCheck.VERSION, exportedAt: new Date().toISOString(), collections: r.value });
  }

  /** The export as a Blob plus a file name, ready for an <a download> link. */
  async function exportFile() {
    const b = await exportBundle();
    if (!b.ok) return b;
    const name = `slop-data-${b.value.exportedAt.slice(0, 10)}.json`;
    return ok({ name, blob: new Blob([JSON.stringify(b.value)], { type: 'application/json' }) });
  }

  /** Imports a bundle object or its JSON text. Nothing changes unless the whole bundle is valid. */
  async function importBundle(input) {
    let bundle = input;
    if (typeof input === 'string') {
      try { bundle = JSON.parse(input); } catch (e) { return fail('invalid', say('ui.data.io.not_json')); }
    }
    const v = ns.bundleCheck.validateBundle(bundle);
    if (!v.ok) return fail('invalid', v.errors[0], { errors: v.errors });
    const r = await ns.store.restore(bundle.collections);
    if (!r.ok) return r;
    const s = await ns.store.seed();
    if (!s.ok) return s;
    return ok({ collections: ns.schema.COLLECTIONS.length });
  }

  ns.exporter = { exportBundle, exportFile, importBundle };
})(typeof window !== 'undefined' ? window : globalThis);
