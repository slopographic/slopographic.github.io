/* Slop Drive — core/ops: every change to the Drive. Each op writes through SlopHub, then refreshes and
 * re-renders once. Items are store records (see store.js); keys are 'd:<id>' / 'f:<id>'. */
'use strict';
(function (DR) {
  const S = DR.S, H = () => window.SlopHub;
  async function done(msg) { await DR.timed(DR.t('drive.app.updating'), () => DR.refresh(), { onRetry: () => DR.render && DR.render() }); if (DR.render) DR.render(); if (msg) DR.toast(msg); }
  DR.done = done;
  /** A toast about items: drive.toast.<base>_one with {name} for one item, drive.toast.<base>_n with {n} for several. */
  const say = (base, items, vars) => (items.length === 1 ? DR.t(`drive.toast.${base}_one`, Object.assign({ name: items[0].name }, vars)) : DR.t(`drive.toast.${base}_n`, Object.assign({ n: items.length }, vars)));

  DR.newFolder = async function (parent = S.section === 'folder' ? S.cwd : null, name) {
    if (name == null) name = await window.SlopUI.prompt(DR.t('drive.menu.new_folder'), DR.t('drive.dlg.name'), DR.uniqueName(parent, DR.t('drive.dlg.new_folder_name'), true), { ok: DR.t('drive.dlg.create') });
    if (!name || !name.trim()) return null;
    const id = await H().createFolder(DR.uniqueName(parent, name.trim().slice(0, 200), true), parent);
    await done();
    DR.select && DR.select(['d:' + id]);
    return id;
  };
  DR.rename = async function (it, name) {
    if (!it) return;
    if (name == null) name = await window.SlopUI.prompt(DR.t('drive.dlg.rename'), DR.t('drive.dlg.name'), it.name, { ok: DR.t('drive.dlg.rename') });
    if (!name || !name.trim() || name.trim() === it.name) return;
    const n = DR.uniqueName(it.parent, name.trim().slice(0, 200), it.isFolder, it.id);
    if (it.isFolder) await H().updateFolder(it.id, { name: n }); else await H().update(it.id, { name: n });
    await done();
  };
  /** Can these items move into folder dest (null = root)? A folder cannot go inside itself. */
  DR.canMove = (items, dest) => items.every((it) => !(it.isFolder && (it.id === dest || DR.contains(it.id, dest))));
  DR.move = async function (items, dest) {
    items = items.filter((it) => it.parent !== dest || it.trashedAt);
    if (!items.length) return 0;
    if (!DR.canMove(items, dest)) { DR.toast(DR.t('drive.toast.not_inside')); return 0; }
    for (const it of items) {
      const name = DR.uniqueName(dest, it.name, it.isFolder, it.id);
      if (it.isFolder) await H().updateFolder(it.id, { parentId: dest, name });
      else await H().update(it.id, { folderId: dest, name });
      it.parent = dest; it.name = name; // keep later uniqueName checks in this batch honest
    }
    await done(say('moved', items, { place: dest ? S.folders.get(dest).name : DR.rootName() }));
    return items.length;
  };
  async function copyFolder(f, dest, top) {
    const id = await H().createFolder(top ? DR.uniqueName(dest, f.name, true) : f.name, dest);
    const { folders, files } = DR.children(f.id);
    for (const r of files) await H().put(r.blob, { name: r.name, from: r.from, meta: r.meta, folderId: id });
    for (const sub of folders) await copyFolder(sub, id, false);
    return id;
  }
  DR.copy = async function (items, dest) {
    const ids = [];
    for (const it of items) {
      if (it.isFolder) {
        if (it.id === dest || DR.contains(it.id, dest)) { DR.toast(DR.t('drive.toast.not_copied_inside')); continue; }
        ids.push('d:' + await copyFolder(it, dest, true));
      } else {
        const name = DR.uniqueName(dest, it.name, false);
        ids.push('f:' + await H().put(it.blob, { name, from: it.from, meta: it.meta, folderId: dest }));
        S.files.set('tmp' + ids.length, { name, parent: dest, isFolder: false }); // reserve the name for the rest of the batch
      }
    }
    await done(ids.length ? say('copied', items) : null);
    return ids;
  };
  DR.duplicate = (items) => DR.copy(items.filter((it) => !it.trashedAt), items[0] ? items[0].parent : null);
  DR.setStar = async function (items, on) {
    for (const it of items) if (it.isFolder) await H().updateFolder(it.id, { starred: on }); else await H().update(it.id, { starred: on }, { touch: false });
    await done(say(on ? 'starred' : 'unstarred', items));
  };
  DR.trash = async function (items) {
    items = items.filter((it) => !it.trashedAt);
    if (!items.length) return;
    const now = Date.now();
    for (const it of items) if (it.isFolder) await H().updateFolder(it.id, { trashedAt: now }); else await H().update(it.id, { trashedAt: now }, { touch: false });
    S.sel.clear();
    await done(say('trashed', items));
  };
  /** Back out of the Trash. If the old folder is gone or still in the Trash, it lands in the root. */
  DR.restore = async function (items) {
    for (const it of items) {
      const p = it.parent && S.folders.get(it.parent), dest = p && !DR.hidden(p) ? it.parent : null;
      const name = DR.uniqueName(dest, it.name, it.isFolder, it.id);
      if (it.isFolder) await H().updateFolder(it.id, { trashedAt: null, parentId: dest, name });
      else await H().update(it.id, { trashedAt: null, folderId: dest, name }, { touch: false });
    }
    S.sel.clear();
    await done(say('restored', items));
  };
  /** Delete for good, folders with everything inside. */
  DR.purge = async function (items, { ask = true } = {}) {
    if (!items.length) return false;
    if (ask && !(await window.SlopUI.confirm(DR.t('drive.dlg.purge_q'), say('purge_body', items), DR.t('drive.menu.delete_forever'), { danger: true }))) return false;
    for (const it of items) {
      if (it.isFolder) {
        const { folders, files } = DR.descendants(it.id);
        for (const r of files) { await window.SlopVersions.removeAll(H(), r); await H().remove(r.id); }
        for (const f of folders) await H().removeFolder(f.id);
        await H().removeFolder(it.id);
      } else { await window.SlopVersions.removeAll(H(), it); await H().remove(it.id); }
    }
    S.sel.clear();
    await done(say('deleted', items));
    return true;
  };
  /** Top-level items in the Trash (not those inside a trashed folder). */
  DR.trashTops = () => [...S.folders.values(), ...S.files.values()].filter((it) => it.trashedAt && !(it.parent && DR.hidden(S.folders.get(it.parent))));
  DR.emptyTrash = async function () {
    const tops = DR.trashTops();
    if (!tops.length) { DR.toast(DR.t('drive.empty.trash_h')); return false; }
    if (!(await window.SlopUI.confirm(DR.t('drive.dlg.empty_q'), DR.t('drive.toast.purge_body_n', { n: tops.length }), DR.t('drive.dlg.empty_ok'), { danger: true }))) return false;
    return DR.purge(tops, { ask: false });
  };
  DR.touch = (it) => { if (it && !it.isFolder) H().touch(it.id); };
})(window.DR);
