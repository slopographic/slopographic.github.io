// Backup and restore through SlopData's exporter. A file is checked whole before anything is written (the bundle
// check names the first problem); restore then replaces every collection in one transaction, or changes nothing.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const { ok, fail } = S.result;

  /** Records per collection in a parsed bundle. */
  function countsOf(bundle) {
    const out = {};
    for (const n of S.schema.COLLECTIONS) out[n] = Array.isArray(bundle.collections[n]) ? bundle.collections[n].length : 0;
    return out;
  }

  /** Checks a backup file's text without writing anything. Resolves to { counts } or a failed Result with errors. */
  function check(text) {
    let bundle;
    const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    try { bundle = JSON.parse(text); } catch (e) { return fail('invalid', t('admin.core.not_json')); }
    const v = S.bundleCheck.validateBundle(bundle);
    if (!v.ok) return fail('invalid', t('admin.core.not_restored', { why: v.errors[0] }), { errors: v.errors });
    return ok({ counts: countsOf(bundle), exportedAt: bundle.exportedAt || '' });
  }

  /** Restores the whole backup, replacing every record. Refused files change nothing. */
  async function restore(text) {
    const r = await S.exporter.importBundle(text);
    if (!r.ok) return fail(r.code || 'invalid', g.SlopI18n ? g.SlopI18n.t('admin.core.nothing_changed', { why: r.message }) : r.message, { errors: r.errors });
    return ok(r.value);
  }

  /** Downloads the full backup (every record, deleted ones included). Returns the Result of the export. */
  async function exportFile() {
    return S.exporter.exportFile();
  }

  NS.restore = { check, restore, exportFile, countsOf };
})(typeof window !== 'undefined' ? window : globalThis);
