// Data overview: the number of records in each collection, live and deleted, read in one transaction. Reset: the
// whole database is erased, but only after the full backup has been offered as a download.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const { ok } = S.result;

  /** { collection: { live, deleted } } for every collection. */
  function counts() {
    return S.store.readAll(async (tx) => {
      const out = {};
      for (const n of S.schema.COLLECTIONS) {
        const l = await tx.list(n, { includeDeleted: true });
        if (!l.ok) return l;
        const deleted = l.value.filter((x) => x.deletedAt).length;
        out[n] = { live: l.value.length - deleted, deleted };
      }
      return ok(out);
    });
  }

  /** Offers the full backup as a download, then erases the database and seeds the defaults again. */
  async function exportAndReset(offer) {
    const f = await S.exporter.exportFile();
    if (!f.ok) return f;
    offer(f.value.blob, f.value.name);
    const e = await S.store.erase();
    if (!e.ok) return e;
    return S.store.ready();
  }

  NS.overview = { counts, exportAndReset };
})(typeof window !== 'undefined' ? window : globalThis);
