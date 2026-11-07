/* SlopDocTabs.drive: Save to Slop Drive for one tab, through window.SlopHub (shared/hub.js).
 * Classic script, no network of its own. The app supplies the file format in adapter.drive = { ext, mime, toBlob?, fromBlob? }.
 * Without toBlob the file holds JSON of adapter.serialize(doc); without fromBlob it is read back with adapter.restore. */
(function () {
  'use strict';
  const NS = window.SlopDocTabs || (window.SlopDocTabs = {});
  if (NS.drive) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }

  const hub = () => window.SlopHub || null;
  const toast = (api, msg) => api.toast(msg);

  /** The file's bytes for doc: the app's own format if it has toBlob, else the JSON of serialize(doc). */
  async function blobOf(api, doc) {
    const dr = api.adapter.drive || {};
    if (dr.toBlob) return dr.toBlob(doc);
    return new Blob([JSON.stringify(api.adapter.serialize(doc))], { type: dr.mime || 'application/json' });
  }
  /** The title plus the app's extension, once: "Notes" -> "Notes.txt", "Notes.txt" stays "Notes.txt". */
  function fileName(api, doc) {
    const dr = api.adapter.drive || {};
    let ext = dr.ext || '';
    if (ext && !ext.startsWith('.')) ext = '.' + ext;
    const base = String(api.nameOf(doc) || tr('ui.untitled', 'Untitled')).replace(/\s+/g, ' ').trim() || tr('ui.untitled', 'Untitled');
    return ext && !base.toLowerCase().endsWith(ext.toLowerCase()) ? base + ext : base;
  }

  /**
   * Save doc to Slop Drive. A tab already linked to a Drive file writes that file again (a new version, not a second
   * copy). Otherwise the person picks a folder and the tab is linked to the new file. Resolves with the Drive id, or null.
   */
  async function saveToDrive(api, doc) {
    if (!doc) return null;
    const H = hub();
    if (!H) { toast(api, tr('ui.no_drive', 'Slop Drive is not available here')); return null; }
    const blob = await blobOf(api, doc), name = fileName(api, doc), type = (api.adapter.drive || {}).mime || blob.type;
    const linked = api.driveIdOf(doc);
    let id = null;
    if (linked) {
      const out = await H.update(linked, { blob, name, type }).catch(() => null);
      if (out) id = linked;
    }
    if (!id) {
      id = await H.saveToDrive(blob, name, { from: api.appId || 'unknown', title: tr('ui.tabs.save_title', 'Save “{name}” to Slop Drive', { name }) });
      if (!id) return null;
    }
    api.setDriveId(doc, id);
    api.markSaved(doc);
    toast(api, tr('ui.tabs.saved', 'Saved {name} to Slop Drive', { name }));
    return id;
  }

  // Open from Slop Drive is each app's: a source of the one intake (SlopIntake.fromDrive), whose reader opens the file in a
  // tab linked to it with api.openDoc(doc, { driveId, origName }).
  NS.drive = { saveToDrive, fileName };
})();
