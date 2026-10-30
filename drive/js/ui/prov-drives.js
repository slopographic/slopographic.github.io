/* Slop Drive — ui/prov-drives: adding, renaming and removing named local drives, allowing access again, and the help
 * text. A local drive is a folder picked on this computer. The browser keeps its handle in this browser's storage, and Slop
 * Drive asks again when the browser needs it (a button press). Removing a drive forgets the handle only: nothing in the
 * folder is deleted. */
'use strict';
(function (DR) {
  const el = DR.el;
  /** The help text, one paragraph per entry (drive.prov.help_1 … help_5). */
  DR.localDrivesHelpText = () => [1, 2, 3, 4, 5].map((i) => DR.t(`drive.prov.help_${i}`));
  DR.localDrivesHelp = function () {
    window.SlopUI.dialog({
      title: DR.t('drive.prov.about'), cls: 'pv-help-dlg',
      body: el('div', { class: 'pv-help' }, DR.localDrivesHelpText().map((t) => el('p', { class: 'sui-p' }, t)), el('p', { class: 'sui-p' },
        el('a', { href: '/how-it-works/' }, DR.t('drive.prov.help_link')),
        DR.t('drive.prov.help_spec'),
        el('a', { href: 'https://wicg.github.io/file-system-access/', rel: 'noopener', target: '_blank' }, 'File System Access API'), '.')),
      buttons: [{ label: DR.t('menu.close'), primary: true }],
    });
  };

  /** Picks a folder (the browser needs the press), then asks for a name. A name already used gets " (2)". */
  DR.addLocalDrive = async function () {
    if (typeof window.showDirectoryPicker !== 'function') return window.SlopUI.alert(DR.t('drive.prov.need_chrome'), DR.t('drive.prov.need_chrome_body'));
    let h;
    try { h = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { if (e && e.name === 'AbortError') return; throw e; }
    const taken = new Set((await DR.drivesAll()).map((d) => d.name.toLowerCase()));
    const typed = await window.SlopUI.prompt(DR.t('drive.prov.name_q'), DR.t('drive.dlg.name'), h.name, { ok: DR.t('drive.prov.add_ok') });
    if (!typed || !typed.trim()) return;
    const name = DR.dirUniqueName(taken, typed.trim().slice(0, 80), true);
    await DR.driveSave({ id: DR.newDriveId(), name, handle: h, added: Date.now() });
    await DR.refreshProviders();
    DR.toast(DR.t('drive.prov.added', { name }));
  };

  const record = async (d) => (await DR.drivesAll()).find((x) => 'dir:' + x.id === d.id) || null;
  DR.renameLocalDrive = async function (d) {
    const rec = await record(d);
    if (!rec) return;
    const typed = await window.SlopUI.prompt(DR.t('drive.prov.rename_q'), DR.t('drive.dlg.name'), rec.name, { ok: DR.t('drive.dlg.rename') });
    if (!typed || !typed.trim() || typed.trim() === rec.name) return;
    await DR.driveSave(Object.assign({}, rec, { name: typed.trim().slice(0, 80) }));
    await DR.refreshProviders();
  };
  DR.removeLocalDrive = async function (d) {
    const yes = await window.SlopUI.confirm(DR.t('drive.prov.remove_q'), DR.t('drive.prov.remove_body', { name: d.label }), DR.t('drive.prov.remove_ok'), { cancel: DR.t('drive.folder.keep_it') });
    if (!yes) return;
    const rec = await record(d);
    if (rec) await DR.driveForget(rec.id);
    await DR.refreshProviders();
  };

  /** The browser asks for access again. Needs the press that called this. */
  DR.providerAllow = async function (d) {
    const p = await DR.dirAllow(d.handle);
    if (p !== 'granted') return window.SlopUI.alert(DR.t('drive.folder.not_granted'), DR.t('drive.prov.not_granted_body', { name: d.label }));
    await DR.refreshProviders();
  };
})(window.DR);
