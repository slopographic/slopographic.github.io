/* Slop Drive — ui/prov-actions: the menu for a row of the Drives tree (right-click, or a long press on touch) and the
 * actions it runs. A folder or file: Move to…, Copy to… (the picker shows every place), New folder inside, Delete… (for
 * good, from the folder). A drive: Allow access when needed, Refresh, Rename, and Remove from Slop Drive (which forgets the
 * folder; nothing in it is deleted). Every action reports its own failure in a message. */
'use strict';
(function (DR) {
  const safe = (fn) => async () => { try { await fn(); } catch (x) { window.SlopUI.alert(DR.t('drive.prov.not_done'), (x && x.message) || String(x)); } };

  DR.providerMenu = function (e, x, y) {
    const d = e.desc, ok = d.status === 'granted', local = d.id.indexOf('dir:') === 0;
    const rows = e.root ? [
      ok ? null : { label: DR.t('drive.prov.state_prompt'), act: safe(() => DR.providerAllow(d)) },
      { label: DR.t('drive.menu.new_folder_inside'), act: safe(() => DR.providerNewFolder(e)), disabled: !ok },
      { label: DR.t('drive.prov.refresh'), act: () => DR.refreshProviders() },
      '-',
      local ? { label: DR.t('drive.menu.rename'), act: safe(() => DR.renameLocalDrive(d)) } : null,
      local ? { label: DR.t('drive.prov.remove'), act: safe(() => DR.removeLocalDrive(d)) } : null,
    ] : [
      e.isFolder ? { label: DR.t('drive.menu.new_folder_inside'), act: safe(() => DR.providerNewFolder(e)) } : null,
      e.isFolder ? '-' : null,
      { label: DR.t('drive.menu.move_to'), act: safe(() => DR.providerTransfer(e, true)) },
      { label: DR.t('drive.menu.copy_to'), act: safe(() => DR.providerTransfer(e, false)) },
      '-',
      { label: DR.t('drive.prov.delete_dots'), act: safe(() => DR.providerDelete(e)) },
    ];
    window.SlopUI.menu(rows.filter((r) => r), x, y);
  };

  /** Move or copy one row to a place the picker returns. */
  DR.providerTransfer = async function (e, move) {
    const target = await DR.providerPicker({
      title: DR.t(move ? 'drive.dlg.move_one_to' : 'drive.dlg.copy_one_to', { name: e.name }), ok: DR.t(move ? 'drive.dlg.move_here' : 'drive.dlg.copy_here'),
      exclude: e.isFolder ? [{ id: e.desc.id, ref: e.ref }] : [], start: { id: e.desc.id, ref: e.parent },
    });
    if (!target) return null;
    return DR.transferEntries([e], await DR.resolveDest(target), { move });
  };

  DR.providerNewFolder = async function (e) {
    const name = await window.SlopUI.prompt(DR.t('drive.menu.new_folder'), DR.t('drive.dlg.name'), DR.t('drive.dlg.new_folder_name'), { ok: DR.t('drive.dlg.create') });
    if (!name || !name.trim()) return;
    await e.provider.mkdir(e.ref, await e.provider.uniqueName(e.ref, name.trim().slice(0, 200), true));
    DR.provChanged();
  };

  /** Deletes a file or a folder from its local folder, for good. */
  DR.providerDelete = async function (e) {
    const body = DR.t(e.isFolder ? 'drive.prov.delete_folder_body' : 'drive.prov.delete_file_body', { name: e.name, place: e.desc.label });
    const yes = await window.SlopUI.confirm(DR.t('drive.prov.delete_q'), body, DR.t('ui.delete'), { danger: true });
    if (!yes) return;
    await e.provider.remove(e.ref, e.isFolder);
    DR.provChanged();
  };
})(window.DR);
