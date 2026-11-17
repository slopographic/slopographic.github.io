/* Slop PDF — File ▸ Versions. The original of a document is its Slop Drive file (io/drive-docs.js); the edited copy and the
   change list (io/doc-changes.js) sit beside it. Open the original, open the edited copy, open the original with the saved
   changes replayed on it, revert the open document to the original (the saved copy stays in Slop Drive) and download the
   change list. Each opens in a new tab, without the device's saved-edits prompt. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, A = SP.app, S = A._, D = SP.driveDocs, t = U.t;

  /** The File ▸ Versions submenu. Every item needs the open document to be linked to Slop Drive. */
  A.versionItems = function () {
    var has = E.state.pages.length > 0, linked = !!A.driveId && D.linked() && has; // an empty tab has no document in Drive
    return [
      { label: t('pdf.act.ver_original'), act: function () { A.openVersion('original'); }, disabled: !linked },
      { label: t('pdf.act.ver_edited'), act: function () { A.openVersion('edited'); }, disabled: !linked },
      { label: t('pdf.act.ver_replay'), act: function () { A.openVersion('replay'); }, disabled: !linked },
      '-',
      { label: t('pdf.act.ver_revert_dots'), act: function () { A.revertToOriginal(); }, disabled: !linked || !has },
      { label: t('pdf.act.ver_download_changes'), act: function () { A.downloadChanges(); }, disabled: !linked },
    ];
  };

  /** The document's versions in Slop Drive, or null (with a message) when there is none yet. */
  async function versions() {
    var v = null;
    try { v = await D.versions(A.driveId); } catch (e) { v = null; }
    if (!v) SlopUI.toast(t('pdf.act.ver_not_in_drive'));
    return v;
  }
  /** A PDF File for a Drive record, named as the record is. */
  function fileOf(rec) { return new File([rec.blob], rec.name || 'document.pdf', { type: 'application/pdf' }); }
  /** Opens the original, the edited copy or the original with the change list replayed, in a new tab. */
  A.openVersion = async function (kind) {
    var v = await versions(); if (!v) return;
    var rec = kind === 'edited' ? v.edited : v.original, changes = null;
    if (kind === 'edited' && !rec) { SlopUI.toast(t('pdf.act.ver_no_edited')); return; }
    if (kind === 'replay') {
      if (!v.changes) { SlopUI.toast(t('pdf.act.ver_no_changes')); return; }
      changes = SP.docChanges.parse(await v.changes.blob.text());
      if (!changes) { SlopUI.toast(t('pdf.act.ver_bad_changes')); return; }
    }
    A.newTab();
    await A.addFiles([fileOf(rec)], { drive: { link: v.original.id, log: false } });
    if (changes) {
      var n = SP.docChanges.replayOn(Array.from(E.files.values())[0], changes);
      SlopUI.toast(n ? t('pdf.act.ver_replayed', { n: n }) : t('pdf.act.ver_nothing'));
    }
  };
  /** Back to the original in this tab. The edits in the tab are dropped; the saved edited copy stays in Slop Drive. */
  A.revertToOriginal = async function () {
    var v = await versions(); if (!v) return;
    var ok = await SlopUI.confirm(t('pdf.act.ver_revert_title'), t('pdf.act.ver_revert_msg'), t('pdf.act.ver_revert'), { danger: true });
    if (!ok) return;
    A.showGrid(true);
    E.closeAll();
    if (v.original.meta && v.original.meta.sha256) await SP.editLog.discard(v.original.meta.sha256);
    S.fileNameTouched = false;
    await A.addFiles([fileOf(v.original)], { drive: { link: v.original.id, log: false } });
    SlopUI.toast(t('pdf.act.ver_reverted'));
  };
  /** Downloads the saved change list as JSON. */
  A.downloadChanges = async function () {
    var v = await versions(); if (!v) return;
    if (!v.changes) { SlopUI.toast(t('pdf.act.ver_no_changes_save')); return; }
    U.download(await v.changes.blob.text(), U.baseName(v.original.name) + '.changes.json', 'application/json');
  };
})();
