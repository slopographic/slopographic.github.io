/* SlopCentral apps: the built-in registrations for "Export everything". Each app is registered through
 * SlopBackup.registerApp, like any app's own code would do (shared/backup/HANDOFF.md). The IndexedDB apps share the
 * generic exporter in central-idb.js. Slop Data goes through its own exporter (validated, one transaction), and the
 * profile is the one settings part. Part of central.js; attaches to window.SlopCentral.apps. */
(function () {
  'use strict';
  const C = window.SlopCentral, B = window.SlopBackup;
  if (C.apps) return; // registered once per page
  const DATA_FILES = ['money.js', 'barcode.js', 'schema-checks.js', 'schema-defs.js', 'schema.js', 'currency.js', 'store.js', 'numbering.js',
    'fx.js', 'ledger.js', 'stock.js', 'billing.js', 'bundle-check.js', 'export.js'];
  const PROFILE_KEY = 'slop-profile';
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup.js

  /** Loads the Slop Data scripts (in the order the Admin page loads them) unless the page has them. */
  async function loadData() {
    const SD = window.SlopData;
    if (SD && SD.exporter && SD.store && SD.bundleCheck && SD.schema) return SD;
    for (const f of DATA_FILES) await B.load('shared/data/' + f);
    return window.SlopData;
  }

  /** The data section (collections) as the bundle Slop Data's own exporter reads. */
  const bundleOf = (d) => ({ format: 'slop-data', version: 1, exportedAt: new Date().toISOString(), collections: d.collections });

  const dataApp = {
    id: 'data', label: 'ui.backup.app_data', version: 2, mode: 'replace', legacy: 'slop-data',
    // Version 1 bundles predate some collections (exchangeRates): migration 2 gives every collection a list.
    migrations: {
      2: (d) => {
        const cols = { ...(d.collections || {}) };
        for (const n of window.SlopData.schema.COLLECTIONS) if (!Array.isArray(cols[n])) cols[n] = [];
        return { collections: cols };
      },
    },
    exportData: async () => {
      const SD = await loadData();
      const r = await SD.exporter.exportBundle();
      if (!r.ok) throw new Error(r.message || tr('ui.backup.data_unread'));
      return { collections: r.value.collections };
    },
    check: (d) => window.SlopData.bundleCheck.validateBundle(bundleOf(d)).errors || [],
    importData: async (d, from, ctx) => {
      const SD = await loadData();
      const before = await SD.exporter.exportBundle();
      if (!before.ok) throw new Error(before.message || tr('ui.backup.data_cur_unread'));
      const bundle = bundleOf(d);
      const v = SD.bundleCheck.validateBundle(bundle);
      if (!v.ok) throw new Error(v.errors[0]);
      const r = await SD.exporter.importBundle(bundle); // one transaction: nothing is written when it fails
      if (!r.ok) throw new Error(r.message || tr('ui.backup.data_refused'));
      ctx.undo(async () => { const u = await SD.exporter.importBundle(before.value); if (!u.ok) throw new Error(u.message); });
    },
  };

  const profileApp = {
    id: 'profile', label: 'ui.backup.app_profile', version: 1, part: 'settings', mode: 'merge', legacy: null,
    exportData: () => {
      let raw = null;
      try { raw = localStorage.getItem(PROFILE_KEY); } catch (e) { return {}; }
      try { const o = raw ? JSON.parse(raw) : null; return C.format.isObj(o) ? o : {}; } catch (e) { return {}; }
    },
    check: () => [],
    importData: async (d, from, ctx) => {
      if (!Object.keys(d).length) return; // a file with no profile changes nothing
      let pre = null;
      try { pre = localStorage.getItem(PROFILE_KEY); } catch (e) { throw new Error(tr('ui.backup.storage_blocked')); }
      localStorage.setItem(PROFILE_KEY, JSON.stringify(d));
      ctx.undo(() => { if (pre === null) localStorage.removeItem(PROFILE_KEY); else localStorage.setItem(PROFILE_KEY, pre); });
    },
  };

  /** The IndexedDB apps: the database name (a function, so an override set on the page is read), the stores to take
   * (null = all) and the legacy name the version 1 ZIP used. */
  const specs = [
    { id: 'drive', label: 'ui.backup.app_drive', legacy: 'slop-drive', db: () => window.SLOP_DRIVE_DB || 'slop-drive', stores: null },
    { id: 'gallery', label: 'ui.backup.app_gallery', legacy: 'slop-gallery', db: () => window.SLOP_GALLERY_DB || 'slop-gallery', stores: null },
    { id: 'music', label: 'ui.backup.app_music', legacy: 'slop-music', db: () => window.SLOP_MUSIC_DB || 'slop-music', stores: ['playlists'] },
    { id: 'tables', label: 'ui.backup.app_tables', legacy: 'slop-tables-templates', db: () => 'slop-tables-templates', stores: ['templates'] },
    { id: 'slides', label: 'ui.backup.app_slides', legacy: 'slop-slides-templates', db: () => 'slop-slides-templates', stores: ['templates'] },
    { id: 'docs', label: 'ui.backup.app_docs', legacy: 'slop-docs', db: () => 'slop-docs', stores: ['templates'] },
    { id: 'session', label: 'ui.backup.app_session', legacy: 'slop-session', db: () => 'slop-session', stores: ['kv'], optional: true },
  ];

  /** An IndexedDB app's registration, from its spec. */
  function idbApp(s) {
    return {
      id: s.id, label: s.label, version: 1, mode: 'merge', legacy: s.legacy, optional: !!s.optional,
      exportData: async () => C.idb.pack(await C.idb.readDb(s.db(), s.stores)),
      check: (data) => C.idb.check(data),
      importData: async (data, from, ctx) => {
        const n = await C.idb.importDb(s.db(), data, ctx);
        if (s.id === 'drive' && n) { try { new BroadcastChannel('slopographic').postMessage({ type: 'drive:change', data: { what: 'restore' }, src: 'backup', time: Date.now() }); } catch (e) { /* no bus */ } }
      },
    };
  }

  // Registration order is the import order: Slop Data first, the profile last.
  B.registerApp(dataApp.id, dataApp);
  for (const s of specs) B.registerApp(s.id, idbApp(s));
  B.registerApp(profileApp.id, profileApp);

  C.apps = { loadData, specs };
})();
