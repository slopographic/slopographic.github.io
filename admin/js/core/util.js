// Slop Admin core helpers: the namespace, the settings read, byte sizes and the message for a failed Result.
// Classic script. Exposes window.SlopAdmin. The rules themselves live in SlopData (schema, store, exporter).
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopAdmin = g.SlopAdmin || {});

  /** The company settings record, or the defaults when there is none yet. */
  async function settings() {
    const r = await S.store.get('settings', 'main');
    return r.ok && r.value ? r.value : { ...S.schemaDefs.DEFAULT_SETTINGS };
  }

  /** "12.3 MB" for a byte count. */
  function bytes(n) {
    if (!Number.isFinite(n)) return 'unknown';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = n, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  /** Text for a failed Result. Says nothing was changed when the Result came from a refused write. */
  const refusal = (r) => (r && r.message) || (g.SlopI18n ? g.SlopI18n.t('admin.core.unchanged') : '');

  NS.util = { settings, bytes, refusal };
})(typeof window !== 'undefined' ? window : globalThis);
