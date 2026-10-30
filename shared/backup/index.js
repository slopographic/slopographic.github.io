/* SlopBackup: the small helper any Slopographic page can include (or load lazily) to back up and restore
 * everything this site keeps in the browser. It loads the real work (zip.js, codec.js, core.js, ui.js) on first use.
 * Classic script, exposes window.SlopBackup:
 *   SlopBackup.exportNow()            build slopographic-backup-YYYY-MM-DD.slop (the version 1 ZIP) and download it
 *   SlopBackup.importFile(file, opts) restore a .slop backup ({ mode: 'merge' | 'replace' })
 *   SlopBackup.openDialog()           the Backup & restore dialog (export, import with merge/replace)
 *   SlopBackup.openEverything(opts)   "Export everything": one .slop-backup.json for the whole suite (central.js)
 *   SlopBackup.registerApp(id, def)   an app's part of that file (see shared/backup/HANDOFF.md)
 *   SlopBackup.registeredApps()       [{ id, label, version, part }] for the apps registered on this page
 *   SlopBackup.kit()                  resolves with the SlopUI dialog kit, loading it if the page lacks it
 *   SlopBackup.EXT, JSON_EXT          the two backup files' extensions ('.slop', '.slop-backup.json' here) */
(function () {
  'use strict';
  if (window.SlopBackup) return;
  const me = document.currentScript && document.currentScript.src;
  const ROOT = me ? new URL('../../', me).href : new URL('/', location.href).href;
  const jobs = new Map();
  /* The backup files' extensions: the version 1 ZIP and the version 2 "Export everything" JSON. The one place they are
   * written; core.js, central.js, ui.js, central-ui.js and Drive's drop check read them from here. A white-label build sets
   * them from the brand profile's backupExt (tools/whitelabel/emit.mjs markerValues). */
  const EXT = /*profile:backupExt*/'.slop';
  const JSON_EXT = /*profile:backupJson*/'.slop-backup.json';
  function load(rel) {
    if (!jobs.has(rel)) jobs.set(rel, new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = new URL(rel, ROOT).href;
      s.onload = res; s.onerror = () => { jobs.delete(rel); rej(new Error('Could not load ' + rel)); };
      document.head.append(s);
    }));
    return jobs.get(rel);
  }
  let kitP = null;
  /** The SlopUI kit. A page may own a different window.SlopUI, so load the kit beside it. */
  function kit() {
    if (window.SlopUI && window.SlopUI.dialog) return Promise.resolve(window.SlopUI);
    if (!kitP) kitP = (async () => {
      if (!document.querySelector('link[href*="slopui.css"]')) {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('shared/slopui.css', ROOT).href; document.head.append(l);
        await new Promise((r) => { l.onload = r; l.onerror = r; });
      }
      const prev = window.SlopUI;
      window.SlopUI = undefined;
      let k;
      try { await load('shared/slopui.js'); } finally { k = window.SlopUI; if (prev) window.SlopUI = prev; }
      return k;
    })();
    return kitP;
  }
  async function ready() {
    await Promise.all(['shared/backup/zip.js', 'shared/backup/codec.js', 'shared/backup/core.js'].map(load));
    return window.SlopBackupCore;
  }
  async function exportNow({ onProgress } = {}) {
    const core = await ready(), ui = await kit();
    const { blob, name, manifest } = await core.exportAll({ onProgress });
    ui.download(blob, name);
    try { localStorage.setItem('slop-backup-last', String(Date.now())); } catch (e) { /* storage blocked */ }
    return { name, size: blob.size, manifest };
  }
  async function importFile(file, opts) { const core = await ready(); return core.importBackup(file, opts); }
  async function openDialog(opts) { await ready(); const ui = await kit(); await load('shared/backup/ui.js'); return window.SlopBackupUI.open(ui, opts); }
  function lastExport() { try { return +localStorage.getItem('slop-backup-last') || 0; } catch (e) { return 0; } }

  /* ---------- "Export everything": the app registry ---------- */
  const APP_RX = /^[a-z][a-z0-9-]{0,39}$/;
  const apps = new Map();
  /** Registers an app for "Export everything". Throws on a bad or duplicate registration (a developer step, so it fails at once).
   * version is the app's data version. A version above 1 must come with migrations[v] for every v from 2 up:
   * migrations[v] turns version v-1 data into version v. part: 'apps' (default) or 'settings'. mode: 'merge' (default) or 'replace'.
   * check(data) → [] or error strings, run before anything is written. */
  function registerApp(id, def) {
    if (typeof id !== 'string' || !APP_RX.test(id)) throw new Error(`registerApp: bad app id "${id}"`);
    if (apps.has(id)) throw new Error(`registerApp: ${id} is already registered`);
    if (!def || !Number.isInteger(def.version) || def.version < 1) throw new Error(`registerApp: ${id} needs a whole-number version from 1`);
    if (typeof def.exportData !== 'function' || typeof def.importData !== 'function') throw new Error(`registerApp: ${id} needs exportData and importData`);
    const migrations = Object.assign({}, def.migrations || {});
    for (let v = 2; v <= def.version; v++) if (typeof migrations[v] !== 'function') throw new Error(`registerApp: ${id} is version ${def.version} but has no migrations[${v}]`);
    apps.set(id, {
      // the label may be an i18n key (central-apps.js): read in the current language each time it is shown
      id, get label() { const I = window.SlopI18n; return (I && I.label ? I.label(def.label) : def.label) || id; }, version: def.version, part: def.part === 'settings' ? 'settings' : 'apps',
      mode: def.mode === 'replace' ? 'replace' : 'merge', exportData: def.exportData, importData: def.importData, migrations,
      check: typeof def.check === 'function' ? def.check : () => [], legacy: def.legacy || null, optional: !!def.optional,
    });
  }
  /** The full registrations in registration order (central.js reads them). */
  function defs() { return [...apps.values()]; }
  function registeredApps() { return defs().map(({ id, label, version, part }) => ({ id, label, version, part })); }
  /** Loads the "Export everything" module and resolves with window.SlopCentral. */
  function central() { return load('shared/backup/central.js').then(() => window.SlopCentral); }
  function openEverything(opts) { return central().then((c) => c.openDialog(opts)); }

  window.SlopBackup = { exportNow, importFile, openDialog, kit, ready, load, lastExport, ROOT, EXT, JSON_EXT,
    registerApp, registeredApps, defs, central, openEverything };
})();
