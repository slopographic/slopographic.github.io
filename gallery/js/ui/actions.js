/* Slop Gallery: the actions every entry point shares (toolbar, right-click menus, SlopCmd commands, keyboard).
 * Each action works on the selection when there is one, otherwise on the photo it was called for.
 * Exposes window.SlopGallery.actions. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const toast = (m) => window.SlopUI && SlopUI.toast(m);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  /** ids for an action: the selection if it holds the photo, else the selection when there is one, else just the photo. */
  function targets(id) {
    const sel = G.state.selected;
    if (id && sel.includes(id)) return sel;
    if (!id && sel.length) return sel;
    return id ? [id] : sel;
  }

  /** One photo into the library: the reader of the one intake (shared/intake, registered in ui/main.js), whichever way
   *  it came in. Throws the reason it is not added (a row in the drop strip, and the toast). */
  async function importOne(file, ctx) {
    const keep = !!(document.getElementById('keepDup') || {}).checked;
    const name = file.slopPath || file.name || 'photo';
    const r = await G.importer.run([{ file, name, driveId: ctx && ctx.drive ? ctx.drive.id : null }], { keepDuplicates: keep });
    if (r.failed.length) throw new Error(t('gallery.act.not_image'));
    if (!r.added) throw new Error(t('gallery.act.already'));
    return name;
  }
  // Import, Import a folder and Import from Slop Drive are sources of the intake, like a drop.
  const importFiles = () => window.SlopIntake.pick({ to: 'gallery' });
  const importFolder = async () => {
    const files = await G.source.fromDirectory();
    if (files === null) { await SlopUI.alert(t('gallery.act.folder_title'), t('gallery.act.folder_body')); return null; }
    return window.SlopIntake.take(files, { source: 'folder', to: 'gallery' });
  };
  const importDrive = () => window.SlopIntake.fromDrive({ to: 'gallery', title: t('gallery.act.drive_title') });

  /** Removes photos from the library after a confirmation (ask: false when the caller already asked, as the assistant's
   *  panel does for destructive commands). Resolves the number removed. */
  async function removeIds(ids, { ask = true } = {}) {
    if (!ids.length) return 0;
    const ok = !ask || await SlopUI.confirm(t('gallery.act.remove_title'), t('gallery.act.remove_body', { n: ids.length }), t('ui.remove'), { danger: true });
    if (!ok) return 0;
    const n = await G.library.remove(ids);
    G.state.select(ids, false);
    ids.forEach((id) => G.urls.forget(id));
    toast(t('gallery.act.removed', { n }));
    return n;
  }
  async function tagPrompt(ids) {
    const typed = await SlopUI.prompt(t('gallery.act.tag_title'), t('gallery.act.tag_label'), '', { ok: t('gallery.act.tag_ok'), placeholder: t('gallery.act.tag_ph') });
    const tag = typed && typed.trim().toLowerCase();
    if (!tag || !ids.length) return;
    await G.library.retag(ids, (m) => ({ tags: [...m.tags, tag] }));
    toast(t('gallery.act.tagged', { n: ids.length, tag }));
  }
  async function exportIds(ids) {
    if (!ids.length) return;
    const n = await G.export.downloadSelection(ids);
    toast(n > 1 ? t('gallery.act.saved_zip', { n }) : t(n ? 'gallery.act.saved' : 'gallery.act.nothing_saved'));
  }
  // Restore a backup: a part of the intake of its own (a .zip, one at a time, asked first), so a backup comes in the same
  // one way as a photo. Registered at boot (ui/main.js), once shared/intake has loaded.
  const registerBackup = () => window.SlopIntake.register({
    id: 'gallery.backup', main: false, paste: false, limit: 1, toast: false,
    accept: { types: ['application/zip', 'application/x-zip-compressed'], exts: ['.zip'], get noun() { return t('gallery.act.backup_noun'); } },
    gate: (batch) => SlopUI.confirm(t('gallery.act.restore_title'), t('gallery.act.restore_body', { name: batch.take[0].name }), t('gallery.act.restore_ok')),
    process: async (file) => {
      try {
        const r = await G.backup.restore(file);
        toast(t(r.merged ? 'gallery.act.restored_merged' : 'gallery.act.restored', { n: r.added, merged: r.merged }));
        return r;
      } catch (e) {
        await SlopUI.alert(t('gallery.act.restore_failed'), t('gallery.act.restore_failed_body', { error: e.message }));
        throw e;
      }
    },
  });
  const restoreBackup = async () => { const s = await window.SlopIntake.pick({ to: 'gallery.backup', multiple: false }); return (s.added[0] && s.added[0].value) || null; };
  function sortIds(ids) {
    const list = ids && ids.length ? ids : G.timeline.visibleIds();
    if (!list.length) { toast(t('gallery.act.nothing_sort')); return; }
    G.sortmode.open(list);
  }

  G.actions = {
    targets, importOne, registerBackup, importFiles, importFolder, importDrive, removeIds, tagPrompt, exportIds, restoreBackup, sortIds,
    selectAll: () => G.state.select(G.timeline.visibleIds(), true),
    clearSelection: () => G.state.clearSelection(),
    toggleFav: (ids) => G.library.toggleFav(ids),
    like: (ids, v) => G.library.setLiked(ids, v),
    dupes: () => G.dupes.open(),
    backup: () => G.export.downloadBackup().then((n) => toast(t('gallery.act.backup_saved', { kb: Math.round(n / 1024) }))),
    makeReel: (ids) => G.reel.open(ids),
  };
})();
